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

export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', fallback: true },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', fallback: true },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', fallback: false },
  { id: 'claude-fable-5-2', label: 'Claude Fable 5.2', fallback: true }
]

export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max']

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
      return `${question.no}번: ${detail} (${question.points}점)`
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

  // 안전 분류기가 거절하면 같은 요청을 다른 모델로 이어서 처리 (지원 모델만)
  const response = modelInfo.fallback
    ? await client.beta.messages.create(
      { ...request, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
      { signal }
    )
    : await client.messages.create(request, { signal })

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
    content: [block, { type: 'text', text: `이 시험은 ${paper.questions.length}문항입니다.\n${describeQuestions(paper)}` }],
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
