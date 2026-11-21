/**
 * @file db.js
 * @brief IndexedDB 저장소 (평가지, 문제지 파일, 풀이 기록)
 * @note 모든 데이터는 사용자의 브라우저에만 저장됩니다. 서버로 보내지 않습니다.
 */

const DB_NAME = 'exam-bench'
const DB_VERSION = 1
const STORES = ['papers', 'files', 'runs']

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('papers')) db.createObjectStore('papers', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { keyPath: 'id' }).createIndex('paperId', 'paperId')
      }
      if (!db.objectStoreNames.contains('runs')) {
        db.createObjectStore('runs', { keyPath: 'id' }).createIndex('paperId', 'paperId')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

/** @brief 트랜잭션 하나로 작업 실행 */
async function withStore(storeName, mode, action) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const store = transaction.objectStore(storeName)
    let result
    Promise.resolve(action(store)).then(value => { result = value }, reject)
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export const db = {
  async listPapers() {
    const papers = await withStore('papers', 'readonly', store => requestToPromise(store.getAll()))
    return papers.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },
  getPaper(id) {
    return withStore('papers', 'readonly', store => requestToPromise(store.get(id)))
  },
  savePaper(paper) {
    const next = { ...paper, updatedAt: new Date().toISOString() }
    return withStore('papers', 'readwrite', store => { store.put(next); return next })
  },
  async deletePaper(id) {
    const [files, runs] = await Promise.all([this.listFiles(id), this.listRuns(id)])
    await withStore('files', 'readwrite', store => files.forEach(file => store.delete(file.id)))
    await withStore('runs', 'readwrite', store => runs.forEach(run => store.delete(run.id)))
    await withStore('papers', 'readwrite', store => store.delete(id))
  },

  listFiles(paperId) {
    return withStore('files', 'readonly', store => requestToPromise(store.index('paperId').getAll(paperId)))
  },
  saveFile(record) {
    return withStore('files', 'readwrite', store => { store.put(record); return record })
  },
  deleteFile(id) {
    return withStore('files', 'readwrite', store => store.delete(id))
  },

  async listRuns(paperId) {
    const runs = paperId
      ? await withStore('runs', 'readonly', store => requestToPromise(store.index('paperId').getAll(paperId)))
      : await withStore('runs', 'readonly', store => requestToPromise(store.getAll()))
    return runs.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  },
  saveRun(run) {
    return withStore('runs', 'readwrite', store => { store.put(run); return run })
  },
  deleteRun(id) {
    return withStore('runs', 'readwrite', store => store.delete(id))
  },

  /** @brief 전체 백업 (파일은 data URL로 포함) */
  async exportAll() {
    const [papers, runs, files] = await Promise.all([
      this.listPapers(),
      this.listRuns(),
      withStore('files', 'readonly', store => requestToPromise(store.getAll()))
    ])
    const encodedFiles = await Promise.all(files.map(async file => ({ ...file, blob: undefined, dataUrl: await blobToDataUrl(file.blob) })))
    return { format: 'exam-bench-backup', version: 1, exportedAt: new Date().toISOString(), papers, runs, files: encodedFiles }
  },

  /** @brief 백업 복원 (같은 ID는 덮어씀) */
  async importAll(backup) {
    if (backup?.format !== 'exam-bench-backup') throw new Error('이 서비스의 백업 파일이 아닙니다.')
    const files = await Promise.all((backup.files || []).map(async file => {
      const { dataUrl, ...rest } = file
      return { ...rest, blob: await (await fetch(dataUrl)).blob() }
    }))
    await withStore('papers', 'readwrite', store => (backup.papers || []).forEach(paper => store.put(paper)))
    await withStore('runs', 'readwrite', store => (backup.runs || []).forEach(run => store.put(run)))
    await withStore('files', 'readwrite', store => files.forEach(file => store.put(file)))
    return { papers: backup.papers?.length || 0, runs: backup.runs?.length || 0, files: files.length }
  },

  async clearAll() {
    for (const name of STORES) await withStore(name, 'readwrite', store => store.clear())
  }
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** @brief data URL에서 base64 본문만 추출 */
export async function blobToBase64(blob) {
  const dataUrl = await blobToDataUrl(blob)
  return String(dataUrl).split(',')[1] ?? ''
}
