/**
 * @file Layout.jsx
 * @brief 상단 헤더, 모바일 하단 탭, 알림 토스트
 */

import { useStore } from '@/lib/store'

const NAV = [
  { path: '/', label: '평가지', icon: 'M6 3h9l5 5v13H6zM14 3v6h6M9 13h8M9 17h6' },
  { path: '/new', label: '새 평가지', icon: 'M12 5v14M5 12h14' },
  { path: '/dashboard', label: '검증 현황', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { path: '/settings', label: '설정', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z' }
]

export function Icon({ d, className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

/** @brief OMR 마킹을 닮은 로고 */
function Logo() {
  return (
    <a href="#/" className="flex items-center gap-2.5 shrink-0" aria-label="AI 내신 성적표 홈">
      <span className="grid grid-cols-3 gap-[3px] p-1.5 rounded-lg bg-white border border-[var(--color-omr)]/40">
        {[0, 1, 0, 1, 0, 0, 0, 0, 1].map((filled, index) => (
          <span key={index} className={`w-[6px] h-[8px] rounded-full ${filled ? 'bg-[var(--color-ink)]' : 'border border-[var(--color-omr)]/70'}`} />
        ))}
      </span>
      <span className="leading-tight">
        <span className="block font-extrabold tracking-tight text-[1.05rem]">AI 내신 성적표</span>
        <span className="block text-[0.7rem] text-[var(--color-ink-soft)] -mt-0.5">문제지·정답 AI 검증과 OMR 채점</span>
      </span>
    </a>
  )
}

function isActive(current, path) {
  if (path === '/') return current === '/' || current.startsWith('/paper')
  return current.startsWith(path)
}

export default function Layout({ route, children }) {
  const { toast, cloud } = useStore()
  const current = route.path

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-30 backdrop-blur bg-[var(--color-paper)]/85 border-b border-[var(--color-line)]">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between gap-4">
          <Logo />
          <nav className="hidden md:flex items-center gap-1" aria-label="주 메뉴">
            {NAV.map(item => (
              <a
                key={item.path}
                href={`#${item.path}`}
                aria-current={isActive(current, item.path) ? 'page' : undefined}
                className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors ${isActive(current, item.path)
                  ? 'bg-[var(--color-brand)] text-white'
                  : 'text-[var(--color-ink-soft)] hover:bg-white'}`}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6 md:py-10 pb-28 md:pb-12">{children}</main>

      <footer className="hidden md:block border-t border-[var(--color-line)] py-6 text-center text-xs text-[var(--color-ink-soft)]">
        {cloud.user ? '평가지와 결과는 중앙 서버의 본인 계정에 저장됩니다' : '로그인하지 않으면 평가지와 결과는 이 브라우저에만 저장됩니다'} · 문제지 저작권은 출제 학교·교사에게 있습니다
      </footer>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-[var(--color-line)] pb-[env(safe-area-inset-bottom)]" aria-label="하단 메뉴">
        <div className="grid grid-cols-4">
          {NAV.map(item => (
            <a
              key={item.path}
              href={`#${item.path}`}
              aria-current={isActive(current, item.path) ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 py-2.5 text-[0.7rem] font-semibold ${isActive(current, item.path) ? 'text-[var(--color-brand)]' : 'text-[var(--color-ink-soft)]'}`}
            >
              <Icon d={item.icon} className="w-6 h-6" />
              {item.label}
            </a>
          ))}
        </div>
      </nav>

      {toast && (
        <div key={toast.key} role="status" className="fixed z-40 left-1/2 -translate-x-1/2 bottom-24 md:bottom-8 max-w-[90vw]">
          <div className={`px-4 py-2.5 rounded-xl shadow-lg text-sm font-semibold text-white ${toast.tone === 'error' ? 'bg-[var(--color-pen)]' : 'bg-[var(--color-ink)]'}`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  )
}
