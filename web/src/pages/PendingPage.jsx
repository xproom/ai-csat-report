/**
 * @file PendingPage.jsx
 * @brief 승인 대기 화면 - 관리자가 승인하면 자동으로 서비스로 넘어감 (신청 정보가 없으면 여기서 적음)
 */

import { useEffect, useState } from 'react'
import { saveMyProfile, signOut } from '@/lib/cloud'
import { useStore } from '@/lib/store'

/** 승인됐는지 자동으로 확인하는 간격 */
const CHECK_MS = 20000

export default function PendingPage() {
  const { cloud, reloadProfile } = useStore()
  const profile = cloud.profile ?? {}
  const requested = Boolean(profile.requested_at)
  const [editing, setEditing] = useState(!requested || profile.status === 'rejected')
  const [form, setForm] = useState({ name: profile.name ?? '', school: profile.school ?? '', subject: profile.subject ?? '' })
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  // 이 화면에는 공통 알림이 없으므로 안내를 화면 안에 보여 줌
  const [message, setMessage] = useState('')

  const submit = async event => {
    event.preventDefault()
    setBusy(true)
    try {
      await saveMyProfile(profile, form)
      await reloadProfile()
      setEditing(false)
      setMessage('가입 신청을 보냈습니다.')
    } catch (error) {
      setMessage(error?.message || '신청하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  // 승인되면 이 화면이 저절로 넘어가도록 주기적으로, 그리고 이 탭으로 돌아올 때 확인
  useEffect(() => {
    const quietly = () => { if (!document.hidden) reloadProfile().catch(() => {}) }
    const timer = setInterval(quietly, CHECK_MS)
    document.addEventListener('visibilitychange', quietly)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', quietly) }
  }, [reloadProfile])

  const check = async () => {
    setChecking(true)
    try {
      const next = await reloadProfile()
      if (next?.status === 'pending') setMessage('아직 승인 전입니다.')
    } catch (error) {
      setMessage(error?.message || '확인하지 못했습니다.')
    } finally {
      setChecking(false)
    }
  }

  const field = (key, label, placeholder) => (
    <label className="block">
      <span className="field-label">{label}</span>
      <input className="input" required value={form[key]} placeholder={placeholder} onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))} />
    </label>
  )

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--color-paper)] px-4 py-10">
      <div className="w-full max-w-lg card p-6 sm:p-8">
        <div className="text-sm font-bold text-[var(--color-ink-soft)]">AI 검증 평가 서비스</div>
        {cloud.profileError ? (
          <>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight">정보를 불러오지 못했습니다</h1>
            <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--color-pen)]">{cloud.profileError}</p>
            <button type="button" className="btn btn-primary mt-4 w-full" onClick={check} disabled={checking}>{checking ? '불러오는 중…' : '다시 시도'}</button>
          </>
        ) : editing ? (
          <>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight">가입 신청</h1>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)] break-keep">
              {profile.status === 'rejected' ? '이전 신청이 승인되지 않았습니다. 정보를 확인해 다시 신청하세요. ' : ''}
              관리자가 확인할 수 있도록 정보를 적어 주세요. 승인되면 바로 이용할 수 있습니다.
            </p>
            <form className="mt-5 space-y-3" onSubmit={submit}>
              <div className="rounded-lg bg-[#f1ede4] px-3 py-2 text-sm"><span className="text-[var(--color-ink-soft)]">이메일</span> <b>{cloud.user?.email}</b></div>
              {field('name', '이름', '홍길동')}
              {field('school', '학교', '○○고등학교')}
              {field('subject', '담당 과목', '수학')}
              <button type="submit" className="btn btn-primary w-full !py-3" disabled={busy}>{busy ? '보내는 중…' : '가입 신청'}</button>
            </form>
          </>
        ) : (
          <>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight">승인 대기 중</h1>
            <p className="mt-2 text-[var(--color-ink-soft)] break-keep">가입 신청을 받았습니다. 관리자가 승인하면 이 화면이 자동으로 넘어갑니다.</p>
            <dl className="mt-5 grid grid-cols-[5rem_1fr] gap-y-1.5 rounded-xl border border-[var(--color-line)] bg-white p-4 text-sm">
              <dt className="text-[var(--color-ink-soft)]">이메일</dt><dd className="font-semibold break-all">{cloud.user?.email}</dd>
              <dt className="text-[var(--color-ink-soft)]">이름</dt><dd className="font-semibold">{profile.name}</dd>
              <dt className="text-[var(--color-ink-soft)]">학교</dt><dd className="font-semibold">{profile.school}</dd>
              <dt className="text-[var(--color-ink-soft)]">과목</dt><dd className="font-semibold">{profile.subject}</dd>
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary flex-1" onClick={check} disabled={checking}>{checking ? '확인 중…' : '승인 확인'}</button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>정보 고치기</button>
            </div>
          </>
        )}
        {message && <p role="status" className="mt-4 rounded-lg bg-[var(--color-brand-soft)] px-3 py-2 text-sm break-keep">{message}</p>}
        <button type="button" className="mt-6 text-sm font-semibold text-[var(--color-ink-soft)] hover:underline" onClick={() => signOut()}>로그아웃</button>
      </div>
    </div>
  )
}
