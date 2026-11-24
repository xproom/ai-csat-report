/**
 * @file password.js
 * @brief 비밀번호 규칙 확인과 로그인 오류 안내 (비밀번호는 저장하지 않고 서버로만 보냄)
 */

export const MIN_PASSWORD = 8

/** @brief 새 비밀번호의 문제점 (괜찮으면 빈 문자열) */
export function passwordProblem(password, confirm) {
  if (password.length < MIN_PASSWORD) return `비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다.`
  // bcrypt는 72바이트까지만 쓰므로 그보다 길면 뒷부분이 무시됨
  if (new TextEncoder().encode(password).length > 72) return '비밀번호가 너무 깁니다.'
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return '영문과 숫자를 함께 넣어 주세요.'
  if (password !== confirm) return '두 비밀번호가 서로 다릅니다.'
  return ''
}

/** @brief Supabase 로그인 오류 → 한국어 안내 (모르는 오류면 빈 문자열) */
export function authErrorMessage(error) {
  const code = error?.code ?? ''
  const message = String(error?.message ?? '')
  if (code === 'otp_disabled' || /signups not allowed/i.test(message)) return '가입되지 않은 이메일입니다. 「가입 신청」을 먼저 해 주세요.'
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) return '이메일이나 비밀번호가 맞지 않습니다. 비밀번호를 정한 적이 없으면 「비밀번호 정하기·재설정」을 누르세요.'
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) return '이메일 확인이 끝나지 않았습니다. 메일의 인증번호를 입력하세요.'
  if (code === 'user_already_exists' || /already registered/i.test(message)) return '이미 가입된 이메일입니다. 로그인하거나 「비밀번호 정하기·재설정」을 누르세요.'
  if (code === 'same_password') return '지금 쓰는 비밀번호와 같습니다. 다른 비밀번호를 정하세요.'
  if (code === 'weak_password') return '너무 쉬운 비밀번호입니다. 더 길고 추측하기 어렵게 정하세요.'
  if (code === 'reauthentication_needed') return '로그인한 지 오래되어 다시 확인이 필요합니다. 로그아웃한 뒤 「비밀번호 정하기·재설정」을 이용하세요.'
  if (code === 'signup_disabled') return '지금은 가입 신청을 받지 않습니다. 관리자에게 문의하세요.'
  if (code === 'otp_expired') return '인증번호가 맞지 않거나 시간이 지났습니다. 새 인증번호를 받아 다시 입력하세요.'
  if (error?.status === 429 || /rate limit|security purposes/i.test(message)) return '요청이 너무 많습니다. 잠시 뒤 다시 시도하세요.'
  return ''
}
