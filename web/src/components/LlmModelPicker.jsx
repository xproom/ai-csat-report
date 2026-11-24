/**
 * @file LlmModelPicker.jsx
 * @brief 키를 등록한 LLM(Claude 제외)에서 풀이할 모델 고르기
 */

import { useState } from 'react'
import { PROVIDERS, listModels } from '@/lib/llmProviders'
import { getProviderKey } from '@/lib/settings'

function ProviderRow({ provider, disabled, onAdd }) {
  const [models, setModels] = useState(null)
  const [model, setModel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const listId = `models-${provider.id}`

  const load = async () => {
    setBusy(true)
    setError('')
    try {
      const list = await listModels(provider.id, getProviderKey(provider.id))
      setModels(list)
      setModel(prev => prev || list[0] || '')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const add = () => {
    const name = model.trim()
    if (!name) return
    onAdd({ id: `${provider.id}:${name}`, providerId: provider.id, model: name, label: `${name} · ${provider.short}` })
    setModel('')
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-full sm:w-24 text-sm font-bold">{provider.short}</span>
        <input className="input flex-1 min-w-[12rem] font-mono text-sm" list={listId} value={model} onChange={e => setModel(e.target.value)} placeholder={models ? '모델 고르기 또는 입력' : '모델을 불러오거나 이름 입력'} disabled={disabled} spellCheck={false} aria-label={`${provider.label} 모델`} />
        <datalist id={listId}>{(models ?? []).map(name => <option key={name} value={name} />)}</datalist>
        <button type="button" className="btn btn-ghost !py-2 text-sm" onClick={load} disabled={busy || disabled}>{busy ? '불러오는 중…' : models ? `모델 ${models.length}개` : '모델 불러오기'}</button>
        <button type="button" className="btn btn-primary !py-2 text-sm" onClick={add} disabled={disabled || !model.trim()}>추가</button>
      </div>
      {error && <p role="alert" className="text-sm text-[var(--color-pen)] break-words">{error}</p>}
    </div>
  )
}

export default function LlmModelPicker({ selected, onChange, disabled }) {
  const ready = PROVIDERS.filter(provider => provider.solveUrl && getProviderKey(provider.id))
  const add = item => onChange(prev => (prev.some(other => other.id === item.id) ? prev : [...prev, item]))
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-white/60 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="field-label !mb-0">다른 LLM으로 풀기</span>
        <a href="#/account" className="text-xs font-bold text-[var(--color-brand)] underline">API 키 등록</a>
      </div>
      {ready.length === 0
        ? <p className="text-sm text-[var(--color-ink-soft)] break-keep">OpenAI·Gemini·Grok·OpenRouter 키를 등록하면 여기서 모델을 골라 풀 수 있습니다.</p>
        : ready.map(provider => <ProviderRow key={provider.id} provider={provider} disabled={disabled} onAdd={add} />)}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map(item => (
            <span key={item.id} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-brand)] bg-[var(--color-brand-soft)] px-3 py-1 text-sm font-semibold break-all">
              {item.label}
              <button type="button" aria-label={`${item.label} 빼기`} disabled={disabled} onClick={() => onChange(prev => prev.filter(other => other.id !== item.id))}>✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
