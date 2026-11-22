/**
 * @file PaperCover.jsx
 * @brief 평가지 표지 - 실제 시험지 표지처럼 렌더링 (목록 썸네일과 상세 화면에서 같은 컴포넌트를 크기만 바꿔 사용)
 * @note 글자 크기는 컨테이너 너비(cqw) 기준이라 어떤 크기에서도 비율이 유지됩니다.
 */

import { COVER_THEMES, SCHOOL_NAMES, countByType, formTypeOf, totalPoints } from '@/lib/schema'

export default function PaperCover({ paper, compact = false }) {
  const { meta, cover } = paper
  const theme = COVER_THEMES[cover.theme] ?? COVER_THEMES.navy
  const counts = countByType(paper)
  const level = SCHOOL_NAMES[meta.schoolLevel] ?? '중학교'
  const notices = (cover.notices || []).filter(Boolean)

  return (
    <div style={{ containerType: 'inline-size' }} className="w-full">
      <div
        className="relative w-full overflow-hidden rounded-[2cqw] shadow-[0_18px_40px_-24px_rgba(0,0,0,0.45)]"
        style={{ aspectRatio: '1 / 1.414', background: theme.paper, color: theme.ink, border: `0.35cqw solid ${theme.ink}22` }}
      >
        {/* 상단 띠 */}
        <div className="flex items-center justify-between px-[6cqw]" style={{ background: theme.ink, color: theme.paper, height: '9cqw' }}>
          <span style={{ fontSize: '3.2cqw', fontWeight: 700, letterSpacing: '0.04em' }}>
            {meta.year}학년도 {meta.semester}학기
          </span>
          <span style={{ fontSize: '3.2cqw', fontWeight: 700, letterSpacing: '0.2em' }}>{meta.examType}</span>
        </div>
        <div style={{ height: '1.2cqw', background: theme.accent }} />

        <div className="px-[7cqw] pt-[7cqw] flex flex-col" style={{ height: 'calc(100% - 10.2cqw)' }}>
          {/* 과목 박스 */}
          <div className="text-center">
            <div style={{ fontSize: '3.6cqw', fontWeight: 600, opacity: 0.75 }}>
              {level} {meta.grade}학년
            </div>
            <div className="font-serif" style={{ fontSize: compact ? '13cqw' : '12cqw', fontWeight: 800, lineHeight: 1.15, marginTop: '1.5cqw', letterSpacing: '0.08em' }}>
              {meta.subject}
            </div>
            {formTypeOf(meta) && (
              <div className="inline-block" style={{ fontSize: '3.8cqw', marginTop: '2cqw', padding: '0.6cqw 2.4cqw', fontWeight: 800, border: `0.45cqw solid ${theme.ink}`, letterSpacing: '0.1em' }}>{formTypeOf(meta)}</div>
            )}
            {meta.elective && (
              <div style={{ fontSize: '3.6cqw', marginTop: '1cqw', fontWeight: 700, opacity: 0.85 }}>선택과목 · {meta.elective}</div>
            )}
            {meta.title?.trim() && (
              <div style={{ fontSize: '3.4cqw', marginTop: '1.5cqw', opacity: 0.8 }}>{meta.title}</div>
            )}
          </div>

          {/* 응시 정보 칸 */}
          <div
            className="grid grid-cols-4 text-center mx-auto"
            style={{ marginTop: '6cqw', width: '100%', border: `0.35cqw solid ${theme.ink}`, fontSize: '3cqw' }}
          >
            {['학년', '반', '번호', '이름'].map((label, index) => (
              <div key={label} style={{ borderLeft: index ? `0.35cqw solid ${theme.ink}` : 'none' }}>
                <div style={{ padding: '1.2cqw 0', background: `${theme.ink}12`, fontWeight: 700, borderBottom: `0.35cqw solid ${theme.ink}` }}>{label}</div>
                <div style={{ height: '6.5cqw' }} />
              </div>
            ))}
          </div>

          {/* 시험 정보 */}
          <div className="grid grid-cols-3 text-center" style={{ marginTop: '5cqw', gap: '2.5cqw' }}>
            {[
              ['문항 수', `${paper.questions.length}문항`],
              ['총점', `${totalPoints(paper)}점`],
              ['시간', `${meta.durationMin}분`]
            ].map(([label, value]) => (
              <div key={label} style={{ borderTop: `0.6cqw solid ${theme.accent}`, paddingTop: '1.6cqw' }}>
                <div style={{ fontSize: '2.6cqw', opacity: 0.65, fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: '4.2cqw', fontWeight: 800 }}>{value}</div>
              </div>
            ))}
          </div>
          <div className="text-center" style={{ fontSize: '2.7cqw', marginTop: '2.5cqw', opacity: 0.75 }}>
            객관식 {counts.choice} · 단답형 {counts.short} · 서술형 {counts.essay}
          </div>

          {/* 유의사항 (썸네일에서는 생략) */}
          {!compact && notices.length > 0 && (
            <div style={{ marginTop: '5cqw', border: `0.3cqw dashed ${theme.ink}66`, borderRadius: '1.5cqw', padding: '3cqw 3.5cqw' }}>
              <div style={{ fontSize: '3cqw', fontWeight: 800, marginBottom: '1.2cqw' }}>수험생 유의사항</div>
              <ol style={{ fontSize: '2.6cqw', lineHeight: 1.6, paddingLeft: '3.5cqw', listStyle: 'decimal' }}>
                {notices.slice(0, 5).map((notice, index) => <li key={index}>{notice}</li>)}
              </ol>
            </div>
          )}

          {/* 학교명 */}
          <div className="mt-auto text-center" style={{ paddingBottom: '6cqw' }}>
            {cover.showSchool && meta.schoolName?.trim() && (
              <div className="font-serif" style={{ fontSize: '4.6cqw', fontWeight: 800, letterSpacing: '0.3em' }}>{meta.schoolName}</div>
            )}
            {paper.isDemo && (
              <div style={{ fontSize: '2.6cqw', marginTop: '1.5cqw', color: '#b4232f', fontWeight: 700 }}>예시 평가지</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
