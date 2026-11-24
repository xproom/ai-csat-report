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

import { blobToBase64 } from './db.js'
import { normalizeChoice } from './grading.js'
import { makeId, QUESTION_TYPES } from './schema.js'
import { CLAUDE_MODELS, MAX_REQUEST_BYTES, describeApiError, estimateRequestBytes } from './aiRunner.js'
import { electiveNote, formNote } from './presets.js'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_THINK_CHARS = 700

// 모델의 내부 추론을 밖으로 꺼내 달라는 요청으로 보이지 않도록, "생각"이 아니라 시험지 여백에 적는 풀이 요약을 요청함
// (Claude는 추론 과정 추출로 판단되는 요청을 거절할 수 있음)
export const LIVE_SYSTEM_PROMPT = `당신은 한국 학교 시험을 보는 학생입니다. 첨부된 문제지에서 지정된 번호의 한 문항을 풀고,
시험지 여백에 적듯이 풀이를 짧게 정리한 뒤 답을 냅니다. 아래 형식의 줄로만 출력하세요.
PAGE: 그 문항이 있는 첨부 파일 번호-쪽 번호 (예: 첫 번째 파일 2쪽이면 1-2)
STEP: 풀이 과정을 한 문장으로 요약 (예: 둘째 문단에서 글쓴이의 주장을 찾는다.)
WORK: 근거가 되는 내용이나 식 한 줄 (LaTeX 없이 일반 문자로)
(STEP과 WORK는 풀이 순서대로 2~6줄)
ANSWER: 최종 답 한 줄 — 객관식은 선지 번호 숫자 하나, 단답형은 답만, 서술형은 핵심 답을 한두 문장으로`

/** 자세한 풀이가 거절될 때 쓰는 답만 받는 지시문 (결과 탭의 한 번에 풀기와 같은 성격) */
export const ANSWER_ONLY_PROMPT = `당신은 한국 학교 시험을 보는 학생입니다. 첨부된 문제지에서 지정된 번호의 문항을 풀고 최종 답만 제출합니다.
다른 말 없이 다음 한 줄만 출력하세요.
ANSWER: 최종 답 — 객관식은 선지 번호 숫자 하나, 단답형은 답만, 서술형은 핵심 답을 한두 문장으로`

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

/** 줄 머리표 → 이벤트 종류 (모델이 영어·한국어 어느 쪽으로 써도 인식) */
const LABELS = [
  ['answer', 'FINAL\\s*ANSWER|ANSWER|최종\\s*답(?:안)?|정답|답'],
  ['page', 'PAGE|쪽|페이지|위치'],
  ['step', 'STEP|THINK|생각|단계'],
  ['work', 'WORK|CALC|풀이|계산|식|메모']
]
const LABEL_SOURCE = LABELS.map(([, source]) => source).join('|')
// 머리표 뒤에는 콜론(:, ：)이나 대시가 와야 함 ("답은 3"처럼 문장 속 단어는 머리표로 보지 않음)
const LABEL_PATTERN = new RegExp(`(?:^|\\s)(${LABEL_SOURCE})\\s*(?:\\(\\s*[^)]*\\))?\\s*[:：]\\s*`, 'gi')

/** @brief 마크다운 꾸밈(**굵게**, `코드`, #, >, 목록 기호) 제거 */
export function stripMarkdown(line) {
  return String(line ?? '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*(?:[#>]+|[-*•]|\d+[.)])\s+/, '')
    .trim()
}

function kindOf(label) {
  const normalized = label.replace(/\s+/g, '')
  for (const [kind, source] of LABELS) {
    if (new RegExp(`^(?:${source})$`, 'i').test(normalized)) return kind
  }
  return 'work'
}

/**
 * @brief 한 줄을 이벤트 목록으로 분류
 * - "**ANSWER:** ③", "답: 3", "- STEP: …" 모두 인식
 * - "PAGE: 1-2 STEP: … ANSWER: 3"처럼 한 줄에 여러 머리표가 있어도 나눔
 * - 머리표가 없는 줄은 풀이 메모(work)로 취급
 * @returns {Array<{ kind: string, text: string }>}
 */
export function classifyLine(line) {
  const clean = stripMarkdown(line)
  if (!clean || /^```/.test(String(line).trim())) return []
  const matches = [...clean.matchAll(LABEL_PATTERN)]
  if (!matches.length) return [{ kind: 'work', text: clean }]
  const parts = []
  const lead = clean.slice(0, matches[0].index).trim()
  if (lead) parts.push({ kind: 'work', text: lead })
  matches.forEach((match, index) => {
    const start = match.index + match[0].length
    const end = index + 1 < matches.length ? matches[index + 1].index : clean.length
    parts.push({ kind: kindOf(match[1]), text: clean.slice(start, end).trim() })
  })
  return parts
}

/**
 * @brief 머리표 있는 답 줄이 없을 때 응답 전체에서 답을 찾음
 * - 객관식: "답은 ③", "정답 3번" 같은 표현 → 없으면 마지막에 나온 ①~⑤
 * - 단답형·서술형: "답: …"·"답은 …" 표현 → 없으면 마지막 줄
 */
export function extractAnswerFallback(question, fullText) {
  const text = String(fullText ?? '').replace(/\*\*|__|`/g, '')
  if (!text.trim()) return ''
  if (question.type === 'choice') {
    const phrases = [...text.matchAll(/(?:최종\s*답|정답|답|ANSWER)\s*(?:은|는|:|：|=|→)?\s*(?:번호\s*)?([①-⑤]|[1-9](?!\d))/gi)]
    if (phrases.length) return normalizeChoice(phrases.at(-1)[1])
    const circled = [...text.matchAll(/[①-⑤]/g)]
    return circled.length ? normalizeChoice(circled.at(-1)[0]) : ''
  }
  const phrases = [...text.matchAll(/(?:최종\s*답|정답|답|ANSWER)\s*(?:은|는|:|：|=|→)\s*([^\n]+)/gi)]
  if (phrases.length) return phrases.at(-1)[1].replace(/[.。]$/, '').trim()
  const lines = text.split('\n').map(stripMarkdown).filter(Boolean)
  return question.type === 'essay' ? lines.at(-1) ?? '' : ''
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
  const note = [formNote(paper), electiveNote(paper, question)].filter(Boolean).join(' ')
  return `이 시험은 모두 ${paper.questions.length}문항입니다. ${question.no}번 문항(${detail}, ${question.points}점)만 풀어 주세요.${note ? ` ${note}` : ''}`
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

const PAGE_MAP_SCHEMA = {
  type: 'object',
  properties: {
    pages: {
      type: 'array',
      items: {
        type: 'object',
        properties: { no: { type: 'integer' }, file: { type: 'integer' }, page: { type: 'integer' } },
        required: ['no', 'file', 'page'],
        additionalProperties: false
      }
    }
  },
  required: ['pages'],
  additionalProperties: false
}

/**
 * @brief 풀기 전에 문항 번호별 위치(파일·쪽)를 한 번에 찾음
 * - 화면에 해당 문항이 있는 쪽을 보여주기 위해 사용 (모델이 풀면서 PAGE를 빠뜨려도 쪽이 맞게 바뀜)
 * - 이 요청이 문제지를 캐시에 올려 두므로, 이어지는 문항 요청은 캐시를 읽음
 * @returns {Promise<Record<number, { file: number, page: number }>>} file은 0부터
 */
export async function locateQuestions({ client, modelInfo, blocks, paper, signal }) {
  const response = await client.messages.create({
    model: modelInfo.id,
    max_tokens: 8000,
    system: '첨부한 시험 문제지에서 각 문항 번호가 처음 나오는 위치를 찾습니다. 문제를 풀지 말고 위치만 답하세요.',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: PAGE_MAP_SCHEMA } },
    messages: [{
      role: 'user',
      content: [...blocks, { type: 'text', text: `문항 번호 ${paper.questions.map(question => question.no).join(', ')}이 각각 몇 번째 첨부 파일(1부터)의 몇 쪽(1부터)에 있는지 알려 주세요. 찾을 수 없는 번호는 빼세요. ${formNote(paper)} ${electiveNote(paper)}` }]
    }]
  }, { signal })
  const text = response.content.filter(block => block.type === 'text').map(block => block.text).join('')
  const map = {}
  try {
    for (const item of JSON.parse(text).pages ?? []) {
      if (Number.isInteger(item.no) && item.page >= 1) map[item.no] = { file: Math.max(0, (item.file || 1) - 1), page: item.page }
    }
  } catch {
    // 위치를 못 찾아도 풀이는 계속함
  }
  return map
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
async function solveOne({ client, modelInfo, effort, blocks, paper, question, signal, emit, compat, mode = 'detailed' }) {
  const request = {
    model: modelInfo.id,
    max_tokens: 16000,
    system: mode === 'answerOnly' ? ANSWER_ONLY_PROMPT : LIVE_SYSTEM_PROMPT,
    output_config: { effort },
    messages: [{ role: 'user', content: [...blocks, { type: 'text', text: questionPrompt(paper, question) }] }]
  }
  const stream = compat.fallbacks
    ? client.beta.messages.stream({ ...request, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, { signal })
    : client.messages.stream(request, { signal })

  let answerText = ''
  let fullText = ''
  let page = null
  let sawAnswerLine = false
  const think = createThinkCollector(text => emit('think', text))
  const lines = createLineParser(line => {
    for (const { kind, text } of classifyLine(line)) {
      if (kind === 'page') {
        page = parsePageRef(text)
        if (page) emit('page', `${page.file + 1}-${page.page}`)
        continue
      }
      if (kind === 'answer') {
        const cleaned = cleanFinalAnswer(question, text)
        // "ANSWER:" 줄이 여러 번이면 답이 있는 마지막 줄을 씀
        if (cleaned || !sawAnswerLine) answerText = text
        sawAnswerLine = true
        if (cleaned) emit('answer', cleaned)
        continue
      }
      if (text) emit(kind, text)
    }
  })

  for await (const event of stream) {
    if (event.type !== 'content_block_delta') continue
    if (event.delta.type === 'thinking_delta') think.feed(event.delta.thinking)
    else if (event.delta.type === 'text_delta') {
      fullText += event.delta.text
      lines.feed(event.delta.text)
    }
  }
  think.flush()
  lines.flush()
  const message = await stream.finalMessage()

  const refused = message.stop_reason === 'refusal'
  const refusalCategory = message.stop_details?.category ?? null
  let answer = cleanFinalAnswer(question, answerText)
  // 형식을 어긴 응답이어도 본문에서 답을 찾아 마킹
  if (!answer) {
    answer = cleanFinalAnswer(question, extractAnswerFallback(question, fullText))
    if (answer) emit('answer', answer)
  }
  return {
    answer,
    status: answer ? 'answered' : sawAnswerLine || message.stop_reason === 'max_tokens' ? 'parse_failed' : 'no_answer',
    refused: refused && !answer,
    refusalCategory,
    page,
    inputTokens: (message.usage?.input_tokens ?? 0) + (message.usage?.cache_creation_input_tokens ?? 0),
    cacheReadTokens: message.usage?.cache_read_input_tokens ?? 0,
    outputTokens: message.usage?.output_tokens ?? 0
  }
}

const SINGLE_ANSWER_SCHEMA = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
  additionalProperties: false
}

/**
 * @brief 마지막 안전장치: 결과 탭의 "한 번에 풀기"와 같은 구조화 응답으로 한 문항의 답만 받음
 * (스트리밍 풀이가 거절돼도 이 방식은 응답한 기록이 있어 마지막 단계로 사용)
 */
async function solveStructured({ client, modelInfo, effort, blocks, paper, question, signal, emit }) {
  const response = await client.messages.create({
    model: modelInfo.id,
    max_tokens: 8000,
    system: ANSWER_ONLY_PROMPT,
    output_config: { effort, format: { type: 'json_schema', schema: SINGLE_ANSWER_SCHEMA } },
    messages: [{ role: 'user', content: [...blocks, { type: 'text', text: questionPrompt(paper, question) }] }]
  }, { signal })
  const refused = response.stop_reason === 'refusal'
  const text = response.content.filter(block => block.type === 'text').map(block => block.text).join('')
  let raw = ''
  try { raw = JSON.parse(text).answer ?? '' } catch { raw = extractAnswerFallback(question, text) }
  const answer = cleanFinalAnswer(question, raw)
  if (answer) emit('answer', answer)
  return {
    answer,
    status: answer ? 'answered' : text ? 'parse_failed' : 'no_answer',
    refused: refused && !answer,
    refusalCategory: response.stop_details?.category ?? null,
    page: null,
    inputTokens: (response.usage?.input_tokens ?? 0) + (response.usage?.cache_creation_input_tokens ?? 0),
    cacheReadTokens: response.usage?.cache_read_input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0
  }
}

/** 거절되면 한 단계씩 낮춰 다시 요청: 자세한 풀이 → 답만(스트리밍) → 구조화 응답 */
const SOLVE_LADDER = ['detailed', 'answerOnly', 'structured']
const LADDER_NOTE = {
  answerOnly: '답만 다시 요청합니다.',
  structured: '한 번에 풀기와 같은 방식으로 답을 다시 요청합니다.'
}

/**
 * @brief 평가지 전체를 문항별로 실시간 풀이
 * @param {Object} options
 * @param {(event: Object) => void} options.onEvent - trace 이벤트가 생길 때마다 호출
 * @returns {Promise<Object>} 풀이 기록(Run) - trace, perQuestionMs 포함
 */
export async function runLiveSolve({ apiKey, model, effort = 'medium', paper, files, signal, onEvent, onStatus, onPageMap }) {
  if (!apiKey) throw new Error('Anthropic API 키를 먼저 입력하세요.')
  if (!files?.length) throw new Error('문제지 파일이 없습니다. 먼저 문제지를 업로드하세요.')
  if (estimateRequestBytes(files) > MAX_REQUEST_BYTES) {
    throw new Error(`문제지 파일이 너무 큽니다(약 ${(estimateRequestBytes(files) / 1048576).toFixed(0)}MB로 전송). 한 요청 한도(32MB)를 넘으니, 해당 과목 쪽만 남긴 PDF나 사진으로 다시 올려 주세요.`)
  }

  const modelInfo = CLAUDE_MODELS.find(item => item.id === model) ?? CLAUDE_MODELS[0]
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const blocks = await buildCachedBlocks(files)

  // 0단계: 문항 위치 찾기 (수행 시간에는 넣지 않음). 키·크레딧 오류는 여기서 바로 드러나 25문항을 헛돌지 않음
  onStatus?.('문제지에서 문항 위치를 찾는 중…')
  const locateStarted = performance.now()
  let pageMap = {}
  try {
    pageMap = await locateQuestions({ client, modelInfo, blocks, paper, signal })
  } catch (error) {
    if (signal?.aborted) throw error
    const info = describeApiError(error)
    if (info.fatal && info.status !== 400) throw new Error(info.message)
    if (info.status === 400 && /credit|balance|billing/i.test(info.message)) throw new Error(info.message)
    // 그 밖의 오류는 위치 없이 계속 (풀이 요청에서 다시 판단)
  }
  const locateMs = Math.round(performance.now() - locateStarted)
  onPageMap?.(pageMap)
  onStatus?.('')

  const started = performance.now()
  const trace = []
  const answers = {}
  const perQuestionMs = {}
  const errors = {}
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }
  // 계정에서 받지 않는 선택 기능은 400 오류가 나면 끄고 다시 시도
  const compat = { fallbacks: modelInfo.fallback }
  // 같은 단계에서 두 문항 연속 거절되면 남은 문항은 다음 단계부터 시작
  let baseLevel = 0
  let refusalsAtBase = 0
  const refusals = {}
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
    if (pageMap[question.no]) emit('page', `${pageMap[question.no].file + 1}-${pageMap[question.no].page}`)
    for (;;) {
      try {
        let level = baseLevel
        let result = null
        const spent = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }
        for (;;) {
          const mode = SOLVE_LADDER[level]
          result = mode === 'structured'
            ? await solveStructured({ client, modelInfo, effort, blocks, paper, question, signal, emit })
            : await solveOne({ client, modelInfo, effort, blocks, paper, question, signal, emit, compat, mode })
          spent.inputTokens += result.inputTokens
          spent.outputTokens += result.outputTokens
          spent.cacheReadTokens += result.cacheReadTokens
          if (level === baseLevel) {
            if (result.refused) {
              refusalsAtBase += 1
              if (refusalsAtBase >= 2 && baseLevel < SOLVE_LADDER.length - 1) {
                baseLevel += 1
                refusalsAtBase = 0
                emit('step', '거절이 이어져 남은 문항은 더 간단한 방식으로 답을 받습니다.')
              }
            } else {
              refusalsAtBase = 0
            }
          }
          if (!result.refused || level === SOLVE_LADDER.length - 1) break
          level += 1
          emit('step', `요청이 거절되어(분류: ${result.refusalCategory ?? '알 수 없음'}) ${LADDER_NOTE[SOLVE_LADDER[level]]}`)
        }
        Object.assign(result, spent)
        if (result.refused) {
          refusals[question.no] = result.refusalCategory ?? 'unknown'
          errors[question.no] = `모델이 이 문항에 답하기를 거절했습니다(분류: ${result.refusalCategory ?? '알 수 없음'}).`
          emit('step', errors[question.no])
        }
        answers[question.no] = { answer: result.answer, status: result.status }
        usage.inputTokens += result.inputTokens
        usage.outputTokens += result.outputTokens
        usage.cacheReadTokens += result.cacheReadTokens
        consecutiveFailures = 0
        break
      } catch (error) {
        if (signal?.aborted) { aborted = true; break }
        const info = describeApiError(error)
        if (info.status === 400 && compat.fallbacks && !/credit|balance|billing/i.test(info.message)) {
          compat.fallbacks = false
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
    pageMap,
    locateMs,
    refusals,
    solveMode: SOLVE_LADDER[baseLevel],
    trace,
    errors,
    fatalError,
    note: fatalError ? `오류로 멈춤: ${fatalError}` : aborted ? '중간에 멈춰 일부 문항은 풀지 않았습니다.' : ''
  }
}
