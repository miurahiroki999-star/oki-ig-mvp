import React, { useState } from 'react'
import { ThreadsDraft, ThreadsPatternKey } from '../types'
import { getSettings, getNoteThreadsHistory, appendNoteThreadsHistory, saveThreadsDraft, getNoteDrafts } from '../lib/storage'
import { generateNoteThreadsCore, buildThreadsDraftsForDay, toNoteThreadsHistoryEntry, SourceSelection } from '../lib/noteThreadsPlan'
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

// v2仕様: 1日3本体制。1回の生成操作で7:00(B)/12:30(A)/21:30(C)をまとめて出力する。
export default function ThreadsScreen({ source, onSourceChange, memo, onMemoChange }: Props) {
  const [drafts, setDrafts] = useState<ThreadsDraft[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
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
      const printDate = todayStr()

      // 同日・同テーマで生成済みのNOTE記事があれば、公開後URL(手動入力済みの場合)をA(12:30枠)へ自動で紐づける
      const todaysNote = getNoteDrafts()
        .filter((d) => d.printDate === printDate && d.sourceTheme === source.theme)
        .slice(-1)[0]

      const newDrafts = buildThreadsDraftsForDay(core, source, {
        idPrefix: `threads-${printDate}-${Date.now()}`,
        printDate,
        regenerationCount: drafts ? drafts[0].regenerationCount + 1 : 0,
        noteUrl: todaysNote?.publishedUrl
      })

      newDrafts.forEach((d) => saveThreadsDraft(d))
      appendNoteThreadsHistory(
        newDrafts.map((d) => toNoteThreadsHistoryEntry(source, core, printDate, { pattern: d.pattern, body: d.bodyText }))
      )
      setDrafts(newDrafts)
      setEditingIndex(null)
    } finally {
      setLoading(false)
    }
  }

  function startEdit(index: number) {
    if (!drafts) return
    setDraftText(drafts[index].bodyText)
    setEditingIndex(index)
  }

  function saveEdit(index: number) {
    if (!drafts) return
    const updated = drafts.map((d, i) => (i === index ? { ...d, bodyText: draftText } : d))
    setDrafts(updated)
    saveThreadsDraft(updated[index])
    setEditingIndex(null)
  }

  async function copyBody(index: number) {
    if (!drafts) return
    await navigator.clipboard.writeText(drafts[index].bodyText)
    alert('Threads本文をコピーしました。Threadsにそのまま貼り付けできます。')
  }

  return (
    <div>
      <SourceSelector source={source} onSourceChange={onSourceChange} memo={memo} onMemoChange={onMemoChange} />

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="section-title">Threads下書き生成</div>
        <div className="helper-text" style={{ marginBottom: 12 }}>
          1回の生成操作で1日3本（7:00＝断定意見型／12:30＝リンクシェア型／21:30＝マントラ列挙型）をまとめて作成します。
          投稿間隔を4時間以上空けるThreadsのアルゴリズム推奨に合わせた時間割です。ハッシュタグは付けません。Threadsへの投稿は行いません（下書きの生成まで）。
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={handleGenerate} disabled={loading || !source}>
            {loading ? '生成中...' : drafts ? '3投稿をまとめて再生成' : '3投稿をまとめて生成する'}
          </button>
        </div>
        {error && <div className="helper-text" style={{ marginTop: 8, color: '#c0503f' }}>{error}</div>}
      </div>

      {drafts && drafts.map((draft, index) => (
        <div className="card" style={{ marginBottom: 16 }} key={draft.id}>
          <div className="carousel-card-header">
            <span className="post-tag">
              {draft.publishTime}公開 ・ {PATTERN_LABEL[draft.pattern]} ・ テーマ:{draft.sourceTheme} ・ {draft.source === 'ai' ? 'AI生成' : 'ローカル生成'}
            </span>
            {draft.regenerationCount > 0 && <span className="helper-text">再生成 {draft.regenerationCount} 回</span>}
          </div>

          {draft.pattern === 'link_share' && (
            <div className="helper-text" style={{ marginTop: 8 }}>
              NOTEタブで「公開後のNOTE記事URL」を入力・保存すると、次回生成時にこの本文へ自動で反映されます。未入力の間はプレースホルダーのままです。
            </div>
          )}

          {editingIndex !== index ? (
            <div className="post-body-text" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{draft.bodyText}</div>
          ) : (
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              style={{ minHeight: 160, padding: 8, borderRadius: 8, border: '1px solid #dcece0', fontSize: 12.5, width: '100%', marginTop: 8 }}
            />
          )}

          <div className="post-actions" style={{ marginTop: 10 }}>
            {editingIndex !== index ? (
              <>
                <button className="mini-btn" onClick={() => copyBody(index)}>Threads本文をコピー</button>
                <button className="mini-btn" onClick={() => startEdit(index)}>本文を編集</button>
              </>
            ) : (
              <>
                <button className="mini-btn" onClick={() => saveEdit(index)}>保存する</button>
                <button className="mini-btn" onClick={() => setEditingIndex(null)}>キャンセル</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
