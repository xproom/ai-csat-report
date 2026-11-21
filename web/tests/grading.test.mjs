import test from 'node:test'
import assert from 'node:assert/strict'
import { gradeRun, isShortAnswerCorrect, normalizeChoice, questionStats, modelLeaderboard } from '../src/lib/grading.js'
import { parseAnswers, importRuns } from '../src/lib/aiRunner.js'
import { createPaper, buildQuestions, totalPoints } from '../src/lib/schema.js'

function samplePaper() {
  const paper = createPaper({ questions: buildQuestions({ choiceCount: 3, shortCount: 1, essayCount: 1 }) })
  paper.questions[0].answer = '3'
  paper.questions[1].answer = '1'
  paper.questions[2].answer = '5'
  paper.questions[3].answer = '1/2|0.5'
  return paper
}

test('choice normalization', () => {
  assert.equal(normalizeChoice('③'), '3')
  assert.equal(normalizeChoice(' 4번 '), '4')
  assert.equal(normalizeChoice('정답은 2'), '2')
  assert.equal(normalizeChoice(''), '')
})

test('short answers accept alternatives, spacing and numeric equality', () => {
  assert.ok(isShortAnswerCorrect('0.50', '1/2|0.5'))
  assert.ok(isShortAnswerCorrect(' 1 / 2 ', '1/2|0.5'))
  assert.ok(!isShortAnswerCorrect('2', '1/2|0.5'))
  assert.ok(!isShortAnswerCorrect('', '3'))
})

test('gradeRun scores types, invalid answers and pending essays', () => {
  const paper = samplePaper()
  const run = {
    answers: {
      1: { answer: '③', status: 'answered' },
      2: { answer: '2', status: 'answered' },
      3: { answer: '', status: 'no_answer' },
      4: { answer: '0.5', status: 'answered' },
      5: { answer: '서술', status: 'answered' }
    },
    essayScores: {}
  }
  const result = gradeRun(paper, run)
  const [q1, , , q4, q5] = paper.questions
  assert.equal(result.score, q1.points + q4.points)
  assert.equal(result.maxScore, totalPoints(paper))
  assert.equal(result.correct, 2)
  assert.equal(result.invalid, 1)
  assert.equal(result.pendingEssays, 1)
  assert.equal(result.items[4].correct, null)

  const scored = gradeRun(paper, { ...run, essayScores: { 5: 7 } })
  assert.equal(scored.score, q1.points + q4.points + 7)
  assert.equal(scored.pendingEssays, 0)
  // 배점을 넘는 점수는 잘림
  assert.equal(gradeRun(paper, { ...run, essayScores: { 5: 99 } }).items[4].earned, q5.points)
})

test('parseAnswers handles valid, partial and broken JSON', () => {
  const paper = samplePaper()
  const ok = parseAnswers('{"answers":[{"no":1,"answer":"3"},{"no":4,"answer":"0.5"}]}', paper)
  assert.deepEqual(ok[1], { answer: '3', status: 'answered' })
  assert.equal(ok[2].status, 'no_answer')
  const wrapped = parseAnswers('결과:\n{"answers":[{"no":2,"answer":"1"}]}', paper)
  assert.equal(wrapped[2].answer, '1')
  const broken = parseAnswers('not json', paper)
  assert.equal(broken[1].status, 'parse_failed')
})

test('importRuns accepts object and array answer formats', () => {
  const paper = samplePaper()
  const runs = importRuns([
    { model: 'A', answers: { 1: '3', 4: '1/2' } },
    { model: 'B', answers: [{ no: 1, answer: '1' }] }
  ], paper)
  assert.equal(runs.length, 2)
  assert.equal(gradeRun(paper, runs[0]).correct, 2)
  assert.equal(runs[1].answers[1].answer, '1')
  assert.throws(() => importRuns({ answers: {} }, paper), /model/)
})

test('questionStats and leaderboard aggregate across runs', () => {
  const paper = samplePaper()
  const runs = [
    { model: 'A', answers: { 1: { answer: '3', status: 'answered' } } },
    { model: 'B', answers: { 1: { answer: '1', status: 'answered' } } }
  ]
  const stats = questionStats(paper, runs)
  assert.equal(stats[0].rate, 0.5)
  // 답을 내지 않은 문항은 오답으로 집계
  assert.equal(stats[4].attempts, 2)
  assert.equal(stats[4].rate, 0)
  const board = modelLeaderboard([{ paper, runs }])
  assert.equal(board[0].model, 'A')
  assert.equal(board[0].papers, 1)
})
