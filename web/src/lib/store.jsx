/**
 * @file store.jsx
 * @brief 앱 전역 데이터(평가지·풀이 기록), 중앙 서버 로그인·승인 상태, 해시 라우터, 알림
 *
 * cloud = { configured, ready, user, profile, profileError, needPassword, guest }
 * - configured: 서버 연결 정보가 있음 (있으면 로그인해야 쓸 수 있음)
 * - profile: 교사 프로필 { role: 'admin'|'teacher', status: 'pending'|'approved'|'rejected', ... }
 * - guest: 로그인 없이 체험 (이 브라우저에만 저장)
 * - 승인된 교사만 서버 저장소를 씀. 승인 전에는 브라우저 저장소(비어 있음)를 그대로 둠
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createCloudDb, fetchMyProfile, getCloudConfig, getNeedPassword, getSupabase, isGuest, setNeedPassword, setPendingLogin } from './cloud'
import { db, getBackend, setBackend } from './db'

const StoreContext = createContext(null)

/** @brief 화면에서 쓸 수 있는 자료만 (망가진 자료 하나 때문에 목록 전체가 멈추지 않게) */
const usablePapers = list => list.filter(paper => paper?.id && paper.meta && Array.isArray(paper.questions))
const usableRuns = list => list.filter(run => run?.id).map(run => (run.answers ? run : { ...run, answers: {} }))

/** @brief 목록에서 같은 id를 바꿔 넣음 (평가지는 맨 앞으로, 풀이는 제자리) */
const putPaper = (list, paper) => [paper, ...list.filter(item => item.id !== paper.id)]
const putRun = (list, run) => (list.some(item => item.id === run.id) ? list.map(item => (item.id === run.id ? run : item)) : [...list, run])

export function StoreProvider({ children }) {
  const [papers, setPapers] = useState([])
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  // 중앙 서버(Supabase): configured=연결 정보 있음, user=로그인한 교사, ready=로그인 상태 확인 끝
  const [cloud, setCloud] = useState(() => ({ configured: Boolean(getCloudConfig()), user: null, profile: null, ready: !getCloudConfig(), guest: isGuest() }))
  const userIdRef = useRef(undefined)

  // 새로 읽기 번호 (먼저 시작했지만 늦게 끝난 응답이나 로그아웃 전 계정의 응답을 버림)
  const refreshRef = useRef(0)
  // 새로 읽는 동안 저장한 것 (먼저 읽은 옛 내용에 덮이지 않게 다시 반영)
  const savedRef = useRef([])
  const refresh = useCallback(async () => {
    const ticket = refreshRef.current + 1
    refreshRef.current = ticket
    savedRef.current = []
    try {
      const [nextPapers, nextRuns] = await Promise.all([db.listPapers(), db.listRuns()])
      if (refreshRef.current !== ticket) return
      const saved = savedRef.current
      setPapers(saved.filter(item => item.paper).reduce((list, item) => putPaper(list, item.paper), usablePapers(nextPapers)))
      setRuns(saved.filter(item => item.run).reduce((list, item) => putRun(list, item.run), usableRuns(nextRuns)))
      setError('')
    } catch (err) {
      if (refreshRef.current !== ticket) return
      setError(err?.message || '저장소를 열 수 없습니다. 사생활 보호 모드에서는 저장이 제한될 수 있습니다.')
    } finally {
      if (refreshRef.current === ticket) setLoading(false)
    }
  }, [])

  /**
   * @brief 방금 저장한 평가지를 화면 자료에 바로 반영 (전체를 다시 읽지 않음)
   * @param backend - 저장한 저장소. 그사이 로그아웃·계정 전환으로 저장소가 바뀌었으면 반영하지 않음
   */
  const applyPaper = useCallback((paper, backend = getBackend()) => {
    if (backend !== getBackend()) return
    savedRef.current.push({ paper })
    setPapers(prev => putPaper(prev, paper))
  }, [])

  /** @brief 방금 저장한 풀이 기록을 화면 자료에 바로 반영 */
  const applyRun = useCallback((run, backend = getBackend()) => {
    if (backend !== getBackend()) return
    savedRef.current.push({ run })
    setRuns(prev => putRun(prev, run))
  }, [])

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) {
      refresh()
      return undefined
    }
    // 로그인한 사용자가 바뀔 때만 프로필을 읽고 저장소를 바꿈 (토큰 갱신 때는 그대로)
    const apply = async session => {
      const user = session?.user ?? null
      if (userIdRef.current === (user?.id ?? null)) {
        setCloud(prev => ({ ...prev, user }))
        return
      }
      userIdRef.current = user?.id ?? null
      // 앞 계정의 자료가 잠깐이라도 보이지 않게 비움 (진행 중이던 읽기도 무효)
      refreshRef.current += 1
      setLoading(true)
      setPapers([])
      setRuns([])
      let profile = null
      let profileError = ''
      if (user) {
        try {
          profile = await fetchMyProfile(supabase, user)
          setPendingLogin(null)
        } catch (err) {
          profileError = err?.message || '교사 정보를 불러오지 못했습니다.'
        }
        // 프로필을 읽는 사이 로그아웃했거나 다른 계정으로 바뀌었으면 이 결과는 버림
        if (userIdRef.current !== user.id) return
      }
      const approved = profile?.status === 'approved'
      setBackend(user && approved ? createCloudDb(supabase, user.id) : null)
      // 로그인 링크로 돌아온 주소(#access_token=...)는 첫 화면 주소로 정리
      if (user && /access_token|refresh_token/.test(window.location.hash)) window.history.replaceState(null, '', `${window.location.pathname}#/`)
      setCloud(prev => ({ ...prev, configured: true, user, profile, profileError, needPassword: Boolean(user) && getNeedPassword() === user.email, ready: true }))
      refresh()
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session), () => apply(null))
    // 인증 이벤트 안에서 바로 Supabase를 부르면 막힐 수 있어 한 박자 늦게 처리
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { setTimeout(() => apply(session), 0) })
    return () => data.subscription.unsubscribe()
  }, [refresh])

  const notify = useCallback((message, tone = 'ok') => {
    setToast({ message, tone, key: Date.now() })
  }, [])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(timer)
  }, [toast])

  /** @brief 프로필 다시 읽기 (가입 신청 후, 관리자가 승인한 뒤 등) */
  const reloadProfile = useCallback(async () => {
    const supabase = getSupabase()
    const { data } = await supabase.auth.getSession()
    const user = data.session?.user
    if (!user) return
    const profile = await fetchMyProfile(supabase, user)
    // 읽는 사이 로그아웃했거나 다른 계정으로 바뀌었으면 버림
    if (userIdRef.current !== user.id) return
    const approved = profile?.status === 'approved'
    setBackend(approved ? createCloudDb(supabase, user.id) : null)
    setCloud(prev => ({ ...prev, profile, profileError: '' }))
    if (approved) refresh()
    return profile
  }, [refresh])

  /** @brief 새 비밀번호를 정했거나 나중으로 미룸 */
  const finishPassword = useCallback(() => {
    setNeedPassword('')
    setCloud(prev => ({ ...prev, needPassword: false }))
  }, [])

  const setGuestMode = useCallback(on => setCloud(prev => ({ ...prev, guest: on })), [])

  const value = useMemo(() => ({ papers, runs, loading, error, refresh, applyPaper, applyRun, notify, toast, cloud, reloadProfile, finishPassword, setGuestMode }), [papers, runs, loading, error, refresh, applyPaper, applyRun, notify, toast, cloud, reloadProfile, finishPassword, setGuestMode])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  return useContext(StoreContext)
}

/** @brief 해시 기반 라우트 (#/paper/abc?tab=omr) */
function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [path, query = ''] = raw.split('?')
  return { path, segments: path.split('/').filter(Boolean), query: new URLSearchParams(query) }
}

export function useRoute() {
  const [route, setRoute] = useState(parseHash)
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(path) {
  window.location.hash = path
}
