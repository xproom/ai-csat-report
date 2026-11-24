/**
 * @file FileUploader.jsx
 * @brief 문제지 업로드(끌어놓기·선택)와 문제지 뷰어
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { FILE_TYPES as ACCEPTED_TYPES, viewableBlob } from '@/lib/files'
import { Icon } from './Layout'

const MAX_FILE_MB = 30

function formatSize(bytes) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  return `${Math.max(1, Math.round(bytes / 1024))}KB`
}

/**
 * @param {Object} props
 * @param {Array<{ id, name, type, size }>} props.files
 * @param {(files: File[]) => void} props.onAdd
 * @param {(id: string) => void} props.onRemove
 */
export function FileUploader({ files, onAdd, onRemove }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [rejected, setRejected] = useState('')

  const accept = list => {
    const valid = []
    const bad = []
    for (const file of list) {
      if (!ACCEPTED_TYPES.includes(file.type)) bad.push(`${file.name} (형식)`)
      else if (file.size > MAX_FILE_MB * 1024 * 1024) bad.push(`${file.name} (${MAX_FILE_MB}MB 초과)`)
      else valid.push(file)
    }
    setRejected(bad.length ? `올릴 수 없는 파일: ${bad.join(', ')}` : '')
    if (valid.length) onAdd(valid)
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); accept([...e.dataTransfer.files]) }}
        className={`w-full rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${dragging
          ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)]'
          : 'border-[var(--color-line)] bg-white hover:border-[var(--color-brand)]'}`}
      >
        <span className="mx-auto mb-3 flex w-14 h-14 items-center justify-center rounded-2xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
          <Icon d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" className="w-7 h-7" />
        </span>
        <span className="block font-bold">문제지 파일을 끌어다 놓거나 눌러서 선택</span>
        <span className="block mt-1 text-sm text-[var(--color-ink-soft)]">PDF 또는 사진(JPG·PNG) · 여러 장 가능 · 파일당 {MAX_FILE_MB}MB까지</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_TYPES.join(',')}
        className="hidden"
        onChange={e => { accept([...e.target.files]); e.target.value = '' }}
      />
      {rejected && <p className="text-sm text-[var(--color-pen)]">{rejected}</p>}

      {files.length > 0 && (
        <ul className="divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)] bg-white">
          {files.map((file, index) => (
            <li key={file.id} className="flex items-center gap-3 px-4 py-3">
              <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[0.65rem] font-bold text-white ${file.type === 'application/pdf' ? 'bg-[var(--color-pen)]' : 'bg-[var(--color-ok)]'}`}>
                {file.type === 'application/pdf' ? 'PDF' : 'IMG'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{index + 1}. {file.name}</span>
                <span className="block text-xs text-[var(--color-ink-soft)]">{formatSize(file.size)}</span>
              </span>
              <button type="button" className="btn btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => onRemove(file.id)}>삭제</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * @brief 업로드한 문제지 보기 (PDF는 브라우저 내장 뷰어, 사진은 이미지)
 * @param {{ files: Array<{ id, name, type, blob }> }} props
 */
export function PaperViewer({ files }) {
  const [index, setIndex] = useState(0)
  const current = files[Math.min(index, files.length - 1)]
  const url = useMemo(() => {
    const blob = viewableBlob(current)
    return blob ? URL.createObjectURL(blob) : ''
  }, [current])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  if (!files.length) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-line)] bg-white px-6 py-14 text-center text-[var(--color-ink-soft)]">
        업로드된 문제지가 없습니다.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {files.map((file, fileIndex) => (
          <button
            key={file.id}
            type="button"
            aria-pressed={fileIndex === index}
            onClick={() => setIndex(fileIndex)}
            className={`max-w-[14rem] truncate rounded-lg px-3 py-1.5 text-xs font-semibold border ${fileIndex === index ? 'bg-[var(--color-ink)] text-white border-[var(--color-ink)]' : 'bg-white border-[var(--color-line)]'}`}
          >
            {fileIndex + 1}. {file.name}
          </button>
        ))}
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs font-semibold text-[var(--color-brand)] underline">
            새 창에서 크게 보기
          </a>
        )}
      </div>
      <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[#525659]">
        {!url
          ? <p className="px-6 py-14 text-center text-white">표시할 수 없는 파일입니다.</p>
          : current.type === 'application/pdf'
          ? <iframe title={current.name} src={url} className="w-full h-[75vh] min-h-[420px] bg-white" />
          : <img src={url} alt={`${current.name} 문제지`} className="mx-auto max-h-[80vh] w-auto bg-white" />}
      </div>
    </div>
  )
}
