/**
 * @file answerKey.js
 * @brief 실제 정답(정답표) 업로드 파싱과 현재 정답과의 비교
 *
 * 지원 형식
 * - JSON: {"1":"3","2":"5"} / [{"no":1,"answer":"3"}] / {"answers":{...}}
 * - 줄 단위 CSV·TSV·텍스트: "1,3" "1\t③" "1번 ③" "1. 3" "1: 3" "1) 3" (세 번째 칸이 있으면 배점)
 * - 한 줄 나열: "1-3 2-5 3-1" "1:3, 2:5"
 * - 번호 없이 순서대로: "3 5 1 2 4" 또는 객관식만 "35124" (문항 순서대로 대입)
 */

import { normalizeChoiceSet } from './grading.js'
import { questionsFromAnswerKey } from './presets.js'

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩'

/** @brief ①~⑩을 숫자로 바꾸고 앞뒤 공백 제거 */
function cleanAnswer(value) {
  return String(value ?? '')
    .replace(/[①-⑩]/g, char => String(CIRCLED.indexOf(char) + 1))
    .replace(/^["']|["']$/g, '')
    .trim()
}

/** @brief 문항 유형에 맞게 정답 값 정리 (객관식은 선지 번호만) */
function normalizeFor(question, value) {
  const text = cleanAnswer(value)
  if (!question) return text
  return question.type === 'choice' ? normalizeChoiceSet(text) : text
}

function fromJson(data) {
  const source = Array.isArray(data) ? data : data?.answers ?? data
  const entries = []
  if (Array.isArray(source)) {
    for (const item of source) {
      if (item && item.no != null) entries.push({ no: Number(item.no), answer: item.answer, points: item.points })
    }
  } else if (source && typeof source === 'object') {
    for (const [no, answer] of Object.entries(source)) {
      if (/^\d+$/.test(no)) entries.push({ no: Number(no), answer: typeof answer === 'object' ? answer?.answer : answer, points: typeof answer === 'object' ? answer?.points : undefined })
    }
  }
  return entries
}

/** @brief "번호 구분자 정답 [배점]" 형태의 줄 */
const LINE_PATTERN = /^\s*(\d{1,3})\s*(?:번|\.|\)|:|,|\t|-|=|\s)\s*([^,\t]+?)\s*(?:[,\t]\s*([\d.]+)\s*점?)?\s*$/

function fromLines(text) {
  const entries = []
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  // 머리글 줄(번호,정답 …) 건너뜀
  const body = lines.filter(line => !/^(번호|문항|no|q)\b/i.test(line))
  for (const line of body) {
    // 한 줄에 여러 쌍: "1-3 2-5" "1:3, 2:5"
    const pairs = [...line.matchAll(/(\d{1,3})\s*(?:번|[-:=)])\s*([①-⑩]|[^\s,;]+)/g)]
    if (pairs.length > 1) {
      for (const [, no, answer] of pairs) entries.push({ no: Number(no), answer })
      continue
    }
    const match = line.match(LINE_PATTERN)
    if (match) entries.push({ no: Number(match[1]), answer: match[2], points: match[3] ? Number(match[3]) : undefined })
  }
  return entries
}

/** @brief 번호 없이 정답만 나열한 경우 순서대로 1번부터 번호를 붙임 */
function fromSequence(text) {
  const compact = text.replace(/[①-⑩]/g, char => ` ${CIRCLED.indexOf(char) + 1} `).trim()
  let tokens = compact.split(/[\s,;/|]+/).filter(Boolean)
  // "35124"처럼 붙여 쓴 객관식 정답
  if (tokens.length === 1 && /^[1-9]+$/.test(tokens[0])) tokens = tokens[0].split('')
  return tokens.map((answer, index) => ({ no: index + 1, answer }))
}

/**
 * @brief 업로드한 정답 텍스트 해석
 * @returns {{ entries: Array<{ no, answer, points? }>, allEntries: Array<{ no, answer, points?, circled }>, format: string, unknownNos: number[] }}
 *   entries는 평가지에 있는 번호만, allEntries는 정답표의 모든 번호 (문항 구성을 정답표에 맞출 때 사용)
 */
export function parseAnswerKey(text, paper) {
  // trim()은 파일 앞의 BOM도 함께 제거함
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return { entries: [], allEntries: [], format: 'empty', unknownNos: [] }

  let entries = []
  let format = ''
  if (/^[[{]/.test(trimmed)) {
    try {
      entries = fromJson(JSON.parse(trimmed))
      format = 'JSON'
    } catch {
      entries = []
    }
  }
  if (!entries.length) {
    entries = fromLines(trimmed)
    format = '번호별 목록'
  }
  // 번호로 읽힌 항목이 없거나, 번호 없이 문항 대부분을 순서대로 나열한 경우에만 순서 대입 (JSON은 제외)
  if (format !== 'JSON' && entries.length < Math.min(3, paper.questions.length)) {
    const sequence = fromSequence(trimmed)
    const looksLikeSequence = entries.length === 0 || sequence.length >= paper.questions.length * 0.8
    if (looksLikeSequence && sequence.length > entries.length) {
      entries = sequence
      format = '순서대로 나열'
    }
  }

  // 정답표의 모든 항목 (번호 중복이면 마지막 값, 중복 번호는 따로 기록해 검증에 씀)
  const allByNo = new Map()
  const duplicateNos = new Set()
  for (const entry of entries) {
    if (!Number.isInteger(entry.no) || entry.no < 1 || entry.no > 200) continue
    if (allByNo.has(entry.no)) duplicateNos.add(entry.no)
    allByNo.set(entry.no, {
      no: entry.no,
      answer: cleanAnswer(entry.answer),
      points: Number.isFinite(entry.points) && entry.points > 0 ? entry.points : undefined,
      circled: /[①-⑩]/.test(String(entry.answer ?? ''))
    })
  }
  const allEntries = [...allByNo.values()].sort((a, b) => a.no - b.no)

  const byNo = new Map(paper.questions.map(question => [question.no, question]))
  const unknownNos = []
  const merged = new Map()
  for (const entry of entries) {
    const question = byNo.get(entry.no)
    if (!question) {
      unknownNos.push(entry.no)
      continue
    }
    merged.set(entry.no, {
      no: entry.no,
      answer: normalizeFor(question, entry.answer),
      points: Number.isFinite(entry.points) && entry.points > 0 ? entry.points : undefined
    })
  }
  return { entries: [...merged.values()].sort((a, b) => a.no - b.no), allEntries, format, unknownNos: [...new Set(unknownNos)], duplicateNos: [...duplicateNos].sort((a, b) => a - b) }
}

/**
 * @brief 현재 정답과 업로드 정답 비교
 * @returns {Array<{ no, type, current, uploaded, status: 'same'|'changed'|'new'|'missing' }>}
 */
export function diffAnswerKey(paper, entries) {
  const byNo = new Map(entries.map(entry => [entry.no, entry]))
  return paper.questions.map(question => {
    const uploaded = byNo.get(question.no)
    const current = String(question.answer ?? '').trim()
    let status = 'missing'
    if (uploaded) {
      if (!current) status = 'new'
      else if (question.type === 'choice' ? normalizeChoiceSet(current) === uploaded.answer : current === uploaded.answer) status = 'same'
      else status = 'changed'
    }
    return { no: question.no, type: question.type, current, uploaded: uploaded?.answer ?? '', points: uploaded?.points, status }
  })
}

/** @brief 업로드 정답을 평가지에 반영 */
export function applyAnswerKey(paper, entries, { fileName = '', applyPoints = true, parsed = null } = {}) {
  const byNo = new Map(entries.map(entry => [entry.no, entry]))
  return {
    ...paper,
    questions: paper.questions.map(question => {
      const entry = byNo.get(question.no)
      if (!entry) return question
      return { ...question, answer: entry.answer, ...(applyPoints && entry.points ? { points: entry.points } : {}) }
    }),
    answerKeySource: { type: 'upload', fileName, appliedAt: new Date().toISOString(), count: entries.length, ...keyNumbering(parsed) }
  }
}

/** @brief 정답표에 적힌 번호 목록과 중복 번호 (문항 번호 검증용) */
function keyNumbering(parsed) {
  if (!parsed) return {}
  return { nos: parsed.allEntries.map(entry => entry.no), duplicateNos: parsed.duplicateNos ?? [] }
}

/**
 * @brief 정답표로 짐작한 문항 구성과 현재 구성이 다른지
 * - 정답표에 평가지에 없는 번호가 있거나, 같은 번호의 유형이 다르면 다르다고 봄
 * @returns {{ questions: Array, differs: boolean }}
 */
export function proposeStructure(paper, parsed) {
  if (!parsed?.allEntries?.length || parsed.allEntries.length < 3) return { questions: [], differs: false }
  const questions = questionsFromAnswerKey(parsed.allEntries, paper.meta)
  const currentByNo = new Map(paper.questions.map(question => [question.no, question]))
  const differs = parsed.unknownNos.length > 0
    || questions.length !== paper.questions.length
    || questions.some(question => currentByNo.get(question.no)?.type !== question.type)
  return { questions, differs }
}

/**
 * @brief 정답표 텍스트를 평가지에 반영 (필요하면 문항 구성도 정답표에 맞춤)
 * @param {'auto'|'never'|'always'} options.restructure - auto면 구성이 다를 때만 정답표대로 바꿈
 * @returns {{ paper: Object, restructured: boolean, count: number }}
 */
export function applyAnswerKeyText(paper, text, { fileName = '', restructure = 'auto', applyPoints = true } = {}) {
  const parsed = parseAnswerKey(text, paper)
  const proposal = proposeStructure(paper, parsed)
  const useStructure = restructure === 'always' || (restructure === 'auto' && proposal.differs)
  if (useStructure && proposal.questions.length) {
    return {
      paper: {
        ...paper,
        questions: proposal.questions,
        answerKeySource: { type: 'upload', fileName, appliedAt: new Date().toISOString(), count: proposal.questions.length, restructured: true, ...keyNumbering(parsed) }
      },
      restructured: true,
      count: proposal.questions.filter(question => question.answer).length
    }
  }
  return { paper: applyAnswerKey(paper, parsed.entries, { fileName, applyPoints, parsed }), restructured: false, count: parsed.entries.length }
}
