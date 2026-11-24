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
import { db, setBackend } from './db'

const StoreContext = createContext(null)

export function StoreProvider({ children }) {
  const [papers, setPapers] = useState([])
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  // 중앙 서버(Supabase): configured=연결 정보 있음, user=로그인한 교사, ready=로그인 상태 확인 끝
  const [cloud, setCloud] = useState(() => ({ configured: Boolean(getCloudConfig()), user: null, profile: null, ready: !getCloudConfig(), guest: isGuest() }))
  const userIdRef = useRef(undefined)

  const refresh = useCallback(async () => {
    try {
      const [nextPapers, nextRuns] = await Promise.all([db.listPapers(), db.listRuns()])
      setPapers(nextPapers)
      setRuns(nextRuns)
      setError('')
    } catch (err) {
      setError(err?.message || '저장소를 열 수 없습니다. 사생활 보호 모드에서는 저장이 제한될 수 있습니다.')
    } finally {
      setLoading(false)
    }
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
      setLoading(true)
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

  const value = useMemo(() => ({ papers, runs, loading, error, refresh, notify, toast, cloud, reloadProfile, finishPassword, setGuestMode }), [papers, runs, loading, error, refresh, notify, toast, cloud, reloadProfile, finishPassword, setGuestMode])
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
