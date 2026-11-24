/**
 * @file cloud.js
 * @brief Supabase 중앙 서버 연동 - 교사 로그인, 평가지·풀이 기록(DB)과 문제지 파일(Storage) 저장
 *
 * - 연결 정보: 빌드 시 VITE_SUPABASE_URL·VITE_SUPABASE_ANON_KEY, 없으면 설정 화면에서 입력한 값(이 브라우저에 보관)
 *   anon(publishable) 키는 공개돼도 되는 키이며, 실제 접근은 RLS 정책(본인 자료만)으로 막습니다.
 * - 로그인하면 db(저장소)가 이 클라우드 저장소로 바뀌고, 로그아웃하면 브라우저 저장소(IndexedDB)로 돌아갑니다.
 * - 스키마는 저장소의 supabase/schema.sql
 */

import { createClient } from '@supabase/supabase-js'
import { authErrorMessage } from './password.js'

const CONFIG_KEY = 'exam-bench.supabase'
const BUCKET = 'paper-files'

function safe(action, fallback = null) {
  try { return action() } catch { return fallback }
}

/** @brief 연결 정보 { url, anonKey, fromEnv } (없으면 null) */
export function getCloudConfig() {
  const envUrl = import.meta.env?.VITE_SUPABASE_URL
  const envKey = import.meta.env?.VITE_SUPABASE_ANON_KEY
  if (envUrl && envKey) return { url: envUrl, anonKey: envKey, fromEnv: true }
  const saved = safe(() => JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null'))
  return saved?.url && saved?.anonKey ? { ...saved, fromEnv: false } : null
}

/** @brief 설정 화면에서 연결 정보 저장 (빈 값이면 삭제) */
export function setCloudConfig(config) {
  safe(() => {
    if (!config?.url || !config?.anonKey) localStorage.removeItem(CONFIG_KEY)
    else localStorage.setItem(CONFIG_KEY, JSON.stringify({ url: config.url.trim().replace(/\/+$/, ''), anonKey: config.anonKey.trim() }))
  })
  client = null
}

let client = null

/** @brief Supabase 클라이언트 (연결 정보가 없으면 null) */
export function getSupabase() {
  if (client) return client
  const config = getCloudConfig()
  if (!config) return null
  // implicit: 메일의 로그인 링크를 어느 브라우저에서 열어도 그 브라우저에서 로그인됨 (pkce는 요청한 브라우저에서만 됨)
  client = createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' }
  })
  return client
}

/** @brief Supabase 오류를 한국어 안내로 */
export function describeCloudError(error) {
  const message = String(error?.message ?? error ?? '')
  if (/relation .* does not exist|Could not find the table/i.test(message)) return '서버에 표가 없습니다. Supabase SQL Editor에서 supabase/schema.sql을 실행하세요.'
  if (/Bucket not found/i.test(message)) return '서버에 문제지 파일 버킷(paper-files)이 없습니다. supabase/schema.sql을 실행하세요.'
  if (/row-level security|violates row-level/i.test(message)) return '서버 접근 권한이 없습니다. 다시 로그인하세요.'
  if (/JWT|session|not authenticated/i.test(message)) return '로그인이 만료됐습니다. 다시 로그인하세요.'
  if (/Failed to fetch|NetworkError|network/i.test(message)) return '서버에 연결하지 못했습니다. 인터넷 연결과 Supabase 주소를 확인하세요.'
  if (/rate limit/i.test(message)) return '요청이 너무 많습니다. 잠시 뒤 다시 시도하세요.'
  return message || '서버 요청에 실패했습니다.'
}

function check({ data, error }) {
  if (error) throw new Error(describeCloudError(error))
  return data
}

export async function signOut() {
  await getSupabase()?.auth.signOut()
}

/* ───────────── 로그인 (비밀번호 · 이메일 인증번호 · Google) ───────────── */

const siteUrl = () => `${window.location.origin}${window.location.pathname}`

export const cleanEmail = email => email.trim().toLowerCase()

/** @brief 로그인 요청 결과 확인 - 실패하면 한국어 안내와 오류 코드를 담아 던짐 */
function checkAuth({ data, error }) {
  if (!error) return data
  throw Object.assign(new Error(authErrorMessage(error) || describeCloudError(error)), { code: error.code })
}

function requireClient() {
  const supabase = getSupabase()
  if (!supabase) throw new Error('서버 연결 정보가 없습니다.')
  return supabase
}

/** @brief 이메일·비밀번호로 로그인 */
export async function signInWithPassword(email, password) {
  checkAuth(await requireClient().auth.signInWithPassword({ email: cleanEmail(email), password }))
  setNeedPassword('')
}

/**
 * @brief 비밀번호로 가입 신청 (메일의 인증번호를 확인해야 로그인됨)
 * @returns {Promise<boolean>} 메일 확인 없이 바로 로그인됐으면 true
 */
export async function signUpWithPassword(email, password, info) {
  const data = checkAuth(await requireClient().auth.signUp({ email: cleanEmail(email), password, options: { data: info, emailRedirectTo: siteUrl() } }))
  // 이미 가입된 이메일이면 서버가 오류 대신 빈 identities를 돌려줌 (메일도 보내지 않음)
  if (data.user && data.user.identities?.length === 0) throw new Error(authErrorMessage({ code: 'user_already_exists' }))
  return Boolean(data.session)
}

/** @brief 가입 확인 인증번호 다시 보내기 */
export async function resendSignupCode(email) {
  checkAuth(await requireClient().auth.resend({ type: 'signup', email: cleanEmail(email), options: { emailRedirectTo: siteUrl() } }))
}

/** @brief 로그인한 사람의 비밀번호 정하기·바꾸기 */
export async function changePassword(password) {
  checkAuth(await requireClient().auth.updateUser({ password }))
}

/** @brief 가입된 이메일로 인증번호를 보냄 - 메일의 버튼을 눌러도 로그인됨 */
export async function sendLoginCode(email) {
  checkAuth(await requireClient().auth.signInWithOtp({ email: cleanEmail(email), options: { emailRedirectTo: siteUrl(), shouldCreateUser: false } }))
}

const NEED_PASSWORD_KEY = 'exam-bench.needPassword'
/** @brief 「비밀번호 정하기·재설정」 중인 이메일 (로그인되면 새 비밀번호 화면을 보여 줌) */
export const getNeedPassword = () => safe(() => localStorage.getItem(NEED_PASSWORD_KEY) || '', '')
export const setNeedPassword = email => safe(() => (email ? localStorage.setItem(NEED_PASSWORD_KEY, email) : localStorage.removeItem(NEED_PASSWORD_KEY)))

const PENDING_LOGIN_KEY = 'exam-bench.pendingLogin'
const PENDING_LOGIN_MS = 60 * 60 * 1000

/** @brief 인증번호를 기다리는 중인 이메일·신청 정보 (메일을 보고 와서 화면을 새로 열어도 이어서 입력) */
export function getPendingLogin() {
  const pending = safe(() => JSON.parse(localStorage.getItem(PENDING_LOGIN_KEY) || 'null'))
  return pending && Date.now() - pending.at < PENDING_LOGIN_MS ? pending : null
}

export function setPendingLogin(pending) {
  safe(() => (pending ? localStorage.setItem(PENDING_LOGIN_KEY, JSON.stringify({ ...pending, at: Date.now() })) : localStorage.removeItem(PENDING_LOGIN_KEY)))
}

/** @brief 메일로 받은 인증번호로 로그인 */
export async function verifyLoginCode(email, code) {
  checkAuth(await requireClient().auth.verifyOtp({ email: cleanEmail(email), token: code.replace(/\s+/g, ''), type: 'email' }))
}

/** @brief Google 계정으로 로그인 (Supabase에서 Google 로그인을 켜 둔 경우만) */
export async function signInWithGoogle() {
  const supabase = getSupabase()
  check(await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: siteUrl() } }))
}

/** @brief 서버에서 켜 둔 로그인 방법 { google: boolean } */
export async function loginProviders() {
  const config = getCloudConfig()
  if (!config) return { google: false }
  try {
    const response = await fetch(`${config.url}/auth/v1/settings`, { headers: { apikey: config.anonKey } })
    const settings = await response.json()
    return { google: Boolean(settings?.external?.google) }
  } catch {
    return { google: false }
  }
}

/* ───────────── 교사 프로필 · 관리자 승인 ───────────── */

const readProfile = async (supabase, userId) => check(await supabase.from('profiles').select('*').eq('id', userId).maybeSingle())

/**
 * @brief 내 프로필 (없으면 승인 대기 행을 만듦)
 * - 첫 화면에서 적은 가입 신청 정보가 아직 프로필에 없으면 채워 넣음
 *   (계정에 붙은 정보를 먼저 쓰므로 다른 기기에서 메일을 열어도 신청이 이어짐)
 */
export async function fetchMyProfile(supabase, user) {
  let profile = await readProfile(supabase, user.id)
  if (!profile) {
    check(await supabase.from('profiles').insert({ id: user.id, email: user.email ?? '' }))
    profile = await readProfile(supabase, user.id)
  }
  if (profile && !profile.requested_at) {
    const pending = getPendingLogin()
    const info = signupInfo(user.user_metadata) ?? (pending?.email === user.email ? signupInfo(pending?.signup) : null)
    if (info) {
      check(await supabase.from('profiles').update({ ...info, requested_at: new Date().toISOString() }).eq('id', user.id))
      profile = await readProfile(supabase, user.id)
    }
  }
  return profile
}

/** @brief 이름·학교·과목이 모두 있는 신청 정보만 (없으면 null) */
function signupInfo(source) {
  const info = {}
  for (const key of ['name', 'school', 'subject']) {
    info[key] = String(source?.[key] ?? '').trim()
    if (!info[key]) return null
  }
  return info
}

/**
 * @brief 내 정보 저장 (이름·학교·과목). 거절된 경우에만 다시 '승인 대기'로 신청
 * - 승인된 사람(관리자 포함)이 정보를 고쳐도 승인 상태는 그대로
 */
export async function saveMyProfile(profile, { name, school, subject }) {
  const patch = { name: name.trim(), school: school.trim(), subject: subject.trim(), requested_at: profile.requested_at ?? new Date().toISOString() }
  if (profile.status === 'rejected') Object.assign(patch, { status: 'pending', requested_at: new Date().toISOString() })
  check(await getSupabase().from('profiles').update(patch).eq('id', profile.id))
}

/** @brief (관리자) 모든 교사 프로필 */
export async function listProfiles() {
  return check(await getSupabase().from('profiles').select('*').order('created_at', { ascending: false }))
}

/** @brief (관리자) 승인·거절·권한 변경 */
export async function updateProfileByAdmin(id, patch, adminId) {
  const next = { ...patch }
  if (patch.status === 'approved') Object.assign(next, { approved_at: new Date().toISOString(), approved_by: adminId })
  check(await getSupabase().from('profiles').update(next).eq('id', id))
}

/** @brief 관리 메뉴(사용자 관리·설정)를 쓸 수 있는지 - 관리자만. 서버 없이 혼자 쓰는 경우는 설정을 열어 둠 */
export const canManage = cloud => !cloud.configured || (!cloud.guest && cloud.profile?.role === 'admin' && cloud.profile.status === 'approved')

/* ───────────── 로그인 없이 체험 (이 브라우저에만 저장) ───────────── */

const GUEST_KEY = 'exam-bench.guest'
export const isGuest = () => safe(() => sessionStorage.getItem(GUEST_KEY) === '1', false)
export const setGuest = on => safe(() => (on ? sessionStorage.setItem(GUEST_KEY, '1') : sessionStorage.removeItem(GUEST_KEY)))


/**
 * @brief 클라우드 저장소 - db.js의 브라우저 저장소와 같은 함수 모양
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export function createCloudDb(supabase, userId) {
  // 문제지 파일은 한 번 내려받으면 이 탭에서 다시 쓰기 (PDF 보기·AI 풀이마다 다시 받지 않음)
  const blobCache = new Map()
  const pathOf = (paperId, fileId) => `${userId}/${paperId}/${fileId}`

  const api = {
    kind: 'cloud',
    userId,

    async listPapers() {
      const rows = check(await supabase.from('papers').select('data').order('updated_at', { ascending: false }))
      // 파일을 먼저 올리느라 만든 빈 평가지 행(pending)은 목록에서 뺌
      return rows.map(row => row.data).filter(paper => !paper.pending)
    },
    async getPaper(id) {
      const row = check(await supabase.from('papers').select('data').eq('id', id).maybeSingle())
      return row?.data
    },
    async savePaper(paper) {
      const next = { ...paper, updatedAt: new Date().toISOString() }
      check(await supabase.from('papers').upsert({ id: next.id, owner_id: userId, data: next, updated_at: next.updatedAt }))
      return next
    },
    async deletePaper(id) {
      const files = check(await supabase.from('paper_files').select('storage_path').eq('paper_id', id))
      if (files.length) check(await supabase.storage.from(BUCKET).remove(files.map(file => file.storage_path)))
      // 풀이 기록·파일 목록은 외래 키(on delete cascade)로 함께 지워짐
      check(await supabase.from('papers').delete().eq('id', id))
    },

    async listFiles(paperId) {
      const rows = check(await supabase.from('paper_files').select('*').eq('paper_id', paperId).order('ord'))
      return Promise.all(rows.map(async row => {
        let blob = blobCache.get(row.id)
        if (!blob) {
          blob = check(await supabase.storage.from(BUCKET).download(row.storage_path))
          blobCache.set(row.id, blob)
        }
        return { id: row.id, paperId: row.paper_id, name: row.name, type: row.type, size: row.size, order: row.ord, blob }
      }))
    },
    async saveFile(record) {
      const storagePath = pathOf(record.paperId, record.id)
      // 이미 올린 파일(순서만 바뀜)은 다시 올리지 않음
      const existing = check(await supabase.from('paper_files').select('id').eq('id', record.id).maybeSingle())
      if (!existing) {
        check(await supabase.storage.from(BUCKET).upload(storagePath, record.blob, { contentType: record.type || 'application/octet-stream', upsert: true }))
      }
      blobCache.set(record.id, record.blob)
      await ensurePaperRow(record.paperId)
      check(await supabase.from('paper_files').upsert({
        id: record.id,
        paper_id: record.paperId,
        owner_id: userId,
        name: record.name,
        type: record.type,
        size: record.size ?? record.blob?.size ?? 0,
        ord: record.order ?? 0,
        storage_path: storagePath
      }))
      return record
    },
    async deleteFile(id) {
      const row = check(await supabase.from('paper_files').select('storage_path').eq('id', id).maybeSingle())
      if (row) check(await supabase.storage.from(BUCKET).remove([row.storage_path]))
      check(await supabase.from('paper_files').delete().eq('id', id))
      blobCache.delete(id)
    },

    async listRuns(paperId) {
      let query = supabase.from('runs').select('data').order('created_at')
      if (paperId) query = query.eq('paper_id', paperId)
      return check(await query).map(row => row.data)
    },
    async saveRun(run) {
      await ensurePaperRow(run.paperId)
      check(await supabase.from('runs').upsert({ id: run.id, paper_id: run.paperId, owner_id: userId, data: run, created_at: run.createdAt ?? new Date().toISOString() }))
      return run
    },
    async deleteRun(id) {
      check(await supabase.from('runs').delete().eq('id', id))
    },

    async exportAll() {
      const [papers, runs] = await Promise.all([api.listPapers(), api.listRuns()])
      const files = (await Promise.all(papers.map(paper => api.listFiles(paper.id)))).flat()
      const { blobToDataUrl } = await import('./db.js')
      const encodedFiles = await Promise.all(files.map(async file => ({ ...file, blob: undefined, dataUrl: await blobToDataUrl(file.blob) })))
      return { format: 'exam-bench-backup', version: 1, exportedAt: new Date().toISOString(), papers, runs, files: encodedFiles }
    },
    async importAll(backup) {
      if (backup?.format !== 'exam-bench-backup') throw new Error('이 서비스의 백업 파일이 아닙니다.')
      for (const paper of backup.papers || []) await api.savePaper(paper)
      for (const file of backup.files || []) {
        const { dataUrl, ...rest } = file
        await api.saveFile({ ...rest, blob: await (await fetch(dataUrl)).blob() })
      }
      for (const run of backup.runs || []) await api.saveRun(run)
      return { papers: backup.papers?.length || 0, runs: backup.runs?.length || 0, files: backup.files?.length || 0 }
    },
    async clearAll() {
      const papers = await api.listPapers()
      for (const paper of papers) await api.deletePaper(paper.id)
    }
  }

  /** @brief 파일·풀이 기록을 평가지보다 먼저 저장하는 경우를 위해, 평가지 행이 없으면 최소 행을 만듦 */
  async function ensurePaperRow(paperId) {
    const row = check(await supabase.from('papers').select('id').eq('id', paperId).maybeSingle())
    if (row) return
    const now = new Date().toISOString()
    check(await supabase.from('papers').insert({ id: paperId, owner_id: userId, data: { id: paperId, createdAt: now, updatedAt: now, pending: true, meta: {}, questions: [], files: [], cover: {} }, updated_at: now }))
  }

  return api
}

/**
 * @brief 브라우저 저장소의 자료를 서버로 올리기 (같은 ID는 덮어씀)
 * @returns {Promise<{ papers, runs, files }>}
 */
export async function uploadLocalData(localDb, cloudDb, onProgress) {
  const papers = await localDb.listPapers()
  const runs = await localDb.listRuns()
  let files = 0
  for (const [index, paper] of papers.entries()) {
    onProgress?.(`평가지 ${index + 1}/${papers.length} 올리는 중…`)
    await cloudDb.savePaper(paper)
    for (const file of await localDb.listFiles(paper.id)) {
      await cloudDb.saveFile(file)
      files += 1
    }
  }
  // 지워진 평가지의 풀이 기록은 올리지 않음
  let uploadedRuns = 0
  for (const run of runs) {
    if (!papers.some(paper => paper.id === run.paperId)) continue
    await cloudDb.saveRun(run)
    uploadedRuns += 1
  }
  return { papers: papers.length, runs: uploadedRuns, files }
}
