/**
 * @file solutionPdf.js
 * @brief AI 풀이 과정이 문제 아래(점선 상자)에 적힌 문제지 PDF 만들기
 * - 문제지 각 쪽을 그림으로 그리고, 화면과 같은 굴림체·크기로 풀이 기록을 겹쳐 그린 뒤 PDF로 묶음
 * - 한 파일에 홀수형·짝수형이 함께 있으면 평가지의 형 쪽만 넣음
 */

import { openPdf } from './pdfRender.js'
import { buildQuestionIndex } from './pdfText.js'
import { buildReplay, stateAt } from './replay.js'
import { MIN_FIT, NOTE_COLOR, NOTE_FONT, NOTE_LINE_HEIGHT, NOTE_SIZE, answerLabel } from './noteStyle.js'
import { paperTitle } from './schema.js'

/** 그림 해상도 (PDF 1pt당 픽셀) - 2면 인쇄해도 글자가 또렷함 */
const RENDER_SCALE = 2

/** @brief 글자 단위로 줄바꿈 (한글은 아무 데서나 끊어도 되고, 영문·숫자는 가능하면 띄어쓰기에서 끊음) */
function wrapText(ctx, text, maxWidth) {
  const lines = []
  for (const paragraph of String(text).split('\n')) {
    let line = ''
    let lastSpace = -1
    for (const char of paragraph) {
      const next = line + char
      if (ctx.measureText(next).width > maxWidth && line) {
        if (lastSpace > 0 && line.length - lastSpace < 12) {
          lines.push(line.slice(0, lastSpace))
          line = line.slice(lastSpace + 1) + char
        } else {
          lines.push(line)
          line = char
        }
        lastSpace = -1
      } else {
        line = next
      }
      if (char === ' ') lastSpace = line.length - 1
    }
    lines.push(line)
  }
  return lines
}

/** @brief 한 문제의 풀이 기록을 점선 상자 안에 그림 (칸이 모자라면 글자를 줄임) */
function drawNotes(ctx, region, notes, type, pageWidth, pageHeight) {
  const x = region.x0 * pageWidth
  const y = region.top * pageHeight
  const width = (region.x1 - region.x0) * pageWidth
  const height = (region.bottom - region.top) * pageHeight
  const padX = 0.012 * pageWidth
  const padY = 0.006 * pageWidth

  // 점선 상자
  ctx.save()
  ctx.setLineDash([0.008 * pageWidth, 0.005 * pageWidth])
  ctx.lineWidth = Math.max(1.5, 0.0018 * pageWidth)
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)'
  ctx.strokeRect(x, y, width, height)
  ctx.restore()

  const lay = fit => {
    const blocks = notes.map(note => {
      const kind = note.kind === 'answer' || note.kind === 'step' ? note.kind : 'work'
      const size = NOTE_SIZE[kind] * fit * pageWidth
      ctx.font = `${kind === 'answer' ? 'bold ' : ''}${size}px ${NOTE_FONT}`
      const text = kind === 'answer' ? answerLabel(type, note.text) : note.text
      return { kind, size, font: ctx.font, lines: wrapText(ctx, text, width - padX * 2) }
    })
    const total = blocks.reduce((sum, block) => sum + block.lines.length * block.size * NOTE_LINE_HEIGHT, 0) + padY * 2
    return { blocks, total }
  }
  let fit = 1
  let layout = lay(fit)
  for (let i = 0; i < 6 && layout.total > height && fit > MIN_FIT; i += 1) {
    fit = Math.max(MIN_FIT, fit * (height / layout.total) * 0.98)
    layout = lay(fit)
  }

  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, width, height)
  ctx.clip()
  ctx.textBaseline = 'top'
  let cursor = y + padY
  for (const block of layout.blocks) {
    ctx.font = block.font
    ctx.fillStyle = NOTE_COLOR[block.kind]
    for (const line of block.lines) {
      ctx.fillText(line, x + padX, cursor + block.size * (NOTE_LINE_HEIGHT - 1) / 2)
      cursor += block.size * NOTE_LINE_HEIGHT
    }
  }
  ctx.restore()
}

/**
 * @brief 풀이가 적힌 문제지 PDF를 만들어 내려받기
 * @param {{ paper, run, file, onProgress?: (done: number, total: number) => void }} options
 * @returns {Promise<{ pages: number, annotated: number, fileName: string }>}
 */
export async function downloadSolutionPdf({ paper, run, file, onProgress }) {
  if (file?.type !== 'application/pdf') throw new Error('풀이 PDF는 PDF 문제지에서만 만들 수 있습니다.')
  const [{ jsPDF }, pdf, index] = await Promise.all([import('jspdf'), openPdf(file), buildQuestionIndex(file, paper)])
  if (!index?.found) throw new Error('문제지에서 문항 위치를 찾지 못해 풀이를 문제 아래에 적을 수 없습니다.')

  // 풀이가 끝난 상태의 문항별 기록
  const replay = buildReplay(paper, run)
  const final = stateAt(replay, replay.totalMs + 1)
  const notesByNo = final.notesByNo ?? new Map()

  const pageNumbers = index.pageNumbers?.length ? index.pageNumbers : Array.from({ length: pdf.numPages }, (_, i) => i + 1)
  let doc = null
  let annotated = 0
  for (const [position, pageNumber] of pageNumbers.entries()) {
    onProgress?.(position, pageNumbers.length)
    const page = await pdf.getPage(pageNumber)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: RENDER_SCALE })
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: ctx, viewport }).promise

    for (const region of index.regionsOnPage(pageNumber)) {
      const notes = (notesByNo.get(region.no) ?? []).filter(note => String(note.text ?? '').trim())
      if (!notes.length) continue
      const type = paper.questions.find(question => question.no === region.no)?.type
      drawNotes(ctx, region, notes, type, canvas.width, canvas.height)
      annotated += 1
    }

    const orientation = base.width > base.height ? 'landscape' : 'portrait'
    if (!doc) doc = new jsPDF({ unit: 'pt', format: [base.width, base.height], orientation, compress: true })
    else doc.addPage([base.width, base.height], orientation)
    doc.addImage(canvas.toDataURL('image/jpeg', 0.88), 'JPEG', 0, 0, base.width, base.height, undefined, 'FAST')
  }
  onProgress?.(pageNumbers.length, pageNumbers.length)
  const safe = text => String(text).replace(/[\\/:*?"<>|]+/g, ' ').trim()
  const fileName = `${safe(paperTitle(paper))} - ${safe(run.model ?? 'AI')} 풀이.pdf`
  doc.save(fileName)
  return { pages: pageNumbers.length, annotated, fileName }
}
