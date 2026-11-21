/**
 * @file replay.js
 * @brief 풀이 재생 - 풀이 기록을 시각별 이벤트로 바꾸고, 임의 시각의 화면 상태(현재 문항·마킹·풀이 노트·자막)를 계산
 *
 * - 실시간 풀이 기록(run.trace)이 있으면 실제 시각 그대로 재생 (AI 시점 실제 속도)
 * - 없으면(가져온 결과·직접 입력·한 번에 풀기) 전체 수행 시간을 문항 유형 가중치로 나눠 추정 재생
 */

export const TYPE_WEIGHT = { choice: 1, short: 1.6, essay: 3.5 }
const FALLBACK_MS_PER_WEIGHT = 20000
/** 풀이 노트 글씨가 써지는 속도 (재생 시각 기준 초당 글자 수) */
export const WRITE_CHARS_PER_SEC = 45

/**
 * @returns {{ events: Array<{ t, no, kind, text }>, totalMs: number, measured: boolean, live: boolean }}
 */
export function buildReplay(paper, run) {
  if (Array.isArray(run?.trace) && run.trace.length) {
    const events = [...run.trace].sort((a, b) => a.t - b.t)
    const last = events[events.length - 1].t
    return { events, totalMs: Math.max(Number(run.durationMs) || 0, last), measured: true, live: true }
  }

  const measured = Number(run?.durationMs) > 0
  const totalWeight = paper.questions.reduce((sum, question) => sum + (TYPE_WEIGHT[question.type] ?? 1), 0) || 1
  const totalMs = measured ? Number(run.durationMs) : totalWeight * FALLBACK_MS_PER_WEIGHT
  const events = []
  let clock = 0
  for (const question of paper.questions) {
    const share = totalMs * ((TYPE_WEIGHT[question.type] ?? 1) / totalWeight)
    const entry = run?.answers?.[question.no]
    events.push({ t: Math.round(clock), no: question.no, kind: 'start', text: '' })
    events.push({ t: Math.round(clock + share * 0.1), no: question.no, kind: 'step', text: `${question.no}번 문항을 읽고 푸는 중` })
    if (entry?.status === 'answered') {
      if (question.type !== 'choice') events.push({ t: Math.round(clock + share * 0.5), no: question.no, kind: 'work', text: String(entry.answer) })
      events.push({ t: Math.round(clock + share * 0.85), no: question.no, kind: 'answer', text: String(entry.answer) })
    } else {
      events.push({ t: Math.round(clock + share * 0.85), no: question.no, kind: 'step', text: '답을 정하지 못함' })
    }
    clock += share
    events.push({ t: Math.round(clock), no: question.no, kind: 'end', text: '' })
  }
  return { events, totalMs, measured, live: false }
}

/**
 * @brief 재생 시각 clockMs의 화면 상태
 * @returns {{
 *   currentNo: number|null, answeredNos: Set<number>, page: { file, page }|null,
 *   notes: Array<{ kind, text, visible: string, writing: boolean }>, caption: { kind, text }|null,
 *   questionElapsedMs: number, solvedCount: number, done: boolean
 * }}
 */
export function stateAt(replay, clockMs) {
  const answeredNos = new Set()
  const pageByNo = new Map()
  let currentNo = null
  let currentStart = 0
  let caption = null
  let solvedCount = 0
  let notes = []

  for (const event of replay.events) {
    if (event.t > clockMs) break
    switch (event.kind) {
      case 'start':
        currentNo = event.no
        currentStart = event.t
        notes = []
        caption = null
        break
      case 'page': {
        const match = String(event.text).match(/(\d+)-(\d+)/)
        if (match) pageByNo.set(event.no, { file: Number(match[1]) - 1, page: Number(match[2]) })
        break
      }
      case 'think':
        caption = { kind: 'think', text: event.text }
        break
      case 'step':
        caption = { kind: 'step', text: event.text }
        notes.push({ kind: 'step', text: event.text, t: event.t })
        break
      case 'work':
        notes.push({ kind: 'work', text: event.text, t: event.t })
        break
      case 'answer':
        answeredNos.add(event.no)
        notes.push({ kind: 'answer', text: event.text, t: event.t })
        break
      case 'end':
        solvedCount += 1
        break
      default:
        break
    }
  }

  const done = clockMs >= replay.totalMs && replay.events.length > 0
  // 마지막 줄은 글씨를 써 내려가는 효과
  const writtenNotes = notes.map((note, index) => {
    const chars = index === notes.length - 1 ? Math.floor(((clockMs - note.t) / 1000) * WRITE_CHARS_PER_SEC) : Infinity
    const visible = note.text.slice(0, Math.max(1, chars))
    return { kind: note.kind, text: note.text, visible, writing: visible.length < note.text.length }
  })

  // 가장 최근에 page가 알려진 문항의 쪽을 이어서 보여줌
  let page = currentNo != null ? pageByNo.get(currentNo) ?? null : null
  if (!page && pageByNo.size) page = [...pageByNo.values()].pop()

  return {
    currentNo: done ? null : currentNo,
    answeredNos,
    page,
    notes: done ? [] : writtenNotes,
    caption: done ? null : caption,
    questionElapsedMs: currentNo != null ? clockMs - currentStart : 0,
    solvedCount,
    done
  }
}

/** @brief 밀리초 → "1분 05초" / "42.3초" */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}초`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}분 ${String(Math.round(seconds % 60)).padStart(2, '0')}초`
}

/** @brief 재생 시계 mm:ss.s */
export function formatClock(ms, tenths = false) {
  const safe = Math.max(0, ms)
  const total = Math.floor(safe / 1000)
  const base = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  return tenths ? `${base}.${Math.floor((safe % 1000) / 100)}` : base
}
