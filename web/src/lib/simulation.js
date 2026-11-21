/**
 * @file simulation.js
 * @brief OMR 시뮬레이션 타임라인 - 모델이 문항을 풀어 마킹하고(1단계), 정답과 비교해 채점하는(2단계) 과정을 단계별로 재생
 *
 * 시간 배분: API는 전체 수행 시간만 알려주므로, 측정된 전체 시간을 문항 유형별 가중치로 나눠 문항별 시간을 추정합니다.
 * (객관식 1 : 단답형 1.6 : 서술형 3.5) 측정값이 없으면 객관식 1문항 20초를 기준으로 추정합니다.
 */

import { gradeRun } from './grading.js'

export const TYPE_WEIGHT = { choice: 1, short: 1.6, essay: 3.5 }
const FALLBACK_MS_PER_WEIGHT = 20000

/** @brief 재생 시 풀이 단계 전체 길이(1배속) */
export const MARK_PLAYBACK_MS = 12000
/** @brief 재생 시 채점 단계 문항당 길이(1배속) */
export const GRADE_STEP_MS = 160

/**
 * @param {Object} paper
 * @param {Object} run
 * @returns {{
 *   steps: Array<{ phase: 'mark'|'grade', no, type, simMs, startSimMs, answer, status, correct, earned, points, expected }>,
 *   totalSimMs: number, measured: boolean, markCount: number, result: Object
 * }}
 */
export function buildTimeline(paper, run) {
  const result = gradeRun(paper, run)
  const measured = Number(run?.durationMs) > 0
  const totalWeight = paper.questions.reduce((sum, question) => sum + (TYPE_WEIGHT[question.type] ?? 1), 0) || 1
  const totalSimMs = measured ? Number(run.durationMs) : totalWeight * FALLBACK_MS_PER_WEIGHT

  const steps = []
  let clock = 0
  paper.questions.forEach((question, index) => {
    const item = result.items[index]
    const simMs = totalSimMs * ((TYPE_WEIGHT[question.type] ?? 1) / totalWeight)
    steps.push({ phase: 'mark', no: question.no, type: question.type, simMs, startSimMs: clock, answer: item.given, status: item.status, points: item.points })
    clock += simMs
  })
  paper.questions.forEach((question, index) => {
    const item = result.items[index]
    steps.push({ phase: 'grade', no: question.no, type: question.type, simMs: 0, startSimMs: totalSimMs, answer: item.given, status: item.status, correct: item.correct, earned: item.earned, points: item.points, expected: question.answer })
  })
  return { steps, totalSimMs, measured, markCount: paper.questions.length, result }
}

/** @brief 단계 하나의 재생 길이(ms) */
export function playbackDelay(step, timeline, speed = 1) {
  if (step.phase === 'grade') return GRADE_STEP_MS / speed
  const share = timeline.totalSimMs ? step.simMs / timeline.totalSimMs : 1 / timeline.markCount
  return Math.max(90, MARK_PLAYBACK_MS * share) / speed
}

/**
 * @brief 완료한 단계 수(done) 기준 진행 상태
 * @returns {{ visibleNos: Set<number>, gradedNos: Set<number>, simClockMs: number, marked: number, answered: number,
 *   graded: number, correct: number, decided: number, score: number, maxGraded: number }}
 */
export function progressAt(timeline, done) {
  const visibleNos = new Set()
  const gradedNos = new Set()
  let simClockMs = 0
  let answered = 0
  let correct = 0
  let decided = 0
  let score = 0
  let maxGraded = 0
  for (const step of timeline.steps.slice(0, done)) {
    if (step.phase === 'mark') {
      visibleNos.add(step.no)
      simClockMs += step.simMs
      if (step.status === 'answered') answered += 1
    } else {
      gradedNos.add(step.no)
      maxGraded += step.points
      score += step.earned
      if (step.correct !== null) decided += 1
      if (step.correct) correct += 1
    }
  }
  return {
    visibleNos,
    gradedNos,
    simClockMs,
    marked: visibleNos.size,
    answered,
    graded: gradedNos.size,
    correct,
    decided,
    score: Math.round(score * 10) / 10,
    maxGraded: Math.round(maxGraded * 10) / 10
  }
}

/** @brief 밀리초 → "1분 05초" / "42.3초" */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}초`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}분 ${String(Math.round(seconds % 60)).padStart(2, '0')}초`
}

/** @brief 시뮬레이션 시계 표기 mm:ss */
export function formatClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
