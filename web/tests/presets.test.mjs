import test from 'node:test'
import assert from 'node:assert/strict'
import { standardPreset, questionsFromAnswerKey, describeComposition, electiveNote } from '../src/lib/presets.js'
import { parseAnswerKey, proposeStructure, applyAnswerKeyText } from '../src/lib/answerKey.js'
import { createPaper } from '../src/lib/schema.js'

const meta = (subject, extra = {}) => ({ schoolLevel: '고등', grade: 3, semester: 1, examType: '수능', subject, ...extra })
const sum = questions => questions.reduce((total, question) => total + question.points, 0)

test('수능 표준 구성: 수학 30문항 100점, 국어·영어 45문항 100점, 탐구 20문항 50점', () => {
  const math = standardPreset(meta('수학')).questions
  assert.equal(describeComposition(math), '30문항 · 객관식 21 · 단답형 9')
  assert.equal(sum(math), 100)
  assert.equal(sum(math.filter(question => !question.elective)), 74)
  assert.deepEqual(math.filter(question => question.type === 'short').map(question => question.no), [16, 17, 18, 19, 20, 21, 22, 29, 30])
  assert.deepEqual(math.filter(question => question.elective).map(question => question.no), [23, 24, 25, 26, 27, 28, 29, 30])
  const korean = standardPreset(meta('국어')).questions
  assert.equal(korean.length, 45)
  assert.equal(sum(korean), 100)
  assert.equal(korean.filter(question => question.elective).length, 11)
  assert.equal(sum(standardPreset(meta('영어')).questions), 100)
  assert.equal(sum(standardPreset(meta('물리학')).questions), 50)
  assert.equal(standardPreset({ ...meta('수학'), examType: '중간고사' }), null)
  assert.equal(standardPreset({ ...meta('수학'), schoolLevel: '중등' }), null)
})

test('정답표로 문항 구성 짐작: 표준 구성이 있으면 따르고, 없으면 답 모양으로', () => {
  // 수능 수학 정답표 30문항 (16~22, 29~30은 숫자 답)
  const key = Array.from({ length: 30 }, (_, i) => {
    const no = i + 1
    const isShort = (no >= 16 && no <= 22) || no >= 29
    return `${no},${isShort ? 10 + no : '①②③④⑤'[no % 5]}`
  }).join('\n')
  const paper = createPaper() // 기본 25문항 (객관식 20 · 단답 3 · 서술 2)
  paper.meta = { ...paper.meta, ...meta('수학') }
  const parsed = parseAnswerKey(key, paper)
  assert.equal(parsed.allEntries.length, 30)
  assert.deepEqual(parsed.unknownNos, [26, 27, 28, 29, 30])
  const proposal = proposeStructure(paper, parsed)
  assert.equal(proposal.differs, true)
  assert.equal(describeComposition(proposal.questions), '30문항 · 객관식 21 · 단답형 9')
  assert.equal(proposal.questions[15].answer, '26')
  assert.equal(proposal.questions[0].answer, '2')

  // 표준 구성이 없으면 ①~⑤·1~5는 객관식, 나머지는 단답형
  const plain = questionsFromAnswerKey([{ no: 1, answer: '3', circled: true }, { no: 2, answer: '27' }, { no: 3, answer: '1/2' }], { schoolLevel: '중등', examType: '중간고사', subject: '수학' })
  assert.deepEqual(plain.map(question => question.type), ['choice', 'short', 'short'])
})

test('정답표 반영: 구성이 다르면 정답표대로 바꾸고, 같으면 정답만 반영', () => {
  const paper = createPaper()
  paper.meta = { ...paper.meta, ...meta('수학') }
  const key = Array.from({ length: 30 }, (_, i) => `${i + 1},${(i % 5) + 1}`).join('\n')
  const auto = applyAnswerKeyText(paper, key, { fileName: '답지.csv' })
  assert.equal(auto.restructured, true)
  assert.equal(auto.paper.questions.length, 30)
  assert.equal(auto.paper.answerKeySource.fileName, '답지.csv')
  const again = applyAnswerKeyText(auto.paper, key.replace('1,1', '1,4'), { fileName: '수정본.csv' })
  assert.equal(again.restructured, false)
  assert.equal(again.paper.questions[0].answer, '4')
})

test('선택과목 안내는 선택과목 문항과 시험 전체에 들어감', () => {
  const paper = createPaper({ questions: standardPreset(meta('수학')).questions })
  paper.meta = { ...paper.meta, ...meta('수학', { elective: '미적분' }) }
  assert.match(electiveNote(paper, paper.questions[24]), /미적분 부분에 있는 25번/)
  assert.equal(electiveNote(paper, paper.questions[0]), '')
  assert.match(electiveNote(paper), /23~30번은 문제지의 미적분 부분/)
  paper.meta.elective = ''
  assert.equal(electiveNote(paper), '')
})

test('수능형 평가지 제목에 홀수형·짝수형', async () => {
  const { paperTitle, formTypeOf } = await import('../src/lib/schema.js')
  const paper = createPaper()
  paper.meta = { ...paper.meta, ...meta('수학') }
  assert.equal(formTypeOf(paper.meta), '홀수형')
  assert.match(paperTitle(paper), /수능 수학 \(홀수형\)$/)
  paper.meta.formType = '짝수형'
  assert.match(paperTitle(paper), /\(짝수형\)$/)
  assert.equal(formTypeOf({ ...paper.meta, examType: '중간고사' }), '')
})
