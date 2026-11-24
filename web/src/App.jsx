/**
 * @file App.jsx
 * @brief 라우팅과 전역 상태 연결
 * - 서버가 연결돼 있으면 로그인해야 쓸 수 있음: 로그인 전 → 로그인 화면, 승인 전 → 가입 신청·승인 대기 화면
 * - 「로그인 없이 둘러보기」는 이 브라우저에만 저장하는 체험 모드
 */

import { Suspense, lazy, useEffect } from 'react'
import ErrorBoundary from '@/components/ErrorBoundary'
import Layout from '@/components/Layout'
import { StoreProvider, useRoute, useStore } from '@/lib/store'
import HomePage from '@/pages/HomePage'
import { canManage } from '@/lib/cloud'

// 첫 화면만 바로 받고, 나머지 화면은 열 때 내려받음
const loadNewPaper = () => import('@/pages/NewPaperPage')
const loadPaper = () => import('@/pages/PaperPage')
const NewPaperPage = lazy(loadNewPaper)
const PaperPage = lazy(loadPaper)
const AccountPage = lazy(() => import('@/pages/AccountPage'))
const AdminPage = lazy(() => import('@/pages/AdminPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const PendingPage = lazy(() => import('@/pages/PendingPage'))
const SetPasswordPage = lazy(() => import('@/pages/SetPasswordPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))

const Waiting = () => <p className="min-h-[50vh] grid place-items-center text-[var(--color-ink-soft)]">불러오는 중…</p>

function Routes() {
  const route = useRoute()
  const { loading, error, cloud } = useStore()
  const [first, second] = route.segments
  const working = !cloud.configured || cloud.guest || cloud.profile?.status === 'approved'

  // 쓸 준비가 되면 한가할 때 자주 쓰는 화면을 미리 받아 둠
  useEffect(() => {
    if (!working) return undefined
    const prefetch = () => { loadNewPaper().catch(() => {}); loadPaper().catch(() => {}) }
    if (!window.requestIdleCallback) {
      const timer = setTimeout(prefetch, 1500)
      return () => clearTimeout(timer)
    }
    const handle = window.requestIdleCallback(prefetch, { timeout: 4000 })
    return () => window.cancelIdleCallback(handle)
  }, [working])

  // 로그인·승인 확인
  if (cloud.configured && !cloud.guest) {
    if (!cloud.ready) return <p className="min-h-dvh grid place-items-center text-[var(--color-ink-soft)]">불러오는 중…</p>
    if (!cloud.user) return <LoginPage />
    if (cloud.needPassword) return <SetPasswordPage />
    if (cloud.profile?.status !== 'approved') return <PendingPage key={cloud.profile?.status ?? 'none'} />
  }

  let page
  if (loading) page = <p className="py-20 text-center text-[var(--color-ink-soft)]">불러오는 중…</p>
  else if (error) page = <p className="py-20 text-center text-[var(--color-pen)]">{error}</p>
  else if (first === 'new') page = <NewPaperPage />
  else if (first === 'paper' && second) page = <PaperPage key={second} paperId={second} tab={route.query.get('tab') || 'cover'} runId={route.query.get('run')} edit={route.query.get('edit') === '1'} />
  else if (first === 'dashboard') page = <DashboardPage />
  // 설정은 관리자만: 교사가 설정 주소로 들어와도 내 계정을 보여 줌
  else if (first === 'settings' && canManage(cloud)) page = <SettingsPage />
  else if (first === 'settings' || first === 'account') page = <AccountPage />
  else if (first === 'admin') page = <AdminPage />
  else page = <HomePage />

  return <Layout route={route}><ErrorBoundary key={route.path}><Suspense fallback={<Waiting />}>{page}</Suspense></ErrorBoundary></Layout>
}

export default function App() {
  return (
    <StoreProvider>
      <ErrorBoundary><Suspense fallback={<Waiting />}><Routes /></Suspense></ErrorBoundary>
    </StoreProvider>
  )
}
