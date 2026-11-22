import test from 'node:test'
import assert from 'node:assert/strict'
import { buildReplay, stateAt, formatClock } from '../src/lib/replay.js'
import { createLineParser, classifyLine, parsePageRef, cleanFinalAnswer, extractAnswerFallback, stripMarkdown } from '../src/lib/liveSolve.js'
import { createPaper, buildQuestions } from '../src/lib/schema.js'

function paper() {
  const p = createPaper({ questions: buildQuestions({ choiceCount: 2, shortCount: 1, essayCount: 0 }) })
  p.questions[0].answer = '3'
  p.questions[1].answer = '1'
  p.questions[2].answer = '41'
  return p
}

test('line parser splits streamed chunks into lines', () => {
  const lines = []
  const parser = createLineParser(line => lines.push(line))
  parser.feed('PAGE: 1-')
  parser.feed('2\nSTEP: 첫 항이 1')
  parser.feed('이니까\nWORK: a7 = 27\nANSWER: ③')
  parser.flush()
  assert.deepEqual(lines, ['PAGE: 1-2', 'STEP: 첫 항이 1이니까', 'WORK: a7 = 27', 'ANSWER: ③'])
})

test('line classification, page refs and answers', () => {
  assert.deepEqual(classifyLine('STEP: 공비를 구한다'), [{ kind: 'step', text: '공비를 구한다' }])
  assert.deepEqual(classifyLine('- WORK：r^2 = 3'), [{ kind: 'work', text: 'r^2 = 3' }])
  assert.deepEqual(classifyLine('답: 41'), [{ kind: 'answer', text: '41' }])
  assert.deepEqual(classifyLine('그냥 메모'), [{ kind: 'work', text: '그냥 메모' }])
  assert.deepEqual(parsePageRef('2-3'), { file: 1, page: 3 })
  assert.deepEqual(parsePageRef('4'), { file: 0, page: 4 })
  assert.equal(parsePageRef(''), null)
  const p = paper()
  assert.equal(cleanFinalAnswer(p.questions[0], '③번'), '3')
  assert.equal(cleanFinalAnswer(p.questions[2], ' "41" '), '41')
})

test('messy model output: markdown, Korean labels, several labels per line', () => {
  assert.deepEqual(classifyLine('**ANSWER:** ③'), [{ kind: 'answer', text: '③' }])
  assert.deepEqual(classifyLine('**정답**: 4번'), [{ kind: 'answer', text: '4번' }])
  assert.deepEqual(classifyLine('### 최종 답: 2'), [{ kind: 'answer', text: '2' }])
  assert.deepEqual(classifyLine('1. 쪽: 1-3'), [{ kind: 'page', text: '1-3' }])
  assert.deepEqual(classifyLine('> 생각: 조건을 정리한다'), [{ kind: 'step', text: '조건을 정리한다' }])
  assert.deepEqual(classifyLine('`PAGE: 1-2`'), [{ kind: 'page', text: '1-2' }])
  assert.deepEqual(
    classifyLine('PAGE: 1-2 STEP: 더한다 WORK: 2+1=3 ANSWER: 3').map(part => part.kind),
    ['page', 'step', 'work', 'answer']
  )
  assert.deepEqual(classifyLine('```'), [])
  // 문장 속 "답은"은 머리표가 아님
  assert.deepEqual(classifyLine('STEP: 해답은 나중에 확인').map(part => part.kind), ['step'])
  assert.equal(stripMarkdown('- **WORK:** a = 1'), 'WORK: a = 1')
})

test('answer fallback when the model ignores the format', () => {
  const p = paper()
  assert.equal(extractAnswerFallback(p.questions[0], '계산하면 8이므로 정답은 ②이다.'), '2')
  assert.equal(extractAnswerFallback(p.questions[0], '보기를 비교하면 ①은 틀리고, 결국 ④'), '4')
  assert.equal(extractAnswerFallback(p.questions[0], '답: 5번'), '5')
  assert.equal(extractAnswerFallback(p.questions[2], '그래서 답은 41.'), '41')
  assert.equal(extractAnswerFallback(p.questions[0], '모르겠다'), '')
})

test('replay from live trace follows real timestamps', () => {
  const p = paper()
  const run = {
    durationMs: 9000,
    answers: { 1: { answer: '3', status: 'answered' }, 2: { answer: '2', status: 'answered' }, 3: { answer: '41', status: 'answered' } },
    trace: [
      { t: 0, no: 1, kind: 'start' }, { t: 100, no: 1, kind: 'page', text: '1-2' }, { t: 500, no: 1, kind: 'think', text: '생각' },
      { t: 1000, no: 1, kind: 'step', text: '첫 항이 1' }, { t: 1500, no: 1, kind: 'work', text: 'a7 = 27' }, { t: 2000, no: 1, kind: 'answer', text: '3' }, { t: 2100, no: 1, kind: 'end' },
      { t: 2100, no: 2, kind: 'start' }, { t: 4000, no: 2, kind: 'answer', text: '2' }, { t: 4100, no: 2, kind: 'end' },
      { t: 4100, no: 3, kind: 'start' }, { t: 8000, no: 3, kind: 'answer', text: '41' }, { t: 8200, no: 3, kind: 'end' }
    ]
  }
  const replay = buildReplay(p, run)
  assert.equal(replay.live, true)
  assert.equal(replay.totalMs, 9000)
  const early = stateAt(replay, 1520)
  assert.equal(early.currentNo, 1)
  assert.deepEqual(early.page, { file: 0, page: 2 })
  assert.equal(early.caption.text, '첫 항이 1')
  assert.equal(early.answeredNos.size, 0)
  assert.equal(early.notes.at(-1).writing, true)
  const mid = stateAt(replay, 4500)
  assert.equal(mid.currentNo, 3)
  assert.deepEqual([...mid.answeredNos], [1, 2])
  assert.equal(mid.solvedCount, 2)
  assert.equal(mid.questionElapsedMs, 400)
  const end = stateAt(replay, 9000)
  assert.equal(end.done, true)
  assert.equal(end.currentNo, null)
  assert.equal(end.answeredNos.size, 3)
})

test('replay without trace estimates timing from total duration', () => {
  const p = paper()
  const run = { durationMs: 36000, answers: { 1: { answer: '3', status: 'answered' }, 2: { answer: '', status: 'no_answer' }, 3: { answer: '41', status: 'answered' } } }
  const replay = buildReplay(p, run)
  assert.equal(replay.live, false)
  assert.equal(replay.totalMs, 36000)
  const last = replay.events.filter(event => event.kind === 'end').at(-1)
  assert.equal(last.t, 36000)
  const end = stateAt(replay, 36000)
  assert.deepEqual([...end.answeredNos].sort(), [1, 3])
  assert.equal(formatClock(65400, true), '01:05.4')
})

test('지난 문항의 풀이 기록은 남고, 지금 문항은 써 내려가는 중', () => {
  const p = paper()
  const run = {
    durationMs: 6000,
    answers: { 1: { answer: '3', status: 'answered' }, 2: { answer: '2', status: 'answered' } },
    trace: [
      { t: 0, no: 1, kind: 'start' }, { t: 500, no: 1, kind: 'work', text: '1 + 2 = 3' }, { t: 900, no: 1, kind: 'answer', text: '3' }, { t: 1000, no: 1, kind: 'end' },
      { t: 1000, no: 2, kind: 'start' }, { t: 1500, no: 2, kind: 'work', text: '6 - 4 = 2 이므로 답은 2' }, { t: 5000, no: 2, kind: 'end' }
    ]
  }
  const state = stateAt(buildReplay(p, run), 1600)
  assert.equal(state.currentNo, 2)
  assert.deepEqual(state.notesByNo.get(1).map(note => note.visible), ['1 + 2 = 3', '3'])
  assert.equal(state.notesByNo.get(1).every(note => !note.writing), true)
  assert.equal(state.notesByNo.get(2)[0].writing, true)
  const end = stateAt(buildReplay(p, run), 6000)
  assert.equal(end.notesByNo.get(2)[0].visible, '6 - 4 = 2 이므로 답은 2')
})
