/**
 * @file LoginPage.jsx
 * @brief 로그인 화면 - 이메일 로그인 링크(또는 인증번호), Google 로그인, 로그인 없이 둘러보기
 *
 * - 처음 로그인하는 교사는 계정이 만들어지고 '승인 대기' 화면으로 넘어감 (관리자 승인 후 사용)
 * - 메일의 링크를 이 컴퓨터의 브라우저에서 열면 로그인됨 (다른 탭에서 열어도 이 화면이 자동으로 넘어감)
 * - 메일 서버(SMTP)를 연결해 메일에 6자리 번호를 넣으면 번호 입력으로도 로그인 가능
 */

import { useEffect, useRef, useState } from 'react'
import { localDb } from '@/lib/db'
import { loadDemo } from '@/lib/demo'
import { describeCloudError, loginProviders, sendLoginCode, setGuest, signInWithGoogle, verifyLoginCode } from '@/lib/cloud'
import { useStore } from '@/lib/store'

const RESEND_SECONDS = 60

function OmrMark() {
  return (
    <span className="grid grid-cols-3 gap-[5px] p-2.5 rounded-2xl bg-white border border-[var(--color-omr)]/40 shadow-sm" aria-hidden="true">
      {[0, 1, 0, 1, 0, 0, 0, 0, 1].map((filled, index) => (
        <span key={index} className={`w-[10px] h-[13px] rounded-full ${filled ? 'bg-[var(--color-ink)]' : 'border border-[var(--color-omr)]/70'}`} />
      ))}
    </span>
  )
}

export default function LoginPage() {
  const { notify, refresh, setGuestMode } = useStore()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState('email') // email → code
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [google, setGoogle] = useState(false)
  const [wait, setWait] = useState(0)
  const codeRef = useRef(null)

  useEffect(() => { loginProviders().then(providers => setGoogle(providers.google)) }, [])
  // 만료된 링크로 돌아온 경우 (#error=...&error_description=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    if (!params.get('error')) return
    const expired = /expired|invalid/i.test(`${params.get('error_code')} ${params.get('error_description')}`)
    setError(expired ? '로그인 링크가 만료됐거나 이미 사용됐습니다. 새 링크를 받아 주세요.' : '로그인하지 못했습니다. 다시 시도해 주세요.')
    window.history.replaceState(null, '', `${window.location.pathname}#/`)
  }, [])
  useEffect(() => {
    if (!wait) return undefined
    const timer = setTimeout(() => setWait(value => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])
  useEffect(() => { if (step === 'code') codeRef.current?.focus() }, [step])

  const send = async event => {
    event?.preventDefault()
    setError('')
    setBusy(true)
    try {
      await sendLoginCode(email)
      setStep('code')
      setWait(RESEND_SECONDS)
    } catch (err) {
      setError(/rate limit|security purposes/i.test(err?.message ?? '') ? '잠시 뒤 다시 요청해 주세요. (메일은 짧은 시간에 여러 번 보낼 수 없습니다)' : describeCloudError(err))
    } finally {
      setBusy(false)
    }
  }

  const verify = async event => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await verifyLoginCode(email, code)
      // 로그인되면 앱이 자동으로 다음 화면(승인 대기 또는 서비스)으로 넘어감
    } catch (err) {
      setError(err?.message || '로그인하지 못했습니다.')
      setBusy(false)
    }
  }

  const google_ = async () => {
    setError('')
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(describeCloudError(err))
    }
  }

  const tryWithoutLogin = async () => {
    setGuest(true)
    setGuestMode(true)
    // 예시 평가지가 없을 때만 넣음 (여러 번 둘러봐도 겹치지 않게)
    const existing = await localDb.listPapers()
    if (!existing.some(paper => paper.isDemo)) await loadDemo(refresh, notify)
    else await refresh()
  }

  return (
    <div className="min-h-dvh grid lg:grid-cols-[1.1fr_1fr] bg-[var(--color-paper)]">
      {/* 소개 (큰 화면) */}
      <section className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-[var(--color-brand)] text-white p-12">
        <div className="absolute -right-16 -top-10 grid grid-cols-5 gap-4 opacity-20 rotate-12" aria-hidden="true">
          {Array.from({ length: 45 }, (_, index) => (
            <span key={index} className={`w-6 h-9 rounded-[50%] ${[2, 8, 11, 19, 23, 26, 33, 38, 41].includes(index) ? 'bg-white' : 'border-2 border-white'}`} />
          ))}
        </div>
        <div className="relative flex items-center gap-3">
          <OmrMark />
          <span className="text-2xl font-extrabold tracking-tight">AI 검증 평가 서비스</span>
        </div>
        <div className="relative max-w-lg">
          <h1 className="text-4xl xl:text-5xl font-extrabold leading-tight tracking-tight break-keep">시험지를 내기 전에,<br />AI가 먼저 검토하고 풀어 봅니다</h1>
          <ul className="mt-8 space-y-3 text-white/85 text-lg">
            <li>✓ 배점·문항 번호·선지·정답 표기·쪽 번호 자동 검증</li>
            <li>✓ AI가 문제지에 풀이를 적으며 OMR로 답안 제출</li>
            <li>✓ 실제 정답과 비교해 채점, 풀이 PDF 내려받기</li>
          </ul>
        </div>
        <p className="relative text-sm text-white/60">승인된 교사만 이용할 수 있습니다 · 자료는 본인 계정에만 저장됩니다</p>
      </section>

      {/* 로그인 */}
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <OmrMark />
            <div>
              <div className="text-xl font-extrabold tracking-tight">AI 검증 평가 서비스</div>
              <div className="text-sm text-[var(--color-ink-soft)]">문제지·정답 AI 검증과 OMR 채점</div>
            </div>
          </div>

          <div className="card p-6 sm:p-8">
            <h2 className="text-2xl font-extrabold tracking-tight">로그인</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)] break-keep">교사 이메일로 로그인하세요. 처음이면 가입 신청 후 관리자 승인을 받아 이용합니다.</p>

            {step === 'email' ? (
              <form className="mt-6 space-y-3" onSubmit={send}>
                <label className="block">
                  <span className="field-label">이메일</span>
                  <input className="input" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="teacher@school.kr" />
                </label>
                <button type="submit" className="btn btn-primary w-full !py-3" disabled={busy}>{busy ? '보내는 중…' : '로그인 메일 받기'}</button>
              </form>
            ) : (
              <form className="mt-6 space-y-3" onSubmit={verify}>
                <div className="rounded-xl bg-[var(--color-brand-soft)] px-4 py-3 text-sm leading-relaxed break-keep">
                  <b>{email}</b>로 로그인 메일을 보냈습니다.
                  <ol className="mt-2 list-decimal pl-5 space-y-0.5">
                    <li>이 컴퓨터에서 메일함을 열고 <b>Supabase Auth</b>가 보낸 메일을 찾으세요.</li>
                    <li>메일의 <b>「Log In」</b> (처음이면 <b>「Confirm email address」</b>) 링크를 누르세요.</li>
                    <li>로그인되면 이 화면이 자동으로 넘어갑니다.</li>
                  </ol>
                  <p className="mt-2 text-xs text-[var(--color-ink-soft)]">메일이 안 보이면 스팸함을 확인하세요. 휴대폰에서 링크를 누르면 휴대폰에서 로그인됩니다.</p>
                </div>
                <label className="block">
                  <span className="field-label">메일에 6자리 인증번호가 있으면 입력 (없으면 링크를 누르세요)</span>
                  <input
                    ref={codeRef}
                    className="input text-center text-2xl font-extrabold tracking-[0.5em] tabular-nums"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={8}
                    required
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="••••••"
                  />
                </label>
                <button type="submit" className="btn btn-primary w-full !py-3" disabled={busy || code.length < 6}>{busy ? '확인 중…' : '로그인'}</button>
                <div className="flex items-center justify-between text-sm">
                  <button type="button" className="font-semibold text-[var(--color-ink-soft)] hover:underline" onClick={() => { setStep('email'); setCode(''); setError('') }}>← 이메일 바꾸기</button>
                  <button type="button" className="font-semibold text-[var(--color-brand)] hover:underline disabled:opacity-50 disabled:no-underline" disabled={wait > 0 || busy} onClick={send}>
                    {wait > 0 ? `다시 보내기 (${wait}초)` : '인증번호 다시 보내기'}
                  </button>
                </div>
              </form>
            )}

            {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--color-pen)]">{error}</p>}

            {google && (
              <>
                <div className="my-5 flex items-center gap-3 text-xs text-[var(--color-ink-soft)]"><span className="h-px flex-1 bg-[var(--color-line)]" />또는<span className="h-px flex-1 bg-[var(--color-line)]" /></div>
                <button type="button" className="btn btn-ghost w-full !py-3 gap-2" onClick={google_}>
                  <svg className="w-5 h-5" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
                  Google 계정으로 로그인
                </button>
              </>
            )}
          </div>

          <div className="mt-5 text-center">
            <button type="button" className="text-sm font-semibold text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:underline" onClick={tryWithoutLogin}>
              로그인 없이 예시로 둘러보기 →
            </button>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">둘러보기 자료는 이 브라우저에만 저장되고 서버에는 올라가지 않습니다.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
