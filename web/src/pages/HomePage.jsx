/**
 * @file HomePage.jsx
 * @brief 첫 화면 - 서비스 소개와 평가지 목록(표지 썸네일)
 */

import { useMemo, useState } from 'react'
import PaperCover from '@/components/PaperCover'
import { Icon } from '@/components/Layout'
import { loadDemo } from '@/lib/demo'
import { formatRate, gradeRun } from '@/lib/grading'
import { EXAM_TYPES, paperTitle } from '@/lib/schema'
import { useStore } from '@/lib/store'

const STEPS = [
  { title: '표지와 문항 구성', body: '학년·학기·시험 종류·과목을 고르면 시험지 표지가 만들어집니다.', icon: 'M6 3h9l5 5v13H6zM14 3v6h6' },
  { title: '문제지 업로드', body: 'PDF나 사진을 올리고 정답과 배점을 입력합니다.', icon: 'M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3' },
  { title: 'AI가 풀고 OMR로 채점', body: '모델별 OMR 답안지에 빨간 펜으로 채점 결과가 표시됩니다.', icon: 'M9 12l2 2 4-4M12 3a9 9 0 100 18 9 9 0 000-18z' }
]


export default function HomePage() {
  const { papers, runs, refresh, notify } = useStore()
  const [level, setLevel] = useState('전체')
  const [examType, setExamType] = useState('전체')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => papers.filter(paper => {
    if (level !== '전체' && paper.meta.schoolLevel !== level) return false
    if (examType !== '전체' && paper.meta.examType !== examType) return false
    if (query.trim() && !`${paperTitle(paper)} ${paper.meta.schoolName}`.includes(query.trim())) return false
    return true
  }), [papers, level, examType, query])

  const bestOf = paper => {
    const paperRuns = runs.filter(run => run.paperId === paper.id)
    if (!paperRuns.length) return null
    const graded = paperRuns.map(run => ({ model: run.model, ...gradeRun(paper, run) })).sort((a, b) => b.rate - a.rate)
    return { count: paperRuns.length, top: graded[0] }
  }

  return (
    <div className="space-y-10">
      {/* 소개 */}
      <section className="relative overflow-hidden rounded-[28px] bg-[var(--color-brand)] text-white px-6 py-9 sm:px-10 sm:py-12">
        <div className="absolute -right-10 -top-10 hidden sm:grid grid-cols-5 gap-3 opacity-25 rotate-12" aria-hidden="true">
          {Array.from({ length: 35 }, (_, index) => (
            <span key={index} className={`w-5 h-8 rounded-[50%] ${[2, 8, 11, 19, 23, 26, 33].includes(index) ? 'bg-white' : 'border-2 border-white'}`} />
          ))}
        </div>
        <div className="relative max-w-2xl">
          <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-bold tracking-wide">초등 · 중등 정기고사 기반 AI 평가</span>
          <h1 className="mt-4 text-3xl sm:text-5xl font-extrabold leading-[1.15] tracking-tight break-keep">
            AI도 우리 학교<br className="hidden sm:block" /> 시험을 볼 수 있을까?
          </h1>
          <p className="mt-4 text-white/80 sm:text-lg leading-relaxed break-keep">
            중간고사·기말고사 문제지를 올리면 AI 모델이 풀고, 진짜 OMR 답안지처럼 채점해 드립니다. 모델끼리 점수를 비교하고, 어떤 문항에서 틀리는지 확인하세요.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#/new" className="btn bg-white !text-[var(--color-brand)] hover:bg-white/90">새 평가지 만들기</a>
            <a href="#/dashboard" className="btn border border-white/40 text-white hover:bg-white/10">대시보드 보기</a>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <div key={step.title} className="card p-5 flex gap-4">
            <span className="shrink-0 flex w-11 h-11 items-center justify-center rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
              <Icon d={step.icon} className="w-6 h-6" />
            </span>
            <div>
              <div className="text-xs font-bold text-[var(--color-accent)]">STEP {index + 1}</div>
              <div className="font-extrabold">{step.title}</div>
              <p className="mt-1 text-sm text-[var(--color-ink-soft)] leading-relaxed break-keep">{step.body}</p>
            </div>
          </div>
        ))}
      </section>

      {/* 평가지 목록 */}
      <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold">평가지</h2>
            <p className="text-sm text-[var(--color-ink-soft)]">{papers.length}개 · 이 브라우저에 저장됨</p>
          </div>
          {papers.length > 0 && (
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <input className="input !w-full sm:!w-48" value={query} placeholder="검색 (과목, 학교)" onChange={e => setQuery(e.target.value)} aria-label="평가지 검색" />
              <select className="input !w-auto" value={level} onChange={e => setLevel(e.target.value)} aria-label="학교급">
                {['전체', '초등', '중등'].map(item => <option key={item}>{item}</option>)}
              </select>
              <select className="input !w-auto" value={examType} onChange={e => setExamType(e.target.value)} aria-label="시험 종류">
                {['전체', ...EXAM_TYPES].map(item => <option key={item}>{item}</option>)}
              </select>
            </div>
          )}
        </div>

        {papers.length === 0 ? (
          <div className="card px-6 py-14 text-center">
            <p className="text-lg font-extrabold">아직 평가지가 없습니다</p>
            <p className="mt-1 text-[var(--color-ink-soft)]">새 평가지를 만들거나, 예시 데이터로 화면을 먼저 둘러보세요.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <a href="#/new" className="btn btn-primary">새 평가지 만들기</a>
              <button type="button" className="btn btn-ghost" onClick={() => loadDemo(refresh, notify)}>예시 데이터 불러오기</button>
            </div>
            <p className="mt-3 text-xs text-[var(--color-ink-soft)]">예시 데이터의 모델 점수는 둘러보기용 가상 값입니다.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-[var(--color-ink-soft)]">조건에 맞는 평가지가 없습니다.</p>
        ) : (
          <div className="grid gap-5 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filtered.map(paper => {
              const best = bestOf(paper)
              return (
                <a key={paper.id} href={`#/paper/${paper.id}?tab=${best ? 'results' : 'cover'}`} className="group block">
                  <div className="transition-transform duration-200 group-hover:-translate-y-1 group-hover:rotate-[-0.6deg]">
                    <PaperCover paper={paper} compact />
                  </div>
                  <div className="mt-3 px-0.5">
                    <div className="font-bold text-sm leading-snug line-clamp-2 break-keep">{paperTitle(paper)}</div>
                    <div className="mt-1 text-xs text-[var(--color-ink-soft)]">
                      {best ? <>최고 <b className="text-[var(--color-ink)]">{best.top.model}</b> {formatRate(best.top.rate)} · 풀이 {best.count}건</> : '아직 풀이 없음'}
                    </div>
                  </div>
                </a>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
