/**
 * @file pdfRender.js
 * @brief 문제지 PDF 쪽을 캔버스로 그리기 (pdf.js는 필요할 때만 불러옴)
 */

let pdfjsPromise = null
const documents = new Map()
const MAX_OPEN_DOCUMENTS = 6

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
  let opening = documents.get(file.id)
  if (!opening) {
    opening = (async () => {
      const pdfjs = await loadPdfjs()
      const data = new Uint8Array(await file.blob.arrayBuffer())
      return pdfjs.getDocument({ data }).promise
    })()
    // 열지 못한 파일은 다음에 다시 시도
    opening.catch(() => { if (documents.get(file.id) === opening) documents.delete(file.id) })
  }
  // 최근에 쓴 순서로 두고, 오래 안 쓴 문서는 닫아 메모리를 비움
  documents.delete(file.id)
  documents.set(file.id, opening)
  while (documents.size > MAX_OPEN_DOCUMENTS) {
    const [oldest, old] = documents.entries().next().value
    documents.delete(oldest)
    old.then(pdf => pdf.loadingTask.destroy()).catch(() => {})
  }
  return opening
}

// 화면 캔버스마다 가장 최근 그리기 요청 번호 (늦게 끝난 옛 요청은 버림)
const latestRequest = new WeakMap()
// 화면 캔버스마다 지금 그리는 작업 (새 요청이 오면 멈춤)
const renderTasks = new WeakMap()

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
  renderTasks.get(canvas)?.cancel()
  const pdf = await openPdf(file)
  const page = Math.min(Math.max(1, pageNumber), pdf.numPages)
  const pdfPage = await pdf.getPage(page)
  const base = pdfPage.getViewport({ scale: 1 })
  const ratio = window.devicePixelRatio || 1
  const viewport = pdfPage.getViewport({ scale: (cssWidth / base.width) * ratio })

  const stale = () => latestRequest.get(canvas) !== request
  if (stale()) return { pageCount: pdf.numPages, page, stale: true }
  const offscreen = document.createElement('canvas')
  offscreen.width = Math.floor(viewport.width)
  offscreen.height = Math.floor(viewport.height)
  const task = pdfPage.render({ canvas: offscreen, canvasContext: offscreen.getContext('2d'), viewport })
  renderTasks.set(canvas, task)
  try {
    await task.promise
  } catch (error) {
    if (!stale()) throw error
  }

  // 그사이 새 요청이 들어왔으면 이 결과는 버림
  if (stale()) return { pageCount: pdf.numPages, page, stale: true }
  canvas.width = offscreen.width
  canvas.height = offscreen.height
  canvas.style.width = `${cssWidth}px`
  canvas.style.height = `${Math.floor(viewport.height / ratio)}px`
  canvas.getContext('2d').drawImage(offscreen, 0, 0)
  return { pageCount: pdf.numPages, page }
}
