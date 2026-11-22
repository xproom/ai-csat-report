import test from 'node:test'
import assert from 'node:assert/strict'
import { validatePaper, analyzePageNumbers, composition } from '../src/lib/verify.js'
import { analyzeQuestionText, pageNumberCandidates } from '../src/lib/pdfText.js'
import { normalizeChoiceSet, gradeRun } from '../src/lib/grading.js'
import { parseAnswerKey, applyAnswerKeyText } from '../src/lib/answerKey.js'
import { createPaper, buildQuestions } from '../src/lib/schema.js'

const levels = (result, id) => result.checks.find(check => check.id === id).items.map(item => item.level)
const texts = (result, id) => result.checks.find(check => check.id === id).items.map(item => item.text).join('\n')

const basePaper = () => {
  const paper = createPaper({ questions: buildQuestions({ choiceCount: 4, shortCount: 1 }) })
  paper.questions = paper.questions.map((question, index) => ({ ...question, points: 20, answer: question.type === 'choice' ? String(index + 1) : '12' }))
  paper.meta = { ...paper.meta, schoolLevel: '중등', examType: '중간고사' }
  return paper
}

test('복수 정답 정리와 채점', () => {
  assert.equal(normalizeChoiceSet('②④'), '2,4')
  assert.equal(normalizeChoiceSet('4, 2'), '2,4')
  assert.equal(normalizeChoiceSet('24'), '2,4')
  assert.equal(normalizeChoiceSet('3번'), '3')
  const paper = basePaper()
  paper.questions[0].answer = '2,4'
  const run = { answers: { 1: { answer: '4,2', status: 'answered' }, 2: { answer: '2', status: 'answered' } } }
  const items = gradeRun(paper, run).items
  assert.equal(items[0].correct, true)
  assert.equal(items[1].correct, true)
  assert.equal(parseAnswerKey('1 ②④\n2 ③\n3 ①\n4 ⑤', paper).entries[0].answer, '2,4')
})

test('배점 합계·번호 누락·중복', () => {
  const paper = basePaper()
  assert.equal(validatePaper(paper).checks.find(check => check.id === 'points').status, 'ok')
  paper.questions[1].points = 17.5
  assert.match(texts(validatePaper(paper), 'points'), /97\.5점이 총점 100점과 2\.5점 모자랍니다/)
  paper.questions[2].no = 4 // 1,2,4,4,5 → 3번 없음, 4번 중복
  const numbering = texts(validatePaper(paper), 'numbering')
  assert.match(numbering, /4번이 두 번/)
  assert.match(numbering, /2번 다음이 4번입니다 \(3번 없음\)/)
  // 정답표의 중복 번호
  const keyed = applyAnswerKeyText(basePaper(), '1,1\n2,2\n2,3\n3,3\n4,4\n5,12', { fileName: 'key.csv', restructure: 'never' }).paper
  assert.match(texts(validatePaper(keyed), 'numbering'), /key\.csv.*2번이 두 번/)
})

test('문제지 대조: 배점 표시·건너뛴 번호·선지·복수 선택·쪽 번호', () => {
  const paper = basePaper()
  paper.questions[3].answer = '2,4'
  const facts = {
    source: 'pdf', readable: true, defaultPoints: 0,
    anchors: [{ no: 1, index: 1 }, { no: 2, index: 1 }, { no: 4, index: 2 }, { no: 5, index: 2 }],
    questions: {
      1: { ...analyzeQuestionText('1. 다음 중 옳은 것은? [20점] ① 가 ② 나 ③ 다 ④ 라 ⑤ 마'), index: 1 },
      2: { ...analyzeQuestionText('2. 값은? [15점] ① 1 ② 2 ③ 2 ④ 4 ⑤ 5'), index: 1 },
      4: { ...analyzeQuestionText('4. 옳은 것을 모두 고르시오. ① a ② b ③ c ④ d'), index: 2 },
      5: { ...analyzeQuestionText('5. 값을 구하시오.'), index: 2 }
    },
    pages: [
      { index: 1, fileName: 'a.pdf', page: 1, candidates: [{ value: 1, total: 0, slot: 'footer-center' }] },
      { index: 2, fileName: 'a.pdf', page: 2, candidates: [{ value: 2, total: 0, slot: 'footer-center' }] },
      { index: 3, fileName: 'a.pdf', page: 3, candidates: [{ value: 5, total: 0, slot: 'footer-center' }] },
      { index: 4, fileName: 'a.pdf', page: 4, candidates: [{ value: 4, total: 0, slot: 'footer-center' }] }
    ]
  }
  const result = validatePaper(paper, { facts })
  assert.match(texts(result, 'points'), /2번: 문제지에는 \[15점\]인데 입력한 배점은 20점/)
  assert.match(texts(result, 'numbering'), /2번 다음에 4번이 나옵니다 \(3번 없음\)/)
  const options = texts(result, 'options')
  assert.match(options, /2번: 선지 ②와 ③의 내용이 같습니다/)
  assert.match(options, /4번: 선지 ⑤이\(가\) 없습니다/)
  assert.ok(!/1번/.test(options))
  // 4번은 '모두 고르시오'라 복수 정답 정상, 단일 선택 문항에 복수 정답이면 오류
  assert.ok(!/4번/.test(texts(result, 'answers')))
  paper.questions[0].answer = '1,3'
  assert.match(texts(validatePaper(paper, { facts }), 'answers'), /1번: 하나만 고르는 문항인데 정답이 2개\(①③\)/)
  paper.questions[3].answer = '2'
  assert.match(texts(validatePaper(paper, { facts }), 'answers'), /4번: '모두 고르시오' 문항인데 정답이 하나/)
  assert.match(texts(result, 'pages'), /3번째 쪽에 인쇄된 쪽 번호가 5입니다 \(3이어야 함\)/)
})

test('복수 선택 문구 판별: "모두 고른 것은?"은 단일 정답', () => {
  assert.equal(analyzeQuestionText('옳은 것만을 <보기>에서 있는 대로 고른 것은? ① ㄱ ② ㄴ').asksMultiple, false)
  assert.equal(analyzeQuestionText('옳은 것을 모두 고르시오. ① ㄱ ② ㄴ').asksMultiple, true)
  assert.equal(analyzeQuestionText('알맞은 것을 두 개 고르면? ① ㄱ ② ㄴ').multipleCount, 2)
  assert.equal(analyzeQuestionText('함수 f(x)의 값은? [3점] ① 1 ② 2').printedPoints, 3)
})

test('쪽 번호 후보와 분석', () => {
  const item = (str, x0, top) => ({ str, x0, x1: x0 + 0.02, top, bottom: top + 0.01 })
  assert.deepEqual(pageNumberCandidates([item('- 3 -', 0.49, 0.95), item('본문', 0.1, 0.5)]).map(candidate => candidate.value), [3])
  assert.deepEqual(pageNumberCandidates([item('2', 0.3, 0.95), item('/', 0.33, 0.95), item('8', 0.36, 0.95)])[0], { value: 2, total: 8, slot: 'footer-fraction' })
  // 표지는 번호 없음, 2쪽부터 1, 2, 3
  const pages = [1, 2, 3, 4].map(page => ({ index: page, fileName: 'b.pdf', page, candidates: page === 1 ? [] : [{ value: page - 1, total: 0, slot: 'footer-center' }] }))
  const [file] = analyzePageNumbers(pages)
  assert.equal(file.readable, true)
  assert.equal(file.offset, -1)
  const paper = basePaper()
  assert.ok(!/찾지 못했/.test(texts(validatePaper(paper, { facts: { source: 'pdf', readable: true, anchors: [], questions: {}, pages } }), 'pages')))
})

test('유형 구성: 출제 계획과 대조', () => {
  const paper = basePaper()
  assert.deepEqual(composition(paper.questions), { choiceCount: 4, writtenCount: 1, choicePoints: 80, writtenPoints: 20, totalPoints: 100 })
  paper.meta.plan = { choiceCount: 4, writtenCount: 2, choicePoints: 80, writtenPoints: '' }
  const result = validatePaper(paper)
  assert.deepEqual(levels(result, 'composition'), ['info', 'ok', 'error', 'ok'])
  assert.match(texts(result, 'composition'), /서답형 문항 수: 계획은 2문항인데 실제는 1문항/)
})

test('AI 풀이가 모두 같은 다른 답이면 정답 재확인', () => {
  const paper = basePaper()
  const run = answer => ({ answers: { 1: { answer, status: 'answered' } } })
  assert.match(texts(validatePaper(paper, { runs: [run('3'), run('3')] }), 'ai'), /1번: AI 풀이 2건이 모두 ③을\(를\) 답했습니다 \(정답 ①\)/)
})

test('2쪽짜리 문제지에서 쪽 번호 1, 3 → 둘째 쪽 오류', () => {
  const pages = [1, 3].map((value, index) => ({ index: index + 1, fileName: 'c.pdf', page: index + 1, candidates: [{ value, total: 0, slot: 'footer-center' }] }))
  const [file] = analyzePageNumbers(pages)
  assert.equal(file.readable, true)
  assert.deepEqual(file.pages.map(page => [page.printed, page.expected]), [[1, 1], [3, 2]])
})
