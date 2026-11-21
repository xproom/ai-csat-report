/**
 * @file performance.js
 * @brief 실제 정답 대비 LLM 답 비교 - 정확도·수행 시간 성능 평가
 */

import { gradeRun, normalizeChoice } from './grading.js'

/**
 * @brief 풀이 기록별 성능 지표
 * - accuracy: 채점 가능한 문항 중 맞힌 비율 (서술형 채점 대기 제외)
 * - scoreRate: 배점 기준 득점률
 * - durationMs: 전체 수행 시간 (0이면 기록 없음)
 * - perQuestionMs, perCorrectMs: 문항당·정답 1개당 시간
 * - throughput: 분당 처리 문항 수
 * - pareto: 정확도와 시간 모두에서 더 나은 다른 모델이 없는 경우(균형 최적)
 */
export function evaluateRuns(paper, runs) {
  const rows = runs.map(run => {
    const result = gradeRun(paper, run)
    const decided = result.items.filter(item => item.correct !== null).length
    const durationMs = Number(run.durationMs) || 0
    return {
      run,
      model: run.model,
      result,
      correct: result.correct,
      decided,
      invalid: result.invalid,
      accuracy: decided ? result.correct / decided : 0,
      scoreRate: result.rate,
      durationMs,
      perQuestionMs: durationMs ? durationMs / paper.questions.length : 0,
      perCorrectMs: durationMs && result.correct ? durationMs / result.correct : 0,
      throughput: durationMs ? paper.questions.length / (durationMs / 60000) : 0,
      inputTokens: run.usage?.inputTokens ?? 0,
      outputTokens: run.usage?.outputTokens ?? 0,
      pareto: false
    }
  })

  const timed = rows.filter(row => row.durationMs > 0)
  for (const row of timed) {
    row.pareto = !timed.some(other => other !== row
      && other.accuracy >= row.accuracy
      && other.durationMs <= row.durationMs
      && (other.accuracy > row.accuracy || other.durationMs < row.durationMs))
  }
  return rows
}

/** @brief 대표 지표: 가장 정확한 / 가장 빠른 / 균형 최적(정확도 우선) */
export function highlights(rows) {
  if (!rows.length) return {}
  const byAccuracy = [...rows].sort((a, b) => b.accuracy - a.accuracy || (a.durationMs || Infinity) - (b.durationMs || Infinity))
  const timed = rows.filter(row => row.durationMs > 0)
  const fastest = [...timed].sort((a, b) => a.durationMs - b.durationMs)[0]
  const balanced = timed.filter(row => row.pareto).sort((a, b) => b.accuracy / Math.log10(10 + b.durationMs / 1000) - a.accuracy / Math.log10(10 + a.durationMs / 1000))[0]
  return { mostAccurate: byAccuracy[0], fastest, balanced }
}

/**
 * @brief 문항별 실제 정답과 모델 답 비교표
 * @returns {Array<{ no, type, expected, cells: Array<{ runId, answer, status, correct }>, split: boolean, allWrong: boolean, allCorrect: boolean }>}
 */
export function answerMatrix(paper, runs) {
  const graded = runs.map(run => ({ run, result: gradeRun(paper, run) }))
  return paper.questions.map((question, index) => {
    const cells = graded.map(({ run, result }) => {
      const item = result.items[index]
      return { runId: run.id, answer: item.given, status: item.status, correct: item.correct }
    })
    const keyOf = cell => (cell.status !== 'answered' ? '∅' : question.type === 'choice' ? normalizeChoice(cell.answer) : String(cell.answer).trim())
    const distinct = new Set(cells.map(keyOf))
    const decided = cells.filter(cell => cell.correct !== null)
    return {
      no: question.no,
      type: question.type,
      points: question.points,
      expected: question.answer,
      cells,
      split: question.type !== 'essay' && distinct.size > 1,
      allWrong: decided.length > 0 && decided.every(cell => cell.correct === false),
      allCorrect: decided.length > 0 && decided.every(cell => cell.correct === true)
    }
  })
}

/** @brief 성능 표를 CSV 문자열로 */
export function performanceCsv(paper, rows) {
  const header = ['모델', '정확도(%)', '득점률(%)', '맞힌 문항', '채점 문항', '무응답', '수행 시간(초)', '문항당(초)', '정답당(초)', '분당 문항', '입력 토큰', '출력 토큰', '균형 최적']
  const lines = rows.map(row => [
    row.model,
    (row.accuracy * 100).toFixed(1),
    (row.scoreRate * 100).toFixed(1),
    row.correct,
    row.decided,
    row.invalid,
    row.durationMs ? (row.durationMs / 1000).toFixed(1) : '',
    row.perQuestionMs ? (row.perQuestionMs / 1000).toFixed(2) : '',
    row.perCorrectMs ? (row.perCorrectMs / 1000).toFixed(2) : '',
    row.throughput ? row.throughput.toFixed(1) : '',
    row.inputTokens || '',
    row.outputTokens || '',
    row.pareto ? 'O' : ''
  ])
  return [header, ...lines]
    .map(cols => cols.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\n')
}
