import test from 'node:test'
import assert from 'node:assert/strict'
import { findAnchors, blankRegion } from '../src/lib/pdfText.js'

// 2단 편집 쪽: 왼쪽 단 1·2번, 오른쪽 단 3·4번 (비율 좌표)
const item = (str, x0, top, width = 0.3) => ({ str, x0, x1: x0 + width, top, bottom: top + 0.015 })
const page = [
  item('2027학년도 대학수학능력시험 문제지', 0.3, 0.05, 0.4),
  item('1.', 0.08, 0.20, 0.02), item('∛32 × 4^(-1/3)의 값은? [2점]', 0.11, 0.20),
  item('① 1 ② 2 ③ 3 ④ 4 ⑤ 5', 0.10, 0.24),
  item('2.', 0.08, 0.60, 0.02), item('함수 f(x)에 대하여 ...', 0.11, 0.60),
  item('① 6 ② 7 ③ 8 ④ 9 ⑤ 10', 0.10, 0.66),
  item('3.', 0.53, 0.20, 0.02), item('모든 항이 양수인 등비수열 {an}에 대하여', 0.56, 0.20),
  item('a1 = 1, a5 = 3a3', 0.60, 0.23), item('① 9 ② 9√3 ③ 27', 0.55, 0.28),
  item('4.', 0.53, 0.60, 0.02), item('2. 이 본문 속 숫자는 문항 번호가 아님', 0.62, 0.63),
  item('1', 0.5, 0.97, 0.01)
]

test('문항 번호는 단마다 왼쪽 끝 번호만 인정', () => {
  const anchors = findAnchors(page, 30)
  assert.deepEqual(anchors.map(anchor => `${anchor.no}@${anchor.col}`).sort(), ['1@0', '2@0', '3@1', '4@1'])
  assert.deepEqual(findAnchors(page, 3).map(anchor => anchor.no).sort(), [1, 2, 3])
})

test('빈칸은 문제 글 아래부터 같은 단 다음 문제 위까지', () => {
  const anchors = findAnchors(page, 30)
  const q1 = blankRegion(page, anchors, anchors.find(anchor => anchor.no === 1))
  assert.ok(q1.top > 0.255 && q1.top < 0.27, `q1 top ${q1.top}`)
  assert.ok(q1.bottom > 0.58 && q1.bottom < 0.6, `q1 bottom ${q1.bottom}`)
  assert.ok(q1.x0 < 0.1 && q1.x1 <= 0.51, `q1 x ${q1.x0}~${q1.x1}`)
  const q3 = blankRegion(page, anchors, anchors.find(anchor => anchor.no === 3))
  assert.ok(q3.x0 >= 0.5, `q3 오른쪽 단 ${q3.x0}`)
  assert.ok(q3.top > 0.29 && q3.bottom < 0.6)
  // 마지막 문제는 쪽 번호(아래 여백)를 빼고 본문 끝까지
  const q2 = blankRegion(page, anchors, anchors.find(anchor => anchor.no === 2))
  assert.ok(q2.top > 0.67 && q2.bottom <= 0.96, `q2 ${q2.top}~${q2.bottom}`)
})
