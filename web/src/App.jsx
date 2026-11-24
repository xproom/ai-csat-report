/**
 * @file App.jsx
 * @brief 라우팅과 전역 상태 연결
 * - 서버가 연결돼 있으면 로그인해야 쓸 수 있음: 로그인 전 → 로그인 화면, 승인 전 → 가입 신청·승인 대기 화면
 * - 「로그인 없이 둘러보기」는 이 브라우저에만 저장하는 체험 모드
 */

import Layout from '@/components/Layout'
import { StoreProvider, useRoute, useStore } from '@/lib/store'
import HomePage from '@/pages/HomePage'
import NewPaperPage from '@/pages/NewPaperPage'
import PaperPage from '@/pages/PaperPage'
import AdminPage from '@/pages/AdminPage'
import DashboardPage from '@/pages/DashboardPage'
import LoginPage from '@/pages/LoginPage'
import PendingPage from '@/pages/PendingPage'
import SetPasswordPage from '@/pages/SetPasswordPage'
import SettingsPage from '@/pages/SettingsPage'

function Routes() {
  const route = useRoute()
  const { loading, error, cloud } = useStore()
  const [first, second] = route.segments

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
  else if (first === 'settings') page = <SettingsPage />
  else if (first === 'admin') page = <AdminPage />
  else page = <HomePage />

  return <Layout route={route}>{page}</Layout>
}

export default function App() {
  return (
    <StoreProvider>
      <Routes />
    </StoreProvider>
  )
}
