/**
 * @file demo.js
 * @brief 화면 둘러보기용 예시 데이터
 * @note 예시 모델의 답은 무작위로 만든 가상 데이터입니다(isDemo: true). 실제 AI 성능이 아닙니다.
 */

import { db } from './db.js'
import { createPaper, makeId, buildQuestions } from './schema.js'

/** @brief 재현 가능한 의사난수 */
function seeded(seed) {
  let value = seed
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296
    return value / 4294967296
  }
}

const DEMO_MODELS = [
  // secondsPerQuestion: 가상 수행 시간 (느리고 정확 / 보통 / 빠르고 부정확)
  { name: '예시 모델 A', skill: 0.93, secondsPerQuestion: 5.2 },
  { name: '예시 모델 B', skill: 0.8, secondsPerQuestion: 2.4 },
  { name: '예시 모델 C', skill: 0.62, secondsPerQuestion: 0.9 }
]

function demoPaper(meta, counts, seed) {
  const random = seeded(seed)
  const questions = buildQuestions(counts).map(question => {
    if (question.type === 'choice') return { ...question, answer: String(1 + Math.floor(random() * question.choices)), points: question.no <= 10 ? 3 : 4 }
    if (question.type === 'short') return { ...question, answer: String(2 + Math.floor(random() * 40)), points: 5 }
    return { ...question, answer: '풀이 과정을 근거와 함께 서술', points: 8 }
  })
  const paper = createPaper({ questions })
  paper.meta = { ...paper.meta, ...meta, title: '' }
  paper.isDemo = true
  return paper
}

function demoRuns(paper, seed) {
  const random = seeded(seed)
  return DEMO_MODELS.map(model => {
    const answers = {}
    const essayScores = {}
    for (const question of paper.questions) {
      const hit = random() < model.skill
      if (random() < 0.02) {
        answers[question.no] = { answer: '', status: 'no_answer' }
        continue
      }
      if (question.type === 'choice') {
        const wrong = 1 + ((Number(question.answer) + Math.floor(random() * (question.choices - 1))) % question.choices)
        answers[question.no] = { answer: hit ? question.answer : String(wrong), status: 'answered' }
      } else if (question.type === 'short') {
        answers[question.no] = { answer: hit ? question.answer : String(Number(question.answer) + 1 + Math.floor(random() * 5)), status: 'answered' }
      } else {
        answers[question.no] = { answer: '조건을 정리하면 식이 성립하므로, 답은 위와 같다. (예시 서술)', status: 'answered' }
        essayScores[question.no] = Math.round(question.points * Math.min(1, model.skill + (random() - 0.5) * 0.3))
      }
    }
    return {
      id: makeId('run'),
      paperId: paper.id,
      model: model.name,
      source: 'import',
      isDemo: true,
      createdAt: new Date().toISOString(),
      answers,
      essayScores,
      usage: { inputTokens: 4200 + paper.questions.length * 180, outputTokens: Math.round(paper.questions.length * model.secondsPerQuestion * 55) },
      durationMs: Math.round(paper.questions.length * model.secondsPerQuestion * (0.85 + random() * 0.3) * 1000),
      note: '둘러보기용 가상 데이터'
    }
  })
}

export function buildDemoData() {
  const papers = [
    demoPaper({ schoolLevel: '중등', grade: 2, semester: 1, examType: '중간고사', subject: '수학', schoolName: '예시중학교', durationMin: 45 }, { choiceCount: 18, shortCount: 3, essayCount: 2 }, 11),
    demoPaper({ schoolLevel: '중등', grade: 1, semester: 2, examType: '기말고사', subject: '과학', schoolName: '예시중학교', durationMin: 45 }, { choiceCount: 22, shortCount: 2, essayCount: 1 }, 23),
    demoPaper({ schoolLevel: '초등', grade: 6, semester: 1, examType: '단원평가', subject: '사회', schoolName: '예시초등학교', durationMin: 40 }, { choiceCount: 15, shortCount: 5, essayCount: 0, choices: 4 }, 37)
  ]
  papers[1].cover.theme = 'green'
  papers[2].cover.theme = 'burgundy'
  const runs = papers.flatMap((paper, index) => demoRuns(paper, 100 + index * 17))
  return { papers, runs }
}

/** @brief 예시 데이터를 저장소에 넣고 화면 갱신 */
export async function loadDemo(refresh, notify) {
  const { papers, runs } = buildDemoData()
  for (const paper of papers) await db.savePaper(paper)
  for (const run of runs) await db.saveRun(run)
  await refresh()
  notify?.('예시 평가지 3개를 불러왔습니다.')
}
