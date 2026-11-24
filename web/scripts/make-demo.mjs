/**
 * @file make-demo.mjs
 * @brief 백업 파일에서 평가지 하나를 골라 로그인 없이 둘러보기 자료로 만듦
 * 사용: node scripts/make-demo.mjs <백업.json> <평가지 이름에 든 말> → public/demo/
 * @note public/demo는 누구나 볼 수 있게 공개됨. 학교 이름·출제자 같은 정보는 넣지 않음
 */

import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { paperTitle } from '../src/lib/schema.js'

const [backupPath, word] = process.argv.slice(2)
if (!backupPath || !word) throw new Error('사용: node scripts/make-demo.mjs <백업.json> <평가지 이름에 든 말>')
const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'))
const found = backup.papers.filter(paper => paperTitle(paper).includes(word) || paper.meta?.subject === word)
if (found.length !== 1) throw new Error(`'${word}' 평가지가 ${found.length}개입니다: ${found.map(paperTitle).join(' / ')}`)
const [source] = found
const id = 'sample_paper'
const outDir = path.join(import.meta.dirname, '..', 'public', 'demo')
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

const ids = new Map()
const files = backup.files.filter(file => file.paperId === source.id).sort((a, b) => a.order - b.order).map(({ dataUrl, ...file }, index) => {
  const ext = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[file.type]
  const name = `paper-${index + 1}.${ext}`
  fs.writeFileSync(path.join(outDir, name), Buffer.from(dataUrl.split(',')[1], 'base64'))
  ids.set(file.id, `sample_file_${index + 1}`)
  return { id: ids.get(file.id), name: file.name, type: file.type, size: file.size, order: index, url: name }
})
const newFileId = text => [...ids].reduce((result, [from, to]) => result.replaceAll(from, to), text)
const { schoolName: _school, ...meta } = source.meta
const paper = JSON.parse(newFileId(JSON.stringify({ ...source, id, meta: { ...meta, schoolName: '' }, files: files.map(({ id: fileId, name, type, size }) => ({ id: fileId, name, type, size })) })))
const runs = backup.runs.filter(run => run.paperId === source.id && !run.isDemo).map((run, index) => ({ ...run, id: `sample_run_${index + 1}`, paperId: id }))
const body = { paper, runs, files }
const version = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 12)
fs.writeFileSync(path.join(outDir, 'sample.json'), JSON.stringify({ version, ...body }))
console.log(paperTitle(paper), '· 문항', paper.questions.length, '· 문제지', files.map(file => file.name), '· 풀이', runs.map(run => run.model))
