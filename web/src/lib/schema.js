/**
 * @file schema.js
 * @brief 평가지(Paper)·풀이 기록(Run) 데이터 형식과 기본값
 *
 * Paper {
 *   id, createdAt, updatedAt,
 *   meta: { schoolLevel, grade, semester, examType, subject, year, schoolName, title, durationMin, note },
 *   cover: { theme, notices: string[], showSchool },
 *   questions: [{ no, type: 'choice'|'short'|'essay', choices: 4|5, points, answer, unit }],
 *   files: [{ id, name, type, size }]     // 파일 본문은 files 저장소에 따로 보관
 * }
 * Run {
 *   id, paperId, model, source: 'ai'|'manual'|'import', isDemo, createdAt,
 *   answers: { [no]: { answer: string, status: 'answered'|'no_answer'|'parse_failed' } },
 *   essayScores: { [no]: number },        // 서술형 수동 채점 점수
 *   usage: { inputTokens, outputTokens }, durationMs, note
 * }
 */

export const SCHOOL_LEVELS = ['초등', '중등']

export const GRADES = { 초등: [3, 4, 5, 6], 중등: [1, 2, 3] }

export const EXAM_TYPES = ['중간고사', '기말고사', '단원평가', '모의평가']

export const SUBJECTS = {
  초등: ['국어', '수학', '사회', '과학', '영어', '도덕'],
  중등: ['국어', '수학', '영어', '사회', '역사', '과학', '도덕', '기술·가정', '정보', '한문']
}

export const QUESTION_TYPES = {
  choice: '객관식',
  short: '단답형',
  essay: '서술형'
}

export const COVER_THEMES = {
  navy: { label: '네이비', paper: '#fbfaf6', ink: '#1f3a5f', accent: '#c8a24a' },
  green: { label: '칠판', paper: '#f7faf6', ink: '#24513f', accent: '#d97b3f' },
  burgundy: { label: '버건디', paper: '#fcf8f7', ink: '#6b2737', accent: '#3d6b8c' },
  mono: { label: '모노', paper: '#ffffff', ink: '#1d1d1f', accent: '#6b6b6b' }
}

export const DEFAULT_NOTICES = [
  '문제지와 답안지에 학년, 반, 번호, 이름을 정확히 쓰시오.',
  '객관식은 OMR 답안지에 컴퓨터용 사인펜으로 표기하시오.',
  '서술형은 답안지의 정해진 칸에만 답을 쓰시오.'
]

/** @brief 브라우저에서 쓸 짧은 고유 ID */
export function makeId(prefix = 'id') {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}_${random.replace(/-/g, '').slice(0, 16)}`
}

/**
 * @brief 문항 목록 생성
 * @param {{ choiceCount: number, shortCount: number, essayCount: number, choices?: number }} counts
 */
export function buildQuestions({ choiceCount = 20, shortCount = 0, essayCount = 0, choices = 5 }) {
  const questions = []
  let no = 1
  // 기본 배점: 객관식 20 × 3.5 + 단답형 3 × 5 + 서술형 2 × 7.5 = 100점
  for (let i = 0; i < choiceCount; i += 1) questions.push({ no: no++, type: 'choice', choices, points: 3.5, answer: '', unit: '' })
  for (let i = 0; i < shortCount; i += 1) questions.push({ no: no++, type: 'short', choices, points: 5, answer: '', unit: '' })
  for (let i = 0; i < essayCount; i += 1) questions.push({ no: no++, type: 'essay', choices, points: 7.5, answer: '', unit: '' })
  return questions
}

/** @brief 새 평가지 기본값 */
export function createPaper(overrides = {}) {
  const now = new Date().toISOString()
  return {
    id: makeId('paper'),
    createdAt: now,
    updatedAt: now,
    meta: {
      schoolLevel: '중등',
      grade: 2,
      semester: 1,
      examType: '중간고사',
      subject: '수학',
      year: new Date().getFullYear(),
      schoolName: '',
      title: '',
      durationMin: 45,
      note: ''
    },
    cover: { theme: 'navy', notices: [...DEFAULT_NOTICES], showSchool: true },
    questions: buildQuestions({ choiceCount: 20, shortCount: 3, essayCount: 2 }),
    files: [],
    ...overrides
  }
}

/** @brief 표지·목록에 쓰는 평가지 제목 */
export function paperTitle(paper) {
  const { meta } = paper
  if (meta.title?.trim()) return meta.title.trim()
  const level = meta.schoolLevel === '초등' ? '초등학교' : '중학교'
  return `${level} ${meta.grade}학년 ${meta.semester}학기 ${meta.examType} ${meta.subject}`
}

/** @brief 평가지 총점 */
export function totalPoints(paper) {
  return roundPoints(paper.questions.reduce((sum, question) => sum + (Number(question.points) || 0), 0))
}

/** @brief 배점 합계의 부동소수점 오차 제거 (소수 첫째 자리까지) */
export function roundPoints(value) {
  return Math.round(value * 10) / 10
}

/** @brief 문항 유형별 개수 */
export function countByType(paper) {
  const counts = { choice: 0, short: 0, essay: 0 }
  for (const question of paper.questions) counts[question.type] += 1
  return counts
}

/** @brief 정답이 모두 입력됐는지 (서술형은 모범답안이 없어도 됨) */
export function missingAnswers(paper) {
  return paper.questions.filter(question => question.type !== 'essay' && !String(question.answer ?? '').trim())
}
