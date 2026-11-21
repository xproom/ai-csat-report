/**
 * @file CoverOptionsForm.jsx
 * @brief 평가지별 표지 옵션 입력 (학교급·학년·학기·시험 종류·과목·표지 테마·유의사항)
 */

import { COVER_THEMES, EXAM_TYPES, GRADES, SCHOOL_LEVELS, SUBJECTS } from '@/lib/schema'

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
  const setMeta = patch => onChange(prev => ({ ...prev, meta: { ...prev.meta, ...patch } }))
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

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="field-label">학교급</span>
          <Segmented label="학교급" value={meta.schoolLevel} options={SCHOOL_LEVELS.map(level => [level, `${level}학교`])} onChange={changeLevel} />
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
          <input className="input" value={meta.schoolName} placeholder="예: 한빛중학교" onChange={e => setMeta({ schoolName: e.target.value })} />
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
