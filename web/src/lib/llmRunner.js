/**
 * @file llmRunner.js
 * @brief Claude 외 LLM으로 문제지 전체를 한 번에 풀기
 * - 회사마다 받는 파일 형식이 달라, 문제지 쪽을 모두 그림으로 바꿔 보냄
 * - 한 PDF에 홀수형·짝수형이 함께 있으면 평가지의 형 쪽만 보냄
 */

import { ANSWER_SCHEMA, SYSTEM_PROMPT, describeQuestions, parseAnswers } from './aiRunner.js'
import { blobToBase64 } from './db.js'
import { askProvider, providerOf } from './llmProviders.js'
import { openPdf } from './pdfRender.js'
import { buildQuestionIndex } from './pdfText.js'
import { electiveNote, formNote } from './presets.js'
import { makeId } from './schema.js'

/** 그림의 긴 변 (작은 글씨·수식을 읽을 수 있는 크기) */
const LONG_SIDE = 1800
const MAX_PAGES = 60
const MAX_IMAGE_CHARS = 18 * 1024 * 1024

const JSON_NOTE = '반드시 다음 모양의 JSON 하나만 출력하세요: {"answers":[{"no":1,"answer":"3"}]}'

/** @brief 문제지 파일들을 쪽별 그림으로 */
export async function filesToImages(files, paper) {
  const images = []
  for (const file of files) {
    if (file.type !== 'application/pdf') {
      images.push({ mime: file.type, data: await blobToBase64(file.blob) })
      continue
    }
    const pdf = await openPdf(file)
    const index = await buildQuestionIndex(file, paper).catch(() => null)
    const pages = index?.found && index.pageNumbers?.length ? index.pageNumbers : Array.from({ length: pdf.numPages }, (_, i) => i + 1)
    if (images.length + pages.length > MAX_PAGES) throw new Error(`문제지가 ${MAX_PAGES}쪽을 넘습니다. 필요한 쪽만 남겨 다시 올려 주세요.`)
    for (const number of pages) {
      const page = await pdf.getPage(number)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: LONG_SIDE / Math.max(base.width, base.height) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      // intent 'print': 다른 탭을 보는 동안에도 그리기가 멈추지 않음 (기본값은 화면이 보일 때만 그림)
      await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport, intent: 'print' }).promise
      images.push({ mime: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.8).split(',')[1] })
    }
  }
  if (images.reduce((sum, image) => sum + image.data.length, 0) > MAX_IMAGE_CHARS) throw new Error('문제지 그림이 너무 큽니다. 필요한 쪽만 남겨 다시 올려 주세요.')
  return images
}

/**
 * @brief 등록한 LLM으로 평가지 풀이
 * @returns {Promise<Object>} 풀이 기록(Run)
 */
export async function runLlmOnPaper({ providerId, apiKey, model, paper, files, signal, shared = {} }) {
  if (!apiKey) throw new Error(`${providerOf(providerId)?.label ?? ''} API 키를 먼저 입력하세요.`)
  if (!files?.length) throw new Error('문제지 파일이 없습니다. 먼저 문제지를 업로드하세요.')
  shared.images ??= filesToImages(files, paper)
  const images = await shared.images
  signal?.throwIfAborted()
  const started = performance.now()
  const result = await askProvider(providerId, apiKey, {
    model,
    system: `${SYSTEM_PROMPT}\n${JSON_NOTE}`,
    text: `문항 구성:\n${describeQuestions(paper)}\n\n위 ${paper.questions.length}개 문항의 답을 모두 제출하세요. ${formNote(paper)} ${electiveNote(paper)}`,
    images,
    schema: ANSWER_SCHEMA,
    signal
  })
  return {
    id: makeId('run'),
    paperId: paper.id,
    model,
    modelId: result.modelId || model,
    provider: providerId,
    source: 'ai',
    isDemo: false,
    createdAt: new Date().toISOString(),
    answers: parseAnswers(result.text, paper),
    essayScores: {},
    usage: result.usage,
    durationMs: Math.round(performance.now() - started),
    note: result.truncated ? '출력 한도에 걸려 일부 답이 잘렸을 수 있습니다.' : ''
  }
}
