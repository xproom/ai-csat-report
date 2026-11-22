/**
 * @file store.jsx
 * @brief 앱 전역 데이터(평가지·풀이 기록), 중앙 서버 로그인 상태, 해시 라우터, 알림
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createCloudDb, getCloudConfig, getSupabase } from './cloud'
import { db, setBackend } from './db'

const StoreContext = createContext(null)

export function StoreProvider({ children }) {
  const [papers, setPapers] = useState([])
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  // 중앙 서버(Supabase): configured=연결 정보 있음, user=로그인한 교사, ready=로그인 상태 확인 끝
  const [cloud, setCloud] = useState(() => ({ configured: Boolean(getCloudConfig()), user: null, ready: !getCloudConfig() }))
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
    // 로그인한 사용자가 바뀔 때만 저장소를 바꿈 (토큰 갱신 때는 그대로)
    const apply = session => {
      const user = session?.user ?? null
      setCloud({ configured: true, user, ready: true })
      if (userIdRef.current === (user?.id ?? null)) return
      userIdRef.current = user?.id ?? null
      setBackend(user ? createCloudDb(supabase, user.id) : null)
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

  const value = useMemo(() => ({ papers, runs, loading, error, refresh, notify, toast, cloud }), [papers, runs, loading, error, refresh, notify, toast, cloud])
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
