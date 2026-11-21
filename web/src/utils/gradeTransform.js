/**
 * @file gradeTransform.js
 * @brief 모델별 원점수를 수능 등급으로 환산하고 무효 응답(무응답·추출 실패)을 집계
 */

/** 한국사 절대평가 기준 (50점 만점): 40·35·30·25·20·15·10·5 */
const HISTORY_CUTS = [40, 35, 30, 25, 20, 15, 10, 5]
/** 영어 절대평가 기준 (100점 만점): 90·80·…·20 */
const ENGLISH_CUTS = [90, 80, 70, 60, 50, 40, 30, 20]

/**
 * @brief 원점수와 등급컷 배열로 등급 계산
 * @param {number} raw - 원점수
 * @param {number[]|undefined} cuts - [1등급컷 … 8등급컷]
 * @returns {number|null} 1~9 등급, 등급컷이 없으면 null
 */
export function gradeFromCuts(raw, cuts) {
  if (!Array.isArray(cuts) || cuts.length !== 8 || raw == null) return null
  const index = cuts.findIndex(cut => raw >= cut)
  return index === -1 ? 9 : index + 1
}

/**
 * @brief 문항 응답 상태 판별 (구버전 데이터는 extracted_answer=-1을 무응답으로 간주)
 * @returns {'answered'|'no_answer'|'parse_failed'|string}
 */
export function getAnswerStatus(question) {
  if (question.answer_status) return question.answer_status
  return question.extracted_answer === -1 ? 'no_answer' : 'answered'
}

/** @brief 시험 섹션을 그룹별로 분류 */
function _groupSections(exam) {
  const groups = {}
  for (const section of exam?.sections || []) {
    if (!groups[section.group]) groups[section.group] = []
    groups[section.group].push(section)
  }
  return groups
}

/**
 * @brief 공통 + 선택과목 조합(국어·수학) 중 가장 유리한 조합 선택
 * @note 실제 수험생처럼 등급이 가장 좋은 선택과목을 고르고, 등급이 같거나 없으면 원점수로 비교
 */
function _bestCombo(rowsByTarget, sections, gradeCuts) {
  const common = sections.find(section => section.kind === 'common')
  const electives = sections.filter(section => section.kind === 'elective')
  const commonRow = common ? rowsByTarget[common.target] : null
  if (!commonRow) return null

  const combos = electives
    .map(elective => {
      const row = rowsByTarget[elective.target]
      if (!row) return null
      const raw = commonRow.score + row.score
      return {
        elective: elective.section,
        raw,
        max: commonRow.total_points + row.total_points,
        grade: gradeFromCuts(raw, gradeCuts[elective.target])
      }
    })
    .filter(Boolean)

  if (combos.length === 0) return null
  combos.sort((a, b) => (a.grade ?? 10) - (b.grade ?? 10) || b.raw - a.raw)
  return { ...combos[0], combos }
}

/** @brief 단일 섹션 과목(영어·한국사) 결과 */
function _single(rowsByTarget, sections, cuts) {
  const row = sections?.[0] ? rowsByTarget[sections[0].target] : null
  if (!row) return null
  return { raw: row.score, max: row.total_points, grade: gradeFromCuts(row.score, cuts) }
}

/** @brief 탐구 상위 2과목 선택 */
function _bestInquiry(rowsByTarget, sections, gradeCuts) {
  const results = (sections || [])
    .map(section => {
      const row = rowsByTarget[section.target]
      if (!row) return null
      return {
        subject: section.section === '탐구' ? section.subject : section.section,
        raw: row.score,
        max: row.total_points,
        grade: gradeFromCuts(row.score, gradeCuts[section.target])
      }
    })
    .filter(Boolean)
  results.sort((a, b) => (a.grade ?? 10) - (b.grade ?? 10) || b.raw / b.max - a.raw / a.max)
  return results.slice(0, 2)
}

/** @brief 모델의 무효 응답 집계 */
function _invalidStats(rows) {
  const stats = { questions: 0, noAnswer: 0, parseFailed: 0, correct: 0 }
  for (const row of rows) {
    for (const question of row.results || []) {
      stats.questions += 1
      const status = getAnswerStatus(question)
      if (status === 'no_answer') stats.noAnswer += 1
      else if (status === 'parse_failed') stats.parseFailed += 1
      if (question.is_correct) stats.correct += 1
    }
  }
  const invalid = stats.noAnswer + stats.parseFailed
  const valid = stats.questions - invalid
  return {
    ...stats,
    invalid,
    invalidRate: stats.questions ? invalid / stats.questions : 0,
    accuracy: stats.questions ? stats.correct / stats.questions : 0,
    validAccuracy: valid ? stats.correct / valid : null
  }
}

/**
 * @brief 모델별 등급 성적표 생성
 * @param {Object[]} data - results.json 행 목록
 * @param {string[]} models - 표시할 모델 (순서 유지)
 * @param {Object} exam - 시험 매니페스트 (sections 포함)
 * @param {Object} examInfo - getExamInfo() 결과
 * @returns {Object[]} 모델별 성적표
 */
export function buildGradeReport(data, models, exam, examInfo) {
  const groups = _groupSections(exam)
  const gradeCuts = examInfo?.gradeCuts || {}
  const rowsByModel = {}
  for (const row of data || []) {
    if (!rowsByModel[row.model_name]) rowsByModel[row.model_name] = []
    rowsByModel[row.model_name].push(row)
  }

  return models.map(model => {
    const rows = rowsByModel[model] || []
    const rowsByTarget = Object.fromEntries(rows.map(row => [row.target, row]))
    const korean = groups['국어'] ? _bestCombo(rowsByTarget, groups['국어'], gradeCuts) : null
    const math = groups['수학'] ? _bestCombo(rowsByTarget, groups['수학'], gradeCuts) : null
    const english = _single(rowsByTarget, groups['영어'], ENGLISH_CUTS)
    const history = _single(rowsByTarget, groups['한국사'], HISTORY_CUTS)
    const inquiry = _bestInquiry(rowsByTarget, groups['탐구'], gradeCuts)

    // 국수영탐(2) 등급 합: 탐구는 2과목 평균
    const inquiryGrade = inquiry.length === 2 && inquiry.every(item => item.grade != null)
      ? (inquiry[0].grade + inquiry[1].grade) / 2
      : null
    const parts = [korean?.grade, math?.grade, english?.grade, inquiryGrade]
    const gradeSum = parts.every(value => value != null) ? parts.reduce((sum, value) => sum + value, 0) : null

    return {
      model,
      korean,
      math,
      english,
      history,
      inquiry,
      gradeSum,
      invalid: _invalidStats(rows)
    }
  })
}

/** @brief 등급컷이 하나라도 입력된 상대평가 과목이 있는지 */
export function hasRelativeGradeCuts(examInfo) {
  return Object.values(examInfo?.gradeCuts || {}).some(cuts => Array.isArray(cuts) && cuts.length === 8)
}
