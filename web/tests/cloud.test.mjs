import test from 'node:test'
import assert from 'node:assert/strict'
import { createCloudDb, uploadLocalData } from '../src/lib/cloud.js'

/** @brief supabase-js의 from()/storage를 흉내 낸 메모리 저장소 (쓰는 기능만) */
function fakeSupabase() {
  const tables = { papers: [], runs: [], paper_files: [] }
  const objects = new Map()
  const from = name => {
    const state = { filters: [], order: null, op: 'select', payload: null, single: false }
    const run = () => {
      const rows = tables[name]
      const match = row => state.filters.every(([key, value]) => row[key] === value)
      if (state.op === 'upsert') {
        for (const item of [state.payload].flat()) {
          const index = rows.findIndex(row => row.id === item.id)
          if (index >= 0) rows[index] = { ...rows[index], ...item }
          else rows.push({ ...item })
        }
        return { data: null, error: null }
      }
      if (state.op === 'insert') { rows.push({ ...state.payload }); return { data: null, error: null } }
      if (state.op === 'delete') {
        const removed = rows.filter(match)
        tables[name] = rows.filter(row => !match(row))
        // 외래 키 on delete cascade 흉내
        if (name === 'papers') for (const paper of removed) for (const child of ['runs', 'paper_files']) tables[child] = tables[child].filter(row => row.paper_id !== paper.id)
        return { data: null, error: null }
      }
      let result = rows.filter(match)
      if (state.order) result = [...result].sort((a, b) => String(a[state.order.key]).localeCompare(String(b[state.order.key])) * (state.order.ascending ? 1 : -1))
      return { data: state.single ? result[0] ?? null : result, error: null }
    }
    const builder = {
      select() { return builder },
      eq(key, value) { state.filters.push([key, value]); return builder },
      order(key, options = {}) { state.order = { key, ascending: options.ascending !== false }; return builder },
      maybeSingle() { state.single = true; return builder },
      upsert(payload) { state.op = 'upsert'; state.payload = payload; return builder },
      insert(payload) { state.op = 'insert'; state.payload = payload; return builder },
      delete() { state.op = 'delete'; return builder },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject) }
    }
    return builder
  }
  const storage = {
    from: () => ({
      upload: async (path, blob) => { objects.set(path, blob); return { data: { path }, error: null } },
      download: async path => (objects.has(path) ? { data: objects.get(path), error: null } : { data: null, error: { message: 'Object not found' } }),
      remove: async paths => { for (const path of paths) objects.delete(path); return { data: null, error: null } }
    })
  }
  return { client: { from, storage }, tables, objects }
}

test('클라우드 저장소: 평가지·파일·풀이 저장, 목록, 삭제', async () => {
  const { client, tables, objects } = fakeSupabase()
  const cloud = createCloudDb(client, 'user-1')
  const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' })

  // 새 평가지 만들기처럼 파일을 평가지보다 먼저 저장해도 됨
  await cloud.saveFile({ id: 'f1', paperId: 'p1', name: '문제지.pdf', type: 'application/pdf', size: 8, order: 0, blob })
  assert.deepEqual(await cloud.listPapers(), [], '빈 평가지 행은 목록에 안 보임')
  await cloud.savePaper({ id: 'p1', meta: { subject: '수학' }, questions: [], files: [] })
  await cloud.saveRun({ id: 'r1', paperId: 'p1', createdAt: '2026-11-22T00:00:00Z', answers: {} })

  const papers = await cloud.listPapers()
  assert.equal(papers.length, 1)
  assert.equal(papers[0].meta.subject, '수학')
  assert.ok(papers[0].updatedAt)
  assert.equal(tables.papers[0].owner_id, 'user-1')
  assert.ok(objects.has('user-1/p1/f1'), '파일은 본인 폴더 아래에 저장')

  const files = await cloud.listFiles('p1')
  assert.equal(files[0].name, '문제지.pdf')
  assert.equal(files[0].blob, blob)
  assert.equal((await cloud.listRuns('p1')).length, 1)

  await cloud.deletePaper('p1')
  assert.equal(tables.papers.length + tables.runs.length + tables.paper_files.length, 0)
  assert.equal(objects.size, 0)
})

test('브라우저 자료를 서버로 올리기', async () => {
  const { client, tables } = fakeSupabase()
  const cloud = createCloudDb(client, 'user-2')
  const local = {
    listPapers: async () => [{ id: 'p9', meta: {}, questions: [], files: [] }],
    listRuns: async () => [{ id: 'r9', paperId: 'p9', createdAt: '2026-01-01' }, { id: 'orphan', paperId: 'gone', createdAt: '2026-01-01' }],
    listFiles: async () => [{ id: 'f9', paperId: 'p9', name: 'a.png', type: 'image/png', size: 1, order: 0, blob: new Blob(['x']) }]
  }
  const result = await uploadLocalData(local, cloud)
  assert.equal(result.files, 1)
  assert.equal(tables.papers.length, 1)
  assert.equal(tables.runs.length, 1, '평가지가 없는 풀이 기록은 올리지 않음')
  assert.equal(tables.paper_files.length, 1)
})
