import test from 'node:test'
import assert from 'node:assert/strict'
import { PROVIDERS, askProvider, listModels, providerError } from '../src/lib/llmProviders.js'
import { ANSWER_SCHEMA, parseAnswers } from '../src/lib/aiRunner.js'
import { buildQuestions, createPaper } from '../src/lib/schema.js'

const KEY = 'test-key-1234567890'
const ANSWERS = '{"answers":[{"no":1,"answer":"3"},{"no":2,"answer":"12"}]}'
const REPLIES = {
  openai: { status: 'completed', model: 'm', output: [{ type: 'reasoning' }, { content: [{ type: 'output_text', text: ANSWERS }] }], usage: { input_tokens: 5, output_tokens: 7 } },
  gemini: { candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: '생각' }, { text: ANSWERS }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 4, thoughtsTokenCount: 3 } },
  xai: { model: 'm', choices: [{ finish_reason: 'stop', message: { content: '```json\n' + ANSWERS + '\n```' } }], usage: { prompt_tokens: 5, completion_tokens: 7 } }
}
REPLIES.openrouter = REPLIES.xai

function stub(reply, status = 200) {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), headers: init.headers, body: init.body ? JSON.parse(init.body) : null })
    return new Response(JSON.stringify(typeof reply === 'function' ? reply(String(url)) : reply), { status })
  }
  return calls
}

test('회사별 풀이 요청과 답 읽기', async () => {
  const paper = createPaper({ questions: buildQuestions({ choiceCount: 1, shortCount: 1 }) })
  for (const provider of PROVIDERS.filter(item => item.solveUrl)) {
    const calls = stub(REPLIES[provider.id])
    const result = await askProvider(provider.id, KEY, { model: 'model-x', system: 's', text: 't', images: [{ mime: 'image/jpeg', data: 'QUJD' }], schema: ANSWER_SCHEMA })
    const answers = parseAnswers(result.text, paper)
    assert.deepEqual([answers[1].answer, answers[2].answer], ['3', '12'], provider.id)
    assert.equal(result.usage.outputTokens, 7, provider.id)
    assert.ok(!calls[0].url.includes(KEY), '키를 주소에 넣지 않음')
    assert.ok(Object.values(calls[0].headers).some(value => value.includes(KEY)))
    assert.ok(JSON.stringify(calls[0].body).includes('QUJD'))
  }
})

test('모델 목록은 문제를 풀 수 있는 모델만', async () => {
  stub({ data: [{ id: 'gpt-a', created: 1 }, { id: 'gpt-b', created: 2 }, { id: 'text-embedding-3', created: 3 }, { id: 'gpt-realtime', created: 4 }] })
  assert.deepEqual(await listModels('openai', KEY), ['gpt-b', 'gpt-a'])
  stub({ models: [{ name: 'models/gemini-a', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-embedding', supportedGenerationMethods: ['embedContent'] }] })
  assert.deepEqual(await listModels('gemini', KEY), ['gemini-a'])
  const calls = stub(url => (url.endsWith('/key') ? { data: {} } : { data: [{ id: 'x/see', architecture: { input_modalities: ['text', 'image'] } }, { id: 'x/text', architecture: { input_modalities: ['text'] } }] }))
  assert.deepEqual(await listModels('openrouter', KEY), ['x/see'])
  assert.equal(calls.length, 2, '키를 먼저 확인')
})

test('오류 안내와 키 가리기, 거절', async () => {
  stub({ error: { message: `Incorrect API key provided: ${KEY}` } }, 401)
  await assert.rejects(listModels('openai', KEY), error => error.status === 401 && /올바르지 않/.test(error.message) && !error.message.includes(KEY))
  assert.match(providerError('X', 429, ''), /한도/)
  assert.match(providerError('X', 400, 'API key not valid'), /올바르지 않/)
  stub({ promptFeedback: { blockReason: 'SAFETY' } })
  await assert.rejects(askProvider('gemini', KEY, { model: 'm', system: '', text: '', images: [] }), /거절/)
})
