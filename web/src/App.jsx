/**
 * @file App.jsx
 * @brief 라우팅과 전역 상태 연결
 */

import Layout from '@/components/Layout'
import { StoreProvider, useRoute, useStore } from '@/lib/store'
import HomePage from '@/pages/HomePage'
import NewPaperPage from '@/pages/NewPaperPage'
import PaperPage from '@/pages/PaperPage'
import DashboardPage from '@/pages/DashboardPage'
import SettingsPage from '@/pages/SettingsPage'

function Routes() {
  const route = useRoute()
  const { loading, error } = useStore()
  const [first, second] = route.segments

  let page
  if (loading) page = <p className="py-20 text-center text-[var(--color-ink-soft)]">불러오는 중…</p>
  else if (error) page = <p className="py-20 text-center text-[var(--color-pen)]">{error}</p>
  else if (first === 'new') page = <NewPaperPage />
  else if (first === 'paper' && second) page = <PaperPage key={second} paperId={second} tab={route.query.get('tab') || 'cover'} runId={route.query.get('run')} edit={route.query.get('edit') === '1'} />
  else if (first === 'dashboard') page = <DashboardPage />
  else if (first === 'settings') page = <SettingsPage />
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
