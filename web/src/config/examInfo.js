/**
 * @file examInfo.js
 * @brief 시험별 시행일과 원점수 등급컷 설정
 *
 * - examDate: 시험 시행일(YYYY-MM-DD). "시험 당일 모델만" 필터의 기준이 됩니다.
 *   이 날짜까지 출시된 모델은 구조상 해당 시험 문제를 학습할 수 없습니다.
 * - gradeCuts: 상대평가 과목의 원점수 등급컷.
 *   키는 결과 데이터의 target(예: '국어/언매', '수학/미적', '탐구/물리1')이고,
 *   값은 [1등급컷, 2등급컷, ..., 8등급컷] 원점수 배열입니다. 8번째 값 미만은 9등급입니다.
 *   국어·수학은 "공통 + 해당 선택과목" 합산 원점수(100점 만점) 기준입니다.
 *   공식 등급컷이 아직 없으면 비워 두세요. 화면에는 원점수만 나오고 등급은 '—'로 표시됩니다.
 * - gradeCutSource: 등급컷 출처 표기(예: '평가원 채점 결과', 'OO학원 추정치 (2026.11.20)').
 *
 * 영어(100점)·한국사(50점)는 절대평가라 고정 기준을 쓰므로 여기에 넣지 않습니다.
 */

export const EXAM_INFO = {
  'csat-2026': {
    examDate: '2025-11-13',
    gradeCutSource: '',
    gradeCuts: {}
  },
  'csat-2027': {
    examDate: '2026-11-19',
    gradeCutSource: '',
    gradeCuts: {
      // 예시 형식 (실제 값으로 교체하세요):
      // '국어/언매': [91, 84, 76, 66, 55, 44, 33, 24],
    }
  },
  'mock-2027-09': {
    examDate: '',
    gradeCutSource: '',
    gradeCuts: {}
  }
}

/** @brief 시험 정보 조회 (없으면 빈 기본값) */
export function getExamInfo(examId) {
  return EXAM_INFO[examId] || { examDate: '', gradeCutSource: '', gradeCuts: {} }
}
