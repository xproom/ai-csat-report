/**
 * @file settings.js
 * @brief LLM 회사별 API 키 보관 (이 브라우저에만)
 * @note "이 브라우저에 기억"을 끄면 키는 탭을 닫을 때 사라집니다(sessionStorage).
 */

const REMEMBER = 'exam-bench.rememberKey'
// Anthropic 키는 예전부터 쓰던 이름을 그대로 씀
const keyName = id => (id === 'anthropic' ? 'exam-bench.anthropicKey' : `exam-bench.key.${id}`)

function safe(action, fallback = null) {
  try { return action() } catch { return fallback }
}

export function getProviderKey(id) {
  return safe(() => sessionStorage.getItem(keyName(id)) || localStorage.getItem(keyName(id)) || '', '')
}

/** @brief Anthropic 키 */
export const getApiKey = () => getProviderKey('anthropic')

export function isKeyRemembered() {
  return safe(() => localStorage.getItem(REMEMBER) === '1', false)
}

export function setProviderKey(id, value, remember) {
  safe(() => {
    sessionStorage.removeItem(keyName(id))
    localStorage.removeItem(keyName(id))
    if (value) (remember ? localStorage : sessionStorage).setItem(keyName(id), value)
  })
}

/** @brief "이 브라우저에 기억" 바꾸기 - 이미 넣은 키도 함께 옮김 */
export function setRememberKeys(remember, ids) {
  safe(() => localStorage.setItem(REMEMBER, remember ? '1' : '0'))
  for (const id of ids) setProviderKey(id, getProviderKey(id), remember)
}
