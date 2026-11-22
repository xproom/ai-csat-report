/**
 * @file CloudPanel.jsx
 * @brief 설정 화면의 중앙 서버(Supabase) 연결 - 연결 정보, 이메일 로그인, 브라우저 자료 올리기
 */

import { useState } from 'react'
import { createCloudDb, describeCloudError, getCloudConfig, getSupabase, setCloudConfig, setGuest, signOut, uploadLocalData } from '@/lib/cloud'
import { localDb } from '@/lib/db'
import { useStore } from '@/lib/store'

export default function CloudPanel() {
  const { cloud, refresh, notify, setGuestMode } = useStore()
  const config = getCloudConfig()
  const [url, setUrl] = useState(config?.url ?? '')
  const [anonKey, setAnonKey] = useState(config?.fromEnv ? '' : config?.anonKey ?? '')
  const [busy, setBusy] = useState('')

  const saveConfig = () => {
    setCloudConfig(url && anonKey ? { url, anonKey } : null)
    // 클라이언트·로그인 상태를 새로 만들기 위해 다시 불러옴
    window.location.reload()
  }

  // 로그인은 첫 화면(로그인 창)에서 함. 둘러보기 중이면 로그인 창으로 돌아감
  const goLogin = () => { setGuest(false); setGuestMode(false) }

  const logout = async () => {
    await signOut()
    notify('로그아웃했습니다.')
  }

  const upload = async () => {
    const supabase = getSupabase()
    if (!supabase || !cloud.user) return
    const papers = await localDb.listPapers()
    if (!papers.length) { notify('이 브라우저에 올릴 평가지가 없습니다.'); return }
    if (!window.confirm(`이 브라우저에 있는 평가지 ${papers.length}개와 문제지·풀이 기록을 서버(${cloud.user.email})로 올립니다. 서버에 같은 평가지가 있으면 덮어씁니다.`)) return
    try {
      const result = await uploadLocalData(localDb, createCloudDb(supabase, cloud.user.id), message => setBusy(message))
      await refresh()
      notify(`평가지 ${result.papers}개, 문제지 ${result.files}개, 풀이 ${result.runs}개를 서버로 올렸습니다.`)
    } catch (error) {
      notify(describeCloudError(error), 'error')
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="card p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">중앙 서버 (Supabase)</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)] leading-relaxed break-keep">
            로그인하면 평가지·문제지·검증·풀이 기록이 서버에 저장되어 학교·집 어느 기기에서나 이어서 쓸 수 있습니다. 교사마다 본인 자료만 보입니다. API 키는 서버에 저장하지 않습니다.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${cloud.user ? 'bg-emerald-100 text-emerald-900' : cloud.configured ? 'bg-amber-100 text-amber-900' : 'bg-[#f1ede4] text-[var(--color-ink-soft)]'}`}>
          {cloud.user ? '서버에 저장 중' : cloud.configured ? '로그인 전 (브라우저 저장)' : '연결 안 됨 (브라우저 저장)'}
        </span>
      </div>

      {!config?.fromEnv && (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
          <label className="block">
            <span className="field-label">Project URL</span>
            <input className="input font-mono" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" spellCheck={false} />
          </label>
          <label className="block">
            <span className="field-label">anon(publishable) 키</span>
            <input className="input font-mono" value={anonKey} onChange={e => setAnonKey(e.target.value)} placeholder="eyJ… 또는 sb_publishable_…" spellCheck={false} autoComplete="off" />
          </label>
          <button type="button" className="btn btn-ghost" onClick={saveConfig}>{url && anonKey ? '연결' : '연결 해제'}</button>
          <p className="sm:col-span-3 text-xs text-[var(--color-ink-soft)] break-keep">
            Supabase 대시보드 → Project Settings → API에서 확인합니다. service_role(secret) 키는 절대 넣지 마세요. 처음 한 번 SQL Editor에서 저장소의 <code>supabase/schema.sql</code>을 실행해야 합니다.
          </p>
        </div>
      )}
      {config?.fromEnv && <p className="text-xs text-[var(--color-ink-soft)]">이 사이트에 연결된 서버: <span className="font-mono">{config.url}</span></p>}

      {cloud.configured && !cloud.user && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm flex-1 min-w-[12rem]">둘러보기 중입니다. 로그인하면 자료가 본인 계정에 저장됩니다.</span>
          <button type="button" className="btn btn-primary" onClick={goLogin}>로그인하기</button>
        </div>
      )}

      {cloud.user && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm flex-1 min-w-[12rem]">
            <b>{cloud.profile?.name || cloud.user.email}</b>
            {cloud.profile?.name && <span className="text-[var(--color-ink-soft)]"> ({cloud.user.email})</span>}
            {cloud.profile?.role === 'admin' && <span className="ml-1.5 rounded-full bg-[var(--color-brand)] px-2 py-0.5 text-xs font-bold text-white">관리자</span>}
          </span>
          <button type="button" className="btn btn-ghost" disabled={Boolean(busy)} onClick={upload}>{busy || '이 브라우저 자료 서버로 올리기'}</button>
          <button type="button" className="btn btn-ghost" onClick={logout}>로그아웃</button>
        </div>
      )}
    </section>
  )
}
