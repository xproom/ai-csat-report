/**
 * @file PageView.jsx
 * @brief 문제지 한 쪽 보기 (PDF는 pdf.js로 캔버스에 그리고, 사진은 그대로 표시)
 * - annotations가 있으면 각 문제 아래 빈칸에 AI 풀이 기록을 손글씨로 겹쳐 그림
 * - 지금 푸는 문제가 보이도록 문제지 영역(scrollRef) 안에서만 스크롤
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { renderPdfPage } from '@/lib/pdfRender'

const CIRCLED = ['①', '②', '③', '④', '⑤']

/** @brief 문제 아래 빈칸에 쓰는 풀이 기록 */
function NoteBlock({ annotation }) {
  const { notes = [], active, x0, x1, top, bottom, type } = annotation
  const showAnswer = text => (type === 'choice' ? CIRCLED[Number(String(text).match(/[0-9]+/)?.[0]) - 1] ?? text : text)
  return (
    <div
      className={`absolute overflow-hidden rounded-md px-[1.2cqw] py-[0.6cqw] transition-colors ${active ? 'border-2 border-dashed border-amber-400/80 bg-amber-50/60' : ''}`}
      style={{ left: `${x0 * 100}%`, top: `${top * 100}%`, width: `${(x1 - x0) * 100}%`, height: `${(bottom - top) * 100}%` }}
      data-note-no={annotation.no}
    >
      {notes.map((note, index) => (
        <div
          key={index}
          className={`font-hand break-words ${note.kind === 'answer' ? 'text-[var(--color-pen)]' : note.kind === 'step' ? 'text-slate-500' : 'text-[#1b2a6b]'}`}
          style={{ fontSize: note.kind === 'answer' ? '2.7cqw' : note.kind === 'step' ? '1.7cqw' : '2.2cqw', lineHeight: 1.15 }}
        >
          {note.kind === 'answer' ? `답: ${showAnswer(note.visible)}` : note.visible}
          {note.writing && <span className="ml-0.5 inline-block w-[2px] animate-pulse bg-[#1b2a6b] align-middle" style={{ height: '2cqw' }} />}
        </div>
      ))}
    </div>
  )
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
