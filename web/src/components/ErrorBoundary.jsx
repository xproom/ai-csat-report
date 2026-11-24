/**
 * @file ErrorBoundary.jsx
 * @brief 화면 하나에서 오류가 나도 흰 화면이 되지 않게 안내
 * - 새 버전이 배포돼 옛 화면 파일을 받지 못하면 새로고침을 안내
 */

import { Component } from 'react'

const CHUNK_ERROR = /dynamically imported module|module script failed|Failed to fetch|error loading/i

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const outdated = CHUNK_ERROR.test(String(error?.message))
    return (
      <div role="alert" className="mx-auto max-w-lg px-6 py-20 text-center">
        <p className="text-lg font-extrabold">{outdated ? '화면을 내려받지 못했습니다' : '화면을 표시하지 못했습니다'}</p>
        <p className="mt-2 text-[var(--color-ink-soft)] break-keep">
          {outdated ? '새 버전이 나왔거나 인터넷 연결이 끊겼을 수 있습니다. 새로고침해 주세요.' : '자료에 문제가 있을 수 있습니다. 새로고침해도 같으면 다른 평가지를 열어 보세요.'}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>새로고침</button>
          <a href="#/" className="btn btn-ghost">첫 화면으로</a>
        </div>
      </div>
    )
  }
}
