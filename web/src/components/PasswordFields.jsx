/**
 * @file PasswordFields.jsx
 * @brief 비밀번호 입력칸 (보기/숨기기), 새 비밀번호 두 칸
 */

import { useState } from 'react'
import { MIN_PASSWORD } from '@/lib/password'

export function PasswordInput({ label, value, onChange, autoComplete }) {
  const [show, setShow] = useState(false)
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <span className="relative block">
        <input className="input !pr-16" type={show ? 'text' : 'password'} required autoComplete={autoComplete} value={value} onChange={e => onChange(e.target.value)} />
        <button type="button" className="absolute inset-y-0 right-0 px-3 text-xs font-bold text-[var(--color-ink-soft)]" onClick={() => setShow(!show)} aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'}>{show ? '숨기기' : '보기'}</button>
      </span>
    </label>
  )
}

/** @brief 새 비밀번호 + 확인 */
export function NewPasswordFields({ value, confirm, onChange, onConfirm }) {
  return (
    <>
      <PasswordInput label={`비밀번호 (${MIN_PASSWORD}자 이상, 영문·숫자)`} value={value} onChange={onChange} autoComplete="new-password" />
      <PasswordInput label="비밀번호 다시 입력" value={confirm} onChange={onConfirm} autoComplete="new-password" />
    </>
  )
}
