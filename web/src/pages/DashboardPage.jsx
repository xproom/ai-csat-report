/**
 * @file DashboardPage.jsx
 * @brief 검증 현황 - 평가지별 문제지·정답 검증 결과와 AI 채점 결과를 한눈에
 *
 * - 저장된 검증 정보(문제지에서 읽은 사실)로 다시 검사하므로 문제지를 다시 읽지 않음
 * - 항목별(배점·번호·구성·선지·정답·쪽 번호·AI 대조)로 오류가 많은 곳을 보여 줌
 */

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatRate, gradeRun } from '@/lib/grading'
import { EXAM_TYPES, SCHOOL_LEVELS, SCHOOL_SHORT, SUBJECTS, paperTitle } from '@/lib/schema'
import { useStore } from '@/lib/store'
import { LEVEL_LABEL, checkCounts, validateStored } from '@/lib/verify'

const STATUS_STYLE = {
  error: 'bg-red-50 text-[var(--color-pen)] border-red-200',
  warn: 'bg-amber-50 text-amber-900 border-amber-200',
  ok: 'bg-emerald-50 text-emerald-900 border-emerald-200'
}
const STATUS_TEXT = { error: '오류 있음', warn: '확인 필요', ok: '통과' }

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

function Kpi({ label, value, sub, tone = '' }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="text-xs font-bold text-[var(--color-ink-soft)]">{label}</div>
      <div className={`mt-1 text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight ${tone}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-[var(--color-ink-soft)] truncate">{sub}</div>}
    </div>
  )
}

export default function DashboardPage() {
  const { papers, runs } = useStore()
  const [level, setLevel] = useState('전체')
  const [subject, setSubject] = useState('전체')
  const [examType, setExamType] = useState('전체')
  const [status, setStatus] = useState('전체')
  const hasReal = papers.some(paper => !paper.isDemo)
  const [includeDemo, setIncludeDemo] = useState(!hasReal)

  const entries = useMemo(() => papers
    .filter(paper => (level === '전체' || paper.meta.schoolLevel === level)
      && (subject === '전체' || paper.meta.subject === subject)
      && (examType === '전체' || paper.meta.examType === examType)
      && (includeDemo || !paper.isDemo))
    .map(paper => {
      const paperRuns = runs.filter(run => run.paperId === paper.id)
      const verify = validateStored(paper, paperRuns)
      const latest = [...paperRuns].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0]
      return { paper, verify, latest: latest ? { run: latest, ...gradeRun(paper, latest) } : null, runCount: paperRuns.length }
    }), [papers, runs, level, subject, examType, includeDemo])

  const shown = entries.filter(entry => status === '전체' || STATUS_TEXT[entry.verify.status] === status)
  const passed = entries.filter(entry => entry.verify.status === 'ok').length
  const withErrors = entries.filter(entry => entry.verify.status === 'error').length
  const solved = entries.filter(entry => entry.latest)
  const avgRate = solved.length ? solved.reduce((sum, entry) => sum + entry.latest.rate, 0) / solved.length : null

  // 항목별 오류·확인 건수
  const byCheck = useMemo(() => {
    const map = new Map()
    for (const entry of entries) {
      for (const check of entry.verify.checks) {
        if (check.id === 'notes') continue
        const row = map.get(check.id) ?? { name: `${check.letter}. ${check.title}`, error: 0, warn: 0 }
        for (const item of check.items) if (item.level === 'error' || item.level === 'warn') row[item.level] += 1
        map.set(check.id, row)
      }
    }
    return [...map.values()]
  }, [entries])

  const subjects = level === '전체' ? [...new Set(Object.values(SUBJECTS).flat())] : SUBJECTS[level]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">검증 현황</h1>
        <p className="mt-1 text-[var(--color-ink-soft)] break-keep">평가지마다 문제지·정답 검증 결과와 AI 채점 결과를 모아 봅니다. 평가지를 누르면 검증 화면으로 갑니다.</p>
      </div>

      <div className="card p-4 flex flex-wrap items-end gap-3">
        <Select label="학교급" value={level} options={['전체', ...SCHOOL_LEVELS]} onChange={value => { setLevel(value); setSubject('전체') }} />
        <Select label="과목" value={subject} options={['전체', ...subjects]} onChange={setSubject} />
        <Select label="시험 종류" value={examType} options={['전체', ...EXAM_TYPES]} onChange={setExamType} />
        <Select label="검증 결과" value={status} options={['전체', '오류 있음', '확인 필요', '통과']} onChange={setStatus} />
        <label className="flex items-center gap-2 pb-2.5 text-sm font-semibold">
          <input type="checkbox" checked={includeDemo} onChange={e => setIncludeDemo(e.target.checked)} />
          예시 데이터 포함
        </label>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi label="평가지" value={entries.length} sub={`AI 풀이 ${solved.length}개`} />
        <Kpi label="검증 통과" value={passed} sub={entries.length ? `${Math.round((passed / entries.length) * 100)}%` : '—'} tone="text-emerald-800" />
        <Kpi label="오류 있는 평가지" value={withErrors} sub="고친 뒤 다시 검증하세요" tone={withErrors ? 'text-[var(--color-pen)]' : ''} />
        <Kpi label="AI 평균 득점률" value={avgRate == null ? '—' : formatRate(avgRate)} sub="평가지별 최근 풀이 기준" />
      </div>

      {entries.length === 0 ? (
        <div className="card px-6 py-14 text-center">
          <p className="text-lg font-extrabold">조건에 맞는 평가지가 없습니다</p>
          <a href="#/new" className="btn btn-primary mt-5">문제지 검증 시작</a>
        </div>
      ) : (
        <>
          <section className="card p-4 sm:p-6">
            <h2 className="text-lg font-extrabold">평가지별 검증 결과</h2>
            <div className="mt-3 scroll-x">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--color-ink-soft)] border-b border-[var(--color-line)]">
                    <th className="py-2 pr-2 font-semibold">평가지</th>
                    <th className="py-2 pr-2 font-semibold">검증</th>
                    <th className="py-2 pr-2 font-semibold text-right">{LEVEL_LABEL.error}</th>
                    <th className="py-2 pr-2 font-semibold text-right">{LEVEL_LABEL.warn}</th>
                    <th className="py-2 pr-2 font-semibold">문제지 대조</th>
                    <th className="py-2 pr-2 font-semibold text-right">최근 AI 풀이</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(({ paper, verify, latest, runCount }) => (
                    <tr key={paper.id} className="border-b border-[var(--color-line)]/70 last:border-0">
                      <td className="py-2.5 pr-2">
                        <a href={`#/paper/${paper.id}?tab=check`} className="font-bold hover:underline break-keep">{paperTitle(paper)}</a>
                        <div className="text-xs text-[var(--color-ink-soft)]">{SCHOOL_SHORT[paper.meta.schoolLevel]}{paper.meta.grade} · {paper.questions.length}문항{paper.isDemo ? ' · 예시' : ''}</div>
                      </td>
                      <td className="py-2.5 pr-2"><span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-extrabold ${STATUS_STYLE[verify.status]}`}>{STATUS_TEXT[verify.status]}</span></td>
                      <td className={`py-2.5 pr-2 text-right tabular-nums font-bold ${checkCounts(verify).error ? 'text-[var(--color-pen)]' : 'text-[var(--color-ink-soft)]'}`}>{checkCounts(verify).error}</td>
                      <td className={`py-2.5 pr-2 text-right tabular-nums font-bold ${checkCounts(verify).warn ? 'text-amber-800' : 'text-[var(--color-ink-soft)]'}`}>{checkCounts(verify).warn}</td>
                      <td className="py-2.5 pr-2 text-xs text-[var(--color-ink-soft)]">{verify.factsSource === 'ai' ? 'AI 정밀 검증' : verify.factsSource === 'pdf+ai' ? 'PDF + AI' : verify.factsSource === 'pdf' ? 'PDF 글자' : '정답·배점만'}</td>
                      <td className="py-2.5 pr-2 text-right tabular-nums">
                        {latest ? <><b>{latest.score}</b><span className="text-[var(--color-ink-soft)]">/{latest.maxScore}</span><div className="text-xs text-[var(--color-ink-soft)]">{latest.run.model} · {runCount}건</div></> : <span className="text-xs text-[var(--color-ink-soft)]">풀이 전</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shown.length === 0 && <p className="py-6 text-center text-sm text-[var(--color-ink-soft)]">이 검증 결과의 평가지가 없습니다.</p>}
            </div>
          </section>

          <section className="card p-4 sm:p-6">
            <h2 className="text-lg font-extrabold">항목별 발견 건수</h2>
            <p className="mb-3 text-xs text-[var(--color-ink-soft)]">어떤 검증 항목에서 오류가 자주 나오는지 봅니다.</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCheck} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke="#ece7db" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="error" name="오류" stackId="a" fill="var(--color-pen)" />
                  <Bar dataKey="warn" name="확인 필요" stackId="a" fill="var(--color-accent)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
