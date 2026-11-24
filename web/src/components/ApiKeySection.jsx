/**
 * @file ApiKeySection.jsx
 * @brief LLM 회사별 본인 API 키 등록 - 이 브라우저에만 저장, 저장하기 전에 키가 맞는지 확인
 */

import { useState } from 'react'
import { PROVIDERS, listModels } from '@/lib/llmProviders'
import { getProviderKey, isKeyRemembered, setProviderKey, setRememberKeys } from '@/lib/settings'
import { useStore } from '@/lib/store'

function KeyRow({ provider, remember }) {
  const { notify } = useStore()
  const [saved, setSaved] = useState(() => getProviderKey(provider.id))
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null) // { tone, text }

  const store = value => {
    setProviderKey(provider.id, value, remember)
    setSaved(value)
    setKey('')
  }

  const save = async event => {
    event.preventDefault()
    const value = key.trim()
    if (!value) return
    setBusy(true)
    setMessage(null)
    try {
      const models = await listModels(provider.id, value)
      store(value)
      setMessage({ tone: 'ok', text: `키를 확인하고 저장했습니다. 쓸 수 있는 모델 ${models.length}개` })
    } catch (error) {
      // 키가 틀린 경우만 저장하지 않음 (연결 문제·일시 오류면 저장하고 알림)
      const wrong = [400, 401, 403].includes(error.status)
      if (!wrong) store(value)
      setMessage({ tone: 'error', text: wrong ? error.message : `저장했지만 키를 확인하지 못했습니다. ${error.message}` })
    } finally {
      setBusy(false)
    }
  }

  const remove = () => {
    store('')
    setMessage(null)
    notify(`${provider.short} API 키를 지웠습니다.`)
  }

  return (
    <li className="rounded-xl border border-[var(--color-line)] bg-white p-3 sm:p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-extrabold break-keep">{provider.label}</span>
        <span className="flex items-center gap-3 text-xs">
          <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 font-extrabold ${saved ? 'bg-emerald-100 text-emerald-900' : 'bg-[#f1ede4] text-[var(--color-ink-soft)]'}`}>{saved ? '등록됨' : '등록 안 됨'}</span>
          <a className="whitespace-nowrap underline text-[var(--color-ink-soft)]" href={provider.keyUrl} target="_blank" rel="noopener noreferrer">키 발급</a>
        </span>
      </div>
      <form className="flex flex-wrap gap-2" onSubmit={save}>
        <input
          className="input flex-1 min-w-[12rem] font-mono"
          type={show ? 'text' : 'password'}
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder={saved ? `••••${saved.slice(-4)} (바꾸려면 새 키 입력)` : provider.placeholder}
          autoComplete="off"
          spellCheck={false}
          aria-label={`${provider.label} API 키`}
        />
        <button type="button" className="btn btn-ghost" onClick={() => setShow(!show)}>{show ? '숨기기' : '보기'}</button>
        <button type="submit" className="btn btn-primary" disabled={busy || !key.trim()}>{busy ? '확인 중…' : '저장'}</button>
        {saved && <button type="button" className="btn btn-danger" onClick={remove}>지우기</button>}
      </form>
      {message && <p role="status" className={`text-sm break-words ${message.tone === 'ok' ? 'text-emerald-800' : 'text-[var(--color-pen)]'}`}>{message.text}</p>}
    </li>
  )
}

export default function ApiKeySection() {
  const [remember, setRemember] = useState(isKeyRemembered)
  const changeRemember = on => {
    setRemember(on)
    setRememberKeys(on, PROVIDERS.map(provider => provider.id))
  }
  return (
    <section className="card p-4 sm:p-6 space-y-4">
      <div>
        <h2 className="text-lg font-extrabold">LLM API 키</h2>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)] leading-relaxed break-keep">
          문제지를 풀 AI의 키를 등록합니다. 키는 이 브라우저에만 저장되고 이 서비스의 서버로 보내지 않습니다. 사용료는 각 키의 계정에 청구됩니다.
        </p>
        <ul className="mt-2 list-disc pl-5 text-sm text-[var(--color-ink-soft)] space-y-0.5 break-keep">
          <li>등록한 모든 LLM: 「채점 결과 → 풀이 추가」에서 문제지 전체를 한 번에 풀기</li>
          <li>Anthropic(Claude)만: 실시간 AI 풀이, AI 정밀 검증, 정답표 사진 읽기</li>
        </ul>
      </div>
      <ul className="space-y-3">
        {PROVIDERS.map(provider => <KeyRow key={provider.id} provider={provider} remember={remember} />)}
      </ul>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={remember} onChange={e => changeRemember(e.target.checked)} />
        <span>
          이 브라우저에 기억하기
          <span className="block text-xs text-[var(--color-ink-soft)] break-keep">끄면 탭을 닫을 때 모든 키가 지워집니다. 같은 브라우저를 쓰는 다른 사람도 키를 쓸 수 있으니 공용 컴퓨터에서는 끄세요. 사용 한도를 정한 전용 키를 권장합니다.</span>
        </span>
      </label>
    </section>
  )
}
