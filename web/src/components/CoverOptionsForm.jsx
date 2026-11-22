/**
 * @file CoverOptionsForm.jsx
 * @brief 평가지별 표지 옵션 입력 (학교급·학년·학기·시험 종류·과목·표지 테마·유의사항)
 */

import { ELECTIVES, STANDARD_EXAM_TYPES, standardPreset } from '@/lib/presets'
import { COVER_THEMES, EXAM_TYPES, FORM_TYPES, GRADES, SCHOOL_LEVELS, SCHOOL_NAMES, SUBJECTS, formTypeOf, usesFormType } from '@/lib/schema'

function Segmented({ value, options, onChange, label }) {
  return (
    <div className="segmented flex-wrap" role="group" aria-label={label}>
      {options.map(option => {
        const [optionValue, optionLabel] = Array.isArray(option) ? option : [option, option]
        return (
          <button key={optionValue} type="button" aria-pressed={value === optionValue} onClick={() => onChange(optionValue)}>
            {optionLabel}
          </button>
        )
      })}
    </div>
  )
}

export default function CoverOptionsForm({ paper, onChange }) {
  const { meta, cover } = paper
  // 빠르게 연달아 바뀌어도 앞선 변경이 사라지지 않도록 항상 최신 값 기준으로 갱신
  // 아직 정답을 하나도 넣지 않은 평가지는 수능·모의고사 과목을 고르면 표준 문항 구성을 자동으로 채움
  const setMeta = patch => onChange(prev => {
    const nextMeta = { ...prev.meta, ...patch }
    const preset = standardPreset(nextMeta)
    const untouched = !prev.questions.some(question => String(question.answer ?? '').trim())
    // 학교급·시험 종류·과목이 바뀔 때만 (부제 입력 등에서는 문항 구성을 건드리지 않음)
    const structural = ['schoolLevel', 'examType', 'subject'].some(key => key in patch && patch[key] !== prev.meta[key])
    return preset && untouched && structural ? { ...prev, meta: nextMeta, questions: preset.questions } : { ...prev, meta: nextMeta }
  })
  const setCover = patch => onChange(prev => ({ ...prev, cover: { ...prev.cover, ...patch } }))

  const changeLevel = level => {
    const grades = GRADES[level]
    const subjects = SUBJECTS[level]
    setMeta({
      schoolLevel: level,
      grade: grades.includes(meta.grade) ? meta.grade : grades[0],
      subject: subjects.includes(meta.subject) ? meta.subject : subjects[0]
    })
  }

  const subjects = SUBJECTS[meta.schoolLevel]
  const electives = meta.schoolLevel === '고등' && STANDARD_EXAM_TYPES.includes(meta.examType) ? ELECTIVES[meta.subject] ?? [] : []
  const preset = standardPreset(meta)

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="field-label">학교급</span>
          <Segmented label="학교급" value={meta.schoolLevel} options={SCHOOL_LEVELS.map(level => [level, SCHOOL_NAMES[level]])} onChange={changeLevel} />
        </div>
        <div>
          <span className="field-label">학년</span>
          <Segmented label="학년" value={meta.grade} options={GRADES[meta.schoolLevel].map(grade => [grade, `${grade}학년`])} onChange={grade => setMeta({ grade })} />
        </div>
        <div>
          <span className="field-label">학기</span>
          <Segmented label="학기" value={meta.semester} options={[[1, '1학기'], [2, '2학기']]} onChange={semester => setMeta({ semester })} />
        </div>
        <div>
          <span className="field-label">시험 종류</span>
          <Segmented label="시험 종류" value={meta.examType} options={EXAM_TYPES} onChange={examType => setMeta({ examType })} />
        </div>
      </div>

      <div>
        <span className="field-label">과목</span>
        <div className="flex flex-wrap gap-2">
          {subjects.map(subject => (
            <button
              key={subject}
              type="button"
              aria-pressed={meta.subject === subject}
              onClick={() => setMeta({ subject })}
              className={`px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-colors ${meta.subject === subject
                ? 'bg-[var(--color-ink)] text-white border-[var(--color-ink)]'
                : 'bg-white border-[var(--color-line)] text-[var(--color-ink-soft)] hover:border-[var(--color-ink)]'}`}
            >
              {subject}
            </button>
          ))}
        </div>
      </div>

      {usesFormType(meta) && (
        <div>
          <span className="field-label">문제지 형 (홀수형·짝수형은 선지 배열이 달라 정답이 다릅니다. 정답표도 같은 형으로 반영됩니다)</span>
          <Segmented label="문제지 형" value={formTypeOf(meta)} options={FORM_TYPES} onChange={formType => setMeta({ formType })} />
        </div>
      )}
      {electives.length > 0 && (
        <div>
          <span className="field-label">선택과목 (문제지에 여러 과목이 있으면 AI가 이 과목 부분을 풉니다)</span>
          <Segmented label="선택과목" value={meta.elective ?? ''} options={[['', '정하지 않음'], ...electives.map(name => [name, name])]} onChange={elective => setMeta({ elective })} />
        </div>
      )}
      {preset && (
        <p className="rounded-lg bg-[var(--color-brand-soft)] px-3 py-2 text-xs">
          <b>{meta.examType} 표준 구성:</b> {preset.label}. 정답을 넣기 전이면 자동으로 채워지고, 정답표를 올리면 정답표에 맞춰집니다.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="field-label">학년도</span>
          <input className="input" type="number" min="2000" max="2100" value={meta.year} onChange={e => setMeta({ year: Number(e.target.value) || meta.year })} />
        </label>
        <label className="block">
          <span className="field-label">시험 시간(분)</span>
          <input className="input" type="number" min="5" max="180" value={meta.durationMin} onChange={e => setMeta({ durationMin: Number(e.target.value) || 0 })} />
        </label>
        <label className="block">
          <span className="field-label">학교 이름 (선택)</span>
          <input className="input" value={meta.schoolName} placeholder="예: 한빛고등학교" onChange={e => setMeta({ schoolName: e.target.value })} />
        </label>
      </div>

      <label className="block">
        <span className="field-label">부제 (선택)</span>
        <input className="input" value={meta.title} placeholder="예: 1단원 ~ 3단원 / 2반 출제본" onChange={e => setMeta({ title: e.target.value })} />
      </label>

      <div>
        <span className="field-label">표지 테마</span>
        <div className="flex flex-wrap gap-2.5">
          {Object.entries(COVER_THEMES).map(([key, theme]) => (
            <button
              key={key}
              type="button"
              aria-pressed={cover.theme === key}
              onClick={() => setCover({ theme: key })}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold bg-white ${cover.theme === key ? 'border-[var(--color-ink)] ring-2 ring-[var(--color-ink)]/15' : 'border-[var(--color-line)]'}`}
            >
              <span className="w-5 h-5 rounded-md" style={{ background: theme.ink, boxShadow: `inset 0 -5px 0 ${theme.accent}` }} />
              {theme.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="field-label">수험생 유의사항</span>
          <label className="flex items-center gap-2 text-xs font-semibold text-[var(--color-ink-soft)]">
            <input type="checkbox" checked={cover.showSchool} onChange={e => setCover({ showSchool: e.target.checked })} />
            표지에 학교 이름 표시
          </label>
        </div>
        <textarea
          className="input min-h-28"
          value={(cover.notices || []).join('\n')}
          onChange={e => setCover({ notices: e.target.value.split('\n') })}
          placeholder="한 줄에 하나씩 입력 (최대 5줄 표시)"
        />
      </div>

      <label className="block">
        <span className="field-label">메모 (출처, 범위 등 · 표지에는 나오지 않음)</span>
        <input className="input" value={meta.note} onChange={e => setMeta({ note: e.target.value })} />
      </label>
    </div>
  )
}
