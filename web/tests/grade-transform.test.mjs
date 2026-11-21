import test from 'node:test'
import assert from 'node:assert/strict'
import { gradeFromCuts, buildGradeReport, getAnswerStatus } from '../src/utils/gradeTransform.js'
import { applyQuickFilters } from '../src/utils/modelFilters.js'

const exam = {
  id: 'test',
  sections: [
    { target: '국어/공통', subject: '국어', section: '공통', group: '국어', kind: 'common', max_points: 76 },
    { target: '국어/언매', subject: '국어', section: '언매', group: '국어', kind: 'elective', max_points: 24 },
    { target: '국어/화작', subject: '국어', section: '화작', group: '국어', kind: 'elective', max_points: 24 },
    { target: '영어/전체', subject: '영어', section: '영어', group: '영어', kind: 'subject', max_points: 100 },
    { target: '한국사/전체', subject: '한국사', section: '한국사', group: '한국사', kind: 'subject', max_points: 50 },
    { target: '탐구/물리1', subject: '물리1', section: '탐구', group: '탐구', kind: 'subject', max_points: 50 },
    { target: '탐구/화학1', subject: '화학1', section: '탐구', group: '탐구', kind: 'subject', max_points: 50 },
    { target: '탐구/생명1', subject: '생명1', section: '탐구', group: '탐구', kind: 'subject', max_points: 50 }
  ]
}

const row = (target, score, total, results = []) => ({ model_name: 'M', target, score, total_points: total, results })

test('gradeFromCuts boundaries', () => {
  const cuts = [90, 80, 70, 60, 50, 40, 30, 20]
  assert.equal(gradeFromCuts(100, cuts), 1)
  assert.equal(gradeFromCuts(90, cuts), 1)
  assert.equal(gradeFromCuts(89, cuts), 2)
  assert.equal(gradeFromCuts(20, cuts), 8)
  assert.equal(gradeFromCuts(19, cuts), 9)
  assert.equal(gradeFromCuts(50, undefined), null)
})

test('absolute grades for English and History, best elective and inquiry', () => {
  const data = [
    row('국어/공통', 70, 76), row('국어/언매', 20, 24), row('국어/화작', 23, 24),
    row('영어/전체', 89, 100), row('한국사/전체', 40, 50),
    row('탐구/물리1', 30, 50), row('탐구/화학1', 48, 50), row('탐구/생명1', 45, 50)
  ]
  const info = { gradeCuts: {
    '국어/언매': [90, 85, 80, 70, 60, 50, 40, 30],
    '국어/화작': [95, 90, 85, 75, 65, 55, 45, 35],
    '탐구/물리1': [47, 44, 40, 35, 30, 25, 20, 15],
    '탐구/화학1': [47, 44, 40, 35, 30, 25, 20, 15],
    '탐구/생명1': [47, 44, 40, 35, 30, 25, 20, 15]
  } }
  const [r] = buildGradeReport(data, ['M'], exam, info)
  assert.equal(r.english.grade, 2)
  assert.equal(r.history.grade, 1)
  // 언매 90 → 1등급, 화작 93 → 2등급 → 언매 선택
  assert.equal(r.korean.elective, '언매')
  assert.equal(r.korean.grade, 1)
  assert.deepEqual(r.inquiry.map(i => i.subject), ['화학1', '생명1'])
  assert.equal(r.math, null)
  assert.equal(r.gradeSum, null) // 수학 없음
})

test('invalid response stats', () => {
  const data = [row('영어/전체', 2, 100, [
    { is_correct: true, answer_status: 'answered' },
    { is_correct: false, answer_status: 'no_answer' },
    { is_correct: false, answer_status: 'parse_failed' },
    { is_correct: false, extracted_answer: -1 }
  ])]
  const [r] = buildGradeReport(data, ['M'], exam, {})
  assert.equal(r.invalid.noAnswer, 2)
  assert.equal(r.invalid.parseFailed, 1)
  assert.equal(r.invalid.validAccuracy, 1)
  assert.equal(getAnswerStatus({ extracted_answer: 3 }), 'answered')
})

test('exam-day quick filter', () => {
  const meta = { A: { releaseDate: '2026-11-19' }, B: { releaseDate: '2026-11-20' }, C: {} }
  assert.deepEqual(applyQuickFilters(['A', 'B', 'C'], { examDayOnly: true, examDate: '2026-11-19' }, meta), ['A'])
  assert.deepEqual(applyQuickFilters(['A', 'B', 'C'], { examDayOnly: false, examDate: '2026-11-19' }, meta), ['A', 'B', 'C'])
})
