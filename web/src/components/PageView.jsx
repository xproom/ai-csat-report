/**
 * @file PageView.jsx
 * @brief 문제지 한 쪽 보기 (PDF는 pdf.js로 캔버스에 그리고, 사진은 그대로 표시)
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { renderPdfPage } from '@/lib/pdfRender'

export default function PageView({ files, pageRef, placeholder }) {
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
      .then(info => { if (!cancelled) setStatus(`${info.page} / ${info.pageCount}쪽`) })
      .catch(() => { if (!cancelled) setStatus('PDF를 표시하지 못했습니다') })
    return () => { cancelled = true }
  }, [file, isPdf, pageNumber, width])

  return (
    <div ref={wrapRef} className="relative w-full">
      {!file ? (
        placeholder
      ) : isPdf ? (
        <canvas ref={canvasRef} className="block w-full bg-white" aria-label={`문제지 ${fileIndex + 1}번 파일 ${pageNumber}쪽`} />
      ) : (
        <img src={imageUrl} alt={`문제지 ${fileIndex + 1}번 파일`} className="block w-full bg-white" />
      )}
      {file && (
        <span className="absolute top-2 right-2 rounded-md bg-black/55 px-2 py-0.5 text-[0.7rem] font-semibold text-white">
          {files.length > 1 ? `파일 ${fileIndex + 1} · ` : ''}{isPdf ? status || `${pageNumber}쪽` : '사진'}
        </span>
      )}
    </div>
  )
}
