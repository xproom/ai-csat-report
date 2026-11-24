/**
 * @file SetPasswordPage.jsx
 * @brief 비밀번호 정하기 - 「비밀번호 정하기·재설정」으로 로그인한 직후 새 비밀번호를 정함
 */

import { useState } from 'react'
import { NewPasswordFields } from '@/components/PasswordFields'
import { changePassword, signOut } from '@/lib/cloud'
import { passwordProblem } from '@/lib/password'
import { useStore } from '@/lib/store'

export default function SetPasswordPage() {
  const { cloud, finishPassword } = useStore()
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
      finishPassword()
    } catch (err) {
      setError(err?.message || '비밀번호를 저장하지 못했습니다.')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--color-paper)] px-4 py-10">
      <div className="w-full max-w-md card p-6 sm:p-8">
        <div className="text-sm font-bold text-[var(--color-ink-soft)]">AI 검증 평가 서비스</div>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">새 비밀번호 정하기</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)] break-keep"><b className="break-all">{cloud.user?.email}</b> 계정입니다. 다음부터는 이메일과 비밀번호로 로그인합니다.</p>
        <form className="mt-5 space-y-3" onSubmit={save}>
          <input type="email" className="hidden" autoComplete="username" value={cloud.user?.email ?? ''} readOnly />
          <NewPasswordFields value={password} confirm={confirm} onChange={setPassword} onConfirm={setConfirm} />
          <button type="submit" className="btn btn-primary w-full !py-3" disabled={busy}>{busy ? '저장 중…' : '비밀번호 저장'}</button>
        </form>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--color-pen)] break-keep">{error}</p>}
        <div className="mt-5 flex justify-between text-sm font-semibold text-[var(--color-ink-soft)]">
          <button type="button" className="hover:underline" onClick={finishPassword}>나중에 하기</button>
          <button type="button" className="hover:underline" onClick={() => signOut()}>로그아웃</button>
        </div>
      </div>
    </div>
  )
}
