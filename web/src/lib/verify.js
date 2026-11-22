/**
 * @file verify.js
 * @brief 교사가 낸 문제지·정답 검증 (배점·총점, 문항 번호, 유형 구성, 객관식 선지, 정답 표기, 쪽 번호)
 *
 * - 문항 구성·정답표만으로 할 수 있는 검사는 늘 실행
 * - 문제지에서 읽은 사실(facts)이 있으면 문제지와 대조하는 검사도 실행
 *   facts는 PDF 글자에서 읽거나(pdfText.extractPaperFacts, 무료) AI가 문제지를 읽어 만듦(aiVerify, 스캔본도 가능)
 * - 결과 항목 수준: error(고쳐야 함) · warn(확인 필요) · ok(통과) · info(안내)
 */

import { choiceList, gradeRun, normalizeChoiceSet } from './grading.js'
import { ELECTIVES, electiveOf, standardPreset } from './presets.js'
import { formTypeOf, roundPoints, usesFormType } from './schema.js'

export const LEVEL_LABEL = { error: '오류', warn: '확인 필요', ok: '통과', info: '안내' }
const LEVEL_RANK = { error: 3, warn: 2, ok: 1, info: 0 }
const CHECK_LETTERS = '가나다라마바사아자차카'

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩'
const circled = no => CIRCLED[no - 1] ?? String(no)
const fmt = value => String(roundPoints(value))
const listNos = nos => nos.slice(0, 12).join(', ') + (nos.length > 12 ? ` 외 ${nos.length - 12}개` : '')

/** @brief 목표 총점: 출제 계획 → 표준 구성 → 100점 */
export function targetTotal(paper) {
  const planned = Number(paper.meta?.plan?.totalPoints)
  if (planned > 0) return planned
  const preset = standardPreset(paper.meta ?? {})
  if (preset) return roundPoints(preset.questions.reduce((sum, question) => sum + question.points, 0))
  return 100
}

/**
 * @brief 짐작값 배점(표준 구성)을 문제지에 인쇄된 [N점] 표시로 맞춤
 * - 인쇄된 배점이 있는 문항은 그 값, 표시 없는 문항은 "표시 없는 문항은 N점" 안내(없으면 2점)를 쓰되
 *   그렇게 해서 총점이 맞을 때만 적용하고, 맞지 않으면 인쇄된 문항만 바꿈
 * @returns {Object|null} 바뀐 평가지 (바꿀 것이 없으면 null)
 */
export function applyPrintedPoints(paper, facts, { force = false } = {}) {
  const printed = new Map(Object.entries(facts?.questions ?? {}).filter(([, fact]) => fact.printedPoints > 0).map(([no, fact]) => [Number(no), fact.printedPoints]))
  // force: 교사가 「문제지 표시대로 배점 고치기」를 누른 경우 - 짐작값이 아닌 배점도 인쇄된 값으로 바꿈
  const changeable = question => force || question.pointsEstimated
  if (!printed.size || !paper.questions.some(changeable)) return null
  const unmarked = facts.defaultPoints || 2
  const pick = (question, fillUnmarked) => {
    if (!changeable(question)) return question.points
    if (printed.has(question.no)) return printed.get(question.no)
    return fillUnmarked && facts.questions?.[question.no] ? unmarked : question.points
  }
  const total = list => roundPoints(list.reduce((sum, value) => sum + (Number(value) || 0), 0))
  const filled = paper.questions.map(question => pick(question, true))
  const values = total(filled) === targetTotal(paper) ? filled : paper.questions.map(question => pick(question, false))
  if (values.every((value, index) => value === paper.questions[index].points)) return null
  return {
    ...paper,
    questions: paper.questions.map((question, index) => (changeable(question) && values[index] !== question.points
      ? { ...question, points: values[index], pointsEstimated: false, pointsFromPaper: true }
      : question))
  }
}

/** @brief PDF에서 읽은 사실과 AI가 읽은 사실 합치기 (문항 정보는 AI 우선, 쪽 번호는 PDF 우선) */
export function mergeFacts(pdf, ai) {
  const pdfUsable = pdf?.readable && Object.keys(pdf.questions ?? {}).length > 0
  if (!ai) return pdfUsable ? pdf : null
  if (!pdfUsable) return ai
  const pdfPagesFound = (pdf.pages ?? []).some(page => page.candidates?.length)
  return {
    ...pdf,
    source: 'pdf+ai',
    questions: { ...pdf.questions, ...ai.questions },
    anchors: Object.keys(pdf.questions).length >= Object.keys(ai.questions).length * 0.8 ? pdf.anchors : ai.anchors,
    pages: pdfPagesFound ? pdf.pages : ai.pages,
    formType: pdf.formType || ai.formType || '',
    bothForms: Boolean(pdf.bothForms),
    checkedPages: pdf.checkedPages ?? '',
    notes: ai.notes ?? [],
    defaultPoints: pdf.defaultPoints || ai.defaultPoints || 0
  }
}

function makeCheck(id, letter, title, description, items) {
  const status = items.reduce((worst, item) => (LEVEL_RANK[item.level] > LEVEL_RANK[worst] ? item.level : worst), 'info')
  return { id, letter, title, description, items, status }
}

/* ───── 배점 합계와 총점, 문제지 배점 표시 ───── */
function checkPoints(paper, facts) {
  const items = []
  const target = targetTotal(paper)
  for (const question of paper.questions) {
    const points = Number(question.points)
    if (!Number.isFinite(points) || points <= 0) items.push({ level: 'error', no: question.no, text: `${question.no}번 배점이 비어 있거나 0점입니다.` })
  }
  const fromPaper = paper.questions.filter(question => question.pointsFromPaper).length
  if (fromPaper) items.push({ level: 'info', text: `배점을 문제지의 [N점] 표시대로 맞췄습니다 (${fromPaper}문항).` })
  const sum = roundPoints(paper.questions.reduce((total, question) => total + (Number(question.points) || 0), 0))
  if (sum === target) items.push({ level: 'ok', text: `배점 합계 ${fmt(sum)}점이 총점 ${fmt(target)}점과 일치합니다.` })
  else items.push({ level: 'error', text: `배점 합계 ${fmt(sum)}점이 총점 ${fmt(target)}점과 ${fmt(Math.abs(target - sum))}점 ${sum > target ? '많습니다' : '모자랍니다'}.` })

  if (facts) {
    let compared = 0
    for (const question of paper.questions) {
      const fact = facts.questions?.[question.no]
      if (!fact) continue
      const printed = fact.printedPoints || 0
      if (printed > 0) {
        compared += 1
        if (printed !== Number(question.points)) items.push({ level: question.pointsEstimated ? 'warn' : 'error', no: question.no, text: `${question.no}번: 문제지에는 [${fmt(printed)}점]인데 ${question.pointsEstimated ? '표준 구성 짐작 배점은' : '입력한 배점은'} ${fmt(question.points)}점입니다.` })
      } else if (facts.defaultPoints > 0 && Number(question.points) !== facts.defaultPoints) {
        compared += 1
        items.push({ level: 'warn', no: question.no, text: `${question.no}번: 배점 표시가 없어 ${fmt(facts.defaultPoints)}점 문항으로 보이는데 입력한 배점은 ${fmt(question.points)}점입니다.` })
      }
    }
    if (compared && !items.some(item => item.no && item.level !== 'ok' && /문제지|표시/.test(item.text))) {
      items.push({ level: 'ok', text: `문제지의 배점 표시 ${compared}문항이 입력한 배점과 같습니다.` })
    }
  }
  return makeCheck('points', '나', '배점 합계와 총점', '모든 문항 배점의 합이 총점과 정확히 같은지, 문제지에 인쇄된 [N점] 표시와 입력한 배점이 같은지 봅니다.', items)
}

/** @brief 번호 목록에서 중복과 빠진 번호 */
function numberingIssues(nos) {
  const counts = new Map()
  for (const no of nos) counts.set(no, (counts.get(no) ?? 0) + 1)
  const duplicates = [...counts].filter(([, count]) => count > 1).map(([no]) => no).sort((a, b) => a - b)
  const unique = [...counts.keys()].sort((a, b) => a - b)
  const gaps = []
  let previous = 0
  for (const no of unique) {
    if (no > previous + 1) gaps.push({ after: previous, next: no, missing: Array.from({ length: no - previous - 1 }, (_, i) => previous + 1 + i) })
    previous = no
  }
  return { duplicates, gaps }
}

const gapText = (gap, where) => (gap.after === 0
  ? `${where} ${gap.next}번부터 시작합니다 (${listNos(gap.missing)}번 없음).`
  : `${where} ${gap.after}번 다음이 ${gap.next}번입니다 (${listNos(gap.missing)}번 없음).`)

/* ───── 문항 번호 누락·중복 ───── */
function checkNumbering(paper, facts) {
  const items = []
  const own = numberingIssues(paper.questions.map(question => question.no))
  for (const no of own.duplicates) items.push({ level: 'error', no, text: `문항 구성에 ${no}번이 두 번 이상 있습니다.` })
  for (const gap of own.gaps) items.push({ level: 'error', no: gap.missing[0], text: gapText(gap, '문항 구성에서') })

  const source = paper.answerKeySource
  if (source?.nos?.length) {
    for (const no of source.duplicateNos ?? []) items.push({ level: 'error', no, text: `올린 정답표(${source.fileName || '정답표'})에 ${no}번이 두 번 이상 적혀 있습니다. 마지막 값이 반영됐습니다.` })
    for (const gap of numberingIssues(source.nos).gaps) items.push({ level: 'error', no: gap.missing[0], text: gapText(gap, '정답표에서') })
  }

  if (facts?.anchors?.length) {
    const paperNos = new Set(paper.questions.map(question => question.no))
    const foundNos = new Set(facts.anchors.map(anchor => anchor.no))
    // 번호 사이가 건너뛴 곳은 아래에서 따로 알리므로, 문제지 맨 끝 등에서 빠진 번호만 따로 알림
    const maxFound = Math.max(...foundNos)
    const minFound = Math.min(...foundNos)
    const notFoundAll = paper.questions.filter(question => !foundNos.has(question.no)).map(question => question.no)
    const notFound = notFoundAll.filter(no => no > maxFound || no < minFound)
    if (notFoundAll.length > paper.questions.length / 2) {
      items.push({ level: 'info', text: `문제지에서 문항 번호를 ${foundNos.size}개만 읽었습니다. 스캔본·특수 글꼴이면 'AI 정밀 검증'으로 확인하세요.` })
    } else {
      if (notFound.length) items.push({ level: 'warn', no: notFound[0], text: `문제지에서 ${listNos(notFound)}번을 찾지 못했습니다. 번호가 빠졌는지 확인하세요.` })
      const extra = [...foundNos].filter(no => !paperNos.has(no)).sort((a, b) => a - b)
      if (extra.length) items.push({ level: 'error', no: extra[0], text: `문제지에는 ${listNos(extra)}번이 있는데 정답·문항 구성에는 없습니다.` })
      // 읽는 순서대로 번호가 건너뛰는 곳 (선택과목처럼 번호가 다시 작아지는 것은 정상)
      for (let index = 1; index < facts.anchors.length; index += 1) {
        const previous = facts.anchors[index - 1].no
        const next = facts.anchors[index].no
        if (next <= previous + 1) continue
        const skipped = Array.from({ length: next - previous - 1 }, (_, i) => previous + 1 + i)
        if (skipped.every(no => !foundNos.has(no))) items.push({ level: 'error', no: skipped[0], text: `문제지에서 ${previous}번 다음에 ${next}번이 나옵니다 (${listNos(skipped)}번 없음).` })
        else items.push({ level: 'warn', no: next, text: `문제지에서 ${previous}번 다음에 ${next}번이 나옵니다. 번호 순서를 확인하세요.` })
      }
      // 같은 번호가 여러 번 (선택과목 문항은 과목 수만큼 나와도 정상)
      const electiveCount = ELECTIVES[paper.meta?.subject]?.length ?? 1
      const byNo = new Map()
      for (const anchor of facts.anchors) {
        if (!byNo.has(anchor.no)) byNo.set(anchor.no, [])
        byNo.get(anchor.no).push(anchor.index)
      }
      for (const [no, pages] of [...byNo].sort((a, b) => a[0] - b[0])) {
        const question = paper.questions.find(item => item.no === no)
        const allowed = question?.elective ? electiveCount : 1
        if (pages.length > allowed) items.push({ level: 'warn', no, text: `문제지에 ${no}번이 ${pages.length}번 나옵니다 (${pages.map(page => `${page}쪽`).join(', ')}). 번호가 중복됐는지 확인하세요.` })
      }
    }
  }
  if (!items.some(item => item.level === 'error' || item.level === 'warn')) {
    items.push({ level: 'ok', text: `1번부터 ${paper.questions.length}번까지 빠지거나 겹친 번호가 없습니다${facts?.anchors?.length ? ' (문제지와 대조함)' : ''}.` })
  }
  return makeCheck('numbering', '다', '문항 번호 누락·중복', '12번 다음 14번처럼 빠진 번호나, 같은 번호가 두 번 나오는 경우를 문항 구성·정답표·문제지에서 찾습니다.', items)
}

/** @brief 선택형·서답형 문항 수와 배점 */
export function composition(questions) {
  const choice = questions.filter(question => question.type === 'choice')
  const written = questions.filter(question => question.type !== 'choice')
  const sum = list => roundPoints(list.reduce((total, question) => total + (Number(question.points) || 0), 0))
  return { choiceCount: choice.length, writtenCount: written.length, choicePoints: sum(choice), writtenPoints: sum(written), totalPoints: sum(questions) }
}

/* ───── 선택형·서답형 문항 수와 배점 비율 ───── */
function checkComposition(paper) {
  const items = []
  const actual = composition(paper.questions)
  const ratio = actual.totalPoints ? Math.round((actual.choicePoints / actual.totalPoints) * 100) : 0
  items.push({ level: 'info', text: `선택형 ${actual.choiceCount}문항 ${fmt(actual.choicePoints)}점(${ratio}%) · 서답형 ${actual.writtenCount}문항 ${fmt(actual.writtenPoints)}점(${100 - ratio}%)` })

  const plan = paper.meta?.plan ?? {}
  const planned = ['choiceCount', 'writtenCount', 'choicePoints', 'writtenPoints'].filter(key => plan[key] !== '' && plan[key] != null && Number.isFinite(Number(plan[key])))
  const label = { choiceCount: ['선택형 문항 수', '문항'], writtenCount: ['서답형 문항 수', '문항'], choicePoints: ['선택형 배점', '점'], writtenPoints: ['서답형 배점', '점'] }
  if (planned.length) {
    for (const key of planned) {
      const want = Number(plan[key])
      const [name, unit] = label[key]
      if (want === actual[key]) items.push({ level: 'ok', text: `${name}: 계획 ${fmt(want)}${unit}과 같습니다.` })
      else items.push({ level: 'error', text: `${name}: 계획은 ${fmt(want)}${unit}인데 실제는 ${fmt(actual[key])}${unit}입니다.` })
    }
  } else {
    const preset = standardPreset(paper.meta ?? {})
    if (preset) {
      const standard = composition(preset.questions)
      const same = standard.choiceCount === actual.choiceCount && standard.writtenCount === actual.writtenCount
      items.push(same
        ? { level: 'ok', text: `${paper.meta.examType} 표준 구성(선택형 ${standard.choiceCount} · 서답형 ${standard.writtenCount})과 같습니다.` }
        : { level: 'warn', text: `${paper.meta.examType} 표준 구성은 선택형 ${standard.choiceCount} · 서답형 ${standard.writtenCount}문항인데 입력한 구성은 ${actual.choiceCount} · ${actual.writtenCount}문항입니다.` })
    } else {
      items.push({ level: 'info', text: '아래 「출제 계획」에 계획한 문항 수와 배점을 넣으면 실제 구성과 대조합니다.' })
    }
  }
  return makeCheck('composition', '라', '선택형·서답형 구성', '선택형(객관식)과 서답형(단답·서술) 문항 수와 배점 비율이 출제 계획과 맞는지 대조합니다.', items)
}

// 수식 글꼴 등으로 읽히지 않는 글자(사용자 정의·제어 문자)는 지우고, 글자나 숫자가 하나도 없으면 비교하지 않음
const normalizeOption = text => {
  const cleaned = String(text ?? '').normalize('NFKC').replace(/[\p{Co}\p{Cc}\p{Cf}\s]+/gu, '').replace(/[.,]$/, '')
  return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : ''
}

/* ───── 객관식 선지 번호와 중복 내용 ───── */
function checkOptions(paper, facts) {
  const items = []
  const choices = paper.questions.filter(question => question.type === 'choice')
  if (!choices.length) return makeCheck('options', '마', '객관식 선지', '', [{ level: 'info', text: '객관식 문항이 없습니다.' }])
  if (!facts) {
    return makeCheck('options', '마', '객관식 선지', '객관식마다 선지 번호(①~⑤)가 빠짐없이 있는지, 선지 내용이 겹치지 않는지 봅니다.', [{ level: 'info', text: '문제지(PDF)를 올리면 선지를 확인합니다. 스캔본·사진은 「AI 정밀 검증」을 쓰세요.' }])
  }
  const unread = []
  let checked = 0
  for (const question of choices) {
    const fact = facts.questions?.[question.no]
    if (!fact || !fact.marks?.length) { unread.push(question.no); continue }
    checked += 1
    const expected = Array.from({ length: question.choices || 5 }, (_, i) => i + 1)
    const missing = expected.filter(mark => !fact.marks.includes(mark))
    const counts = new Map()
    for (const mark of fact.marks) counts.set(mark, (counts.get(mark) ?? 0) + 1)
    const repeated = [...counts].filter(([, count]) => count > 1).map(([mark]) => mark)
    const extra = [...counts.keys()].filter(mark => mark > expected.length)
    if (missing.length) items.push({ level: 'error', no: question.no, text: `${question.no}번: 선지 ${missing.map(circled).join('')}이(가) 없습니다 (${fact.marks.length}개만 있음).` })
    if (repeated.length) items.push({ level: 'error', no: question.no, text: `${question.no}번: 선지 번호 ${repeated.map(circled).join('')}이(가) 두 번 이상 나옵니다.` })
    if (extra.length) items.push({ level: 'warn', no: question.no, text: `${question.no}번: ${expected.length}지선다인데 선지 ${extra.map(circled).join('')}이(가) 있습니다.` })
    // 선지 내용 중복 (그림 선지처럼 글자가 없는 선지는 제외)
    const seen = new Map()
    fact.marks.forEach((mark, index) => {
      const text = normalizeOption(fact.options?.[index])
      if (!text) return
      if (seen.has(text) && seen.get(text) !== mark) items.push({ level: 'error', no: question.no, text: `${question.no}번: 선지 ${circled(seen.get(text))}와 ${circled(mark)}의 내용이 같습니다 ('${String(fact.options[index]).slice(0, 30)}').` })
      else seen.set(text, mark)
    })
  }
  if (unread.length === choices.length) {
    items.push({ level: 'info', text: '문제지에서 선지 번호를 글자로 읽지 못했습니다 (그림·스캔·특수 글꼴). 「AI 정밀 검증」을 쓰세요.' })
  } else if (unread.length) {
    items.push({ level: 'info', text: `${listNos(unread)}번은 선지를 읽지 못해 확인하지 못했습니다.` })
  }
  if (checked && !items.some(item => item.level === 'error' || item.level === 'warn')) {
    items.push({ level: 'ok', text: `객관식 ${checked}문항의 선지 번호가 빠짐없고 내용이 겹치지 않습니다.` })
  }
  return makeCheck('options', '마', '객관식 선지', '객관식마다 선지 번호(①~⑤)가 빠짐없이 있는지, 선지 내용이 겹치지 않는지 봅니다.', items)
}

/* ───── 정답 표기 오류 ───── */
function checkAnswers(paper, facts) {
  const items = []
  const standard = standardPreset(paper.meta ?? {})
  const missing = []
  for (const question of paper.questions) {
    const raw = String(question.answer ?? '').trim()
    if (question.type === 'essay') continue
    if (!raw) { missing.push(question.no); continue }
    if (question.type === 'choice') {
      const list = choiceList(raw)
      const limit = question.choices || 5
      if (!list.length) { items.push({ level: 'error', no: question.no, text: `${question.no}번: 정답 '${raw}'을(를) 선지 번호로 읽을 수 없습니다.` }); continue }
      const outside = list.filter(mark => mark > limit)
      if (outside.length) items.push({ level: 'error', no: question.no, text: `${question.no}번: 정답 ${outside.join(', ')}번은 ${limit}지선다 범위를 벗어납니다.` })
      const fact = facts?.questions?.[question.no]
      const shown = list.map(circled).join('')
      if (fact?.asksMultiple) {
        if (fact.multipleCount && list.length !== fact.multipleCount) items.push({ level: 'error', no: question.no, text: `${question.no}번: ${fact.multipleCount}개를 고르는 문항인데 정답이 ${list.length}개(${shown})입니다.` })
        else if (list.length === 1) items.push({ level: 'error', no: question.no, text: `${question.no}번: '모두 고르시오' 문항인데 정답이 하나(${shown})뿐입니다. 정답이 정말 하나인지 확인하세요.` })
      } else if (list.length > 1) {
        items.push(fact
          ? { level: 'error', no: question.no, text: `${question.no}번: 하나만 고르는 문항인데 정답이 ${list.length}개(${shown})입니다.` }
          : { level: 'warn', no: question.no, text: `${question.no}번: 정답이 ${list.length}개(${shown})입니다. 복수 선택 문항이 맞는지 확인하세요.` })
      }
    } else if (question.type === 'short' && standard && paper.meta?.subject === '수학') {
      const candidates = raw.split('|').map(item => item.trim())
      if (!candidates.every(item => /^\d{1,3}$/.test(item))) items.push({ level: 'warn', no: question.no, text: `${question.no}번: 수능형 수학 단답형 정답은 0~999 정수인데 '${raw}'입니다.` })
    }
  }
  if (missing.length) items.push({ level: 'error', no: missing[0], text: `정답이 없는 문항: ${listNos(missing)}번` })
  const multiWithoutFacts = !facts && paper.questions.some(question => question.type === 'choice' && choiceList(question.answer).length > 1)
  if (!facts && !multiWithoutFacts) items.push({ level: 'info', text: '문제지를 읽으면 「모두 고르시오」 같은 복수 선택 문항과 정답 개수도 대조합니다.' })
  if (!items.some(item => item.level === 'error' || item.level === 'warn')) {
    items.push({ level: 'ok', text: `정답 ${paper.questions.filter(question => question.type !== 'essay').length}문항의 표기에 문제가 없습니다.` })
  }
  return makeCheck('answers', '바', '정답 표기', '단일 선택 문항에 정답이 2개이거나, 「모두 고르시오」 문항에 정답이 1개인 경우, 범위를 벗어난 정답, 빠진 정답을 찾습니다.', items)
}

/**
 * @brief 쪽 번호 분석: 가장 많은 쪽이 따르는 "인쇄 번호 = 쪽 순서 + 차이" 규칙을 찾고 어긋난 쪽을 찾음
 * @param {Array<{ index, fileName, page, candidates: Array<{ value, total, slot }> }>} pages
 */
export function analyzePageNumbers(pages) {
  const results = []
  const byFile = new Map()
  for (const page of pages) {
    if (!byFile.has(page.fileName)) byFile.set(page.fileName, [])
    byFile.get(page.fileName).push(page)
  }
  for (const [fileName, list] of byFile) {
    const support = new Map()
    for (const page of list) {
      const seen = new Set()
      for (const candidate of page.candidates ?? []) {
        const key = `${candidate.slot}|${candidate.value - page.page}`
        if (seen.has(key)) continue
        seen.add(key)
        support.set(key, (support.get(key) ?? 0) + 1)
      }
    }
    const withCandidates = list.filter(page => page.candidates?.length).length
    const best = [...support].sort((a, b) => b[1] - a[1])[0]
    let rule = best && (best[1] >= 2 || list.length === 1) && best[1] >= Math.ceil(withCandidates * 0.5) ? best[0] : null
    if (!rule) {
      // 규칙을 따르는 쪽이 적으면(예: 2쪽짜리에서 1, 3): 여러 쪽에 같은 자리에 번호가 있으면 첫 번호를 기준으로 봄
      const slotPages = new Map()
      for (const page of list) for (const slot of new Set((page.candidates ?? []).map(candidate => candidate.slot))) slotPages.set(slot, [...(slotPages.get(slot) ?? []), page])
      const [slot, pagesInSlot] = [...slotPages].sort((a, b) => b[1].length - a[1].length)[0] ?? []
      if (slot && pagesInSlot.length >= 2 && pagesInSlot.length >= Math.ceil(list.length * 0.5)) {
        const first = pagesInSlot[0]
        rule = `${slot}|${first.candidates.find(candidate => candidate.slot === slot).value - first.page}`
      }
    }
    if (!rule) { results.push({ fileName, readable: false, pageCount: list.length }); continue }
    const [slot, offsetText] = rule.split('|')
    const offset = Number(offsetText)
    const pagesResult = list.map(page => {
      const inSlot = (page.candidates ?? []).filter(candidate => candidate.slot === slot)
      const match = inSlot.find(candidate => candidate.value === page.page + offset)
      return { index: page.index, page: page.page, expected: page.page + offset, printed: match ? match.value : inSlot[0]?.value ?? null, total: (match ?? inSlot[0])?.total ?? 0 }
    })
    results.push({ fileName, readable: true, slot, offset, pageCount: list.length, pages: pagesResult })
  }
  return results
}

/* ───── 홀수형·짝수형 (수능·모의평가·모의고사) ───── */
function checkFormType(paper, facts) {
  const items = []
  const form = formTypeOf(paper.meta)
  if (!paper.meta?.formType) items.push({ level: 'info', text: `문제지 형을 고르지 않아 ${form}으로 봅니다. 표지 옵션에서 확인하세요.` })
  if (facts?.formType) {
    if (facts.formType === form) items.push({ level: 'ok', text: `문제지에 인쇄된 형(${facts.formType})과 설정한 형이 같습니다.` })
    else items.push({ level: 'error', text: `문제지는 ${facts.formType}인데 평가지는 ${form}으로 설정돼 있습니다. 표지 옵션에서 형을 바꾸거나 맞는 문제지를 올리세요.` })
    if (facts.bothForms) items.push({ level: 'info', text: `문제지 파일에 홀수형과 짝수형이 함께 있어 ${form} 쪽(${facts.checkedPages})만 검사했습니다. AI 풀이도 ${form} 쪽을 풉니다.` })
  } else if (facts) {
    items.push({ level: 'info', text: '문제지에서 홀수형·짝수형 표시를 읽지 못했습니다.' })
  }
  const keyForm = paper.answerKeySource?.formType
  if (keyForm) {
    if (keyForm === form) items.push({ level: 'ok', text: `정답표도 ${keyForm} 기준입니다.` })
    else items.push({ level: 'error', text: `정답표는 ${keyForm} 기준인데 평가지는 ${form}입니다. 같은 형의 정답표를 다시 반영하세요.` })
  } else if (paper.answerKeySource?.type === 'upload') {
    items.push({ level: 'info', text: `올린 정답표에서 형을 알 수 없었습니다. ${form} 정답표인지 확인하세요.` })
  }
  return makeCheck('form', '', '홀수형·짝수형', `수능형 문제지는 형마다 선지 배열이 달라 정답이 다릅니다. 문제지·정답표·설정한 형(${form})이 같은지 봅니다.`, items)
}

/* ───── 문제지 쪽 번호 ───── */
function checkPages(paper, facts) {
  const items = []
  if (!facts?.pages?.length) {
    return makeCheck('pages', '사', '문제지 쪽 번호', '문제지 쪽 번호가 순서대로 매겨졌는지, 빠지거나 겹친 쪽이 없는지 봅니다.', [{ level: 'info', text: '문제지(PDF)를 올리면 쪽 번호를 확인합니다.' }])
  }
  for (const file of analyzePageNumbers(facts.pages)) {
    if (!file.readable) {
      if (file.pageCount > 1) items.push({ level: 'info', text: `${file.fileName}: 쪽 번호를 읽지 못했습니다. 스캔본이면 「AI 정밀 검증」을 쓰세요.` })
      continue
    }
    let wrong = 0
    for (const page of file.pages) {
      if (page.printed === page.expected) continue
      if (page.printed == null) {
        // 표지(첫 쪽)는 쪽 번호가 없어도 정상
        if (page.page === 1 && file.offset < 0) continue
        items.push({ level: 'warn', text: `${file.fileName} ${page.page}번째 쪽에서 쪽 번호를 찾지 못했습니다 (${page.expected}쪽이어야 함).` })
      } else {
        wrong += 1
        items.push({ level: 'error', text: `${file.fileName} ${page.page}번째 쪽에 인쇄된 쪽 번호가 ${page.printed}입니다 (${page.expected}이어야 함).` })
      }
    }
    const totals = [...new Set(file.pages.map(page => page.total).filter(Boolean))]
    const lastExpected = file.pages.at(-1).expected
    for (const total of totals) {
      if (total !== lastExpected) items.push({ level: 'error', text: `${file.fileName}: 쪽 번호에 전체 ${total}쪽으로 적혀 있는데 실제로는 ${lastExpected}쪽까지 있습니다.` })
    }
    if (!wrong && !items.some(item => item.text.startsWith(file.fileName))) items.push({ level: 'ok', text: `${file.fileName}: 쪽 번호 ${file.pages[0].expected}~${lastExpected}쪽이 순서대로 매겨져 있습니다.` })
  }
  if (!items.length) items.push({ level: 'info', text: '한 쪽짜리 문제지이거나 쪽 번호가 없습니다.' })
  return makeCheck('pages', '사', '문제지 쪽 번호', '문제지 쪽 번호가 순서대로 매겨졌는지, 빠지거나 겹친 쪽이 없는지 봅니다.', items)
}

/* ───── AI 풀이와 정답 대조 (정답 오류 의심 문항) ───── */
function checkAgainstRuns(paper, runs) {
  const items = []
  const usable = (runs ?? []).filter(run => !run.isDemo)
  if (!usable.length) {
    return makeCheck('ai', '아', 'AI 풀이와 정답 대조', 'AI가 푼 답과 정답이 다르면 정답 오류일 수도 있어 다시 확인하도록 알려 줍니다.', [{ level: 'info', text: 'AI 풀이를 하면 AI의 답과 정답을 대조해 정답 오류가 의심되는 문항을 알려 줍니다.' }])
  }
  const graded = usable.map(run => gradeRun(paper, run))
  for (const question of paper.questions) {
    if (question.type === 'essay' || !String(question.answer ?? '').trim()) continue
    const cells = graded.map(result => result.items.find(item => item.no === question.no)).filter(item => item && item.status === 'answered')
    if (!cells.length || cells.some(item => item.correct)) continue
    const answers = [...new Set(cells.map(item => (question.type === 'choice' ? normalizeChoiceSet(item.given) : String(item.given).trim())))]
    const expected = question.type === 'choice' ? choiceList(question.answer).map(circled).join('') : question.answer
    const given = question.type === 'choice' ? answers[0].split(',').map(Number).map(circled).join('') : answers[0]
    items.push(answers.length === 1
      ? { level: 'warn', no: question.no, text: `${question.no}번: AI 풀이 ${cells.length}건이 모두 ${given}을(를) 답했습니다 (정답 ${expected}). 정답이 맞는지 다시 확인하세요.` }
      : { level: 'info', no: question.no, text: `${question.no}번: AI 풀이 ${cells.length}건이 모두 틀렸습니다 (정답 ${expected}). 어렵거나 문제가 모호할 수 있습니다.` })
  }
  if (!items.length) items.push({ level: 'ok', text: `AI 풀이 ${usable.length}건과 대조해 정답 오류가 의심되는 문항이 없습니다.` })
  return makeCheck('ai', '아', 'AI 풀이와 정답 대조', 'AI가 푼 답과 정답이 다르면 정답 오류일 수도 있어 다시 확인하도록 알려 줍니다.', items)
}

/**
 * @brief 평가지 전체 검증
 * @param {Object} paper
 * @param {{ facts?: Object|null, runs?: Array }} [options] - facts: mergeFacts 결과
 * @returns {{ checks: Array, counts: { error, warn, ok, info }, status: 'error'|'warn'|'ok', factsSource: string|null }}
 */
export function validatePaper(paper, { facts = null, runs = [] } = {}) {
  const checks = [
    checkPoints(paper, facts),
    checkNumbering(paper, facts),
    checkComposition(paper),
    checkOptions(paper, facts),
    checkAnswers(paper, facts),
    ...(usesFormType(paper.meta) ? [checkFormType(paper, facts)] : []),
    checkPages(paper, facts),
    checkAgainstRuns(paper, runs),
    ...(facts?.notes?.length ? [makeCheck('notes', '', 'AI 검토 의견', 'AI가 문제지를 읽으며 눈에 띈 인쇄 오류·오탈자 등입니다. 직접 확인하세요.', facts.notes.map(text => ({ level: 'warn', text })))] : [])
  ]
  // 항목 기호는 화면에 나오는 순서대로 가, 나, 다 …
  checks.forEach((check, index) => { check.letter = CHECK_LETTERS[index] ?? String(index + 1) })
  const counts = { error: 0, warn: 0, ok: 0, info: 0 }
  for (const check of checks) for (const item of check.items) counts[item.level] += 1
  const status = counts.error ? 'error' : counts.warn ? 'warn' : 'ok'
  return { checks, counts, status, factsSource: facts?.source ?? null, elective: electiveOf(paper) }
}

/** @brief 저장된 검증 정보로 검증 (대시보드·목록용, 문제지를 다시 읽지 않음) */
/** @brief 상태별 검증 항목 수 (화면 요약용 - 항목 안의 줄 수가 아니라 검증 항목 수) */
export function checkCounts(result) {
  const counts = { error: 0, warn: 0, ok: 0, info: 0 }
  for (const check of result.checks) counts[check.status] += 1
  return counts
}

export function validateStored(paper, runs = []) {
  return validatePaper(paper, { facts: mergeFacts(paper.verification?.pdf ?? null, paper.verification?.ai ?? null), runs })
}
