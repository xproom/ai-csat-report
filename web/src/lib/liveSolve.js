/**
 * @file liveSolve.js
 * @brief 실시간 풀이 - Claude가 문항을 하나씩 풀며 생각·풀이·답을 스트리밍하고, 시각을 함께 기록(trace)
 *
 * 문항마다 요청을 한 번씩 보냅니다(문항별 실제 수행 시간을 재기 위해).
 * 문제지 파일은 첫 요청 뒤 프롬프트 캐시로 재사용되어, 두 번째 문항부터는 입력 비용이 크게 줄어듭니다.
 *
 * 출력 형식(줄 단위)
 *   PAGE: 1-2      ← 첨부 파일 순서-쪽 (문항이 있는 위치)
 *   STEP: 생각 한 문장
 *   WORK: 식·메모 한 줄
 *   ANSWER: 최종 답
 *
 * trace 이벤트: { t: 시작부터 ms, no, kind: 'start'|'page'|'think'|'step'|'work'|'answer'|'end', text }
 */

import Anthropic from '@anthropic-ai/sdk'
import { blobToBase64 } from './db.js'
import { normalizeChoice } from './grading.js'
import { makeId, QUESTION_TYPES } from './schema.js'
import { CLAUDE_MODELS, MAX_REQUEST_BYTES, describeApiError, estimateRequestBytes } from './aiRunner.js'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_THINK_CHARS = 700

export const LIVE_SYSTEM_PROMPT = `당신은 한국 학교 시험을 치르는 학생입니다. 첨부된 문제지에서 지정된 번호의 한 문항만 풉니다.
반드시 아래 형식의 줄로만 출력하고, 다른 말은 쓰지 마세요.
PAGE: 그 문항이 있는 첨부 파일 번호-쪽 번호 (예: 첫 번째 파일 2쪽이면 1-2)
STEP: 지금 하는 생각을 한국어 한 문장으로 짧게
WORK: 식이나 계산 한 줄 (LaTeX 없이 일반 문자로, 예: a7 = 1 × 3^3 = 27)
(STEP과 WORK는 풀이 순서대로 섞어서 2~8줄)
ANSWER: 최종 답 한 줄 — 객관식은 선지 번호 숫자 하나, 단답형은 답만, 서술형은 핵심 답을 한두 문장으로`

/** @brief 스트리밍 텍스트를 줄 단위로 끊어 전달 */
export function createLineParser(onLine) {
  let buffer = ''
  return {
    feed(chunk) {
      buffer += chunk
      let index = buffer.indexOf('\n')
      while (index !== -1) {
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        if (line) onLine(line)
        index = buffer.indexOf('\n')
      }
    },
    flush() {
      const line = buffer.trim()
      buffer = ''
      if (line) onLine(line)
    }
  }
}

const LINE_PATTERN = /^\s*(?:[-*]\s*)?(PAGE|STEP|WORK|ANSWER|답)\s*[:：]\s*(.*)$/i

/** @brief 한 줄을 이벤트 종류로 분류 (형식 밖의 줄은 풀이 메모로 취급) */
export function classifyLine(line) {
  const match = line.match(LINE_PATTERN)
  if (!match) return { kind: 'work', text: line.replace(/^[-*]\s*/, '') }
  const key = match[1].toUpperCase()
  const kind = key === '답' ? 'answer' : key.toLowerCase()
  return { kind, text: match[2].trim() }
}

/** @brief "1-2" → { file: 0, page: 2 } */
export function parsePageRef(text) {
  const match = String(text ?? '').match(/(\d+)\s*[-–_/.\s]\s*(\d+)/)
  if (match) return { file: Math.max(0, Number(match[1]) - 1), page: Math.max(1, Number(match[2])) }
  const single = String(text ?? '').match(/(\d+)/)
  return single ? { file: 0, page: Math.max(1, Number(single[1])) } : null
}

/** @brief 문항 유형에 맞게 최종 답 정리 */
export function cleanFinalAnswer(question, text) {
  const raw = String(text ?? '').trim().replace(/^["'`]+|["'`]+$/g, '').trim()
  if (!raw) return ''
  if (question.type === 'choice') return normalizeChoice(raw)
  return raw
}

function questionPrompt(paper, question) {
  const detail = question.type === 'choice' ? `${question.choices}지선다 객관식` : QUESTION_TYPES[question.type]
  return `이 시험은 모두 ${paper.questions.length}문항입니다. ${question.no}번 문항(${detail}, ${question.points}점)만 풀어 주세요.`
}

/** @brief 업로드 파일 → 콘텐츠 블록 (마지막 블록에 캐시 지점) */
async function buildCachedBlocks(files) {
  const blocks = []
  for (const file of files) {
    const data = await blobToBase64(file.blob)
    if (file.type === 'application/pdf') blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } })
    else if (IMAGE_TYPES.includes(file.type)) blocks.push({ type: 'image', source: { type: 'base64', media_type: file.type, data } })
  }
  if (!blocks.length) throw new Error('풀 수 있는 문제지 파일(PDF·사진)이 없습니다.')
  blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: 'ephemeral' } }
  return blocks
}

/** @brief 생각 요약 스트림을 문장 단위 이벤트로 묶음 */
function createThinkCollector(emit) {
  let sentence = ''
  let used = 0
  const push = () => {
    const text = sentence.replace(/\s+/g, ' ').trim()
    sentence = ''
    if (!text || used >= MAX_THINK_CHARS) return
    used += text.length
    emit(text.length > 120 ? `${text.slice(0, 120)}…` : text)
  }
  return {
    feed(chunk) {
      for (const char of chunk) {
        sentence += char
        if (/[.!?。\n]/.test(char) && sentence.trim().length > 8) push()
      }
    },
    flush: push
  }
}

/**
 * @brief 한 문항 실시간 풀이
 * @returns {Promise<{ answer, status, page, durationMs, inputTokens, outputTokens, cacheReadTokens }>}
 */
async function solveOne({ client, modelInfo, effort, blocks, paper, question, signal, emit, compat }) {
  const request = {
    model: modelInfo.id,
    max_tokens: 16000,
    system: LIVE_SYSTEM_PROMPT,
    // 생각 요약을 자막으로 보여주기 위해 요청 (계정에서 받지 않으면 빼고 다시 시도)
    thinking: compat.summarized ? { type: 'adaptive', display: 'summarized' } : { type: 'adaptive' },
    output_config: { effort },
    messages: [{ role: 'user', content: [...blocks, { type: 'text', text: questionPrompt(paper, question) }] }]
  }
  const stream = compat.fallbacks
    ? client.beta.messages.stream({ ...request, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, { signal })
    : client.messages.stream(request, { signal })

  let answerText = ''
  let page = null
  let sawAnswerLine = false
  const think = createThinkCollector(text => emit('think', text))
  const lines = createLineParser(line => {
    const { kind, text } = classifyLine(line)
    if (kind === 'page') {
      page = parsePageRef(text)
      if (page) emit('page', `${page.file + 1}-${page.page}`)
      return
    }
    if (kind === 'answer') {
      sawAnswerLine = true
      answerText = text
      emit('answer', cleanFinalAnswer(question, text) || text)
      return
    }
    if (text) emit(kind, text)
  })

  for await (const event of stream) {
    if (event.type !== 'content_block_delta') continue
    if (event.delta.type === 'thinking_delta') think.feed(event.delta.thinking)
    else if (event.delta.type === 'text_delta') lines.feed(event.delta.text)
  }
  think.flush()
  lines.flush()
  const message = await stream.finalMessage()

  if (message.stop_reason === 'refusal') {
    emit('step', '이 문항은 모델이 응답을 거절했습니다.')
  }
  const answer = cleanFinalAnswer(question, answerText)
  return {
    answer,
    status: answer ? 'answered' : sawAnswerLine || message.stop_reason === 'max_tokens' ? 'parse_failed' : 'no_answer',
    page,
    inputTokens: (message.usage?.input_tokens ?? 0) + (message.usage?.cache_creation_input_tokens ?? 0),
    cacheReadTokens: message.usage?.cache_read_input_tokens ?? 0,
    outputTokens: message.usage?.output_tokens ?? 0
  }
}

/**
 * @brief 평가지 전체를 문항별로 실시간 풀이
 * @param {Object} options
 * @param {(event: Object) => void} options.onEvent - trace 이벤트가 생길 때마다 호출
 * @returns {Promise<Object>} 풀이 기록(Run) - trace, perQuestionMs 포함
 */
export async function runLiveSolve({ apiKey, model, effort = 'medium', paper, files, signal, onEvent }) {
  if (!apiKey) throw new Error('설정에서 Anthropic API 키를 먼저 입력하세요.')
  if (!files?.length) throw new Error('문제지 파일이 없습니다. 먼저 문제지를 업로드하세요.')
  if (estimateRequestBytes(files) > MAX_REQUEST_BYTES) {
    throw new Error(`문제지 파일이 너무 큽니다(약 ${(estimateRequestBytes(files) / 1048576).toFixed(0)}MB로 전송). 한 요청 한도(32MB)를 넘으니, 해당 과목 쪽만 남긴 PDF나 사진으로 다시 올려 주세요.`)
  }

  const modelInfo = CLAUDE_MODELS.find(item => item.id === model) ?? CLAUDE_MODELS[0]
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const blocks = await buildCachedBlocks(files)
  const started = performance.now()
  const trace = []
  const answers = {}
  const perQuestionMs = {}
  const errors = {}
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }
  // 계정에서 받지 않는 선택 기능은 400 오류가 나면 끄고 다시 시도
  const compat = { fallbacks: modelInfo.fallback, summarized: true }
  let aborted = false
  let fatalError = ''
  let consecutiveFailures = 0

  for (const question of paper.questions) {
    if (signal?.aborted) { aborted = true; break }
    const questionStart = performance.now()
    const emit = (kind, text = '') => {
      const event = { t: Math.round(performance.now() - started), no: question.no, kind, text }
      trace.push(event)
      onEvent?.(event)
    }
    emit('start')
    for (;;) {
      try {
        const result = await solveOne({ client, modelInfo, effort, blocks, paper, question, signal, emit, compat })
        answers[question.no] = { answer: result.answer, status: result.status }
        usage.inputTokens += result.inputTokens
        usage.outputTokens += result.outputTokens
        usage.cacheReadTokens += result.cacheReadTokens
        consecutiveFailures = 0
        break
      } catch (error) {
        if (signal?.aborted) { aborted = true; break }
        const info = describeApiError(error)
        if (info.status === 400 && (compat.fallbacks || compat.summarized)) {
          if (compat.fallbacks) compat.fallbacks = false
          else compat.summarized = false
          emit('step', '일부 선택 기능 없이 다시 요청합니다.')
          continue
        }
        answers[question.no] = { answer: '', status: 'no_answer' }
        errors[question.no] = info.message
        emit('step', `오류: ${info.message}`)
        consecutiveFailures += 1
        if (info.fatal) fatalError = info.message
        else if (consecutiveFailures >= 3) fatalError = `${info.message} (3문항 연속 실패로 멈춤)`
        break
      }
    }
    perQuestionMs[question.no] = Math.round(performance.now() - questionStart)
    emit('end')
    if (aborted || fatalError) break
  }

  for (const question of paper.questions) {
    answers[question.no] ??= { answer: '', status: 'no_answer' }
  }

  return {
    id: makeId('run'),
    paperId: paper.id,
    model: `${modelInfo.label} (실시간)`,
    modelId: modelInfo.id,
    source: 'ai',
    mode: 'live',
    isDemo: false,
    createdAt: new Date().toISOString(),
    effort,
    answers,
    essayScores: {},
    usage,
    durationMs: Math.round(performance.now() - started),
    perQuestionMs,
    trace,
    errors,
    fatalError,
    note: fatalError ? `오류로 멈춤: ${fatalError}` : aborted ? '중간에 멈춰 일부 문항은 풀지 않았습니다.' : ''
  }
}
