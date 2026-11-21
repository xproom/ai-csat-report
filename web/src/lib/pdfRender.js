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

/**
 * @brief PDF 한 쪽을 캔버스 너비에 맞춰 그림
 * @returns {Promise<{ pageCount: number, page: number }>}
 */
export async function renderPdfPage(file, pageNumber, canvas, cssWidth) {
  const pdf = await openPdf(file)
  const page = Math.min(Math.max(1, pageNumber), pdf.numPages)
  const pdfPage = await pdf.getPage(page)
  const base = pdfPage.getViewport({ scale: 1 })
  const ratio = window.devicePixelRatio || 1
  const viewport = pdfPage.getViewport({ scale: (cssWidth / base.width) * ratio })
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  canvas.style.width = `${cssWidth}px`
  canvas.style.height = `${Math.floor(viewport.height / ratio)}px`
  await pdfPage.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise
  return { pageCount: pdf.numPages, page }
}
