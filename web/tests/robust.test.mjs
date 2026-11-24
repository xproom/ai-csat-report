import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAnswerKey } from '../src/lib/answerKey.js'
import { importRuns } from '../src/lib/aiRunner.js'
import { createCloudDb } from '../src/lib/cloud.js'
import { backupBlob, viewableBlob } from '../src/lib/files.js'
import { analyzeQuestionText } from '../src/lib/pdfText.js'
import { buildQuestions, createPaper } from '../src/lib/schema.js'
import { validatePaper } from '../src/lib/verify.js'
import { createAutosaver } from '../src/lib/useAutosave.js'

const paper = () => createPaper({ questions: buildQuestions({ choiceCount: 5, shortCount: 1 }) })
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

/** @brief 걸린 시간(ms) */
function took(job) {
  const start = performance.now()
  job()
  return performance.now() - start
}

test('아주 긴 공백이 든 정답표·문항 글에서 멈추지 않음', () => {
  const gap = ' '.repeat(50000)
  assert.ok(took(() => parseAnswerKey(`1${gap}3\n${gap}x${gap}\n2 ${gap}`, paper())) < 1000)
  assert.ok(took(() => analyzeQuestionText(`1. 옳은 것을${gap}모두${gap}고르시오`)) < 500)
})

test('엉뚱하게 큰 문항 번호로 검증이 멈추지 않고 오류로 알림', () => {
  const broken = paper()
  broken.questions[0].no = 1e9
  broken.questions[1].no = -3
  broken.questions[2].no = Number.NaN
  let result
  assert.ok(took(() => { result = validatePaper(broken, { facts: { anchors: [{ no: 1e9, page: 1 }], notes: '문자열' }, runs: [] }) }) < 500)
  assert.equal(result.status, 'error')
})

test('망가진 풀이 결과 가져오기', () => {
  const runs = importRuns({ model: 'x', answers: [null, { no: 1, answer: '3' }] }, paper())
  assert.equal(runs[0].answers[1].answer, '3')
})

test('허용하지 않은 파일 형식은 열지 않음', async () => {
  const html = new Blob(['<script>1</script>'], { type: 'text/html' })
  assert.equal(viewableBlob({ type: 'text/html', blob: html }), null)
  assert.equal(viewableBlob({ type: 'image/svg+xml', blob: html }), null)
  assert.equal(viewableBlob({ type: 'application/pdf', blob: html }).type, 'application/pdf', '형식을 속인 파일은 PDF로만 열림')
  await assert.rejects(backupBlob('text/html', 'data:text/html,hi'))
  await assert.rejects(backupBlob('application/pdf', 'https://example.com/a.pdf'), /백업 파일/)
  assert.equal((await backupBlob('image/png', 'data:text/html,hi')).type, 'image/png')
})

test('자동 저장: 묶어서 저장하고, 떠날 때 바로 저장하고, 순서를 지킴', async () => {
  const saved = []
  let release
  const backend = { savePaper: async next => { await new Promise(resolve => { release = resolve }); saved.push(next.v); return next } }
  const saver = createAutosaver({ delay: 15 })
  saver.edit({ v: 1 }, backend)
  saver.edit({ v: 2 }, backend)
  assert.ok(saver.dirty)
  saver.flush()
  await wait(1)
  // 저장하는 동안 더 고침 → 첫 저장이 끝난 뒤에 이어서 저장
  saver.edit({ v: 3 }, backend)
  await wait(40)
  assert.deepEqual(saved, [])
  release()
  await wait(5)
  release()
  await wait(5)
  assert.deepEqual(saved, [2, 3])
  assert.equal(saver.dirty, false)
})

test('자동 저장: 고친 때의 저장소에 저장하고, 실패하면 알리고 다음에 다시 저장', async () => {
  const log = []
  let fail = true
  const errors = []
  const backend = { savePaper: async next => { if (fail) throw new Error('끊김'); log.push(next.v); return next } }
  const saver = createAutosaver({ delay: 5, onError: error => errors.push(error.message), onSaved: (_next, used) => assert.equal(used, backend) })
  saver.edit({ v: 1 }, backend)
  await wait(20)
  assert.deepEqual(errors, ['끊김'])
  assert.ok(saver.dirty, '저장 못 한 내용을 버리지 않음')
  fail = false
  await saver.flush()
  assert.deepEqual(log, [1])
})

test('자동 저장: 삭제한 평가지는 뒤늦게 되살아나지 않음', async () => {
  const log = []
  const backend = { savePaper: async next => { await wait(10); log.push(next.v); return next } }
  let applied = 0
  const saver = createAutosaver({ delay: 5, onSaved: () => { applied += 1 } })
  saver.edit({ v: 1 }, backend)
  saver.flush()
  await saver.discard()
  assert.deepEqual(log, [1], '진행 중인 저장이 끝난 뒤에 삭제를 시작')
  assert.equal(applied, 0)
  saver.edit({ v: 2 }, backend)
  await wait(30)
  assert.deepEqual(log, [1])
})

/** @brief 응답 시간을 정할 수 있는 가짜 서버 */
function slowServer({ delay = () => 0, rows = {} } = {}) {
  const calls = []
  const tables = { papers: new Map(), runs: new Map(), paper_files: new Map(), ...rows }
  const from = name => {
    const state = { op: 'select', payload: null, range: null, single: false, filter: null }
    const builder = {
      select: () => builder,
      eq: (key, value) => { state.filter = [key, value]; return builder },
      order: () => builder,
      range: (a, b) => { state.range = [a, b]; return builder },
      maybeSingle: () => { state.single = true; return builder },
      upsert: payload => { state.op = 'upsert'; state.payload = payload; return builder },
      insert: payload => { state.op = 'insert'; state.payload = payload; return builder },
      delete: () => { state.op = 'delete'; return builder },
      then: (resolve, reject) => (async () => {
        calls.push(`${name}:${state.op}`)
        await wait(delay(calls.length, state))
        if (state.op === 'upsert' || state.op === 'insert') { tables[name].set(state.payload.id, state.payload); return { data: null, error: null } }
        let list = [...tables[name].values()]
        if (state.filter) list = list.filter(row => row[state.filter[0]] === state.filter[1])
        if (state.op === 'delete') { for (const row of list) tables[name].delete(row.id); if (name === 'papers') { tables.runs.clear(); tables.paper_files.clear() } return { data: null, error: null } }
        if (state.range) list = list.slice(state.range[0], state.range[1] + 1)
        // 서버는 한 번에 1000행까지만 줌
        return { data: state.single ? list[0] ?? null : list.slice(0, 1000), error: null }
      })().then(resolve, reject)
    }
    return builder
  }
  const uploads = []
  const storage = { from: () => ({ upload: async path => { uploads.push(path); return { data: {}, error: null } }, remove: async () => ({ data: null, error: null }), download: async () => { calls.push('download'); await wait(5); return { data: new Blob(['x']), error: null } } }) }
  return { client: { from, storage }, calls, tables, uploads }
}

test('서버 저장: 먼저 보낸 저장이 늦게 끝나도 마지막 내용이 남음', async () => {
  const server = slowServer({ delay: count => (count === 1 ? 40 : 0) })
  const cloud = createCloudDb(server.client, 'u')
  await Promise.all([cloud.savePaper({ id: 'p', v: 1 }), cloud.savePaper({ id: 'p', v: 2 })])
  assert.equal(server.tables.papers.get('p').data.v, 2)
})

test('서버 저장: 같은 확인을 되풀이하지 않고 파일은 한 번만 올림', async () => {
  const server = slowServer()
  const cloud = createCloudDb(server.client, 'u')
  const file = id => ({ id, paperId: 'p', type: 'image/png', order: 0, blob: new Blob(['x']) })
  await Promise.all([cloud.saveFile(file('a')), cloud.saveFile(file('b'))])
  assert.equal(server.calls.filter(call => call === 'papers:insert').length, 1, '빈 평가지 행은 한 번만')
  const before = server.calls.length
  await cloud.saveFile(file('a'))
  assert.equal(server.calls.length, before, '바뀌지 않은 파일은 요청 없음')
  assert.equal(server.uploads.length, 2)
  await cloud.savePaper({ id: 'p' })
  const start = server.calls.length
  for (let i = 0; i < 10; i += 1) await cloud.saveRun({ id: 'r', paperId: 'p', answers: {} })
  assert.equal(server.calls.length - start, 10, '마킹 10번 = 요청 10번')
  // 지운 뒤 같은 파일을 다시 올리면 실제로 올라감
  await cloud.deletePaper('p')
  await cloud.saveFile(file('a'))
  assert.equal(server.uploads.length, 3)
})

test('서버 목록: 1000건이 넘어도 모두 읽고, 같은 파일은 동시에 한 번만 받음', async () => {
  const runs = new Map(Array.from({ length: 1234 }, (_, i) => [`r${i}`, { id: `r${i}`, data: { id: `r${i}`, paperId: 'p' } }]))
  const files = new Map([['f', { id: 'f', paper_id: 'p', ord: 0, storage_path: 'x' }]])
  const server = slowServer({ rows: { runs, paper_files: files } })
  const cloud = createCloudDb(server.client, 'u')
  assert.equal((await cloud.listRuns()).length, 1234)
  await Promise.all([cloud.listFiles('p'), cloud.listFiles('p')])
  assert.equal(server.calls.filter(call => call === 'download').length, 1)
})

test('둘러보기 자료: 한 번만 넣고, 새 버전이면 바꾸고, 자료가 없으면 알려 줌', async () => {
  const { loadSample } = await import('../src/lib/demo.js')
  const papers = new Map([['old', { id: 'old', isDemo: true }], ['mine', { id: 'mine' }]])
  const files = new Map()
  const runs = new Map()
  const store = {
    listPapers: async () => [...papers.values()],
    savePaper: async item => { papers.set(item.id, item) },
    saveFile: async item => { files.set(item.id, item) },
    saveRun: async item => { runs.set(item.id, item) },
    deletePaper: async id => { papers.delete(id) }
  }
  let version = 'a'
  let broken = false
  const sample = () => ({ version, paper: { id: 's', meta: {}, questions: [] }, runs: [{ id: 'r', answers: {} }], files: [{ id: 'f', type: 'application/pdf', url: 'p.pdf' }, { id: 'x', type: 'text/html', url: 'x.html' }] })
  const request = async url => (String(url).endsWith('sample.json') ? new Response(JSON.stringify(sample())) : new Response('%PDF', { status: broken ? 500 : 200 }))
  assert.equal(await loadSample(store, async () => new Response('<html>')), true, '자료 파일이 없으면 있던 예시를 씀')
  broken = true
  await assert.rejects(loadSample(store, request))
  assert.ok(papers.has('old') && !papers.has('s'), '도중에 끊기면 아무것도 바꾸지 않음')
  broken = false
  assert.equal(await loadSample(store, request), true)
  assert.deepEqual([...papers.keys()], ['mine', 's'])
  assert.deepEqual([...files.keys()], ['f'], '허용한 형식만')
  papers.set('s', { ...papers.get('s'), edited: true })
  await loadSample(store, request)
  assert.ok(papers.get('s').edited, '둘러보며 바꾼 내용은 남음')
  version = 'b'
  await loadSample(store, request)
  assert.ok(!papers.get('s').edited)
  papers.clear()
  assert.equal(await loadSample(store, async () => { throw new Error('끊김') }), false)
})
