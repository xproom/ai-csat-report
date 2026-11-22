/**
 * @file noteStyle.js
 * @brief 문제지 위 AI 풀이 기록의 글꼴·크기 (화면과 내려받는 PDF가 같은 모양이 되도록 한곳에서 정함)
 * - 크기는 문제지 쪽 너비에 대한 비율 (화면에서는 cqw, PDF에서는 픽셀로 바꿔 씀)
 * - 칸에 다 들어가지 않으면 최소 MIN_FIT까지 글자를 줄이고, 그래도 넘치면 화면은 상자를 늘리고 PDF는 풀이 모음 쪽에 씀
 */

export const NOTE_FONT = "Gulim, '굴림', GulimChe, '굴림체', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif"

/** 쪽 너비 대비 글자 크기 */
export const NOTE_SIZE = { work: 0.022, step: 0.017, answer: 0.027 }
export const NOTE_LINE_HEIGHT = 1.25
/** 칸에 맞추려고 줄일 수 있는 최소 배율 (기본 크기의 60%). 그래도 넘치면 화면은 상자를 늘리고 PDF는 풀이 모음 쪽에 씀 */
export const MIN_FIT = 0.6

export const NOTE_COLOR = { work: '#1b2a6b', step: '#64748b', answer: '#d62839' }

const CIRCLED = ['①', '②', '③', '④', '⑤']

/** @brief 답 표시 (객관식은 ①~⑤) */
export function answerLabel(type, text) {
  const shown = type === 'choice' ? CIRCLED[Number(String(text).match(/[0-9]+/)?.[0]) - 1] ?? text : text
  return `답: ${shown}`
}
