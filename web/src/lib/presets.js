/**
 * @file presets.js
 * @brief 수능·모의고사 과목별 표준 문항 구성과, 정답표로 문항 구성을 짐작하는 기능
 *
 * 배점은 대표적인 배분입니다(총점이 맞도록 잡은 값). 실제 정답표에 배점이 있으면 그 값으로 덮어씁니다.
 */

import { normalizeChoiceSet } from './grading.js'
import { formTypeOf } from './schema.js'

/** 표준 구성을 쓰는 시험 종류 */
export const STANDARD_EXAM_TYPES = ['수능', '모의고사', '모의평가']

/** 과목별 선택과목 (선택과목 문항은 문제지에서 해당 과목 부분을 풀어야 함) */
export const ELECTIVES = {
  수학: ['확률과 통계', '미적분', '기하'],
  국어: ['화법과 작문', '언어와 매체']
}

/** 2점·3점을 섞어 총점을 맞춤: threeNos에 든 번호만 3점 */
function points2or3(count, threeCount) {
  const threes = new Set()
  // 3점 문항을 고르게 흩어 놓음
  for (let i = 0; i < threeCount; i += 1) threes.add(Math.round(((i + 0.5) * count) / threeCount))
  return no => (threes.has(no) ? 3 : 2)
}

// 표준 구성의 배점은 짐작값이라 pointsEstimated로 표시 (문제지의 [N점] 표시를 읽으면 그 값으로 바뀜)
function choice(no, points, extra = {}) {
  return { no, type: 'choice', choices: 5, points, pointsEstimated: true, answer: '', unit: '', ...extra }
}
function short(no, points, extra = {}) {
  return { no, type: 'short', choices: 5, points, pointsEstimated: true, answer: '', unit: '', ...extra }
}

/** 수능 수학: 공통 1~15 객관식·16~22 단답, 선택 23~28 객관식·29~30 단답 (공통 74점 + 선택 26점) */
function mathPreset() {
  const commonPoints = { 1: 2, 2: 2, 16: 2, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 17: 3, 18: 3, 19: 3 }
  const electivePoints = { 23: 2, 24: 3, 25: 3, 26: 3, 27: 3, 28: 4, 29: 4, 30: 4 }
  const questions = []
  for (let no = 1; no <= 30; no += 1) {
    const elective = no >= 23
    const points = elective ? electivePoints[no] : commonPoints[no] ?? 4
    const isShort = (no >= 16 && no <= 22) || no >= 29
    questions.push(isShort ? short(no, points, elective ? { elective: true } : {}) : choice(no, points, elective ? { elective: true } : {}))
  }
  return questions
}

/** 45문항 5지선다 (국어는 35~45번이 선택과목), 2점 35개 + 3점 10개 = 100점 */
function choice45(electiveFrom = null) {
  const pointsOf = points2or3(45, 10)
  return Array.from({ length: 45 }, (_, index) => {
    const no = index + 1
    return choice(no, pointsOf(no), electiveFrom && no >= electiveFrom ? { elective: true } : {})
  })
}

/** 20문항 5지선다, 2점 10개 + 3점 10개 = 50점 (한국사·탐구) */
function choice20() {
  const pointsOf = points2or3(20, 10)
  return Array.from({ length: 20 }, (_, index) => choice(index + 1, pointsOf(index + 1)))
}

/**
 * @brief 평가지 표지 옵션에 맞는 표준 구성
 * @returns {{ label: string, questions: Array } | null} 표준 구성이 없으면 null
 */
export function standardPreset(meta) {
  if (!STANDARD_EXAM_TYPES.includes(meta.examType) || meta.schoolLevel !== '고등') return null
  switch (meta.subject) {
    case '수학': return { label: '수학 30문항 (객관식 21 · 단답형 9, 23~30번 선택과목)', questions: mathPreset() }
    case '국어': return { label: '국어 45문항 5지선다 (35~45번 선택과목)', questions: choice45(35) }
    case '영어': return { label: '영어 45문항 5지선다', questions: choice45() }
    default: return { label: `${meta.subject} 20문항 5지선다 (50점)`, questions: choice20() }
  }
}

/**
 * @brief 정답표 항목으로 문항 구성을 짐작
 * - 표준 구성이 있으면 그 번호의 유형·배점·선택과목 표시를 따름
 * - 없으면 ①~⑤로 적힌 답이나 1~5 한 자리 숫자는 객관식, 그 밖은 단답형
 * - 정답표의 배점이 있으면 그 값을 씀
 * @param {Array<{ no, answer, points?, circled? }>} entries
 * @param {Object} meta - 평가지 표지 옵션
 */
export function questionsFromAnswerKey(entries, meta) {
  const preset = standardPreset(meta)
  const presetByNo = new Map((preset?.questions ?? []).map(question => [question.no, question]))
  return [...entries]
    .sort((a, b) => a.no - b.no)
    .map(entry => {
      const base = presetByNo.get(entry.no)
      const text = String(entry.answer ?? '').trim()
      const looksChoice = entry.circled || /^[1-5]$/.test(text)
      const type = base?.type ?? (looksChoice ? 'choice' : 'short')
      const keyPoints = Number.isFinite(entry.points) && entry.points > 0
      const points = keyPoints ? entry.points : base?.points ?? (type === 'choice' ? 3 : 4)
      return {
        no: entry.no,
        type,
        choices: base?.choices ?? 5,
        points,
        ...(keyPoints ? {} : { pointsEstimated: true }),
        answer: type === 'choice' ? normalizeChoiceSet(text) : text,
        unit: '',
        ...(base?.elective ? { elective: true } : {})
      }
    })
}

/** @brief 문항 구성 요약 (예: "30문항 · 객관식 21 · 단답형 9") */
export function describeComposition(questions) {
  const count = type => questions.filter(question => question.type === type).length
  const parts = [`${questions.length}문항`]
  if (count('choice')) parts.push(`객관식 ${count('choice')}`)
  if (count('short')) parts.push(`단답형 ${count('short')}`)
  if (count('essay')) parts.push(`서술형 ${count('essay')}`)
  return parts.join(' · ')
}

/** @brief 평가지에 선택과목이 정해져 있으면 그 이름 (없으면 '') */
export function electiveOf(paper) {
  const options = ELECTIVES[paper?.meta?.subject] ?? []
  return options.includes(paper?.meta?.elective) ? paper.meta.elective : ''
}

/**
 * @brief AI 지시문에 넣을 선택과목 안내
 * - 문항 하나: 선택과목 문항이면 "문제지의 ○○ 부분에 있는 N번"을 풀라고 안내
 * - 문항 없이: 시험 전체에 대한 한 줄 안내
 */
export function electiveNote(paper, question = null) {
  const elective = electiveOf(paper)
  if (!elective) return ''
  if (question) return question.elective ? `이 문항은 선택과목 "${elective}" 문항입니다. 문제지에서 ${elective} 부분에 있는 ${question.no}번을 풀어 주세요.` : ''
  const electiveNos = (paper.questions ?? []).filter(item => item.elective).map(item => item.no)
  const range = electiveNos.length ? `${Math.min(...electiveNos)}~${Math.max(...electiveNos)}번` : '선택과목 문항'
  return `응시한 선택과목은 "${elective}"입니다. ${range}은 문제지의 ${elective} 부분에서 찾으세요.`
}

/**
 * @brief 홀수형·짝수형 안내 (한 파일에 두 형이 함께 있을 때 평가지의 형만 풀도록)
 * @returns {string} 나누지 않는 시험이면 빈 문자열
 */
export function formNote(paper) {
  const form = formTypeOf(paper.meta)
  return form ? `이 평가지는 ${form}입니다. 첨부한 문제지에 홀수형과 짝수형이 함께 있으면 ${form} 부분만 보고 푸세요.` : ''
}
