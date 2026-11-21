/**
 * @file store.jsx
 * @brief 앱 전역 데이터(평가지·풀이 기록)와 해시 라우터, 알림
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { db } from './db'

const StoreContext = createContext(null)

export function StoreProvider({ children }) {
  const [papers, setPapers] = useState([])
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)

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

  useEffect(() => { refresh() }, [refresh])

  const notify = useCallback((message, tone = 'ok') => {
    setToast({ message, tone, key: Date.now() })
  }, [])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(timer)
  }, [toast])

  const value = useMemo(() => ({ papers, runs, loading, error, refresh, notify, toast }), [papers, runs, loading, error, refresh, notify, toast])
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
