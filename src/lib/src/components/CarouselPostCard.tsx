import React, { useState } from 'react'
import { CarouselPost } from '../types'
import { exportSinglePostZip } from '../lib/zipExport'

interface Props {
  post: CarouselPost
  onSaveCaption: (updated: CarouselPost) => void
  onFullRegenerate: (post: CarouselPost) => void
  regenerating: boolean
}

export default function CarouselPostCard({ post, onSaveCaption, onFullRegenerate, regenerating }: Props) {
  const [editing, setEditing] = useState(false)
  const [draftCaption, setDraftCaption] = useState(post.caption)
  const [activeSlide, setActiveSlide] = useState(0)

  const copyCaption = async () => {
    await navigator.clipboard.writeText(post.caption)
    alert('投稿欄本文をコピーしました。Instagramの投稿欄にそのまま貼り付けできます。')
  }

  const saveCaption = () => {
    onSaveCaption({ ...post, caption: draftCaption })
    setEditing(false)
  }

  const downloadActiveSlide = () => {
    const slide = post.slides[activeSlide]
    if (!slide?.imageDataUrl) return
    const a = document.createElement('a')
    a.href = slide.imageDataUrl
    a.download = `${post.printDate}_${post.dayIndex}日目_${post.postIndex}投稿目_${String(slide.index).padStart(2, '0')}_${slide.role}.png`
    a.click()
  }

  return (
    <div className="carousel-card">
      <div className="carousel-card-header">
        <span className="post-tag">
          {post.dayIndex}日目 ・ {post.postIndex}投稿目 ・ テーマ:{post.theme} ・ {post.source === 'ai' ? 'AI生成' : 'ローカル生成'}
        </span>
        {post.regenerationCount > 0 && <span className="helper-text">再生成 {post.regenerationCount} 回</span>}
      </div>

      <div className="carousel-main-preview">
        {post.slides[activeSlide]?.imageDataUrl ? (
          <img src={post.slides[activeSlide].imageDataUrl} alt={`${post.postTitle} ${activeSlide + 1}枚目`} />
        ) : (
          <div className="carousel-placeholder">生成中...</div>
        )}
      </div>

      <div className="carousel-thumb-row">
        {post.slides.map((s, i) => (
          <button
            key={s.index}
            className={`carousel-thumb ${i === activeSlide ? 'active' : ''}`}
            onClick={() => setActiveSlide(i)}
            title={`${s.index}枚目・${s.role}`}
          >
            {s.imageDataUrl ? <img src={s.imageDataUrl} alt={s.role} /> : <span className="carousel-thumb-loading">…</span>}
            <span className="carousel-thumb-label">{s.index}</span>
          </button>
        ))}
      </div>

      <div className="post-title">{post.postTitle}</div>

      {!editing ? (
        <div className="post-body-text">{post.caption}</div>
      ) : (
        <textarea
          value={draftCaption}
          onChange={(e) => setDraftCaption(e.target.value)}
          style={{ minHeight: 200, padding: 8, borderRadius: 8, border: '1px solid #dcece0', fontSize: 12.5 }}
        />
      )}

      <div className="post-actions">
        {!editing ? (
          <>
            <button className="mini-btn" onClick={copyCaption}>投稿欄本文をコピー</button>
            <button className="mini-btn" onClick={() => setEditing(true)}>投稿欄本文を編集</button>
            <button className="mini-btn" onClick={() => onFullRegenerate(post)} disabled={regenerating}>
              {regenerating ? '再生成中...' : 'この投稿を再生成'}
            </button>
            <button className="mini-btn" onClick={downloadActiveSlide}>この枚だけPNG保存</button>
            <button className="mini-btn" onClick={() => exportSinglePostZip(post)}>投稿単位でZIP</button>
          </>
        ) : (
          <>
            <button className="mini-btn" onClick={saveCaption}>保存する</button>
            <button className="mini-btn" onClick={() => { setDraftCaption(post.caption); setEditing(false) }}>キャンセル</button>
          </>
        )}
      </div>
    </div>
  )
}
