/**
 * @file aiRunner.js
 * @brief 업로드한 문제지를 Claude에게 풀게 하고 문항별 답을 받아 풀이 기록(Run)으로 변환
 *
 * - 사용자가 입력한 본인 API 키로 브라우저에서 직접 호출합니다(BYOK). 키는 이 브라우저에만 저장됩니다.
 * - 문제지(PDF·이미지)를 그대로 첨부하고, 구조화 출력(JSON 스키마)으로 문항 번호별 답을 받습니다.
 * - 다른 회사 모델 결과는 '결과 가져오기(JSON)'나 OMR 직접 입력으로 추가합니다.
 */

import Anthropic from '@anthropic-ai/sdk'
import { blobToBase64 } from './db.js'
import { makeId, QUESTION_TYPES } from './schema.js'
import { electiveNote, electiveOf } from './presets.js'

export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', fallback: true },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', fallback: true },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', fallback: false },
  { id: 'claude-fable-5-2', label: 'Claude Fable 5.2', fallback: true }
]

export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max']

/** 한 요청의 최대 크기(32MB)보다 조금 작게 잡은 문제지 크기 한도 (base64로 늘어나는 양 포함) */
export const MAX_REQUEST_BYTES = 31 * 1024 * 1024

/** @brief 문제지 파일을 base64로 보낼 때의 대략적인 요청 크기 */
export function estimateRequestBytes(files) {
  return files.reduce((sum, file) => sum + Math.ceil((file.size ?? file.blob?.size ?? 0) / 3) * 4, 0) + 20000
}

/** @brief API 오류 본문의 메시지 */
function rawMessage(error) {
  return error?.error?.error?.message || error?.error?.message || error?.message || String(error ?? '알 수 없는 오류')
}

/**
 * @brief API 오류를 사용자가 이해할 수 있는 한국어 설명으로
 * @returns {{ message: string, fatal: boolean, status: number|null }}
 *   fatal이면 같은 설정으로 다른 문항을 풀어도 똑같이 실패하므로 풀이 전체를 멈춤
 */
export function describeApiError(error) {
  const status = Number(error?.status) || null
  const raw = rawMessage(error)
  const lower = raw.toLowerCase()
  if (!status) {
    return { status, fatal: true, message: `Anthropic API에 연결하지 못했습니다. 인터넷 연결, 회사·학교 방화벽, 광고 차단 같은 브라우저 확장 프로그램이 api.anthropic.com 요청을 막는지 확인하세요. (${raw})` }
  }
  if (status === 401) return { status, fatal: true, message: `API 키가 올바르지 않습니다(401). 설정에서 키를 다시 확인하세요. (${raw})` }
  if (status === 403) return { status, fatal: true, message: `이 API 키로는 요청이 허용되지 않습니다(403). 키의 권한이나 워크스페이스 설정을 확인하세요. (${raw})` }
  if (status === 404) return { status, fatal: true, message: `모델을 찾을 수 없습니다(404). 이 계정에서 선택한 모델을 쓸 수 있는지 확인하고 다른 모델로 시도해 보세요. (${raw})` }
  if (status === 413) return { status, fatal: true, message: `요청이 너무 큽니다(413). 문제지 파일이 한 요청 한도(32MB)를 넘습니다. 해당 과목 쪽만 남긴 PDF로 다시 올려 주세요. (${raw})` }
  if (status === 400 && /credit|balance|billing/.test(lower)) return { status, fatal: true, message: `API 크레딧 잔액이 부족합니다(400). Anthropic 콘솔에서 결제 상태를 확인하세요. (${raw})` }
  if (status === 400 && /pdf|page|document/.test(lower)) return { status, fatal: true, message: `문제지 PDF를 처리하지 못했습니다(400). 쪽 수가 너무 많거나 암호가 걸린 PDF일 수 있습니다. (${raw})` }
  if (status === 400) return { status, fatal: true, message: `요청 형식 오류(400): ${raw}` }
  if (status === 429) return { status, fatal: false, message: `요청 한도를 넘었습니다(429). 잠시 후 다시 시도하세요. (${raw})` }
  return { status, fatal: false, message: `Anthropic 서버 오류(${status}). 잠시 후 다시 시도하세요. (${raw})` }
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    answers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          no: { type: 'integer' },
          answer: { type: 'string' }
        },
        required: ['no', 'answer'],
        additionalProperties: false
      }
    }
  },
  required: ['answers'],
  additionalProperties: false
}

const SYSTEM_PROMPT = `당신은 한국 학교의 정기고사를 치르는 학생입니다. 첨부된 문제지의 모든 문항을 풀고, 문항 번호별 최종 답만 제출합니다.
답안 작성 규칙:
- 객관식: 고른 선지 번호를 숫자 하나로 쓴다 (예: "3").
- 단답형: 최종 답만 간단히 쓴다. 단위가 필요한 경우에만 붙인다.
- 서술형: 채점자가 읽을 수 있도록 풀이 과정과 답을 3~6문장으로 쓴다.
- 풀 수 없는 문항도 가장 그럴듯한 답을 쓴다. 문제지에서 해당 번호를 찾을 수 없을 때만 빈 문자열을 쓴다.`

/** @brief 문항 구성 안내문 (모델이 번호와 유형을 맞추도록) */
function describeQuestions(paper) {
  return paper.questions
    .map(question => {
      const type = QUESTION_TYPES[question.type]
      const detail = question.type === 'choice' ? `${question.choices}지선다` : type
      const elective = question.elective && electiveOf(paper) ? ` - 선택과목 ${electiveOf(paper)} 부분` : ''
      return `${question.no}번: ${detail} (${question.points}점)${elective}`
    })
    .join('\n')
}

/** @brief 업로드 파일을 Claude 콘텐츠 블록으로 변환 */
async function fileToBlock(file) {
  const data = await blobToBase64(file.blob)
  if (file.type === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
  }
  if (IMAGE_TYPES.includes(file.type)) {
    return { type: 'image', source: { type: 'base64', media_type: file.type, data } }
  }
  throw new Error(`지원하지 않는 파일 형식입니다: ${file.name}`)
}

/**
 * @brief Claude로 평가지 풀이 실행
 * @param {Object} options
 * @param {string} options.apiKey
 * @param {string} options.model - CLAUDE_MODELS의 id
 * @param {string} options.effort
 * @param {Object} options.paper
 * @param {Array<{ name, type, blob }>} options.files - 문제지 파일
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Object>} 풀이 기록(Run)
 */
export async function runClaudeOnPaper({ apiKey, model, effort = 'high', paper, files, signal }) {
  if (!apiKey) throw new Error('설정에서 Anthropic API 키를 먼저 입력하세요.')
  if (!files?.length) throw new Error('문제지 파일이 없습니다. 먼저 문제지를 업로드하세요.')
  if (estimateRequestBytes(files) > MAX_REQUEST_BYTES) {
    throw new Error('문제지 파일이 너무 큽니다. 한 요청 한도(32MB)를 넘으니, 해당 과목 쪽만 남긴 PDF나 사진으로 다시 올려 주세요.')
  }

  const modelInfo = CLAUDE_MODELS.find(item => item.id === model) ?? CLAUDE_MODELS[0]
  const blocks = await Promise.all(files.map(fileToBlock))
  const { response, text, durationMs } = await callClaude({
    apiKey,
    modelInfo,
    effort,
    system: SYSTEM_PROMPT,
    content: [
      ...blocks,
      { type: 'text', text: `문항 구성:\n${describeQuestions(paper)}\n\n위 ${paper.questions.length}개 문항의 답을 모두 제출하세요.` }
    ],
    signal
  })
  const answers = parseAnswers(text, paper)
  if (response.stop_reason === 'max_tokens') {
    for (const entry of Object.values(answers)) {
      if (entry.status === 'no_answer') entry.status = 'parse_failed'
    }
  }

  return {
    id: makeId('run'),
    paperId: paper.id,
    model: modelInfo.label,
    modelId: response.model ?? modelInfo.id,
    source: 'ai',
    isDemo: false,
    createdAt: new Date().toISOString(),
    effort,
    answers,
    essayScores: {},
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0
    },
    durationMs,
    note: response.stop_reason === 'max_tokens' ? '출력 한도에 걸려 일부 답이 잘렸을 수 있습니다.' : ''
  }
}

/**
 * @brief Claude 요청 공통 처리 (구조화 출력, 거절 시 서버 측 대체 모델, 거절 응답 오류 처리)
 * @returns {Promise<{ response, text: string, durationMs: number }>} durationMs는 요청 시작부터 응답까지의 실제 시간
 */
async function callClaude({ apiKey, modelInfo, effort, system, content, signal }) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const started = performance.now()
  const request = {
    model: modelInfo.id,
    max_tokens: 16000,
    system,
    output_config: { effort, format: { type: 'json_schema', schema: ANSWER_SCHEMA } },
    messages: [{ role: 'user', content }]
  }

  // 안전 분류기가 거절하면 같은 요청을 다른 모델로 이어서 처리 (지원 모델만).
  // 계정에서 이 선택 기능을 받지 않으면(400) 기능 없이 한 번 더 보냄.
  let response
  try {
    response = modelInfo.fallback
      ? await client.beta.messages.create(
        { ...request, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
        { signal }
      )
      : await client.messages.create(request, { signal })
  } catch (error) {
    if (signal?.aborted) throw error
    // 크레딧 부족처럼 기능과 무관한 400은 다시 보내도 같으므로 바로 안내
    const optionalFeatureRejected = modelInfo.fallback && Number(error?.status) === 400 && !/credit|balance|billing/i.test(rawMessage(error))
    if (!optionalFeatureRejected) throw new Error(describeApiError(error).message)
    try {
      response = await client.messages.create(request, { signal })
    } catch (retryError) {
      if (signal?.aborted) throw retryError
      throw new Error(describeApiError(retryError).message)
    }
  }

  if (response.stop_reason === 'refusal') {
    throw new Error(`모델이 응답을 거절했습니다${response.stop_details?.category ? ` (${response.stop_details.category})` : ''}.`)
  }

  const text = response.content.filter(block => block.type === 'text').map(block => block.text).join('')
  return { response, text, durationMs: Math.round(performance.now() - started) }
}

const KEY_READER_PROMPT = `첨부한 자료는 학교 시험의 정답표(답안지)입니다. 문제를 풀지 말고, 정답표에 적힌 각 문항 번호의 정답을 그대로 옮겨 적으세요.
- 객관식은 선지 번호를 숫자 하나로 쓴다 (예: ③ → "3").
- 단답형은 적힌 답을 그대로 쓴다. 정답이 여러 개면 "|"로 구분한다.
- 서술형 모범답안은 핵심만 한두 문장으로 쓴다.
- 정답표에 없는 번호는 넣지 않는다.`

/**
 * @brief 정답표 PDF·사진에서 Claude로 정답 읽기
 * @returns {Promise<string>} answerKey.parseAnswerKey에 넣을 JSON 텍스트
 */
export async function readAnswerKeyWithClaude({ apiKey, model = CLAUDE_MODELS[0].id, paper, file, signal }) {
  if (!apiKey) throw new Error('정답표 사진·PDF를 읽으려면 설정에서 Anthropic API 키를 입력하세요.')
  const modelInfo = CLAUDE_MODELS.find(item => item.id === model) ?? CLAUDE_MODELS[0]
  const block = await fileToBlock(file)
  const { text } = await callClaude({
    apiKey,
    modelInfo,
    effort: 'low',
    system: KEY_READER_PROMPT,
    content: [block, { type: 'text', text: `이 시험은 ${paper.questions.length}문항입니다. ${electiveNote(paper)}\n${describeQuestions(paper)}` }],
    signal
  })
  return text
}

/**
 * @brief 모델 응답 JSON을 문항별 답으로 변환
 * @returns {Record<number, { answer: string, status: string }>}
 */
export function parseAnswers(text, paper) {
  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch {
    const match = String(text).match(/\{[\s\S]*\}/)
    if (match) {
      try { parsed = JSON.parse(match[0]) } catch { parsed = null }
    }
  }
  const list = Array.isArray(parsed?.answers) ? parsed.answers : []
  const byNo = new Map(list.map(item => [Number(item.no), String(item.answer ?? '').trim()]))
  const answers = {}
  for (const question of paper.questions) {
    const answer = byNo.get(question.no) ?? ''
    answers[question.no] = {
      answer,
      status: parsed === null ? 'parse_failed' : answer ? 'answered' : 'no_answer'
    }
  }
  return answers
}

/**
 * @brief 외부에서 만든 결과 JSON을 풀이 기록으로 변환
 * 허용 형식:
 *   { "model": "GPT-6", "answers": { "1": "3", "2": "5" } }
 *   { "model": "GPT-6", "answers": [{ "no": 1, "answer": "3" }] }
 *   또는 위 객체들의 배열
 */
export function importRuns(json, paper) {
  const items = Array.isArray(json) ? json : [json]
  return items.map(item => {
    if (!item?.model) throw new Error('각 결과에 "model" 이름이 필요합니다.')
    const raw = Array.isArray(item.answers)
      ? Object.fromEntries(item.answers.map(entry => [entry.no, entry.answer]))
      : item.answers || {}
    const answers = {}
    for (const question of paper.questions) {
      const value = raw[question.no] ?? raw[String(question.no)]
      const answer = value == null ? '' : String(value).trim()
      answers[question.no] = { answer, status: answer ? 'answered' : 'no_answer' }
    }
    return {
      id: makeId('run'),
      paperId: paper.id,
      model: String(item.model),
      source: 'import',
      isDemo: false,
      createdAt: new Date().toISOString(),
      answers,
      essayScores: item.essayScores || {},
      usage: item.usage || {},
      // 수행 시간: durationMs(밀리초) 또는 seconds(초)
      durationMs: Number(item.durationMs) || (Number(item.seconds) > 0 ? Math.round(Number(item.seconds) * 1000) : 0),
      note: item.note || ''
    }
  })
}
