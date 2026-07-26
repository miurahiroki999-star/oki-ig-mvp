import React, { useState } from 'react'
import { ThreadsDraft, ThreadsPatternKey } from '../types'
import { getSettings, getNoteThreadsHistory, appendNoteThreadsHistory, saveThreadsDraft } from '../lib/storage'
import { generateNoteThreadsCore, buildThreadsDraft, toNoteThreadsHistoryEntry, pickRandomThreadsPattern, SourceSelection } from '../lib/noteThreadsPlan'
import { todayStr } from '../lib/dateUtil'
import SourceSelector from './SourceSelector'

interface Props {
  source: SourceSelection | null
  onSourceChange: (s: SourceSelection) => void
  memo: string
  onMemoChange: (memo: string) => void
}

const PATTERN_LABEL: Record<ThreadsPatternKey, string> = {
  link_share: 'A: リンクシェア型',
  assertive: 'B: 断定意見型',
  mantra: 'C: マントラ列挙型'
}

export default function ThreadsScreen({ source, onSourceChange, memo, onMemoChange }: Props) {
  const [draft, setDraft] = useState<ThreadsDraft | null>(null)
  const [patternChoice, setPatternChoice] = useState<ThreadsPatternKey | 'random'>('random')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [draftText, setDraftText] = useState('')

  async function handleGenerate() {
    if (!source) {
      setError('先にネタ元を選択してください。')
      return
    }
    setError('')
    setLoading(true)
    try {
      const settings = getSettings()
      const history = getNoteThreadsHistory()
      const core = await generateNoteThreadsCore(source, settings, history, memo)
      const pattern = patternChoice === 'random' ? pickRandomThreadsPattern() : patternChoice
      const printDate = todayStr()
      const newDraft = buildThreadsDraft(core, source, pattern, {
        id: `threads-${printDate}-${Date.now()}`,
        printDate,
        regenerationCount: draft ? draft.regenerationCount + 1 : 0,
        noteUrl: draft?.noteUrl
      })
      setDraft(newDraft)
      setDraftText(newDraft.bodyText)
      saveThreadsDraft(newDraft)
      appendNoteThreadsHistory([toNoteThreadsHistoryEntry(source, core, printDate, { pattern, body: newDraft.bodyText })])
    } finally {
      setLoading(false)
    }
  }

  function saveEdit() {
    if (!draft) return
    const updated = { ...draft, bodyText: draftText }
    setDraft(updated)
    saveThreadsDraft(updated)
    setEditing(false)
  }

  async function copyBody() {
    if (!draft) return
    await navigator.clipboard.writeText(draft.bodyText)
    alert('Threads本文をコピーしました。Threadsにそのまま貼り付けできます。')
  }

  return (
    <div>
      <SourceSelector source={source} onSourceChange={onSourceChange} memo={memo} onMemoChange={onMemoChange} />

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="section-title">Threads下書き生成</div>
        <div className="helper-text" style={{ marginBottom: 12 }}>
          1日1本、コピペ前提のThreads投稿下書きを生成します。3パターン（リンクシェア／断定意見／マントラ列挙）から自動選択します。
          ハッシュタグは付けません。Threadsへの投稿は行いません（下書きの生成まで）。
        </div>
        <div className="form-row">
          <label>パターン</label>
          <select value={patternChoice} onChange={(e) => setPatternChoice(e.target.value as ThreadsPatternKey | 'random')}>
            <option value="random">ランダム選択（推奨）</option>
            <option value="link_share">{PATTERN_LABEL.link_share}</option>
            <option value="assertive">{PATTERN_LABEL.assertive}</option>
            <option value="mantra">{PATTERN_LABEL.mantra}</option>
          </select>
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={handleGenerate} disabled={loading || !source}>
            {loading ? '生成中...' : draft ? 'この投稿を再生成' : 'Threads下書きを生成する'}
          </button>
        </div>
        {error && <div className="helper-text" style={{ marginTop: 8, color: '#c0503f' }}>{error}</div>}
      </div>

      {draft && (
        <div className="card">
          <div className="carousel-card-header">
            <span className="post-tag">
              {draft.printDate} ・ テーマ:{draft.sourceTheme} ・ {PATTERN_LABEL[draft.pattern]} ・ {draft.source === 'ai' ? 'AI生成' : 'ローカル生成'}
            </span>
            {draft.regenerationCount > 0 && <span className="helper-text">再生成 {draft.regenerationCount} 回</span>}
          </div>

          {draft.pattern === 'link_share' && (
            <div className="helper-text" style={{ marginTop: 8 }}>
              NOTE記事を公開した後、下の本文を「編集」して記事URLに差し替えてください（未公開の間はプレースホルダーのままです）。
            </div>
          )}

          {!editing ? (
            <div className="post-body-text" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{draft.bodyText}</div>
          ) : (
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              style={{ minHeight: 160, padding: 8, borderRadius: 8, border: '1px solid #dcece0', fontSize: 12.5, width: '100%', marginTop: 8 }}
            />
          )}

          <div className="post-actions" style={{ marginTop: 10 }}>
            {!editing ? (
              <>
                <button className="mini-btn" onClick={copyBody}>Threads本文をコピー</button>
                <button className="mini-btn" onClick={() => { setDraftText(draft.bodyText); setEditing(true) }}>本文を編集</button>
              </>
            ) : (
              <>
                <button className="mini-btn" onClick={saveEdit}>保存する</button>
                <button className="mini-btn" onClick={() => setEditing(false)}>キャンセル</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
