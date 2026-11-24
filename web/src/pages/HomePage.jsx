/**
 * @file HomePage.jsx
 * @brief 첫 화면 - 서비스 소개(교사용 검증 흐름)와 평가지 목록(표지 썸네일, 검증 상태)
 */

import { useMemo, useState } from 'react'
import PaperCover from '@/components/PaperCover'
import { Icon } from '@/components/Layout'
import { loadDemo, loadSample } from '@/lib/demo'
import { gradeRun } from '@/lib/grading'
import { EXAM_TYPES, SCHOOL_LEVELS, paperTitle } from '@/lib/schema'
import { useStore } from '@/lib/store'
import { checkCounts, validateStored } from '@/lib/verify'

const VERIFY_LABEL = {
  error: ['검증 오류', 'text-[var(--color-pen)]'],
  warn: ['확인 필요', 'text-amber-800'],
  ok: ['검증 통과', 'text-emerald-800']
}

const STEPS = [
  { title: '문제지·정답 올리기', body: '출제한 문제지(PDF·사진)와 정답표를 올립니다. 수능·모의고사는 표준 구성이 자동으로 잡힙니다.', icon: 'M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3' },
  { title: '문제지·정답 검증', body: '배점 합계, 문항 번호 누락·중복, 선택형·서답형 비율, 선지 ①~⑤, 정답 표기, 쪽 번호를 확인합니다.', icon: 'M9 12l2 2 4-4M5 4h14v16H5z' },
  { title: 'AI가 풀고 OMR 채점', body: 'AI가 문제지 각 문항 아래에 풀이를 적고 OMR에 마킹하면, 정답과 비교해 채점합니다.', icon: 'M9 12l2 2 4-4M12 3a9 9 0 100 18 9 9 0 000-18z' }
]


export default function HomePage() {
  const { papers, runs, refresh, notify, cloud } = useStore()
  const [level, setLevel] = useState('전체')
  const [examType, setExamType] = useState('전체')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => papers.filter(paper => {
    if (level !== '전체' && paper.meta.schoolLevel !== level) return false
    if (examType !== '전체' && paper.meta.examType !== examType) return false
    if (query.trim() && !`${paperTitle(paper)} ${paper.meta.schoolName}`.includes(query.trim())) return false
    return true
  }), [papers, level, examType, query])

  /** @brief 목록 카드 아래 줄: 검증 상태와 최근 AI 풀이 점수 */
  const summaries = useMemo(() => new Map(papers.map(paper => {
    const paperRuns = runs.filter(run => run.paperId === paper.id)
    const verify = validateStored(paper, paperRuns)
    const latest = [...paperRuns].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0]
    return [paper.id, { verify, counts: checkCounts(verify), latest: latest ? { model: latest.model, ...gradeRun(paper, latest) } : null }]
  })), [papers, runs])

  /** @brief 예시 불러오기 (둘러보기에서는 실제 평가지, 로그인했으면 가상 평가지) */
  const addDemo = async () => {
    try {
      if (!cloud.guest) {
        await loadDemo(refresh, notify)
        return
      }
      await loadSample()
      await refresh()
    } catch (error) {
      notify(error?.message || '예시를 불러오지 못했습니다.', 'error')
    }
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
          <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-bold tracking-wide">초등 · 중등 · 고등 교사용 출제 검토</span>
          <h1 className="mt-4 text-3xl sm:text-5xl font-extrabold leading-[1.15] tracking-tight break-keep">
            시험지를 내기 전에,<br className="hidden sm:block" /> AI가 먼저 검토하고 풀어 봅니다
          </h1>
          <p className="mt-4 text-white/80 sm:text-lg leading-relaxed break-keep">
            출제한 문제지와 정답을 올리면 배점·문항 번호·선지·정답 표기·쪽 번호의 오류를 찾아 드립니다. 이어서 AI가 문제지에 풀이를 적어 가며 OMR로 답안을 내고, 정답과 비교해 채점합니다. AI가 틀린 문항은 정답이나 문제에 오류가 없는지 한 번 더 살펴보세요.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#/new" className="btn bg-white !text-[var(--color-brand)] hover:bg-white/90">문제지 검증 시작</a>
            <a href="#/dashboard" className="btn border border-white/40 text-white hover:bg-white/10">검증 현황 보기</a>
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
            <p className="text-sm text-[var(--color-ink-soft)]">{papers.length}개 · {cloud.user ? '서버에 저장됨' : '이 브라우저에 저장됨'}</p>
          </div>
          {papers.length > 0 && (
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <input className="input !w-full sm:!w-48" value={query} placeholder="검색 (과목, 학교)" onChange={e => setQuery(e.target.value)} aria-label="평가지 검색" />
              <select className="input !w-auto" value={level} onChange={e => setLevel(e.target.value)} aria-label="학교급">
                {['전체', ...SCHOOL_LEVELS].map(item => <option key={item}>{item}</option>)}
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
              <button type="button" className="btn btn-ghost" onClick={addDemo}>예시 데이터 불러오기</button>
            </div>
            {!cloud.guest && <p className="mt-3 text-xs text-[var(--color-ink-soft)]">예시 데이터의 AI 풀이는 둘러보기용 가상 값입니다.</p>}
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-[var(--color-ink-soft)]">조건에 맞는 평가지가 없습니다.</p>
        ) : (
          <div className="grid gap-5 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filtered.map(paper => {
              const summary = summaries.get(paper.id)
              const [verifyLabel, verifyTone] = VERIFY_LABEL[summary.verify.status]
              return (
                <a key={paper.id} href={`#/paper/${paper.id}?tab=check`} className="group block">
                  <div className="transition-transform duration-200 group-hover:-translate-y-1 group-hover:rotate-[-0.6deg]">
                    <PaperCover paper={paper} compact />
                  </div>
                  <div className="mt-3 px-0.5">
                    <div className="font-bold text-sm leading-snug line-clamp-2 break-keep">{paperTitle(paper)}</div>
                    <div className="mt-1 text-xs text-[var(--color-ink-soft)]">
                      <b className={verifyTone}>{verifyLabel}</b>
                      {summary.verify.status !== 'ok' && <span> {summary.counts.error + summary.counts.warn}개 항목</span>}
                      {' · '}
                      {summary.latest ? <>AI {summary.latest.score}/{summary.latest.maxScore}점</> : 'AI 풀이 전'}
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
