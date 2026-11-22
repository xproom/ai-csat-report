/**
 * @file pdfText.js
 * @brief PDF 글자 위치로 문항 번호("1.", "2.")와 각 문제 아래 빈칸을 찾음
 *
 * - 텍스트가 들어 있는 PDF(평가원 문제지 등)에서만 동작. 스캔본·사진이면 결과가 비어 있음
 * - 좌표는 모두 쪽 크기에 대한 비율(0~1), 위에서부터 잰 값
 * - 2단 편집(왼쪽·오른쪽 단)을 구분해, 같은 단의 다음 문제 바로 위까지를 빈칸으로 봄
 */

import { openPdf } from './pdfRender.js'

/** 문항 번호 모양: "1." "12." (뒤에 글자가 이어져도 됨) */
const ANCHOR_PATTERN = /^\s*(\d{1,2})\s*[.．]\s*(?:\S|$)/

/**
 * @brief 쪽 안의 문항 번호 위치 찾기
 * @param {Array<{ str, x0, x1, top, bottom }>} items - 비율 좌표의 글자 조각
 * @param {number} maxNo - 평가지의 가장 큰 문항 번호
 * @returns {Array<{ no, col, x0, top }>}
 */
export function findAnchors(items, maxNo) {
  const candidates = []
  for (const item of items) {
    const match = item.str.match(ANCHOR_PATTERN)
    if (!match) continue
    const no = Number(match[1])
    if (no < 1 || no > maxNo) continue
    candidates.push({ no, col: item.x0 < 0.5 ? 0 : 1, x0: item.x0, top: item.top, item })
  }
  // 단마다 가장 왼쪽 근처에 있는 번호만 문항 번호로 인정 (본문 속 "2." 같은 숫자는 제외)
  const anchors = []
  for (const col of [0, 1]) {
    const inCol = candidates.filter(anchor => anchor.col === col)
    if (!inCol.length) continue
    const minX = Math.min(...inCol.map(anchor => anchor.x0))
    const seen = new Set()
    for (const anchor of inCol.sort((a, b) => a.top - b.top)) {
      if (anchor.x0 > minX + 0.03 || seen.has(anchor.no)) continue
      seen.add(anchor.no)
      anchors.push(anchor)
    }
  }
  return anchors
}

/**
 * @brief 문제 아래 빈칸 계산: 문제 글이 끝난 곳 ~ 같은 단 다음 문제 바로 위
 * @returns {{ x0, x1, top, bottom, qTop }} 비율 좌표
 */
export function blankRegion(items, anchors, anchor) {
  const colItems = items.filter(item => (item.x0 < 0.5 ? 0 : 1) === anchor.col && item.str.trim())
  const colX0 = anchor.col === 0 ? Math.min(...colItems.map(item => item.x0), anchor.x0) : Math.max(0.5, Math.min(...colItems.map(item => item.x0)))
  const colX1 = anchor.col === 0 ? Math.min(0.5, Math.max(...colItems.map(item => item.x1))) : Math.max(...colItems.map(item => item.x1))
  const below = anchors.filter(other => other.col === anchor.col && other.top > anchor.top + 0.005).sort((a, b) => a.top - b.top)
  // 단의 마지막 문제는 쪽 아래 여백(쪽 번호 등) 바로 위까지 빈칸으로 씀
  const footerTops = items.filter(item => item.top > 0.9).map(item => item.top)
  const pageBottom = Math.min(0.95, footerTops.length ? Math.min(...footerTops) - 0.01 : 0.95)
  const nextTop = below.length ? below[0].top : pageBottom
  const inQuestion = colItems.filter(item => item.top >= anchor.top - 0.005 && item.top < nextTop - 0.005)
  const contentBottom = inQuestion.length ? Math.max(...inQuestion.map(item => item.bottom)) : anchor.top + 0.03
  let top = contentBottom + 0.008
  const bottom = nextTop - 0.008
  // 빈칸이 너무 좁으면 위로 조금 겹쳐서라도 최소 높이를 확보
  if (bottom - top < 0.06) top = Math.max(anchor.top + 0.02, bottom - 0.06)
  // 단 경계(가운데 0.5)를 넘지 않게 하고, 단 전체 너비를 씀
  // (문제 글이 짧아도 빈칸은 단 끝까지: 오른쪽 단의 끝은 왼쪽 여백과 대칭으로 잡음)
  const pageLeft = Math.min(...items.filter(item => item.str.trim()).map(item => item.x0), colX0)
  const x0 = anchor.col === 0 ? Math.max(0, colX0 - 0.005) : Math.max(0.5, colX0 - 0.005)
  const x1 = anchor.col === 0 ? 0.49 : Math.min(1, Math.max(colX1 + 0.005, 1 - pageLeft))
  return { x0, x1, top, bottom, qTop: anchor.top }
}

/** @brief PDF 한 쪽의 글자 조각을 비율 좌표로 */
async function pageItems(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  const W = viewport.width
  const H = viewport.height
  // pdf.js 좌표 변환으로 화면 좌표(왼쪽 위 기준)로 바꿈 → 쪽 시작점이 0이 아니거나 회전된 PDF도 맞게 계산
  return content.items
    .filter(item => typeof item.str === 'string' && item.str.trim())
    .map(item => {
      const height = Math.abs(item.height || item.transform[3] || 10)
      const [left, baseline] = viewport.convertToViewportPoint(item.transform[4], item.transform[5])
      const [right] = viewport.convertToViewportPoint(item.transform[4] + item.width, item.transform[5])
      const x0 = Math.min(left, right) / W
      const x1 = Math.max(left, right) / W
      return { str: item.str, x0, x1, top: (baseline - height) / H, bottom: (baseline + height * 0.25) / H }
    })
}

const indexCache = new Map()

/**
 * @brief PDF 문제지 전체에서 문항 위치 색인 만들기 (파일마다 한 번)
 * @param {{ id, type, blob }} file
 * @param {Object} paper - 문항 번호 범위와 선택과목(meta.elective)을 씀
 * @returns {Promise<{ regionOf: (no) => ({ page, ...region })|null, regionsOnPage: (page) => Array<{ no, ...region }>, pageCount: number }>}
 */
export async function buildQuestionIndex(file, paper) {
  if (file?.type !== 'application/pdf') return null
  const key = `${file.id}:${paper.questions.length}:${paper.meta?.elective ?? ''}`
  if (indexCache.has(key)) return indexCache.get(key)
  const promise = (async () => {
    const pdf = await openPdf(file)
    const maxNo = Math.max(...paper.questions.map(question => question.no))
    const pages = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const items = await pageItems(pdf, pageNumber)
      pages.push({ pageNumber, items, anchors: findAnchors(items, maxNo), text: items.map(item => item.str).join('').replace(/\s+/g, '') })
    }
    // 문항 번호마다 나온 자리 (홀수형·짝수형이나 선택과목처럼 여러 번 나올 수 있음)
    const occurrences = new Map()
    for (const page of pages) {
      for (const anchor of page.anchors) {
        if (!occurrences.has(anchor.no)) occurrences.set(anchor.no, [])
        occurrences.get(anchor.no).push({ page, anchor })
      }
    }
    const elective = String(paper.meta?.elective ?? '').replace(/\s+/g, '')
    const pick = no => {
      const list = occurrences.get(no) ?? []
      const question = paper.questions.find(item => item.no === no)
      if (question?.elective && elective) {
        // 선택과목 문항은 그 과목 이름이 나온 쪽(또는 그 뒤쪽)에서 찾음
        const electiveStart = pages.find(page => page.text.includes(elective))?.pageNumber
        const match = list.find(entry => electiveStart && entry.page.pageNumber >= electiveStart)
        if (match) return match
      }
      return list[0] ?? null
    }
    const chosen = new Map(paper.questions.map(question => [question.no, pick(question.no)]))
    const regionOf = no => {
      const entry = chosen.get(no)
      if (!entry) return null
      return { page: entry.page.pageNumber, ...blankRegion(entry.page.items, entry.page.anchors, entry.anchor) }
    }
    const regionsOnPage = pageNumber => paper.questions
      .map(question => ({ no: question.no, region: regionOf(question.no) }))
      .filter(item => item.region?.page === pageNumber)
      .map(item => ({ no: item.no, ...item.region }))
    return { regionOf, regionsOnPage, pageCount: pdf.numPages, found: [...chosen.values()].filter(Boolean).length }
  })()
  indexCache.set(key, promise)
  promise.catch(() => indexCache.delete(key))
  return promise
}

/* ───────────── 검증용: 문제지에서 읽어 낸 사실(문항 번호·배점 표시·선지·쪽 번호) ───────────── */

const CIRCLED_MARKS = '①②③④⑤⑥⑦⑧⑨⑩'
const POINTS_PATTERN = /[[［(（]\s*(\d+(?:\.\d+)?)\s*점\s*[\]］)）]/
const DEFAULT_POINTS_PATTERN = /표시가\s*없는\s*문항은\s*(?:모두\s*)?(\d+(?:\.\d+)?)\s*점/
// "모두 고르시오", "두 개 고르면" 같은 복수 선택 문항 ("모두 고른 것은?"은 조합형 단일 정답이라 제외)
const MULTI_PATTERN = /(모두|있는\s*대로|두\s*개|2\s*개|세\s*개|3\s*개|두\s*가지|2\s*가지|세\s*가지|3\s*가지)\s*(?:를|을|만|씩)?\s*(?:골라|고르시오|고르세요|고르면|고르라|찾으시오|찾아\s*쓰|택하시오)/

/** @brief 글자 조각을 읽는 순서(위→아래, 같은 줄은 왼쪽→오른쪽)로 정렬 */
function readingOrder(items) {
  const sorted = [...items].sort((a, b) => a.top - b.top)
  const lines = []
  for (const item of sorted) {
    const line = lines.at(-1)
    if (line && Math.abs(line[0].top - item.top) < 0.007) line.push(item)
    else lines.push([item])
  }
  return lines.flatMap(line => line.sort((a, b) => a.x0 - b.x0))
}

/** @brief 문항 글에서 선지 번호(①~⑤)와 선지 내용, 복수 선택 여부, 배점 표시 읽기 */
export function analyzeQuestionText(text) {
  const marks = []
  const positions = []
  for (let index = 0; index < text.length; index += 1) {
    const mark = CIRCLED_MARKS.indexOf(text[index])
    if (mark !== -1) { marks.push(mark + 1); positions.push(index) }
  }
  const options = positions.map((start, index) => text.slice(start + 1, positions[index + 1] ?? text.length).trim())
  // 마지막 선지 뒤에 붙은 다른 글(그림 설명·안내문)은 다른 선지 길이에 맞춰 잘라 냄
  if (options.length > 1) {
    const longest = Math.max(...options.slice(0, -1).map(option => option.length))
    options[options.length - 1] = options.at(-1).slice(0, longest * 2 + 6).trim()
  }
  const stem = positions.length ? text.slice(0, positions[0]) : text
  const multi = stem.match(MULTI_PATTERN)
  const countWord = multi?.[1]?.replace(/\s/g, '') ?? ''
  const multipleCount = /^(두|2)/.test(countWord) ? 2 : /^(세|3)/.test(countWord) ? 3 : 0
  const points = stem.match(POINTS_PATTERN) ?? text.match(POINTS_PATTERN)
  return {
    marks,
    options: options.map(option => option.slice(0, 80)),
    asksMultiple: Boolean(multi),
    multipleCount,
    printedPoints: points ? Number(points[1]) : 0,
    stem: stem.replace(/\s+/g, ' ').trim().slice(0, 90)
  }
}

/** @brief 쪽 위·아래 여백에서 쪽 번호 후보 찾기 ("3", "- 3 -", "3쪽", "3 / 8") */
export function pageNumberCandidates(items) {
  const candidates = []
  const zones = [
    ['footer', items.filter(item => item.top > 0.9)],
    ['header', items.filter(item => item.bottom < 0.09)]
  ]
  for (const [zone, zoneItems] of zones) {
    const line = readingOrder(zoneItems).map(item => item.str).join(' ')
    const fraction = line.match(/(\d{1,3})\s*[/／]\s*(\d{1,3})/)
    if (fraction) candidates.push({ value: Number(fraction[1]), total: Number(fraction[2]), slot: `${zone}-fraction` })
    for (const item of zoneItems) {
      const match = item.str.trim().match(/^[-–—(]?\s*(\d{1,3})\s*(?:쪽|[-–—)])?$/)
      if (!match) continue
      const center = (item.x0 + item.x1) / 2
      const side = center < 0.35 ? 'left' : center > 0.65 ? 'right' : 'center'
      candidates.push({ value: Number(match[1]), total: 0, slot: `${zone}-${side}` })
    }
  }
  return candidates
}

/**
 * @brief 문제지 PDF들에서 검증에 쓸 사실을 읽어 냄 (텍스트가 들어 있는 PDF만, API 사용 없음)
 * @param {Array<{ id, name, type, blob }>} files
 * @param {Object} paper
 * @returns {Promise<Object>} facts { source:'pdf', pageCount, readable, pages, anchors, questions, defaultPoints }
 */
export async function extractPaperFacts(files, paper) {
  const pdfFiles = files.filter(file => file?.type === 'application/pdf')
  const maxNo = Math.max(1, ...paper.questions.map(question => question.no))
  const pages = []
  const segments = []
  let allText = ''
  let index = 0
  let current = null
  for (const file of pdfFiles) {
    const pdf = await openPdf(file)
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      index += 1
      const items = await pageItems(pdf, pageNumber)
      const text = items.map(item => item.str).join('')
      allText += `${text}
`
      pages.push({ index, fileName: file.name, page: pageNumber, candidates: pageNumberCandidates(items), compact: text.replace(/\s+/g, '') })
      const anchors = findAnchors(items, maxNo)
      const anchorItems = new Map(anchors.map(anchor => [anchor.item, anchor.no]))
      const body = items.filter(item => item.top > 0.04 && item.top < 0.94)
      const twoColumns = anchors.some(anchor => anchor.col === 1)
      const ordered = twoColumns
        ? [...readingOrder(body.filter(item => item.x0 < 0.5)), ...readingOrder(body.filter(item => item.x0 >= 0.5))]
        : readingOrder(body)
      for (const item of ordered) {
        if (anchorItems.has(item)) {
          current = { no: anchorItems.get(item), index, parts: [] }
          segments.push(current)
        }
        current?.parts.push(item.str)
      }
    }
  }

  const elective = String(paper.meta?.elective ?? '').replace(/\s+/g, '')
  const electiveStart = elective ? pages.find(page => page.compact.includes(elective))?.index : undefined
  const questions = {}
  for (const question of paper.questions) {
    const list = segments.filter(segment => segment.no === question.no)
    const chosen = (question.elective && electiveStart ? list.find(segment => segment.index >= electiveStart) : null) ?? list[0]
    if (!chosen) continue
    questions[question.no] = { index: chosen.index, ...analyzeQuestionText(chosen.parts.join(' ')) }
  }
  const defaultPoints = allText.match(DEFAULT_POINTS_PATTERN)
  return {
    source: 'pdf',
    createdAt: new Date().toISOString(),
    fileKey: pdfFiles.map(file => file.id).join(','),
    pageCount: index,
    readable: allText.replace(/\s+/g, '').length > 40,
    pages: pages.map(page => ({ index: page.index, fileName: page.fileName, page: page.page, candidates: page.candidates })),
    anchors: segments.map(segment => ({ no: segment.no, index: segment.index })),
    questions,
    defaultPoints: defaultPoints ? Number(defaultPoints[1]) : 0,
    electiveStart: electiveStart ?? 0
  }
}
