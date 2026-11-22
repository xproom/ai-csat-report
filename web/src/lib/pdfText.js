/**
 * @file pdfText.js
 * @brief PDF 글자 위치로 문항 번호("1.", "2.")와 각 문제 아래 빈칸을 찾음
 *
 * - 텍스트가 들어 있는 PDF(평가원 문제지 등)에서만 동작. 스캔본·사진이면 결과가 비어 있음
 * - 좌표는 모두 쪽 크기에 대한 비율(0~1), 위에서부터 잰 값
 * - 2단 편집(왼쪽·오른쪽 단)을 구분해, 같은 단의 다음 문제 바로 위까지를 빈칸으로 봄
 */

import { openPdf } from './pdfRender.js'
import { formTypeOf } from './schema.js'

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
  // 다음 문제 줄에 붙은 글자(수식 기호가 줄보다 조금 위에 놓인 경우 등)는 이 문제 글로 보지 않음
  const inQuestion = colItems.filter(item => item.top >= anchor.top - 0.005 && item.top < nextTop - 0.015)
  const contentBottom = inQuestion.length ? Math.max(...inQuestion.map(item => item.bottom)) : anchor.top + 0.03
  // 빈칸은 늘 문제 글(선지 포함)이 끝난 아래에서 시작 → 문제·선지를 가리지 않음
  const top = contentBottom + 0.008
  // 빈칸이 거의 없으면 최소 높이만 잡아 둠 (tight). 풀이가 길면 화면에서 상자를 아래로 늘려 보여 줌
  const bottom = Math.max(nextTop - 0.008, top + 0.03)
  const tight = nextTop - 0.008 - top < 0.06
  // 단 경계(가운데 0.5)를 넘지 않게 하고, 단 전체 너비를 씀
  // (문제 글이 짧아도 빈칸은 단 끝까지: 오른쪽 단의 끝은 왼쪽 여백과 대칭으로 잡음)
  const pageLeft = Math.min(...items.filter(item => item.str.trim()).map(item => item.x0), colX0)
  const x0 = anchor.col === 0 ? Math.max(0, colX0 - 0.005) : Math.max(0.5, colX0 - 0.005)
  const x1 = anchor.col === 0 ? 0.49 : Math.min(1, Math.max(colX1 + 0.005, 1 - pageLeft))
  return { x0, x1, top, bottom, qTop: anchor.top, tight, pageBottom }
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
  const form = formTypeOf(paper.meta)
  const key = `${file.id}:${paper.questions.length}:${paper.meta?.elective ?? ''}:${form}`
  if (indexCache.has(key)) return indexCache.get(key)
  const promise = (async () => {
    const pdf = await openPdf(file)
    const maxNo = Math.max(...paper.questions.map(question => question.no))
    const allPages = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const items = await pageItems(pdf, pageNumber)
      const raw = items.map(item => item.str).join('')
      allPages.push({ pageNumber, items, anchors: findAnchors(items, maxNo), text: raw.replace(/\s+/g, ''), form: pageFormType(raw), fileName: file.name })
    }
    // 한 파일에 홀수형·짝수형이 함께 있으면 평가지의 형 쪽에서만 문항을 찾음
    const forms = assignPageForms(allPages)
    const both = forms.includes('홀수형') && forms.includes('짝수형')
    const pages = both && form ? allPages.filter((_, i) => forms[i] === form) : allPages
    // 지문 속 "1. 2." 목록처럼 문항 순서를 거스르는 번호는 문항 번호에서 뺌 (검증과 같은 규칙)
    filterAnchorSequence(pages, paper)
    // 문항 번호마다 나온 자리 (선택과목처럼 여러 번 나올 수 있음)
    const occurrences = new Map()
    for (const page of pages) {
      for (const anchor of page.anchors) {
        if (!occurrences.has(anchor.no)) occurrences.set(anchor.no, [])
        occurrences.get(anchor.no).push({ page, anchor })
      }
    }
    const inElective = electivePageTest(pages.map(page => page.text), paper, pages.map(page => headerText(page.items)))
    const pick = no => {
      const list = occurrences.get(no) ?? []
      const question = paper.questions.find(item => item.no === no)
      if (question?.elective && inElective) {
        const match = list.find(entry => inElective(pages.indexOf(entry.page)))
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
    return { regionOf, regionsOnPage, pageCount: pdf.numPages, pageNumbers: pages.map(page => page.pageNumber), found: [...chosen.values()].filter(Boolean).length }
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

  // 1) 모든 쪽의 글자와 홀수형·짝수형 표시를 읽음
  const all = []
  let index = 0
  for (const file of pdfFiles) {
    const pdf = await openPdf(file)
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      index += 1
      const items = await pageItems(pdf, pageNumber)
      const text = items.map(item => item.str).join('')
      all.push({ index, fileName: file.name, page: pageNumber, items, text, compact: text.replace(/\s+/g, ''), form: pageFormType(text) })
    }
  }
  const forms = assignPageForms(all)
  const oddFound = forms.includes('홀수형')
  const evenFound = forms.includes('짝수형')

  // 2) 한 파일에 홀수형·짝수형이 함께 있으면 평가지의 형 쪽만 검사 (쪽 번호도 형마다 1쪽부터)
  const selected = formTypeOf(paper.meta)
  const keep = oddFound && evenFound && selected ? all.filter((page, i) => forms[i] === selected) : all
  const pages = keep.length ? keep : all
  const sectionPage = new Map()
  const pagesOut = pages.map(page => {
    const section = oddFound && evenFound ? `${page.fileName} (${forms[all.indexOf(page)]})` : page.fileName
    sectionPage.set(section, (sectionPage.get(section) ?? 0) + 1)
    return { index: page.index, fileName: section, page: sectionPage.get(section), candidates: pageNumberCandidates(page.items) }
  })

  // 3) 읽는 순서대로 문항 글을 나눔. 번호가 앞 문항보다 작아지면(지문 속 "1. 2." 목록 등) 문항 번호로 보지 않음
  //    선택과목 첫 번호(예: 국어 35, 수학 23)로 돌아가는 것만 허용
  const electiveFirst = Math.min(...paper.questions.filter(question => question.elective).map(question => question.no))
  const segments = []
  let current = null
  let lastNo = 0
  for (const page of pages) {
    const anchors = findAnchors(page.items, maxNo)
    const anchorItems = new Map(anchors.map(anchor => [anchor.item, anchor.no]))
    const body = page.items.filter(item => item.top > 0.04 && item.top < 0.94)
    const twoColumns = anchors.some(anchor => anchor.col === 1)
    const ordered = twoColumns
      ? [...readingOrder(body.filter(item => item.x0 < 0.5)), ...readingOrder(body.filter(item => item.x0 >= 0.5))]
      : readingOrder(body)
    for (const item of ordered) {
      const no = anchorItems.get(item)
      const accepted = no != null && (no >= lastNo || (no === electiveFirst && lastNo >= electiveFirst))
      if (accepted) {
        current = { no, index: page.index, pos: pages.indexOf(page), parts: [] }
        segments.push(current)
        lastNo = no
      }
      current?.parts.push(item.str)
    }
  }

  const inElective = electivePageTest(pages.map(page => page.compact), paper, pages.map(page => headerText(page.items)))
  const questions = {}
  for (const question of paper.questions) {
    const list = segments.filter(segment => segment.no === question.no)
    const chosen = (question.elective && inElective ? list.find(segment => inElective(segment.pos)) : null) ?? list[0]
    if (!chosen) continue
    questions[question.no] = { index: chosen.index, ...analyzeQuestionText(chosen.parts.join(' ')) }
  }
  const allText = pages.map(page => page.text).join('\n')
  const defaultPoints = allText.match(DEFAULT_POINTS_PATTERN)
  const keptForms = [...new Set(pages.map(page => forms[all.indexOf(page)]).filter(Boolean))]
  return {
    source: 'pdf',
    createdAt: new Date().toISOString(),
    fileKey: pdfFiles.map(file => file.id).join(','),
    pageCount: pages.length,
    totalPageCount: all.length,
    readable: allText.replace(/\s+/g, '').length > 40,
    pages: pagesOut,
    anchors: segments.map(segment => ({ no: segment.no, index: segment.index })),
    questions,
    defaultPoints: defaultPoints ? Number(defaultPoints[1]) : 0,
    // 검사한 쪽의 형 (한 파일에 두 형이 있으면 고른 형 쪽만 검사했으므로 그 형)
    formType: keptForms.length === 1 ? keptForms[0] : '',
    bothForms: oddFound && evenFound,
    checkedPages: oddFound && evenFound ? `${pages[0].index}~${pages.at(-1).index}쪽` : ''
  }
}

/** @brief 쪽 위쪽 20%의 글자 (머리글) */
function headerText(items) {
  return items.filter(item => item.top < 0.2).map(item => item.str).join('').replace(/\s+/g, '')
}

/**
 * @brief 선택과목 쪽인지 판별하는 함수 (선택과목을 고르지 않았거나 못 찾으면 null)
 * - 평가원 문제지는 선택과목 쪽마다 머리글에 "(미적분)"처럼 과목 이름이 괄호로 들어감 → 그 쪽들
 * - 앞 과목 마지막 쪽 아래에 "선택과목(미적분) 문제가 이어집니다" 같은 안내가 있으므로 머리글(위쪽)에서만 찾음
 * - 괄호 머리글이 없으면 과목 이름이 처음 나온 쪽부터
 * @param {string[]} texts - 쪽별 글자 (공백 없앰)
 * @param {string[]} [headers] - 쪽별 머리글 글자
 * @returns {((pageIndex: number) => boolean)|null}
 */
export function electivePageTest(texts, paper, headers = texts) {
  const elective = String(paper.meta?.elective ?? '').replace(/\s+/g, '')
  if (!elective) return null
  const headed = headers.map((text, index) => (text.includes(`(${elective})`) ? index : -1)).filter(index => index >= 0)
  if (headed.length) {
    let best = [headed[0]]
    let run = [headed[0]]
    for (const index of headed.slice(1)) {
      run = index === run.at(-1) + 1 ? [...run, index] : [index]
      if (run.length > best.length) best = run
    }
    const section = new Set(best)
    return index => section.has(index)
  }
  const start = texts.findIndex(text => text.includes(elective))
  return start >= 0 ? index => index >= start : null
}

/**
 * @brief 쪽마다 찾은 문항 번호 중 순서를 거스르는 번호(지문 속 "1. 2." 목록 등)를 뺌
 * - 앞 문항 번호보다 작아지면 문항 번호가 아님. 선택과목 첫 번호(국어 35, 수학 23)로 돌아가는 것만 허용
 */
function filterAnchorSequence(pages, paper) {
  const electiveFirst = Math.min(...paper.questions.filter(question => question.elective).map(question => question.no))
  let lastNo = 0
  for (const page of pages) {
    page.anchors = page.anchors.filter(anchor => {
      const accepted = anchor.no >= lastNo || (anchor.no === electiveFirst && lastNo >= electiveFirst)
      if (accepted) lastNo = anchor.no
      return accepted
    })
  }
}

/** @brief 한 쪽에 인쇄된 형 표시 ('홀수형' | '짝수형' | '') */
function pageFormType(text) {
  const odd = /홀\s*수\s*형/.test(text)
  const even = /짝\s*수\s*형/.test(text)
  return odd === even ? '' : odd ? '홀수형' : '짝수형'
}

/** @brief 형 표시가 없는 쪽은 앞쪽(없으면 뒤쪽)의 형을 이어받음 */
function assignPageForms(pages) {
  const forms = pages.map(page => page.form)
  for (let i = 1; i < forms.length; i += 1) if (!forms[i] && pages[i].fileName === pages[i - 1].fileName) forms[i] = forms[i - 1]
  for (let i = forms.length - 2; i >= 0; i -= 1) if (!forms[i] && pages[i].fileName === pages[i + 1].fileName) forms[i] = forms[i + 1]
  return forms
}
