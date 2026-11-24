/**
 * @file ApiKeySection.jsx
 * @brief 본인의 Anthropic API 키 입력 (이 브라우저에만 저장)
 */

import { useState } from 'react'
import { getApiKey, isKeyRemembered, setApiKey } from '@/lib/settings'
import { useStore } from '@/lib/store'

export default function ApiKeySection() {
  const { notify } = useStore()
  const [key, setKey] = useState(getApiKey)
  const [remember, setRemember] = useState(isKeyRemembered)
  const [show, setShow] = useState(false)

  const saveKey = () => {
    setApiKey(key.trim(), remember)
    notify(key.trim() ? 'API 키를 저장했습니다.' : 'API 키를 지웠습니다.')
  }

  return (
    <section className="card p-4 sm:p-6 space-y-4">
      <div>
        <h2 className="text-lg font-extrabold">Anthropic API 키</h2>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)] leading-relaxed">
          Claude로 문제지를 풀 때 사용합니다. 요청은 이 브라우저에서 Anthropic API로 바로 가며, 이 서비스의 서버를 거치지 않습니다.
          키는 <a className="underline" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">Anthropic 콘솔</a>에서 발급할 수 있습니다.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          className="input flex-1 min-w-[14rem] font-mono"
          type={show ? 'text' : 'password'}
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder="sk-ant-…"
          autoComplete="off"
          spellCheck={false}
          aria-label="Anthropic API 키"
        />
        <button type="button" className="btn btn-ghost" onClick={() => setShow(!show)}>{show ? '숨기기' : '보기'}</button>
        <button type="button" className="btn btn-primary" onClick={saveKey}>저장</button>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={remember} onChange={e => setRemember(e.target.checked)} />
        <span>
          이 브라우저에 기억하기
          <span className="block text-xs text-[var(--color-ink-soft)]">끄면 탭을 닫을 때 키가 지워집니다. 공용 컴퓨터에서는 끄세요. 사용 한도를 정한 전용 키를 쓰는 것을 권장합니다.</span>
        </span>
      </label>
    </section>
  )
}
