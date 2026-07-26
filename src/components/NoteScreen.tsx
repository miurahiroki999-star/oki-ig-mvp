import React, { useState } from 'react'
import { NoteDraft } from '../types'
import { getSettings, getNoteThreadsHistory, appendNoteThreadsHistory, saveNoteDraft } from '../lib/storage'
import { generateNoteThreadsCore, buildNoteDraft, toNoteThreadsHistoryEntry, SourceSelection } from '../lib/noteThreadsPlan'
import { buildNoteImagePrompt, generateNoteHeadlineImage } from '../lib/noteImageGen'
import { todayStr } from '../lib/dateUtil'
import SourceSelector from './SourceSelector'

interface Props {
  source: SourceSelection | null
  onSourceChange: (s: SourceSelection) => void
  memo: string
  onMemoChange: (memo: string) => void
}

export default function NoteScreen({ source, onSourceChange, memo, onMemoChange }: Props) {
  const [draft, setDraft] = useState<NoteDraft | null>(null)
  const [loading, setLoading] = useState(false)
  const [imageLoading, setImageLoading] = useState(false)
  const [error, setError] = useState('')

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
      const newDraft = buildNoteDraft(core, source, settings, {
        id: `note-${printDate}-${Date.now()}`,
        printDate,
        regenerationCount: draft ? draft.regenerationCount + 1 : 0
      })
      newDraft.imagePrompt = buildNoteImagePrompt(source.theme, core.noteTitle, settings.displayName, settings.title)
      setDraft(newDraft)
      saveNoteDraft(newDraft)
      appendNoteThreadsHistory([toNoteThreadsHistoryEntry(source, core, printDate)])
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerateImage() {
    if (!draft) return
    setImageLoading(true)
    try {
      const imageDataUrl = await generateNoteHeadlineImage(draft.imagePrompt)
      if (!imageDataUrl) {
        setError('見出し画像の生成に失敗しました。OpenAI画像生成APIの設定・応答時間をご確認のうえ、もう一度お試しください。')
        return
      }
      const updated = { ...draft, imageDataUrl }
      setDraft(updated)
      saveNoteDraft(updated)
    } finally {
      setImageLoading(false)
    }
  }

  async function copyBody() {
    if (!draft) return
    await navigator.clipboard.writeText(draft.bodyMarkdown)
    alert('NOTE本文をコピーしました。NOTEのエディタに貼り付けてください。')
  }

  function downloadImage() {
    if (!draft?.imageDataUrl) return
    const a = document.createElement('a')
    a.href = draft.imageDataUrl
    a.download = `${draft.printDate}_NOTE見出し画像_${draft.sourceTheme}.png`
    a.click()
  }

  function sanitizeFilenamePart(text: string): string {
    return text
      .replace(/[\\/:*?"<>|\n\r]/g, '')
      .trim()
      .slice(0, 40)
  }

  function downloadMarkdown() {
    if (!draft) return
    const blob = new Blob([draft.bodyMarkdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${draft.printDate}_${sanitizeFilenamePart(draft.title)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  function updatePublishedUrlLocal(value: string) {
    if (!draft) return
    setDraft({ ...draft, publishedUrl: value })
  }

  function persistPublishedUrl() {
    if (!draft) return
    saveNoteDraft(draft)
  }

  return (
    <div>
      <SourceSelector source={source} onSourceChange={onSourceChange} memo={memo} onMemoChange={onMemoChange} />

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="section-title">NOTE下書き生成</div>
        <div className="helper-text" style={{ marginBottom: 12 }}>
          1日1本、コピペ前提のNOTE記事下書きを生成します。まずOpenAI APIで生成し、失敗時のみローカルフレーズバンクに切り替わります。
          NOTE投稿は行いません（下書きの生成まで）。
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={handleGenerate} disabled={loading || !source}>
            {loading ? '生成中...' : draft ? 'この投稿を再生成' : 'NOTE下書きを生成する'}
          </button>
        </div>
        {error && <div className="helper-text" style={{ marginTop: 8, color: '#c0503f' }}>{error}</div>}
      </div>

      {draft && (
        <div className="card">
          <div className="carousel-card-header">
            <span className="post-tag">
              {draft.printDate} ・ テーマ:{draft.sourceTheme} ・ {draft.source === 'ai' ? 'AI生成' : 'ローカル生成'}
            </span>
            {draft.regenerationCount > 0 && <span className="helper-text">再生成 {draft.regenerationCount} 回</span>}
          </div>

          <div className="post-title" style={{ marginTop: 8 }}>{draft.title}</div>

          <div className="note-body-preview">{draft.bodyMarkdown}</div>

          <div className="helper-text" style={{ marginTop: 8 }}>
            ※ NOTEのエディタに貼り付けた後、見出し・太字・箇条書きが崩れていないか必ず目視確認してください。
          </div>

          <div className="post-actions" style={{ marginTop: 10 }}>
            <button className="mini-btn" onClick={copyBody}>NOTE本文をコピー</button>
            <button className="mini-btn" onClick={downloadMarkdown}>.mdダウンロード</button>
            <button className="mini-btn" onClick={handleGenerateImage} disabled={imageLoading}>
              {imageLoading ? '見出し画像を生成中...' : '見出し画像を生成'}
            </button>
            {draft.imageDataUrl && (
              <button className="mini-btn" onClick={downloadImage}>見出し画像をダウンロード</button>
            )}
          </div>

          <div className="form-row" style={{ marginTop: 12 }}>
            <label>公開後のNOTE記事URL（任意・Threadsのリンクシェア型に自動反映されます）</label>
            <input
              value={draft.publishedUrl || ''}
              onChange={(e) => updatePublishedUrlLocal(e.target.value)}
              onBlur={persistPublishedUrl}
              placeholder="https://note.com/..."
            />
          </div>

          {draft.imageDataUrl && (
            <div className="note-image-preview">
              <img src={draft.imageDataUrl} alt="NOTE見出し画像" />
              <div className="helper-text">
                NOTEに直接アップロードするAPIはありません。ダウンロードした画像を、貼り付け時に手動でNOTEの見出し画像欄にアップロードしてください。
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
