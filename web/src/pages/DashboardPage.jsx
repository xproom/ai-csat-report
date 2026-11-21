/**
 * @file DashboardPage.jsx
 * @brief 평가 결과 대시보드 - 모델 순위, 과목별 히트맵, 문항 유형별·학년별 득점률
 */

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatRate, gradeRun, modelLeaderboard } from '@/lib/grading'
import { EXAM_TYPES, GRADES, QUESTION_TYPES, SCHOOL_LEVELS, SUBJECTS, paperTitle } from '@/lib/schema'
import { useStore } from '@/lib/store'

const PALETTE = ['#1f3a5f', '#c8a24a', '#2f7d5b', '#d62839', '#6b4fa0', '#2b8aa8', '#b35c2e', '#5b6478']

/** @brief 득점률 → 히트맵 배경색 */
function heatColor(rate) {
  if (rate == null) return '#f1ede4'
  // 40% 이하 빨강 → 100% 초록
  const t = Math.min(1, Math.max(0, (rate - 0.4) / 0.6))
  return `hsl(${4 + t * 136} 60% ${90 - t * 22}%)`
}

function Select({ label, value, options, onChange }) {
  return (
    <label className="block min-w-[7.5rem] flex-1 sm:flex-none">
      <span className="field-label">{label}</span>
      <select className="input" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(option => <option key={option}>{option}</option>)}
      </select>
    </label>
  )
}

function Kpi({ label, value, sub }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="text-xs font-bold text-[var(--color-ink-soft)]">{label}</div>
      <div className="mt-1 text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-[var(--color-ink-soft)] truncate">{sub}</div>}
    </div>
  )
}

export default function DashboardPage() {
  const { papers, runs } = useStore()
  const [level, setLevel] = useState('전체')
  const [grade, setGrade] = useState('전체')
  const [subject, setSubject] = useState('전체')
  const [examType, setExamType] = useState('전체')
  const hasReal = runs.some(run => !run.isDemo)
  const [includeDemo, setIncludeDemo] = useState(!hasReal)

  const entries = useMemo(() => papers
    .filter(paper => (level === '전체' || paper.meta.schoolLevel === level)
      && (grade === '전체' || `${paper.meta.grade}학년` === grade)
      && (subject === '전체' || paper.meta.subject === subject)
      && (examType === '전체' || paper.meta.examType === examType)
      && (includeDemo || !paper.isDemo))
    .map(paper => ({ paper, runs: runs.filter(run => run.paperId === paper.id && (includeDemo || !run.isDemo)) }))
    .filter(entry => entry.runs.length > 0), [papers, runs, level, grade, subject, examType, includeDemo])

  const board = useMemo(() => modelLeaderboard(entries), [entries])
  const subjects = useMemo(() => [...new Set(entries.map(entry => entry.paper.meta.subject))], [entries])
  const runCount = entries.reduce((sum, entry) => sum + entry.runs.length, 0)
  const overall = board.length ? board.reduce((sum, row) => sum + row.avgRate * row.papers, 0) / runCount : null

  /** @brief 모델별 문항 유형 득점률 */
  const typeRows = useMemo(() => {
    const map = new Map()
    for (const { paper, runs: paperRuns } of entries) {
      for (const run of paperRuns) {
        const result = gradeRun(paper, run)
        if (!map.has(run.model)) map.set(run.model, {})
        const row = map.get(run.model)
        for (const [type, value] of Object.entries(result.byType)) {
          row[type] ??= { earned: 0, max: 0 }
          row[type].earned += value.earned
          row[type].max += value.max
        }
      }
    }
    return board.map(({ model }) => ({ model, ...Object.fromEntries(Object.entries(map.get(model) || {}).map(([type, value]) => [type, value.max ? value.earned / value.max : null])) }))
  }, [entries, board])

  /** @brief 학년별 평균 득점률 */
  const gradeRows = useMemo(() => {
    const map = new Map()
    for (const { paper, runs: paperRuns } of entries) {
      const key = `${paper.meta.schoolLevel === '초등' ? '초' : '중'}${paper.meta.grade}`
      const order = (paper.meta.schoolLevel === '초등' ? 0 : 10) + paper.meta.grade
      if (!map.has(key)) map.set(key, { key, order, rates: [] })
      for (const run of paperRuns) map.get(key).rates.push(gradeRun(paper, run).rate)
    }
    return [...map.values()].sort((a, b) => a.order - b.order).map(row => ({ key: row.key, pct: Math.round(row.rates.reduce((s, r) => s + r, 0) / row.rates.length * 1000) / 10 }))
  }, [entries])

  const recent = useMemo(() => entries
    .flatMap(({ paper, runs: paperRuns }) => paperRuns.map(run => ({ paper, run, result: gradeRun(paper, run) })))
    .sort((a, b) => b.run.createdAt.localeCompare(a.run.createdAt))
    .slice(0, 6), [entries])

  const gradeOptions = level === '전체' ? ['전체', ...new Set([...GRADES.초등, ...GRADES.중등].map(value => `${value}학년`))] : ['전체', ...GRADES[level].map(value => `${value}학년`)]
  const subjectOptions = ['전체', ...(level === '전체' ? [...new Set([...SUBJECTS.초등, ...SUBJECTS.중등])] : SUBJECTS[level])]
  const chartData = board.map((row, index) => ({ model: row.model, pct: Math.round(row.avgRate * 1000) / 10, color: PALETTE[index % PALETTE.length] }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">평가 결과 대시보드</h1>
          <p className="mt-1 text-[var(--color-ink-soft)]">평가지 여러 개에 걸친 AI 모델 성적을 한눈에 비교합니다.</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={includeDemo} onChange={e => setIncludeDemo(e.target.checked)} />
          예시(가상) 데이터 포함
        </label>
      </div>

      <div className="card p-4 flex flex-wrap gap-3">
        <Select label="학교급" value={level} options={['전체', ...SCHOOL_LEVELS]} onChange={value => { setLevel(value); setGrade('전체'); setSubject('전체') }} />
        <Select label="학년" value={grade} options={gradeOptions} onChange={setGrade} />
        <Select label="과목" value={subject} options={subjectOptions} onChange={setSubject} />
        <Select label="시험 종류" value={examType} options={['전체', ...EXAM_TYPES]} onChange={setExamType} />
      </div>

      {entries.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <p className="text-lg font-extrabold">표시할 결과가 없습니다</p>
          <p className="mt-1 text-[var(--color-ink-soft)]">평가지에서 AI 풀이를 실행하거나 필터를 바꿔 보세요.{!includeDemo && papers.some(paper => paper.isDemo) && ' 예시 데이터를 포함하면 둘러볼 수 있습니다.'}</p>
          <a href="#/" className="btn btn-primary mt-5">평가지로 가기</a>
        </div>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Kpi label="평가지" value={entries.length} sub={`${subjects.length}개 과목`} />
            <Kpi label="풀이 기록" value={runCount} />
            <Kpi label="평가한 모델" value={board.length} />
            <Kpi label="1위 모델" value={formatRate(board[0]?.avgRate)} sub={board[0]?.model} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="card p-4 sm:p-6">
              <h2 className="text-lg font-extrabold">모델 순위 <span className="text-sm font-semibold text-[var(--color-ink-soft)]">평균 득점률</span></h2>
              <p className="text-xs text-[var(--color-ink-soft)]">전체 평균 {formatRate(overall)}</p>
              <div style={{ height: Math.max(180, chartData.length * 44) }} className="mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }}>
                    <CartesianGrid horizontal={false} stroke="#ece7db" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="model" width={110} tick={{ fontSize: 12, fontWeight: 600 }} tickLine={false} axisLine={false} />
                    <Tooltip formatter={value => [`${value}%`, '평균 득점률']} />
                    <Bar dataKey="pct" radius={[0, 6, 6, 0]} barSize={22}>
                      {chartData.map(row => <Cell key={row.model} fill={row.color} />)}
                      <LabelList dataKey="pct" position="right" formatter={value => `${value}%`} style={{ fontSize: 12, fontWeight: 700, fill: '#1f2a44' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card p-4 sm:p-6">
              <h2 className="text-lg font-extrabold mb-3">순위표</h2>
              <div className="scroll-x">
                <table className="w-full min-w-[340px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--color-ink-soft)] border-b border-[var(--color-line)]">
                      <th className="py-2 pr-2">#</th>
                      <th className="py-2 pr-2">모델</th>
                      <th className="py-2 pr-2 text-right">평균</th>
                      <th className="py-2 pr-2 text-right">최고</th>
                      <th className="py-2 text-right">최저</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.map((row, index) => (
                      <tr key={row.model} className="border-b border-[var(--color-line)]/60 last:border-0">
                        <td className="py-2 pr-2 font-extrabold">{index + 1}</td>
                        <td className="py-2 pr-2">
                          <span className="font-bold">{row.model}</span>
                          <span className="block text-xs text-[var(--color-ink-soft)]">평가지 {row.papers}개{row.isDemo ? ' · 가상' : ''}</span>
                        </td>
                        <td className="py-2 pr-2 text-right font-extrabold tabular-nums">{formatRate(row.avgRate)}</td>
                        <td className="py-2 pr-2 text-right tabular-nums text-xs">{formatRate(row.best)}</td>
                        <td className="py-2 text-right tabular-nums text-xs">{formatRate(row.worst)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card p-4 sm:p-6">
            <h2 className="text-lg font-extrabold">과목별 득점률</h2>
            <p className="mb-3 text-xs text-[var(--color-ink-soft)]">초록에 가까울수록 높고, 빨강에 가까울수록 낮습니다.</p>
            <div className="scroll-x">
              <table className="w-full text-sm border-separate border-spacing-1" style={{ minWidth: 160 + subjects.length * 84 }}>
                <thead>
                  <tr>
                    <th className="text-left text-xs text-[var(--color-ink-soft)] font-semibold px-2">모델</th>
                    {subjects.map(name => <th key={name} className="text-xs text-[var(--color-ink-soft)] font-semibold px-2">{name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {board.map(row => (
                    <tr key={row.model}>
                      <td className="px-2 py-1 font-bold whitespace-nowrap">{row.model}</td>
                      {subjects.map(name => (
                        <td key={name} className="rounded-lg px-2 py-2.5 text-center font-bold tabular-nums" style={{ background: heatColor(row.bySubject[name]) }}>
                          {formatRate(row.bySubject[name])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-4 sm:p-6">
              <h2 className="text-lg font-extrabold">문항 유형별 득점률</h2>
              <p className="mb-3 text-xs text-[var(--color-ink-soft)]">서술형은 수동 채점한 점수만 반영됩니다.</p>
              <div className="scroll-x">
                <table className="w-full min-w-[320px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--color-ink-soft)] border-b border-[var(--color-line)]">
                      <th className="py-2 pr-2">모델</th>
                      {Object.entries(QUESTION_TYPES).map(([type, label]) => <th key={type} className="py-2 pr-2 text-right">{label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {typeRows.map(row => (
                      <tr key={row.model} className="border-b border-[var(--color-line)]/60 last:border-0">
                        <td className="py-2 pr-2 font-bold">{row.model}</td>
                        {Object.keys(QUESTION_TYPES).map(type => (
                          <td key={type} className="py-2 pr-2 text-right tabular-nums">
                            {row[type] == null ? <span className="text-[var(--color-ink-soft)]">—</span> : formatRate(row[type])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card p-4 sm:p-6">
              <h2 className="text-lg font-extrabold">학년별 평균 득점률</h2>
              <p className="mb-3 text-xs text-[var(--color-ink-soft)]">모든 모델의 풀이를 합친 평균</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={gradeRows} margin={{ top: 18, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#ece7db" />
                    <XAxis dataKey="key" tick={{ fontSize: 12, fontWeight: 600 }} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip formatter={value => [`${value}%`, '평균 득점률']} />
                    <Bar dataKey="pct" fill="var(--color-brand)" radius={[6, 6, 0, 0]} barSize={36}>
                      <LabelList dataKey="pct" position="top" formatter={value => `${value}%`} style={{ fontSize: 11, fontWeight: 700, fill: '#1f2a44' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="card p-4 sm:p-6">
            <h2 className="text-lg font-extrabold mb-3">최근 풀이</h2>
            <ul className="divide-y divide-[var(--color-line)]">
              {recent.map(({ paper, run, result }) => (
                <li key={run.id}>
                  <a href={`#/paper/${paper.id}?tab=omr&run=${run.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 hover:bg-white/60 rounded-lg px-2 -mx-2">
                    <span className="font-bold">{run.model}</span>
                    <span className="text-sm text-[var(--color-ink-soft)] truncate flex-1 min-w-[10rem]">{paperTitle(paper)}</span>
                    <span className="font-hand text-2xl text-[var(--color-pen)] leading-none">{result.score}점</span>
                    <span className="text-xs text-[var(--color-ink-soft)] tabular-nums">{formatRate(result.rate)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
