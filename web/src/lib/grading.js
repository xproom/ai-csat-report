/**
 * @file grading.js
 * @brief 풀이 기록 채점과 통계 집계
 */

import { roundPoints } from './schema.js'

/**
 * @brief 단답형 비교용 정규화 (공백·전각·대소문자·후행 단위 일부 무시)
 */
export function normalizeAnswer(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[.,。]$/, '')
    .toLowerCase()
}

/**
 * @brief 단답형 정답 판정
 * @param {string} given - 제출 답
 * @param {string} expected - 정답 (여러 개 허용 시 '|'로 구분, 예: "1/2|0.5")
 */
export function isShortAnswerCorrect(given, expected) {
  const target = normalizeAnswer(given)
  if (!target) return false
  return String(expected ?? '')
    .split('|')
    .map(normalizeAnswer)
    .filter(Boolean)
    .some(candidate => {
      if (candidate === target) return true
      const a = Number(candidate)
      const b = Number(target)
      return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9
    })
}

/** @brief 객관식 답을 선지 번호 문자열로 정리 ("③", "3번", " 3 " → "3") */
export function normalizeChoice(value) {
  const text = String(value ?? '').normalize('NFKC').trim()
  if (!text) return ''
  const circled = '①②③④⑤'.indexOf(text.charAt(0))
  if (circled !== -1) return String(circled + 1)
  const match = text.match(/\d+/)
  return match ? String(Number(match[0])) : ''
}

/**
 * @brief 객관식 정답을 선지 번호 묶음으로 정리 (복수 정답 지원)
 * - "③" → "3", "②④"·"2,4"·"2|4"·"2 4"·"24" → "2,4" (작은 번호부터, 중복 제거)
 * - 두 자리 이상 숫자는 선지 번호를 붙여 쓴 것으로 보고 한 자리씩 나눔
 */
export function normalizeChoiceSet(value) {
  const text = String(value ?? '').normalize('NFKC').replace(/[①-⑩]/g, char => ` ${'①②③④⑤⑥⑦⑧⑨⑩'.indexOf(char) + 1} `)
  const digits = []
  for (const group of text.match(/\d+/g) ?? []) {
    if (group.length > 1 && group !== '10') digits.push(...group.split('').map(Number))
    else digits.push(Number(group))
  }
  return [...new Set(digits.filter(digit => digit > 0))].sort((a, b) => a - b).join(',')
}

/** @brief 객관식 정답 묶음 → 번호 배열 */
export function choiceList(value) {
  const set = normalizeChoiceSet(value)
  return set ? set.split(',').map(Number) : []
}

/**
 * @brief 한 풀이 기록 채점
 * @returns {{
 *   score: number, maxScore: number, rate: number, correct: number, total: number,
 *   pendingEssays: number, invalid: number, noKey: number,
 *   items: Array<{ no, type, points, expected, given, status, correct: boolean|null, earned: number, noKey: boolean }>,
 *   byType: Record<string, { earned: number, max: number }>
 * }}
 */
export function gradeRun(paper, run) {
  const items = []
  const byType = {}
  let score = 0
  let maxScore = 0
  let correctCount = 0
  let pendingEssays = 0
  let invalid = 0
  let noKeyCount = 0

  for (const question of paper.questions) {
    const points = Number(question.points) || 0
    const entry = run?.answers?.[question.no] ?? run?.answers?.[String(question.no)]
    const given = entry?.answer ?? ''
    const status = entry?.status ?? (String(given).trim() ? 'answered' : 'no_answer')
    let correct = null
    let earned = 0
    // 실제 정답이 없는 객관식·단답형은 맞고 틀림을 정할 수 없음 (0점, 채점 제외 표시)
    const noKey = question.type !== 'essay' && !String(question.answer ?? '').trim()

    if (noKey) {
      noKeyCount += 1
      if (status !== 'answered') invalid += 1
    } else if (status !== 'answered') {
      invalid += 1
      correct = false
    } else if (question.type === 'choice') {
      // 복수 정답은 고른 번호 묶음이 정확히 같아야 정답
      correct = normalizeChoiceSet(given) !== '' && normalizeChoiceSet(given) === normalizeChoiceSet(question.answer)
    } else if (question.type === 'short') {
      correct = isShortAnswerCorrect(given, question.answer)
    }

    if (question.type === 'essay' && status === 'answered') {
      const manual = run?.essayScores?.[question.no] ?? run?.essayScores?.[String(question.no)]
      if (manual === undefined || manual === null || manual === '') {
        pendingEssays += 1
        correct = null
      } else {
        earned = Math.max(0, Math.min(points, Number(manual) || 0))
        correct = earned >= points
      }
    } else if (correct) {
      earned = points
    }

    if (correct) correctCount += 1
    score += earned
    maxScore += points
    byType[question.type] ??= { earned: 0, max: 0 }
    byType[question.type].earned += earned
    byType[question.type].max += points
    items.push({ no: question.no, type: question.type, points, expected: question.answer, given, status, correct, earned, noKey })
  }

  score = roundPoints(score)
  maxScore = roundPoints(maxScore)
  for (const value of Object.values(byType)) {
    value.earned = roundPoints(value.earned)
    value.max = roundPoints(value.max)
  }

  return {
    score,
    maxScore,
    rate: maxScore ? score / maxScore : 0,
    correct: correctCount,
    total: paper.questions.length,
    pendingEssays,
    invalid,
    noKey: noKeyCount,
    items,
    byType
  }
}

/**
 * @brief 문항별 정답률 (여러 풀이 기록 기준)
 * @returns {Array<{ no, type, points, rate: number|null, attempts: number }>}
 */
export function questionStats(paper, runs) {
  const graded = runs.map(run => gradeRun(paper, run))
  return paper.questions.map((question, index) => {
    const decided = graded.map(result => result.items[index]).filter(item => item.correct !== null)
    const correct = decided.filter(item => item.correct).length
    return {
      no: question.no,
      type: question.type,
      points: question.points,
      attempts: decided.length,
      rate: decided.length ? correct / decided.length : null
    }
  })
}

/**
 * @brief 모델별 종합 성적 (여러 평가지)
 * @param {Array<{ paper, runs }>} entries
 * @returns {Array<{ model, papers: number, avgRate: number, best: number, worst: number, bySubject: Record<string, number> }>}
 */
export function modelLeaderboard(entries) {
  const byModel = new Map()
  for (const { paper, runs } of entries) {
    for (const run of runs) {
      const result = gradeRun(paper, run)
      if (!byModel.has(run.model)) byModel.set(run.model, { model: run.model, rates: [], subjects: {}, isDemo: Boolean(run.isDemo) })
      const row = byModel.get(run.model)
      row.rates.push(result.rate)
      const subject = paper.meta.subject
      row.subjects[subject] ??= []
      row.subjects[subject].push(result.rate)
    }
  }
  const average = values => values.reduce((sum, value) => sum + value, 0) / values.length
  return [...byModel.values()]
    .map(row => ({
      model: row.model,
      isDemo: row.isDemo,
      papers: row.rates.length,
      avgRate: average(row.rates),
      best: Math.max(...row.rates),
      worst: Math.min(...row.rates),
      bySubject: Object.fromEntries(Object.entries(row.subjects).map(([subject, rates]) => [subject, average(rates)]))
    }))
    .sort((a, b) => b.avgRate - a.avgRate)
}

/** @brief 득점률을 "85.0%" 형태로 */
export function formatRate(rate) {
  return rate == null || Number.isNaN(rate) ? '—' : `${(rate * 100).toFixed(1)}%`
}
