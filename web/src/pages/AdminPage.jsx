/**
 * @file AdminPage.jsx
 * @brief (관리자) 사용자 관리 - 가입 신청 승인·거절, 관리자 지정
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { listProfiles, updateProfileByAdmin } from '@/lib/cloud'
import { useStore } from '@/lib/store'

const STATUS = {
  pending: ['승인 대기', 'bg-amber-50 text-amber-900 border-amber-200'],
  approved: ['승인됨', 'bg-emerald-50 text-emerald-900 border-emerald-200'],
  rejected: ['거절됨', 'bg-red-50 text-[var(--color-pen)] border-red-200']
}
const FILTERS = [['pending', '승인 대기'], ['approved', '승인됨'], ['rejected', '거절됨'], ['all', '전체']]

const when = value => (value ? new Date(value).toLocaleDateString('ko-KR') : '—')

export default function AdminPage() {
  const { cloud, notify } = useStore()
  const [profiles, setProfiles] = useState(null)
  const [filter, setFilter] = useState('pending')
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState('')

  const load = useCallback(async () => {
    try {
      setProfiles(await listProfiles())
    } catch (error) {
      notify(error?.message || '사용자 목록을 불러오지 못했습니다.', 'error')
      setProfiles([])
    }
  }, [notify])
  useEffect(() => { load() }, [load])

  const counts = useMemo(() => {
    const result = { pending: 0, approved: 0, rejected: 0, all: profiles?.length ?? 0 }
    for (const profile of profiles ?? []) result[profile.status] += 1
    return result
  }, [profiles])
  const shown = (profiles ?? []).filter(profile => (filter === 'all' || profile.status === filter)
    && (!query.trim() || `${profile.email} ${profile.name} ${profile.school} ${profile.subject}`.includes(query.trim())))

  const change = async (profile, patch, message) => {
    if (profile.id === cloud.user.id && (patch.role === 'teacher' || patch.status === 'rejected')) {
      notify('자기 자신의 관리자 권한은 거둘 수 없습니다.', 'error')
      return
    }
    setBusyId(profile.id)
    try {
      await updateProfileByAdmin(profile.id, patch, cloud.user.id)
      notify(message)
      await load()
    } catch (error) {
      notify(error?.message || '바꾸지 못했습니다.', 'error')
    } finally {
      setBusyId('')
    }
  }

  if (cloud.profile?.role !== 'admin') {
    return <p className="py-20 text-center text-[var(--color-ink-soft)]">관리자만 볼 수 있는 화면입니다.</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">사용자 관리</h1>
          <p className="mt-1 text-[var(--color-ink-soft)]">가입을 신청한 교사를 승인하면 서비스를 이용할 수 있습니다. 승인된 교사는 본인 자료만 봅니다.</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={load}>새로고침</button>
      </div>

      <div className="card p-3 sm:p-4 flex flex-wrap items-center gap-2">
        <div className="segmented" role="group" aria-label="상태">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} {counts[key]}</button>
          ))}
        </div>
        <input className="input sm:!w-64 sm:ml-auto" value={query} onChange={e => setQuery(e.target.value)} placeholder="이름·이메일·학교 검색" aria-label="사용자 검색" />
      </div>

      {profiles === null ? (
        <p className="py-10 text-center text-[var(--color-ink-soft)]">불러오는 중…</p>
      ) : shown.length === 0 ? (
        <p className="card py-12 text-center text-[var(--color-ink-soft)]">{filter === 'pending' ? '승인을 기다리는 신청이 없습니다.' : '해당하는 사용자가 없습니다.'}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map(profile => {
            const [label, tone] = STATUS[profile.status] ?? STATUS.pending
            const me = profile.id === cloud.user.id
            const busy = busyId === profile.id
            return (
              <li key={profile.id} className="card p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-extrabold truncate">{profile.name || '(이름 없음)'} {me && <span className="text-xs font-bold text-[var(--color-brand)]">· 나</span>}</div>
                    <div className="text-sm text-[var(--color-ink-soft)] break-all">{profile.email}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-extrabold ${tone}`}>{label}</span>
                    {profile.role === 'admin' && <span className="whitespace-nowrap rounded-full bg-[var(--color-brand)] px-2.5 py-0.5 text-xs font-extrabold text-white">관리자</span>}
                  </div>
                </div>
                <dl className="grid grid-cols-[4.5rem_1fr] gap-y-1 text-sm">
                  <dt className="text-[var(--color-ink-soft)]">학교</dt><dd>{profile.school || '—'}</dd>
                  <dt className="text-[var(--color-ink-soft)]">과목</dt><dd>{profile.subject || '—'}</dd>
                  <dt className="text-[var(--color-ink-soft)]">신청일</dt><dd>{profile.requested_at ? when(profile.requested_at) : '정보 미입력'}</dd>
                  {profile.approved_at && <><dt className="text-[var(--color-ink-soft)]">승인일</dt><dd>{when(profile.approved_at)}</dd></>}
                </dl>
                <div className="mt-auto flex flex-wrap gap-2">
                  {profile.status !== 'approved' && <button type="button" className="btn btn-primary !py-1.5 text-sm" disabled={busy} onClick={() => change(profile, { status: 'approved' }, `${profile.name || profile.email} 님을 승인했습니다.`)}>승인</button>}
                  {profile.status !== 'rejected' && !me && <button type="button" className="btn btn-danger !py-1.5 text-sm" disabled={busy} onClick={() => change(profile, { status: 'rejected' }, profile.status === 'approved' ? '이용을 중지했습니다.' : '신청을 거절했습니다.')}>{profile.status === 'approved' ? '이용 중지' : '거절'}</button>}
                  {profile.status === 'approved' && !me && (
                    profile.role === 'admin'
                      ? <button type="button" className="btn btn-ghost !py-1.5 text-sm" disabled={busy} onClick={() => change(profile, { role: 'teacher' }, '관리자 권한을 거뒀습니다.')}>교사로 바꾸기</button>
                      : <button type="button" className="btn btn-ghost !py-1.5 text-sm" disabled={busy} onClick={() => change(profile, { role: 'admin' }, '관리자로 지정했습니다.')}>관리자로 지정</button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
