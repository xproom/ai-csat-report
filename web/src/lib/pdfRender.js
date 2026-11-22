/**
 * @file pdfRender.js
 * @brief 문제지 PDF 쪽을 캔버스로 그리기 (pdf.js는 필요할 때만 불러옴)
 */

let pdfjsPromise = null
const documents = new Map()

async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      return pdfjs
    })
  }
  return pdfjsPromise
}

/** @brief 파일 id별로 PDF 문서를 한 번만 연다 */
export async function openPdf(file) {
  if (!documents.has(file.id)) {
    documents.set(file.id, (async () => {
      const pdfjs = await loadPdfjs()
      const data = new Uint8Array(await file.blob.arrayBuffer())
      return pdfjs.getDocument({ data }).promise
    })())
  }
  return documents.get(file.id)
}

// 화면 캔버스마다 가장 최근 그리기 요청 번호 (늦게 끝난 옛 요청은 버림)
const latestRequest = new WeakMap()

/**
 * @brief PDF 한 쪽을 캔버스 너비에 맞춰 그림
 * - 보이지 않는 캔버스에 먼저 다 그린 뒤, 가장 최근 요청일 때만 화면 캔버스로 옮김
 * - 화면 캔버스를 그리는 도중에 건드리지 않으므로, 너비가 바뀌며 연달아 다시 그려도
 *   그림이 뒤집히거나 깨지지 않음 (예전에는 그리는 중에 캔버스 크기를 바꿔 좌표 변환이 어긋났음)
 * @returns {Promise<{ pageCount: number, page: number, stale?: boolean }>}
 */
export async function renderPdfPage(file, pageNumber, canvas, cssWidth) {
  const request = (latestRequest.get(canvas) ?? 0) + 1
  latestRequest.set(canvas, request)
  const pdf = await openPdf(file)
  const page = Math.min(Math.max(1, pageNumber), pdf.numPages)
  const pdfPage = await pdf.getPage(page)
  const base = pdfPage.getViewport({ scale: 1 })
  const ratio = window.devicePixelRatio || 1
  const viewport = pdfPage.getViewport({ scale: (cssWidth / base.width) * ratio })

  const offscreen = document.createElement('canvas')
  offscreen.width = Math.floor(viewport.width)
  offscreen.height = Math.floor(viewport.height)
  await pdfPage.render({ canvas: offscreen, canvasContext: offscreen.getContext('2d'), viewport }).promise

  // 그사이 새 요청이 들어왔으면 이 결과는 버림
  if (latestRequest.get(canvas) !== request) return { pageCount: pdf.numPages, page, stale: true }
  canvas.width = offscreen.width
  canvas.height = offscreen.height
  canvas.style.width = `${cssWidth}px`
  canvas.style.height = `${Math.floor(viewport.height / ratio)}px`
  canvas.getContext('2d').drawImage(offscreen, 0, 0)
  return { pageCount: pdf.numPages, page }
}
