import test from 'node:test'
import assert from 'node:assert/strict'
import { authErrorMessage, passwordProblem } from '../src/lib/password.js'

test('새 비밀번호 규칙', () => {
  assert.match(passwordProblem('a1', 'a1'), /8자 이상/)
  assert.match(passwordProblem('abcdefgh', 'abcdefgh'), /영문과 숫자/)
  assert.match(passwordProblem('12345678', '12345678'), /영문과 숫자/)
  assert.match(passwordProblem('abcd1234', 'abcd1235'), /서로 다릅니다/)
  assert.match(passwordProblem('가'.repeat(25) + 'a1', '가'.repeat(25) + 'a1'), /너무 깁니다/)
  assert.equal(passwordProblem('abcd1234', 'abcd1234'), '')
})

test('로그인 오류 안내', () => {
  assert.match(authErrorMessage({ code: 'invalid_credentials' }), /맞지 않습니다/)
  assert.match(authErrorMessage({ code: 'email_not_confirmed' }), /이메일 확인/)
  assert.match(authErrorMessage({ status: 429 }), /잠시 뒤/)
  assert.equal(authErrorMessage({ message: 'something else' }), '')
})
