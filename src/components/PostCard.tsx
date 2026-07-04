import React, { useState } from 'react'
import { GeneratedPost } from '../types'
import { fileBaseName } from '../lib/zipExport'
import { buildManualPrompt } from '../lib/openai'

interface Props {
  post: GeneratedPost
  onSaveEdit: (updated: GeneratedPost, regenerateImageOnly: boolean) => void
  onFullRegenerate: (post: GeneratedPost) => void
}

export default function PostCard({ post, onSaveEdit, onFullRegenerate }: Props) {
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(post.title)
  const [draftBody, setDraftBody] = useState(post.body)
  const [showPrompt, setShowPrompt] = useState(false)

  const copyBody = async () => {
    await navigator.clipboard.writeText(post.body)
    alert('本文をコピーしました。Instagramの投稿欄にそのまま貼り付けできます。')
  }

  const downloadPng = () => {
    if (!post.imageDataUrl) return
    const a = document.createElement('a')
    a.href = post.imageDataUrl
    a.download = `${fileBaseName(post)}.png`
    a.click()
  }

  const downloadTxt = () => {
    const blob = new Blob([post.body], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${fileBaseName(post)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const saveTextEdit = () => {
    onSaveEdit({ ...post, title: draftTitle, body: draftBody }, false)
    setEditing(false)
  }

  const saveTextEditAndRerender = () => {
    onSaveEdit({ ...post, title: draftTitle, body: draftBody }, true)
    setEditing(false)
  }

  return (
    <div className="post-card">
      {post.imageDataUrl && <img src={post.imageDataUrl} alt={post.title} />}
      <div className="post-card-body">
        <span className="post-tag">
          {post.dayIndex}日目 ・ {post.orderIndex}回目 ・ {post.kind}（{post.role}） ・ {post.source === 'ai' ? 'AI生成' : 'ローカル生成'}
        </span>
        {!editing ? (
          <>
            <div className="post-title">{post.title}</div>
            <div className="post-body-text">{post.body}</div>
          </>
        ) : (
          <>
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              style={{ padding: 6, borderRadius: 8, border: '1px solid #dcece0', fontSize: 13 }}
            />
            <textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              style={{ minHeight: 120, padding: 8, borderRadius: 8, border: '1px solid #dcece0', fontSize: 12.5 }}
            />
          </>
        )}

        {showPrompt && (
          <textarea className="prompt-box" readOnly value={buildManualPrompt(post)} />
        )}

        <div className="post-actions">
          {!editing ? (
            <>
              <button className="mini-btn" onClick={copyBody}>コピー</button>
              <button className="mini-btn" onClick={() => setEditing(true)}>編集</button>
              <button className="mini-btn" onClick={() => onFullRegenerate(post)}>再生成</button>
              <button className="mini-btn" onClick={downloadPng} disabled={!post.imageDataUrl}>PNG</button>
              <button className="mini-btn" onClick={downloadTxt}>TXT</button>
              <button className="mini-btn" onClick={() => setShowPrompt((v) => !v)}>
                {showPrompt ? 'プロンプトを閉じる' : 'AIプロンプト'}
              </button>
            </>
          ) : (
            <>
              <button className="mini-btn" onClick={saveTextEdit}>文言だけ保存</button>
              <button className="mini-btn" onClick={saveTextEditAndRerender}>保存して画像も再生成</button>
              <button className="mini-btn" onClick={() => setEditing(false)}>キャンセル</button>
            </>
          )}
        </div>
        {post.regenerationCount > 0 && (
          <span className="helper-text">再生成 {post.regenerationCount} 回</span>
        )}
      </div>
    </div>
  )
}
