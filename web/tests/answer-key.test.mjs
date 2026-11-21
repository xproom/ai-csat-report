import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAnswerKey, diffAnswerKey, applyAnswerKey } from '../src/lib/answerKey.js'
import { createPaper, buildQuestions } from '../src/lib/schema.js'

const paper = () => createPaper({ questions: buildQuestions({ choiceCount: 5, shortCount: 1, essayCount: 0 }) })
const answers = result => result.entries.map(entry => `${entry.no}:${entry.answer}`).join(' ')

test('CSV with header, circled digits and points column', () => {
  const result = parseAnswerKey('번호,정답,배점\n1,③,4\n2,5\n3,①\n6,1/2', paper())
  assert.equal(answers(result), '1:3 2:5 3:1 6:1/2')
  assert.equal(result.entries[0].points, 4)
})

test('various line formats', () => {
  const result = parseAnswerKey('1번 ②\n2. 4\n3) 1\n4: 5\n5\t3\n6 = 12', paper())
  assert.equal(answers(result), '1:2 2:4 3:1 4:5 5:3 6:12')
})

test('pairs on one line', () => {
  assert.equal(answers(parseAnswerKey('1-3 2-5 3-1 4-2', paper())), '1:3 2:5 3:1 4:2')
  assert.equal(answers(parseAnswerKey('1:3, 2:5, 3:1', paper())), '1:3 2:5 3:1')
})

test('sequence without numbers', () => {
  assert.equal(answers(parseAnswerKey('3 5 1 2 4 7', paper())), '1:3 2:5 3:1 4:2 5:4 6:7')
  assert.equal(answers(parseAnswerKey('35124', paper())), '1:3 2:5 3:1 4:2 5:4')
  assert.equal(answers(parseAnswerKey('③⑤①②④', paper())), '1:3 2:5 3:1 4:2 5:4')
})

test('JSON formats and unknown numbers', () => {
  const result = parseAnswerKey('{"1":"3","2":"⑤","99":"1"}', paper())
  assert.equal(answers(result), '1:3 2:5')
  assert.deepEqual(result.unknownNos, [99])
  assert.equal(answers(parseAnswerKey('[{"no":3,"answer":"2","points":5}]', paper())), '3:2')
})

test('diff and apply', () => {
  const base = paper()
  base.questions[0].answer = '3'
  base.questions[1].answer = '1'
  const { entries } = parseAnswerKey('1,3\n2,2\n3,4', base)
  const diff = diffAnswerKey(base, entries)
  assert.deepEqual(diff.slice(0, 4).map(row => row.status), ['same', 'changed', 'new', 'missing'])
  const applied = applyAnswerKey(base, entries, { fileName: 'key.csv' })
  assert.equal(applied.questions[1].answer, '2')
  assert.equal(applied.questions[3].answer, '')
  assert.equal(applied.answerKeySource.fileName, 'key.csv')
})
