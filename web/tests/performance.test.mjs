import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateRuns, highlights, answerMatrix, performanceCsv } from '../src/lib/performance.js'
import { buildTimeline, progressAt, playbackDelay } from '../src/lib/simulation.js'
import { createPaper, buildQuestions } from '../src/lib/schema.js'

function setup() {
  const paper = createPaper({ questions: buildQuestions({ choiceCount: 4, shortCount: 0, essayCount: 0 }) })
  paper.questions.forEach((question, index) => { question.answer = String(index + 1); question.points = 25 })
  const mk = (model, answers, durationMs) => ({
    id: model,
    model,
    durationMs,
    answers: Object.fromEntries(answers.map((answer, index) => [index + 1, { answer, status: answer ? 'answered' : 'no_answer' }]))
  })
  const runs = [
    mk('정확·느림', ['1', '2', '3', '4'], 120000),
    mk('보통', ['1', '2', '3', '5'], 60000),
    mk('빠름', ['1', '5', '', '5'], 20000),
    mk('나쁨', ['2', '5', '5', '5'], 90000),
    mk('시간없음', ['1', '2', '3', '4'], 0)
  ]
  return { paper, runs }
}

test('accuracy, time metrics and pareto front', () => {
  const { paper, runs } = setup()
  const rows = evaluateRuns(paper, runs)
  const by = Object.fromEntries(rows.map(row => [row.model, row]))
  assert.equal(by['정확·느림'].accuracy, 1)
  assert.equal(by['빠름'].accuracy, 0.25)
  assert.equal(by['빠름'].invalid, 1)
  assert.equal(by['보통'].perQuestionMs, 15000)
  assert.equal(by['보통'].perCorrectMs, 20000)
  assert.equal(by['정확·느림'].throughput, 2)
  assert.deepEqual(rows.filter(row => row.pareto).map(row => row.model), ['정확·느림', '보통', '빠름'])
  assert.equal(by['나쁨'].pareto, false)
  assert.equal(by['시간없음'].pareto, false)
  const best = highlights(rows)
  assert.equal(best.fastest.model, '빠름')
  assert.equal(best.mostAccurate.model, '정확·느림')
  assert.ok(best.balanced.pareto)
})

test('answer matrix flags split and all-wrong questions', () => {
  const { paper, runs } = setup()
  const matrix = answerMatrix(paper, runs)
  assert.equal(matrix[0].split, true)
  assert.equal(matrix[0].allCorrect, false)
  assert.equal(matrix[3].cells.find(cell => cell.runId === '나쁨').correct, false)
  const allWrong = answerMatrix(paper, [runs[3]])
  assert.equal(allWrong[1].allWrong, true)
  const csv = performanceCsv(paper, evaluateRuns(paper, runs))
  assert.match(csv.split('\n')[0], /정확도/)
  assert.equal(csv.split('\n').length, 6)
})

test('simulation timeline splits measured time and tracks progress', () => {
  const { paper, runs } = setup()
  const timeline = buildTimeline(paper, runs[1])
  assert.equal(timeline.steps.length, 8)
  assert.equal(timeline.measured, true)
  assert.equal(Math.round(timeline.steps.slice(0, 4).reduce((sum, step) => sum + step.simMs, 0)), 60000)
  const half = progressAt(timeline, 2)
  assert.equal(half.marked, 2)
  assert.equal(half.graded, 0)
  assert.equal(Math.round(half.simClockMs), 30000)
  const end = progressAt(timeline, 8)
  assert.equal(end.correct, 3)
  assert.equal(end.score, 75)
  assert.ok(playbackDelay(timeline.steps[0], timeline, 2) < playbackDelay(timeline.steps[0], timeline, 1))
  assert.equal(buildTimeline(paper, runs[4]).measured, false)
})
