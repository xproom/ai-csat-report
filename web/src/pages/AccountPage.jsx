/**
 * @file AccountPage.jsx
 * @brief 내 계정 (교사용) - 내 정보, 비밀번호, API 키, 로그아웃
 * - 서버 연결·백업·초기화 같은 설정은 관리자만 (SettingsPage)
 */

import { MyInfo, PasswordForm } from '@/components/AccountForms'
import ApiKeySection from '@/components/ApiKeySection'
import { setGuest, signOut } from '@/lib/cloud'
import { useStore } from '@/lib/store'

export default function AccountPage() {
  const { cloud, setGuestMode } = useStore()
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">내 계정</h1>
        <p className="mt-1 text-[var(--color-ink-soft)] break-all">{cloud.user ? `${cloud.user.email} · 자료는 본인 계정에 저장됩니다.` : '둘러보기 중입니다. 로그인하면 자료가 본인 계정에 저장됩니다.'}</p>
      </div>

      {cloud.user ? (
        <section className="card p-4 sm:p-6 space-y-4">
          <h2 className="text-lg font-extrabold">내 정보</h2>
          {cloud.profile && <MyInfo profile={cloud.profile} />}
          <PasswordForm email={cloud.user.email} />
          <div className="flex justify-end">
            <button type="button" className="btn btn-ghost" onClick={() => signOut()}>로그아웃</button>
          </div>
        </section>
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => { setGuest(false); setGuestMode(false) }}>로그인하기</button>
      )}

      <ApiKeySection />
    </div>
  )
}
