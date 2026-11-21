/**
 * @file settings.js
 * @brief API 키 등 브라우저 설정
 * @note "이 브라우저에 기억"을 끄면 키는 탭을 닫을 때 사라집니다(sessionStorage).
 */

const KEY = 'exam-bench.anthropicKey'
const REMEMBER = 'exam-bench.rememberKey'

function safe(action, fallback = null) {
  try { return action() } catch { return fallback }
}

export function getApiKey() {
  return safe(() => sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || '', '')
}

export function isKeyRemembered() {
  return safe(() => localStorage.getItem(REMEMBER) === '1', false)
}

export function setApiKey(value, remember) {
  safe(() => {
    sessionStorage.removeItem(KEY)
    localStorage.removeItem(KEY)
    localStorage.setItem(REMEMBER, remember ? '1' : '0')
    if (!value) return
    if (remember) localStorage.setItem(KEY, value)
    else sessionStorage.setItem(KEY, value)
  })
}
