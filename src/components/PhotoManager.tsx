import React, { useRef, useState } from 'react'
import { PhotoAsset } from '../types'
import { getPhotos, savePhotos, getSettings } from '../lib/storage'

const TAG_CANDIDATES = [
  '笑顔', '真剣', '瞑想', '講演風', '対談風', '経営者感', '爽やか',
  '信頼形成向き', '導線向き', 'セッション案内向き', 'Life Wellness Association向き'
]

export default function PhotoManager() {
  const [photos, setPhotos] = useState<PhotoAsset[]>(getPhotos())
  const [tagging, setTagging] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function persist(next: PhotoAsset[]) {
    setPhotos(next)
    savePhotos(next)
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return
    const newPhotos: PhotoAsset[] = []
    for (const file of Array.from(files)) {
      const dataUrl: string = await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })
      newPhotos.push({ id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: file.name, dataUrl, tags: [], createdAt: new Date().toISOString() })
    }
    persist([...photos, ...newPhotos])
  }

  async function autoTag(photo: PhotoAsset) {
    setTagging(photo.id)
    try {
      const settings = getSettings()
      const res = await fetch('/.netlify/functions/tag-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: photo.dataUrl, model: settings.openaiModel })
      })
      if (!res.ok) throw new Error('unavailable')
      const data = await res.json()
      updateTags(photo.id, data.tags || [])
    } catch {
      alert('自動タグ付け（OpenAI Vision）が利用できませんでした。手動でタグを選択してください。\n（OPENAI_API_KEY未設定の場合はこの表示になります）')
    } finally {
      setTagging(null)
    }
  }

  function updateTags(id: string, tags: string[]) {
    const next = photos.map((p) => (p.id === id ? { ...p, tags } : p))
    persist(next)
  }

  function toggleTag(photo: PhotoAsset, tag: string) {
    const has = photo.tags.includes(tag)
    updateTags(photo.id, has ? photo.tags.filter((t) => t !== tag) : [...photo.tags, tag])
  }

  function remove(id: string) {
    persist(photos.filter((p) => p.id !== id))
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="section-title">写真素材集</div>
        <div className="helper-text" style={{ marginBottom: 12 }}>
          信頼形成系・導線系・About me・自己開示などの投稿で使う本人写真を、あらかじめここに登録しておきます。
          投稿ごとのアップロードは不要です。
        </div>
        <input ref={inputRef} type="file" accept="image/*" multiple onChange={(e) => handleFiles(e.target.files)} />
      </div>

      <div className="card">
        <div className="section-title">登録済み写真（{photos.length}）</div>
        <div className="template-grid">
          {photos.map((p) => (
            <div key={p.id} className="card" style={{ padding: 10 }}>
              <img src={p.dataUrl} alt={p.name} style={{ width: '100%', borderRadius: 10, marginBottom: 8 }} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {TAG_CANDIDATES.map((tag) => (
                  <button
                    key={tag}
                    className="mini-btn"
                    style={{ background: p.tags.includes(tag) ? '#bfe8c4' : '#fff' }}
                    onClick={() => toggleTag(p, tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <div className="btn-row">
                <button className="mini-btn" onClick={() => autoTag(p)} disabled={tagging === p.id}>
                  {tagging === p.id ? 'タグ付け中...' : 'AI自動タグ付け'}
                </button>
                <button className="mini-btn" onClick={() => remove(p.id)}>削除</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
