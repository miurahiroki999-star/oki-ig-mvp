import React, { useState } from 'react'
import { GeneratedPost, HistoryEntry, HistoryEntryType, PhotoAsset, PHOTO_ELIGIBLE_ROLES } from '../types'
import { getSettings, getTemplates, getHistory, appendHistory, saveBatch, getNextPrintRun, getBatches, getPhotos } from '../lib/storage'
import { planThemesForDays, buildDayPosts, regenerateSingleContent } from '../lib/contentPlan'
import { pickTemplate, pickPhotoForRole } from '../lib/templateRotation'
import { renderPostImage } from '../lib/imageGen'
import { exportBatchZip } from '../lib/zipExport'
import PostCard from './PostCard'

function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toHistoryEntry(p: GeneratedPost, entryType: HistoryEntryType): HistoryEntry {
  return {
    id: `${p.id}-${entryType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    printDate: p.printDate,
    printRun: p.printRun,
    dayIndex: p.dayIndex,
    orderIndex: p.orderIndex,
    kind: p.kind,
    theme: p.theme,
    role: p.role,
    title: p.title,
    body: p.body,
    approach: p.approach,
    claim: p.claim,
    cta: p.cta,
    hashtags: p.hashtags,
    templateId: p.templateId,
    regenerationCount: p.regenerationCount,
    entryType,
    source: p.source
  }
}

// 信頼形成・導線系投稿かどうか(優先度B拡張: 写真背景を使う対象の判定)
function isPhotoEligible(role: string): boolean {
  return PHOTO_ELIGIBLE_ROLES.includes(role)
}

export default function GenerateScreen() {
  const [days, setDays] = useState(3)
  const [memo, setMemo] = useState('')
  const [posts, setPosts] = useState<GeneratedPost[]>([])
  const [printDate, setPrintDate] = useState<string>('')
  const [printRun, setPrintRun] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')

  const groupedByDay = posts.reduce<Record<number, GeneratedPost[]>>((acc, p) => {
    ;(acc[p.dayIndex] ||= []).push(p)
    return acc
  }, {})

  function pickPhotoIfEligible(role: string, photos: PhotoAsset[], usedPhotoIds: string[]): PhotoAsset | undefined {
    const settings = getSettings()
    if (!settings.usePhotosForTrustPosts) return undefined
    if (!isPhotoEligible(role)) return undefined
    const photo = pickPhotoForRole(role, photos, usedPhotoIds)
    if (photo) usedPhotoIds.push(photo.id)
    return photo
  }

  async function handleGenerate() {
    setLoading(true)
    setPosts([])
    try {
      const settings = getSettings()
      const templates = getTemplates()
      const photos = getPhotos()
      let history = getHistory()

      const date = todayStr()
      const run = getNextPrintRun(date)
      setPrintDate(date)
      setPrintRun(run)

      const seedBase = Date.now() % 100000
      const themes = planThemesForDays(days, memo, seedBase)
      const allPosts: GeneratedPost[] = []
      const pickedTemplateIdsThisBatch: string[] = []
      const usedPhotoIdsThisBatch: string[] = []

      for (let d = 0; d < themes.length; d++) {
        setProgress(`${d + 1} / ${themes.length} 日目を生成中...（OpenAI APIで文章生成 → 失敗時のみローカル生成）`)
        await new Promise((r) => requestAnimationFrame(r))

        const combinedHistory = [...history, ...allPosts.map((p) => toHistoryEntry(p, 'generated'))]
        const planned = await buildDayPosts(d + 1, themes[d], combinedHistory, settings, seedBase + d * 10, memo)

        for (const p of planned.posts) {
          const tpl = pickTemplate(p.kind, templates, combinedHistory, pickedTemplateIdsThisBatch)
          pickedTemplateIdsThisBatch.push(tpl.id)
          const photo = pickPhotoIfEligible(p.role, photos, usedPhotoIdsThisBatch)
          const imageDataUrl = await renderPostImage(p.kind, p.title, tpl, seedBase + p.dayIndex + p.orderIndex, photo)

          const full: GeneratedPost = {
            ...(p as any),
            id: `${date}-${run}-${p.dayIndex}-${p.orderIndex}-${p.kind}`,
            templateId: tpl.id,
            imageDataUrl,
            createdAt: new Date().toISOString(),
            printDate: date,
            printRun: run,
            photoId: photo?.id
          }
          allPosts.push(full)
        }
      }

      setPosts(allPosts)
      saveBatch({ printDate: date, printRun: run, days, memo, posts: allPosts, createdAt: new Date().toISOString() })
      appendHistory(allPosts.map((p) => toHistoryEntry(p, 'generated')))
    } finally {
      setLoading(false)
      setProgress('')
    }
  }

  function persistUpdatedPost(updated: GeneratedPost, entryType: HistoryEntryType) {
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    // 履歴は上書きせず、生成済み・再生成済み・編集済みのすべてを追加保存する
    appendHistory([toHistoryEntry(updated, entryType)])
    const batches = getBatches()
    const b = batches.find((b) => b.printDate === updated.printDate && b.printRun === updated.printRun)
    if (b) {
      b.posts = b.posts.map((p) => (p.id === updated.id ? updated : p))
      saveBatch(b)
    }
  }

  async function handleSaveEdit(updated: GeneratedPost, regenerateImageOnly: boolean) {
    if (!regenerateImageOnly) {
      persistUpdatedPost(updated, 'edited')
      return
    }
    const templates = getTemplates()
    const tpl = templates.find((t) => t.id === updated.templateId) ?? templates.find((t) => t.kind === updated.kind)!
    const photos = getPhotos()
    const settings = getSettings()
    const photo =
      settings.usePhotosForTrustPosts && isPhotoEligible(updated.role) ? pickPhotoForRole(updated.role, photos, []) : undefined
    const imageDataUrl = await renderPostImage(updated.kind, updated.title, tpl, Date.now() % 1000, photo)
    persistUpdatedPost({ ...updated, imageDataUrl, photoId: photo?.id }, 'edited')
  }

  async function handleFullRegenerate(post: GeneratedPost) {
    const settings = getSettings()
    const history = getHistory()
    const seed = Date.now() % 100000
    const result = await regenerateSingleContent(post.kind, post.role, post.theme, history, settings, seed, memo)

    const templates = getTemplates()
    const tpl = pickTemplate(post.kind, templates, history, [])
    const photos = getPhotos()
    const photo = settings.usePhotosForTrustPosts && isPhotoEligible(post.role) ? pickPhotoForRole(post.role, photos, []) : undefined
    const imageDataUrl = await renderPostImage(post.kind, result.title, tpl, seed, photo)

    const updated: GeneratedPost = {
      ...post,
      title: result.title,
      body: result.body,
      approach: result.approach,
      claim: result.claim,
      cta: result.cta,
      hashtags: result.hashtags,
      templateId: tpl.id,
      imageDataUrl,
      photoId: photo?.id,
      regenerationCount: post.regenerationCount + 1,
      source: result.source
    }
    persistUpdatedPost(updated, 'regenerated')
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="section-title">投稿生成</div>
        <div className="helper-text" style={{ marginBottom: 12 }}>
          生成日数と任意メモだけで、1日あたりフィード3本＋ストーリーズ5本を自動で作成します。
          各投稿はまずOpenAI APIで文章を生成し、失敗時のみローカルフレーズバンクに切り替わります。
        </div>
        <div className="form-row">
          <label>生成日数（例：1 / 3 / 7）</label>
          <input type="number" min={1} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value)))} />
        </div>
        <div className="form-row">
          <label>自由メモ（任意・空欄なら自動配分）</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="例：人間関係多めで／今回はご縁と瞑想を多めに／無料診断導線を少し強めたい"
          />
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
            {loading ? '生成中...' : '生成する'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => posts.length > 0 && exportBatchZip(posts, printDate, printRun)}
            disabled={posts.length === 0}
          >
            ZIPダウンロード
          </button>
        </div>
        {loading && <div className="helper-text" style={{ marginTop: 8 }}>{progress}</div>}
        {printDate && posts.length > 0 && (
          <div className="helper-text" style={{ marginTop: 8 }}>
            打ち出し：{printDate}_{printRun}回目打ち出し
          </div>
        )}
      </div>

      {Object.keys(groupedByDay)
        .map(Number)
        .sort((a, b) => a - b)
        .map((dayIndex) => {
          const dayPosts = groupedByDay[dayIndex]
          const theme = dayPosts[0]?.theme
          const feeds = dayPosts.filter((p) => p.kind === 'フィード').sort((a, b) => a.orderIndex - b.orderIndex)
          const stories = dayPosts.filter((p) => p.kind === 'ストーリーズ').sort((a, b) => a.orderIndex - b.orderIndex)
          return (
            <div className="day-block" key={dayIndex}>
              <div className="day-heading">{dayIndex}日目 ・ テーマ：{theme}</div>
              <div className="post-grid">
                {feeds.map((p) => (
                  <PostCard key={p.id} post={p} onSaveEdit={handleSaveEdit} onFullRegenerate={handleFullRegenerate} />
                ))}
                {stories.map((p) => (
                  <PostCard key={p.id} post={p} onSaveEdit={handleSaveEdit} onFullRegenerate={handleFullRegenerate} />
                ))}
              </div>
            </div>
          )
        })}
    </div>
  )
}
