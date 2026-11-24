/**
 * @file LoginPage.jsx
 * @brief 첫 화면 - 로그인 / 가입 신청, Google 로그인, 로그인 없이 둘러보기
 *
 * - 가입 신청: 이름·학교·과목·이메일·비밀번호를 적고 메일의 인증번호를 확인하면 신청됨 → 관리자 승인 후 이용
 * - 로그인: 이메일과 비밀번호. 비밀번호가 없거나 잊었으면 인증번호로 확인하고 새로 정함 (인증번호만으로 로그인도 가능)
 * - 인증번호를 기다리는 중에 화면을 새로 열어도 입력칸이 그대로 나옴 (1시간)
 */

import { useEffect, useRef, useState } from 'react'
import { NewPasswordFields, PasswordInput } from '@/components/PasswordFields'
import { loadDemo, loadSample } from '@/lib/demo'
import { changePassword, cleanEmail, describeCloudError, getPendingLogin, loginProviders, resendSignupCode, sendLoginCode, setGuest, setNeedPassword, setPendingLogin, signInWithGoogle, signInWithPassword, signUpWithPassword, verifyLoginCode } from '@/lib/cloud'
import { passwordProblem } from '@/lib/password'
import { navigate, useStore } from '@/lib/store'

const RESEND_SECONDS = 60
const SIGNUP_FIELDS = [['name', '이름', '홍길동'], ['school', '학교', '○○고등학교'], ['subject', '담당 과목', '수학']]
const MODES = {
  login: { title: '로그인', help: '가입한 이메일과 비밀번호로 로그인합니다. 한 번 로그인하면 이 브라우저에서 유지됩니다.', submit: '로그인' },
  code: { title: '인증번호로 로그인', help: '가입한 이메일로 인증번호를 보냅니다.', submit: '인증번호 받기', verify: '로그인' },
  reset: { title: '비밀번호 정하기·재설정', help: '이메일로 인증번호를 확인한 뒤 새 비밀번호를 정합니다.', submit: '인증번호 받기', verify: '확인하고 비밀번호 정하기' },
  signup: { title: '가입 신청', help: '정보를 적고 이메일을 확인하면 신청됩니다. 관리자가 승인하면 이용할 수 있습니다.', submit: '가입 신청하고 인증번호 받기', verify: '이메일 확인하고 신청 마치기' }
}
const EMPTY_SIGNUP = { name: '', school: '', subject: '' }

/** @brief 만료된 링크로 돌아온 주소(#error=...)의 안내 (아니면 빈 문자열) */
function linkError() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  if (!params.get('error')) return ''
  return /expired|invalid/i.test(`${params.get('error_code')} ${params.get('error_description')}`)
    ? '로그인 링크가 만료됐거나 이미 사용됐습니다. 인증번호를 다시 받아 주세요.'
    : '로그인하지 못했습니다. 다시 시도해 주세요.'
}

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
  // 인증번호를 기다리던 중이면 그 화면부터 (비밀번호는 어디에도 저장하지 않음)
  const [pending] = useState(getPendingLogin)
  const [mode, setMode] = useState(pending?.kind ?? 'login') // login(비밀번호) | code(인증번호) | reset(비밀번호 정하기) | signup
  const [email, setEmail] = useState(pending?.email ?? '')
  const [signup, setSignup] = useState(pending?.signup ?? EMPTY_SIGNUP)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState(pending ? 'code' : 'form') // form → code
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(linkError)
  const [google, setGoogle] = useState(false)
  const [wait, setWait] = useState(0)
  const codeRef = useRef(null)
  const text = MODES[mode] ?? MODES.login

  useEffect(() => { loginProviders().then(providers => setGoogle(providers.google)) }, [])
  // 안내를 읽어 둔 뒤 주소에서 오류 표시를 지움
  useEffect(() => {
    if (/error=/.test(window.location.hash)) window.history.replaceState(null, '', `${window.location.pathname}#/`)
  }, [])
  useEffect(() => {
    if (!wait) return undefined
    const timer = setTimeout(() => setWait(value => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])
  useEffect(() => { if (step === 'code') codeRef.current?.focus() }, [step])

  const signupData = () => (mode === 'signup' ? { name: signup.name.trim(), school: signup.school.trim(), subject: signup.subject.trim() } : null)
  const waitForCode = kind => {
    setPendingLogin({ email: cleanEmail(email), signup: signupData(), kind })
    if (kind === 'reset') setNeedPassword(cleanEmail(email))
    setMode(kind)
    setStep('code')
  }

  const submit = async event => {
    event.preventDefault()
    const problem = mode === 'signup' ? passwordProblem(password, confirm) : ''
    setError(problem)
    if (problem) return
    setBusy(true)
    try {
      if (mode === 'login') {
        await signInWithPassword(email, password)
        return // 로그인되면 앱이 자동으로 다음 화면으로 넘어감
      }
      if (mode === 'signup') {
        if (await signUpWithPassword(email, password, signupData())) return
      } else {
        await sendLoginCode(email)
      }
      waitForCode(mode)
      setWait(RESEND_SECONDS)
    } catch (err) {
      if (err?.code === 'email_not_confirmed') {
        // 가입은 했지만 메일 확인이 남은 경우 → 인증번호 입력으로
        waitForCode('signup')
        setWait(0)
      }
      setError(err?.message || '처리하지 못했습니다.')
    }
    setBusy(false)
  }

  const resend = async () => {
    setError('')
    setBusy(true)
    try {
      if (mode === 'signup') await resendSignupCode(email)
      else await sendLoginCode(email)
      setWait(RESEND_SECONDS)
    } catch (err) {
      setError(err?.message || '메일을 보내지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const changeMode = next => {
    setPendingLogin(null)
    setNeedPassword('')
    setMode(next)
    setStep('form')
    setCode('')
    setPassword('')
    setConfirm('')
    setError('')
  }

  const verify = async event => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await verifyLoginCode(email, code)
      // 같은 이메일로 먼저 신청된 적이 있어도, 메일을 확인한 사람이 방금 정한 비밀번호가 쓰이게 함
      if (mode === 'signup' && password) await changePassword(password).catch(() => {})
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
    setError('')
    setBusy(true)
    try {
      const ready = await loadSample()
      setGuest(true)
      navigate('/')
      // 실제 평가지를 준비하지 못했으면 가상 평가지로
      if (ready) await refresh()
      else await loadDemo(refresh, notify)
      setGuestMode(true)
    } catch (err) {
      setGuest(false)
      setError(err?.message || '둘러보기 자료를 불러오지 못했습니다.')
      setBusy(false)
    }
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
            <div className="segmented mb-5 w-full [&>button]:flex-1" role="group" aria-label="로그인 또는 가입 신청">
              <button type="button" aria-pressed={mode !== 'signup'} onClick={() => changeMode('login')}>로그인</button>
              <button type="button" aria-pressed={mode === 'signup'} onClick={() => changeMode('signup')}>가입 신청</button>
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight">{text.title}</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)] break-keep">{text.help}</p>

            {step === 'form' ? (
              <form key={mode} className="mt-5 space-y-3" onSubmit={submit}>
                {mode === 'signup' && SIGNUP_FIELDS.map(([key, label, placeholder]) => (
                  <label key={key} className="block">
                    <span className="field-label">{label}</span>
                    <input className="input" required maxLength={60} value={signup[key]} placeholder={placeholder} onChange={e => setSignup(prev => ({ ...prev, [key]: e.target.value }))} />
                  </label>
                ))}
                <label className="block">
                  <span className="field-label">이메일</span>
                  <input className="input" type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="teacher@school.kr" />
                </label>
                {mode === 'login' && <PasswordInput label="비밀번호" value={password} onChange={setPassword} autoComplete="current-password" />}
                {mode === 'signup' && <NewPasswordFields value={password} confirm={confirm} onChange={setPassword} onConfirm={setConfirm} />}
                <button type="submit" className="btn btn-primary w-full !py-3" disabled={busy}>{busy ? '처리 중…' : text.submit}</button>
                {mode === 'login' && (
                  <div className="flex flex-wrap justify-between gap-x-4 gap-y-2 text-sm font-semibold">
                    <button type="button" className="text-[var(--color-brand)] hover:underline" onClick={() => changeMode('reset')}>비밀번호 정하기·재설정</button>
                    <button type="button" className="text-[var(--color-ink-soft)] hover:underline" onClick={() => changeMode('code')}>인증번호로 로그인</button>
                  </div>
                )}
                {(mode === 'code' || mode === 'reset') && (
                  <div className="flex flex-wrap justify-between gap-x-4 gap-y-2 text-sm font-semibold">
                    <button type="button" className="text-[var(--color-ink-soft)] hover:underline" onClick={() => changeMode('login')}>← 비밀번호로 로그인</button>
                    <button type="button" className="text-[var(--color-brand)] hover:underline disabled:opacity-50 disabled:no-underline" disabled={!email.trim()} onClick={() => { setError(''); waitForCode(mode) }}>이미 받은 인증번호 입력</button>
                  </div>
                )}
              </form>
            ) : (
              <form className="mt-5 space-y-3" onSubmit={verify}>
                <p className="rounded-xl bg-[var(--color-brand-soft)] px-4 py-3 text-sm leading-relaxed break-keep">
                  <b className="break-all">{email}</b>로 온 <b>「AI 검증 평가 서비스」</b> 메일의 인증번호를 입력하세요. 휴대폰에서 메일을 봐도 됩니다.
                  <span className="mt-1 block text-xs text-[var(--color-ink-soft)]">메일의 버튼을 누르면 버튼을 누른 브라우저에서 로그인됩니다. 메일이 안 보이면 스팸함을 확인하세요.</span>
                </p>
                <label className="block">
                  <span className="field-label">인증번호</span>
                  <input
                    ref={codeRef}
                    className="input text-center text-2xl font-extrabold tracking-[0.4em] tabular-nums"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={10}
                    required
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                  />
                </label>
                <button type="submit" className="btn btn-primary w-full !py-3" disabled={busy || code.length < 6}>{busy ? '확인 중…' : text.verify}</button>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <button type="button" className="font-semibold text-[var(--color-ink-soft)] hover:underline" onClick={() => changeMode(mode)}>← 이메일 바꾸기</button>
                  <button type="button" className="font-semibold text-[var(--color-brand)] hover:underline disabled:opacity-50 disabled:no-underline" disabled={wait > 0 || busy} onClick={resend}>
                    {wait > 0 ? `다시 보내기 (${wait}초)` : '인증번호 다시 보내기'}
                  </button>
                </div>
              </form>
            )}

            {error && (
              <div role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--color-pen)] break-keep">
                {error}
                {mode !== 'signup' && /「가입 신청」/.test(error) && <button type="button" className="ml-2 font-bold underline" onClick={() => changeMode('signup')}>가입 신청하기</button>}
              </div>
            )}

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
            <button type="button" disabled={busy} className="text-sm font-semibold text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:underline" onClick={tryWithoutLogin}>
              {busy ? '준비 중…' : '로그인 없이 예시로 둘러보기 →'}
            </button>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">둘러보기 자료는 이 브라우저에만 저장되고 서버에는 올라가지 않습니다.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
