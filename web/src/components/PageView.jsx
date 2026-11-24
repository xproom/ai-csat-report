/**
 * @file PageView.jsx
 * @brief 문제지 한 쪽 보기 (PDF는 pdf.js로 캔버스에 그리고, 사진은 그대로 표시)
 * - annotations가 있으면 각 문제 아래 빈칸(점선 상자)에 AI 풀이 기록을 굴림체로 겹쳐 그림
 * - 지금 푸는 문제가 보이도록 문제지 영역(scrollRef) 안에서만 스크롤
 */

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MIN_FIT, NOTE_COLOR, NOTE_FONT, NOTE_LINE_HEIGHT, NOTE_SIZE, answerLabel } from '@/lib/noteStyle'
import { renderPdfPage } from '@/lib/pdfRender'

/**
 * @brief 문제 아래 빈칸에 쓰는 풀이 기록 - 굴림체, 점선 상자
 * - 풀이가 길면 ① 글자를 줄이고(최소 MIN_FIT) ② 그래도 넘치면 상자를 아래로 늘려 모두 보여 줌
 * - 상자를 늘리면 다음 문제를 가릴 수 있으므로, 지금 푸는(또는 고른) 문제만 자동으로 늘리고
 *   이미 푼 문제는 「풀이 더 보기」를 눌러 펼침
 */
const NoteBlock = memo(function NoteBlock({ annotation }) {
  const { notes = [], active, x0, x1, top, bottom, type } = annotation
  const boxRef = useRef(null)
  const innerRef = useRef(null)
  const fitRef = useRef(1)
  const [overflowing, setOverflowing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const textKey = notes.map(note => note.visible).join('|')

  // 빈칸 높이에 비해 글이 얼마나 긴지 재서 글자 크기를 맞춤
  // - 크기는 화면 요소에 바로 적고 한 번에 정함 (상태로 되풀이하면 커졌다 작아지기를 반복해 화면이 멈출 수 있음)
  useLayoutEffect(() => {
    const box = boxRef.current
    const inner = innerRef.current
    const page = box?.parentElement
    if (!inner || !page) return undefined
    const refit = () => {
      const style = getComputedStyle(box)
      const available = (bottom - top) * page.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - 4
      // 문제지 그림이 아직 없어 높이를 모르면 나중에 (아래 ResizeObserver)
      if (available <= 0) return
      const heightAt = fit => {
        fitRef.current = fit
        inner.style.setProperty('--fit', String(fit))
        return inner.scrollHeight
      }
      const limit = available * 1.01
      const now = heightAt(fitRef.current)
      let fits = now <= limit
      // 지금 크기로 충분하면 그대로 (글을 쓰는 동안 크기가 들쭉날쭉하지 않게)
      if (!fits || (fitRef.current < 1 && now < available * 0.8)) {
        fits = heightAt(1) <= limit
        if (!fits) {
          let low = MIN_FIT
          let high = 1
          for (let step = 0; step < 5; step += 1) {
            const middle = (low + high) / 2
            if (heightAt(middle) <= limit) low = middle
            else high = middle
          }
          fits = heightAt(Number(low.toFixed(3))) <= limit
        }
      }
      setOverflowing(!fits)
    }
    refit()
    const observer = new ResizeObserver(refit)
    observer.observe(page)
    return () => observer.disconnect()
  }, [textKey, top, bottom])

  const showAll = overflowing && (active || expanded)
  return (
    <div
      ref={boxRef}
      className={`absolute rounded-md px-[1.2cqw] py-[0.6cqw] transition-colors border-2 border-dashed ${active ? 'border-amber-400/80' : 'border-amber-400/60'} bg-white ${showAll ? 'z-20 shadow-lg' : 'overflow-hidden'}`}
      style={{
        left: `${x0 * 100}%`,
        top: `${top * 100}%`,
        width: `${(x1 - x0) * 100}%`,
        ...(showAll
          ? { minHeight: `${(bottom - top) * 100}%` }
          : { height: `${(bottom - top) * 100}%` }),
        fontFamily: NOTE_FONT
      }}
      data-note-no={annotation.no}
    >
      <div ref={innerRef} style={{ '--fit': 1 }}>
        {notes.map((note, index) => (
          <div
            key={index}
            className="break-words"
            style={{ fontSize: `calc(var(--fit) * ${((NOTE_SIZE[note.kind] ?? NOTE_SIZE.work) * 100).toFixed(3)}cqw)`, lineHeight: NOTE_LINE_HEIGHT, color: NOTE_COLOR[note.kind] ?? NOTE_COLOR.work, fontWeight: note.kind === 'answer' ? 700 : 400 }}
          >
            {note.kind === 'answer' ? answerLabel(type, note.visible) : note.visible}
            {note.writing && <span className="ml-0.5 inline-block w-[2px] animate-pulse align-middle" style={{ height: '1em', background: NOTE_COLOR.work }} />}
          </div>
        ))}
      </div>
      {overflowing && !active && (
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className={`${expanded ? 'sticky bottom-0 mt-1' : 'absolute inset-x-0 bottom-0 pt-[3cqw]'} flex w-full items-end justify-center bg-gradient-to-t from-white via-white/90 to-transparent pb-[0.4cqw] text-[1.6cqw] font-bold text-[var(--color-brand)]`}
        >
          {expanded ? '접기 ▴' : '풀이 더 보기 ▾'}
        </button>
      )}
    </div>
  )
}, (prev, next) => sameAnnotation(prev.annotation, next.annotation))

/** @brief 보이는 내용이 같은 풀이 기록인지 (같으면 다시 그리지 않음) */
function sameAnnotation(a, b) {
  return a.no === b.no && a.active === b.active && a.type === b.type
    && a.x0 === b.x0 && a.x1 === b.x1 && a.top === b.top && a.bottom === b.bottom
    && a.notes.length === b.notes.length
    && a.notes.every((note, index) => note.kind === b.notes[index].kind && note.visible === b.notes[index].visible && note.writing === b.notes[index].writing)
}

export default function PageView({ files, pageRef, placeholder, onPageCount, annotations = [], scrollRef = null }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const [width, setWidth] = useState(0)
  const [status, setStatus] = useState('')
  const fileIndex = Math.min(pageRef?.file ?? 0, Math.max(0, files.length - 1))
  const file = files[fileIndex]
  const pageNumber = pageRef?.page ?? 1
  const isPdf = file?.type === 'application/pdf'

  const imageUrl = useMemo(() => (file && !isPdf && file.blob ? URL.createObjectURL(file.blob) : ''), [file, isPdf])
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl) }, [imageUrl])

  // 컨테이너 너비 추적
  useEffect(() => {
    const element = wrapRef.current
    if (!element) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // PDF 쪽 그리기 (빠르게 바뀌면 마지막 요청만 반영)
  useEffect(() => {
    if (!isPdf || !width || !canvasRef.current) return undefined
    let cancelled = false
    renderPdfPage(file, pageNumber, canvasRef.current, width)
      .then(info => {
        if (cancelled) return
        setStatus(`${info.page} / ${info.pageCount}쪽`)
        onPageCount?.(fileIndex, info.pageCount)
      })
      .catch(() => { if (!cancelled) setStatus('PDF를 표시하지 못했습니다') })
    return () => { cancelled = true }
  }, [file, isPdf, pageNumber, width, fileIndex, onPageCount])

  // 지금 푸는 문제가 보이도록 문제지 영역 안에서만 스크롤 (페이지 전체는 움직이지 않음)
  const active = annotations.find(annotation => annotation.active)
  const activeKey = active ? `${active.no}:${pageNumber}` : ''
  useEffect(() => {
    const container = scrollRef?.current
    const wrap = wrapRef.current
    if (!container || !wrap || !active) return
    const wrapTop = wrap.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
    const target = wrapTop + (active.qTop ?? active.top) * wrap.clientHeight - container.clientHeight * 0.15
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
    // 문제나 쪽이 바뀔 때만 이동 (같은 문제를 쓰는 동안에는 그대로)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, width])

  return (
    <div ref={wrapRef} className="relative w-full" style={{ containerType: 'inline-size' }}>
      {!file ? (
        placeholder
      ) : isPdf ? (
        <canvas ref={canvasRef} className="block w-full bg-white" aria-label={`문제지 ${fileIndex + 1}번 파일 ${pageNumber}쪽`} />
      ) : (
        <img src={imageUrl} alt={`문제지 ${fileIndex + 1}번 파일`} className="block w-full bg-white" />
      )}
      {file && annotations.map(annotation => <NoteBlock key={annotation.no} annotation={annotation} />)}
      {file && (
        <span className="absolute top-2 right-2 rounded-md bg-black/55 px-2 py-0.5 text-[0.7rem] font-semibold text-white">
          {files.length > 1 ? `파일 ${fileIndex + 1} · ` : ''}{isPdf ? status || `${pageNumber}쪽` : '사진'}
        </span>
      )}
    </div>
  )
}
