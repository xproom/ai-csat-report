/**
 * @file useAutosave.js
 * @brief 고친 평가지를 잠시 뒤 자동 저장
 * - 화면을 떠나거나 탭을 숨기면 기다리지 않고 바로 저장 (마지막 0.5초 동안 고친 것이 사라지지 않게)
 * - 고친 때의 저장소에 저장 (로그아웃한 뒤 늦게 저장돼 다른 곳에 남지 않게)
 * - 한 번에 하나씩 차례대로 저장하고, 실패하면 알린 뒤 다음 저장 때 다시 시도
 */

import { useCallback, useEffect, useRef } from 'react'
import { getBackend } from './db.js'

const DELAY_MS = 500

/** @brief 화면과 상관없는 저장 부분 (시험에서 따로 씀) */
export function createAutosaver({ onSaved, onError, delay = DELAY_MS }) {
  let pending = null
  let timer = null
  let saving = null
  let discarded = false

  const flush = () => {
    clearTimeout(timer)
    timer = null
    if (saving || !pending || discarded) return saving ?? Promise.resolve()
    const { paper, backend } = pending
    pending = null
    saving = (async () => {
      try {
        const saved = await backend.savePaper(paper)
        if (!discarded) onSaved?.(saved, backend)
      } catch (error) {
        if (discarded) return
        pending ??= { paper, backend, failed: true }
        onError?.(error)
      }
    })().finally(() => {
      saving = null
      // 저장하는 동안 더 고쳤으면 이어서 저장 (실패한 것은 다음 기회에)
      if (pending && !pending.failed) flush()
    })
    return saving
  }

  return {
    edit(paper, backend) {
      if (discarded) return
      pending = { paper, backend }
      clearTimeout(timer)
      timer = setTimeout(flush, delay)
    },
    flush,
    /** 아직 저장되지 않은 것이 있는지 */
    get dirty() { return Boolean(pending || saving) },
    /** 더 저장하지 않음 (평가지를 지울 때). 진행 중인 저장이 끝날 때까지 기다림 */
    async discard() {
      discarded = true
      pending = null
      clearTimeout(timer)
      await saving
    },
    /** 다시 저장을 받음 (삭제에 실패했을 때) */
    resume() { discarded = false }
  }
}

/** @brief paper가 바뀔 때마다 자동 저장. { discard, resume } 을 돌려줌 */
export function useAutosave(paper, onSaved, onError) {
  const handlers = useRef({ onSaved, onError })
  useEffect(() => { handlers.current = { onSaved, onError } }, [onSaved, onError])
  const saverRef = useRef(null)
  const saver = useCallback(() => {
    saverRef.current ??= createAutosaver({
      onSaved: (...args) => handlers.current.onSaved?.(...args),
      onError: error => handlers.current.onError?.(error)
    })
    return saverRef.current
  }, [])

  useEffect(() => { if (paper) saver().edit(paper, getBackend()) }, [paper, saver])

  useEffect(() => {
    const flush = () => saver().flush()
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    // 저장이 끝나지 않았는데 창을 닫으려 하면 한 번 물음
    const onLeave = event => {
      flush()
      if (saver().dirty) event.preventDefault()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', onLeave)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', onLeave)
      flush()
    }
  }, [saver])

  return saver
}
