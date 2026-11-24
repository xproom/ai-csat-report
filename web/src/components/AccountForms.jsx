/**
 * @file AccountForms.jsx
 * @brief 내 계정 입력폼 - 내 정보(이름·학교·과목), 비밀번호
 */

import { useState } from 'react'
import { NewPasswordFields } from '@/components/PasswordFields'
import { changePassword, describeCloudError, saveMyProfile } from '@/lib/cloud'
import { passwordProblem } from '@/lib/password'
import { useStore } from '@/lib/store'

/** @brief 내 정보(이름·학교·과목) 고치기 - 관리자의 사용자 관리 화면에 보임 */
export function MyInfo({ profile }) {
  const { reloadProfile, notify } = useStore()
  const [form, setForm] = useState({ name: profile.name ?? '', school: profile.school ?? '', subject: profile.subject ?? '' })
  const [busy, setBusy] = useState(false)
  const save = async event => {
    event.preventDefault()
    setBusy(true)
    try {
      await saveMyProfile(profile, form)
      await reloadProfile()
      notify('내 정보를 저장했습니다.')
    } catch (error) {
      notify(describeCloudError(error), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={save}>
      {[['name', '이름'], ['school', '학교'], ['subject', '담당 과목']].map(([key, label]) => (
        <label key={key} className="block">
          <span className="field-label">{label}</span>
          <input className="input" required maxLength={60} value={form[key]} onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))} />
        </label>
      ))}
      <button type="submit" className="btn btn-ghost" disabled={busy}>{busy ? '저장 중…' : '내 정보 저장'}</button>
    </form>
  )
}

/** @brief 비밀번호 정하기·바꾸기 */
export function PasswordForm({ email }) {
  const { notify } = useStore()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async event => {
    event.preventDefault()
    const problem = passwordProblem(password, confirm)
    setError(problem)
    if (problem) return
    setBusy(true)
    try {
      await changePassword(password)
      setPassword('')
      setConfirm('')
      notify('비밀번호를 저장했습니다.')
    } catch (err) {
      setError(err?.message || '비밀번호를 저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="rounded-xl border border-[var(--color-line)] px-4 py-3">
      <summary className="cursor-pointer text-sm font-bold">비밀번호 정하기·바꾸기</summary>
      <form className="mt-3 grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={save}>
        <input type="email" className="hidden" autoComplete="username" value={email} readOnly />
        <NewPasswordFields value={password} confirm={confirm} onChange={setPassword} onConfirm={setConfirm} />
        <button type="submit" className="btn btn-ghost" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
      </form>
      {error && <p role="alert" className="mt-2 text-sm text-[var(--color-pen)] break-keep">{error}</p>}
    </details>
  )
}
