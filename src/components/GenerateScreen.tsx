import React, { useState } from 'react'
import { ALL_THEMES, CarouselPost, HistoryEntry, HistoryEntryType, Theme } from '../types'
import { getSettings, getHistory, appendHistory, saveBatch, getNextPrintRun, getBatches } from '../lib/storage'
import { planThemesForDay, buildDayPosts, regenerateSinglePost, toCarouselPost } from '../lib/contentPlan'
import { renderAllSlides } from '../lib/imageGen'
import { exportBatchZip } from '../lib/zipExport'
import CarouselPostCard from './CarouselPostCard'

function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}


function normalizeForHistory(text: string): string {
  return (text || '')
    .replace(/\s+/g, '')
    .replace(/[、。,.，．！？!?\-ー—―「」『』（）()【】［］\[\]・✔●○\u3000]/g, '')
    .trim()
}

function slideFingerprintForHistory(role: string | undefined, text: string): string {
  return `${role || '本文'}:${normalizeForHistory(text)}`
}

function toHistoryEntry(p: CarouselPost, entryType: HistoryEntryType): HistoryEntry {
  const topSlide = p.slides.find((s) => s.role === 'TOP')
  const middleSlides = p.slides.filter((s) => s.role !== 'TOP' && s.role !== 'CTA')
  const problem = middleSlides.find((s) => s.role === '問題提起')
  return {
    id: `${p.id}-${entryType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    printDate: p.printDate,
    printRun: p.printRun,
    dayIndex: p.dayIndex,
    postIndex: p.postIndex,
    publishTime: p.publishTime,
    theme: p.theme,
    postTitle: p.postTitle,
    topHeadline: topSlide?.headline || p.postTitle,
    captionLead: p.captionLead,
    problemFingerprint: problem ? slideFingerprintForHistory('問題提起', problem.mainText || '') : undefined,
    slideFingerprints: middleSlides.map((s) => slideFingerprintForHistory(s.role, s.mainText || '')).filter(Boolean),
    slideMainTexts: middleSlides.map((s) => (s.mainText || '').trim()).filter(Boolean),
    entryType,
    source: p.source
  }
}

export default function GenerateScreen() {
  const [days, setDays] = useState(1)
  const [themeChoice, setThemeChoice] = useState<Theme | 'auto'>('auto')
  const [memo, setMemo] = useState('')
  const [posts, setPosts] = useState<CarouselPost[]>([])
  const [printDate, setPrintDate] = useState<string>('')
  const [printRun, setPrintRun] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)

  const settings = getSettings()
  const postsPerDay = settings.postsPerDay

  const groupedByDay = posts.reduce<Record<number, CarouselPost[]>>((acc, p) => {
    ;(acc[p.dayIndex] ||= []).push(p)
    return acc
  }, {})

  async function handleGenerate() {
    setLoading(true)
    setPosts([])
    try {
      const settings = getSettings()
      let history = getHistory()

      const date = todayStr()
      const run = getNextPrintRun(date)
      setPrintDate(date)
      setPrintRun(run)

      const seedBase = Date.now() % 100000
      const allPosts: CarouselPost[] = []

      for (let d = 1; d <= days; d++) {
        setProgress(`${d} / ${days} 日目を生成中...（1日${postsPerDay}投稿・OpenAI APIで文章生成 → 失敗時のみローカル生成）`)
        await new Promise((r) => requestAnimationFrame(r))

        const combinedHistory = [...history, ...allPosts.map((p) => toHistoryEntry(p, 'generated'))]
        const themes = planThemesForDay(d, themeChoice, postsPerDay, memo, seedBase)
        const planned = await buildDayPosts(d, themes, combinedHistory, settings, seedBase + d * 10, memo)

        for (const p of planned) {
          setProgress(`${d} / ${days} 日目 ・ ${p.postIndex} / ${postsPerDay} 投稿目のカルーセル画像を生成中...`)
          await new Promise((r) => requestAnimationFrame(r))
          const slidesWithImages = await renderAllSlides(p.slides, settings.displayName, settings.title, p.theme, p.postIndex)
          const full = toCarouselPost(
            { ...p, slides: slidesWithImages },
            {
              id: `${date}-${run}-${p.dayIndex}-${p.postIndex}`,
              printDate: date,
              printRun: run,
              createdAt: new Date().toISOString(),
              regenerationCount: 0
            }
          )
          allPosts.push(full)
        }
      }

      setPosts(allPosts)
      saveBatch({ printDate: date, printRun: run, days, postsPerDay, memo, theme: themeChoice, posts: allPosts, createdAt: new Date().toISOString() })
      appendHistory(allPosts.map((p) => toHistoryEntry(p, 'generated')))
    } finally {
      setLoading(false)
      setProgress('')
    }
  }

  function persistUpdatedPost(updated: CarouselPost, entryType: HistoryEntryType) {
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    appendHistory([toHistoryEntry(updated, entryType)])
    const batches = getBatches()
    const b = batches.find((b) => b.printDate === updated.printDate && b.printRun === updated.printRun)
    if (b) {
      b.posts = b.posts.map((p) => (p.id === updated.id ? updated : p))
      saveBatch(b)
    }
  }

  function handleSaveCaption(updated: CarouselPost) {
    persistUpdatedPost(updated, 'generated')
  }

  async function handleFullRegenerate(post: CarouselPost) {
    setRegeneratingId(post.id)
    try {
      const settings = getSettings()
      const history = getHistory()
      const seed = Date.now() % 100000
      const result = await regenerateSinglePost(post.theme, history, settings, seed, memo)
      const slidesWithImages = await renderAllSlides(result.slides, settings.displayName, settings.title, post.theme, post.postIndex)

      const updated: CarouselPost = {
        ...post,
        postTitle: result.postTitle,
        slides: slidesWithImages,
        caption: result.caption,
        captionLead: result.captionLead,
        hashtags: result.hashtags,
        regenerationCount: post.regenerationCount + 1,
        source: result.source
      }
      persistUpdatedPost(updated, 'regenerated')
    } finally {
      setRegeneratingId(null)
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="section-title">投稿生成</div>
        <div className="helper-text" style={{ marginBottom: 12 }}>
          生成日数・テーマ指定・任意メモを入れて生成すると、1日あたりカルーセル投稿{postsPerDay}本（1投稿あたり画像{settings.slidesPerPost}枚前後＋投稿欄本文1本）を自動作成します。
          各投稿はまずOpenAI APIで文章を生成し、失敗時のみローカルフレーズバンクに切り替わります。ストーリーズは生成しません。
        </div>
        <div className="form-row">
          <label>生成日数（例：1 / 3 / 7）</label>
          <input type="number" min={1} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value)))} />
        </div>
        <div className="form-row">
          <label>テーマ指定</label>
          <select value={themeChoice} onChange={(e) => setThemeChoice(e.target.value as Theme | 'auto')}>
            <option value="auto">自動配分（テーマをローテーション）</option>
            {ALL_THEMES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>自由メモ（任意）</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="例：人と会うと疲れる人向け／ご縁と瞑想を多めに"
          />
        </div>
        <div className="helper-text">投稿本数：1日{postsPerDay}本（固定・変更は設定画面の内部設定から）</div>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
            {loading ? '生成中...' : '生成する'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => posts.length > 0 && exportBatchZip(posts, printDate, printRun, days, postsPerDay)}
            disabled={posts.length === 0}
          >
            全体ZIPダウンロード
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
          const dayPosts = groupedByDay[dayIndex].sort((a, b) => a.postIndex - b.postIndex)
          return (
            <div className="day-block" key={dayIndex}>
              <div className="day-heading">{dayIndex}日目</div>
              <div className="carousel-grid">
                {dayPosts.map((p) => (
                  <CarouselPostCard
                    key={p.id}
                    post={p}
                    onSaveCaption={handleSaveCaption}
                    onFullRegenerate={handleFullRegenerate}
                    regenerating={regeneratingId === p.id}
                  />
                ))}
              </div>
            </div>
          )
        })}
    </div>
  )
}
