/**
 * @file RunPanel.jsx
 * @brief 풀이 기록 추가 - Claude로 풀기 / OMR 직접 입력 / 결과 JSON 가져오기
 */

import { useRef, useState } from 'react'
import { CLAUDE_MODELS, EFFORT_LEVELS, importRuns, runClaudeOnPaper } from '@/lib/aiRunner'
import { db } from '@/lib/db'
import { makeId, missingAnswers } from '@/lib/schema'
import { getApiKey } from '@/lib/settings'
import { navigate, useStore } from '@/lib/store'

const TABS = [
  ['ai', 'AI로 풀기'],
  ['manual', 'OMR 직접 입력'],
  ['import', '결과 가져오기']
]

const IMPORT_EXAMPLE = `{
  "model": "GPT-6.2",
  "answers": { "1": "3", "2": "5", "21": "12" }
}`

export default function RunPanel({ paper, files }) {
  const { refresh, notify } = useStore()
  const [tab, setTab] = useState('ai')
  const [selected, setSelected] = useState([CLAUDE_MODELS[0].id])
  const [effort, setEffort] = useState('high')
  const [progress, setProgress] = useState([])
  const [running, setRunning] = useState(false)
  const [manualName, setManualName] = useState('')
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState('')
  const abortRef = useRef(null)
  const apiKey = getApiKey()
  const missing = missingAnswers(paper)

  const toggleModel = id => setSelected(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])

  const runAll = async () => {
    const controller = new AbortController()
    abortRef.current = controller
    setRunning(true)
    setProgress(selected.map(id => ({ id, label: CLAUDE_MODELS.find(model => model.id === id)?.label, state: 'waiting', message: '' })))
    for (const id of selected) {
      if (controller.signal.aborted) break
      setProgress(prev => prev.map(item => item.id === id ? { ...item, state: 'running' } : item))
      try {
        const run = await runClaudeOnPaper({ apiKey, model: id, effort, paper, files, signal: controller.signal })
        await db.saveRun(run)
        const answered = Object.values(run.answers).filter(entry => entry.status === 'answered').length
        setProgress(prev => prev.map(item => item.id === id ? { ...item, state: 'done', message: `${answered}/${paper.questions.length}문항 답변 · ${(run.durationMs / 1000).toFixed(0)}초` } : item))
      } catch (error) {
        const message = controller.signal.aborted ? '중단됨' : (error?.message || '실패')
        setProgress(prev => prev.map(item => item.id === id ? { ...item, state: 'error', message } : item))
      }
      await refresh()
    }
    setRunning(false)
    abortRef.current = null
  }

  const createManual = async () => {
    const name = manualName.trim() || '직접 입력'
    const run = {
      id: makeId('run'),
      paperId: paper.id,
      model: name,
      source: 'manual',
      isDemo: false,
      createdAt: new Date().toISOString(),
      answers: {},
      essayScores: {},
      usage: {},
      durationMs: 0,
      note: ''
    }
    await db.saveRun(run)
    await refresh()
    setManualName('')
    navigate(`/paper/${paper.id}?tab=results&run=${run.id}&edit=1`)
  }

  const doImport = async (text = importText) => {
    try {
      const created = importRuns(JSON.parse(text), paper)
      for (const run of created) await db.saveRun(run)
      await refresh()
      setImportText('')
      setImportError('')
      notify(`${created.length}개 결과를 가져왔습니다.`)
    } catch (error) {
      setImportError(error instanceof SyntaxError ? 'JSON 형식이 올바르지 않습니다.' : error.message)
    }
  }

  return (
    <div className="card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-extrabold">풀이 추가</h3>
        <div className="segmented" role="tablist" aria-label="풀이 추가 방법">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>
      </div>

      {missing.length > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          정답이 비어 있는 문항이 {missing.length}개 있습니다({missing.slice(0, 6).map(question => question.no).join(', ')}{missing.length > 6 ? '…' : ''}번). 이 문항은 모두 오답으로 채점됩니다.
        </p>
      )}

      {tab === 'ai' && (
        <div className="mt-4 space-y-4">
          {!apiKey && (
            <p className="rounded-lg bg-[var(--color-brand-soft)] px-3 py-2 text-sm">
              Claude로 풀려면 <a href="#/account" className="font-bold underline">API 키 입력 화면</a>에서 본인의 Anthropic API 키를 입력하세요. 키는 이 브라우저에만 저장되고, 요청은 브라우저에서 Anthropic으로 바로 갑니다.
            </p>
          )}
          {!files.length && <p className="text-sm text-[var(--color-pen)]">먼저 ‘문제지’ 탭에서 문제지 파일을 올려 주세요.</p>}
          <p className="text-sm">여기서는 문제지 전체를 한 번에 풉니다. AI가 문항을 하나씩 풀며 OMR에 마킹하는 과정을 실제 속도로 보려면 <a href={`#/paper/${paper.id}?tab=sim`} className="font-bold text-[var(--color-brand)] underline">AI 풀이</a> 탭에서 실시간으로 풀게 하세요.</p>
          <div>
            <span className="field-label">풀이할 모델 (여러 개 선택 가능)</span>
            <div className="flex flex-wrap gap-2">
              {CLAUDE_MODELS.map(model => (
                <label key={model.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold cursor-pointer ${selected.includes(model.id) ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)]' : 'border-[var(--color-line)] bg-white'}`}>
                  <input type="checkbox" checked={selected.includes(model.id)} onChange={() => toggleModel(model.id)} disabled={running} />
                  {model.label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="field-label">추론 강도 (effort)</span>
              <select className="input !w-auto" value={effort} onChange={e => setEffort(e.target.value)} disabled={running}>
                {EFFORT_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
              </select>
            </label>
            {running
              ? <button type="button" className="btn btn-danger" onClick={() => abortRef.current?.abort()}>중단</button>
              : <button type="button" className="btn btn-primary" disabled={!apiKey || !files.length || !selected.length} onClick={runAll}>풀이 시작</button>}
            <span className="text-xs text-[var(--color-ink-soft)]">API 사용료는 입력한 키의 계정에 청구됩니다. 문제지 분량에 따라 모델당 수십 초~수 분 걸립니다.</span>
          </div>
          {progress.length > 0 && (
            <ul className="space-y-1.5">
              {progress.map(item => (
                <li key={item.id} className="flex items-center gap-3 rounded-lg bg-white border border-[var(--color-line)] px-3 py-2 text-sm">
                  <span className={`w-2.5 h-2.5 rounded-full ${item.state === 'done' ? 'bg-[var(--color-ok)]' : item.state === 'error' ? 'bg-[var(--color-pen)]' : item.state === 'running' ? 'bg-[var(--color-accent)] animate-pulse' : 'bg-gray-300'}`} />
                  <span className="font-semibold">{item.label}</span>
                  <span className="text-[var(--color-ink-soft)] truncate">{item.state === 'running' ? '푸는 중…' : item.state === 'waiting' ? '대기' : item.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'manual' && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-[var(--color-ink-soft)]">다른 AI 서비스(ChatGPT, Gemini 등)에서 받은 답이나 학생 답을 OMR에 직접 마킹해 기록합니다.</p>
          <div className="flex flex-wrap gap-2">
            <input className="input flex-1 min-w-[12rem]" value={manualName} placeholder="이름 (예: GPT-6.2 웹, 학생 평균)" onChange={e => setManualName(e.target.value)} />
            <button type="button" className="btn btn-primary" onClick={createManual}>빈 OMR 만들기</button>
          </div>
        </div>
      )}

      {tab === 'import' && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-[var(--color-ink-soft)]">다른 도구로 만든 결과를 JSON으로 붙여넣거나 파일로 올립니다. 여러 모델은 배열로 넣으세요.</p>
          <textarea className="input font-mono text-xs min-h-36" value={importText} placeholder={IMPORT_EXAMPLE} onChange={e => setImportText(e.target.value)} />
          {importError && <p className="text-sm text-[var(--color-pen)]">{importError}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" disabled={!importText.trim()} onClick={() => doImport()}>가져오기</button>
            <label className="btn btn-ghost">
              JSON 파일 선택
              <input type="file" accept="application/json,.json" className="hidden" onChange={async e => { const file = e.target.files?.[0]; if (file) doImport(await file.text()); e.target.value = '' }} />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
