import React, { useState } from 'react'
import { AppSettings } from '../types'
import { getSettings, saveSettings, resetSettingsToDefaults, resetHistory } from '../lib/storage'

export default function SettingsScreen() {
  const [settings, setSettings] = useState<AppSettings>(getSettings())
  const [saved, setSaved] = useState(false)
  const [historyCleared, setHistoryCleared] = useState(false)

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }))
    setSaved(false)
  }

  function handleSave() {
    saveSettings(settings)
    setSaved(true)
  }

  function resetDefaults() {
    setSettings(resetSettingsToDefaults())
    setSaved(true)
  }

  function handleResetHistory() {
    if (!confirm('重複回避用の生成履歴をリセットします。よろしいですか？（生成済みのZIP・画像には影響しません）')) return
    resetHistory()
    setHistoryCleared(true)
  }

  return (
    <div className="card">
      <div className="section-title">設定</div>

      <div className="form-row">
        <label>表示名（TOP・CTA・中ページフッターに表示）</label>
        <input value={settings.displayName} onChange={(e) => update('displayName', e.target.value)} />
      </div>
      <div className="form-row">
        <label>肩書き</label>
        <input value={settings.title} onChange={(e) => update('title', e.target.value)} />
      </div>
      <div className="form-row">
        <label>公式LINE URL</label>
        <input value={settings.lineUrl} onChange={(e) => update('lineUrl', e.target.value)} />
      </div>
      <div className="form-row">
        <label>OpenAIモデル名（環境変数OPENAI_MODELより優先されます）</label>
        <input value={settings.openaiModel} onChange={(e) => update('openaiModel', e.target.value)} />
      </div>

      <div className="form-row">
        <label>1日あたりの投稿本数（標準5固定：6:30 / 9:30 / 12:30 / 18:30 / 21:00）</label>
        <input
          type="number"
          min={5}
          max={5}
          value={settings.postsPerDay}
          onChange={() => update('postsPerDay', 5)}
        />
      </div>
      <div className="form-row">
        <label>1投稿あたりのスライド枚数（内部設定・基本8、テーマにより9〜10まで可変）</label>
        <input
          type="number"
          min={8}
          max={10}
          value={settings.slidesPerPost}
          onChange={(e) => update('slidesPerPost', Math.max(8, Math.min(10, Number(e.target.value))))}
        />
      </div>

      <div className="section-title" style={{ fontSize: 16, marginTop: 24 }}>投稿欄本文の固定ブロック</div>
      <div className="helper-text" style={{ marginBottom: 12 }}>
        service / Present / profile / よくある相談 は応樹さんから素材回収中のため、下記の仮置き文言を差し替えられるようにしています。生成時は毎回この内容がそのまま投稿欄本文に挿入されます。
      </div>

      <div className="form-row">
        <label>よくある相談 / お客様の声ブロック</label>
        <textarea style={{ minHeight: 110 }} value={settings.testimonialBlock} onChange={(e) => update('testimonialBlock', e.target.value)} />
      </div>
      <div className="form-row">
        <label>serviceブロック</label>
        <textarea style={{ minHeight: 110 }} value={settings.serviceBlock} onChange={(e) => update('serviceBlock', e.target.value)} />
      </div>
      <div className="form-row">
        <label>Presentブロック</label>
        <textarea style={{ minHeight: 90 }} value={settings.presentBlock} onChange={(e) => update('presentBlock', e.target.value)} />
      </div>
      <div className="form-row">
        <label>profileブロック</label>
        <textarea style={{ minHeight: 90 }} value={settings.profileBlock} onChange={(e) => update('profileBlock', e.target.value)} />
      </div>

      <div className="form-row">
        <label>禁止表現（カンマ区切り）</label>
        <textarea
          value={settings.forbiddenWords.join(', ')}
          onChange={(e) => update('forbiddenWords', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
        />
      </div>
      <div className="form-row">
        <label>ハッシュタグ基本セット（カンマ区切り・#は不要・8〜12個程度。20個以上は禁止）</label>
        <textarea
          value={settings.baseHashtags.join(', ')}
          onChange={(e) => update('baseHashtags', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
        />
      </div>

      <div className="btn-row">
        <button className="btn btn-primary" onClick={handleSave}>保存する</button>
        <button className="btn btn-ghost" onClick={resetDefaults}>初期値に戻す</button>
        <button className="btn btn-ghost" onClick={handleResetHistory}>重複回避履歴をリセット</button>
      </div>
      {saved && <div className="helper-text" style={{ marginTop: 8 }}>保存しました。</div>}
      {historyCleared && <div className="helper-text" style={{ marginTop: 8 }}>履歴をリセットしました。</div>}
    </div>
  )
}
