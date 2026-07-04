import React, { useState } from 'react'
import { AppSettings } from '../types'
import { getSettings, saveSettings, defaultSettings } from '../lib/storage'

export default function SettingsScreen() {
  const [settings, setSettings] = useState<AppSettings>(getSettings())
  const [saved, setSaved] = useState(false)

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }))
    setSaved(false)
  }

  function handleSave() {
    saveSettings(settings)
    setSaved(true)
  }

  function resetDefaults() {
    setSettings(defaultSettings)
  }

  return (
    <div className="card">
      <div className="section-title">設定</div>
      <div className="form-row">
        <label>表示名</label>
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
        <label>ブランドカラー（グラデーション開始 / 終了）</label>
        <div style={{ display: 'flex', gap: 10 }}>
          <input type="color" value={settings.brandColorFrom} onChange={(e) => update('brandColorFrom', e.target.value)} />
          <input type="color" value={settings.brandColorTo} onChange={(e) => update('brandColorTo', e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <label>禁止表現（カンマ区切り）</label>
        <textarea
          value={settings.forbiddenWords.join(', ')}
          onChange={(e) => update('forbiddenWords', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
        />
      </div>
      <div className="form-row">
        <label>ハッシュタグ基本セット（カンマ区切り・#は不要）</label>
        <textarea
          value={settings.baseHashtags.join(', ')}
          onChange={(e) => update('baseHashtags', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
        />
      </div>
      <div className="form-row">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={settings.usePhotosForTrustPosts}
            onChange={(e) => update('usePhotosForTrustPosts', e.target.checked)}
          />
          信頼形成・導線系投稿（フィード3回目／ストーリーズ4・5回目）で、写真素材集に登録済みの本人写真を背景に使う
        </label>
        <div className="helper-text">
          オンにすると、対象の投稿だけ「写真素材集」でタグ付けした本人写真を背景に使用します。通常投稿（問題提起・教育気づき・日常人柄）は今まで通り背景テンプレート＋テキストのままです。該当タグの写真が未登録の場合は自動的に通常の背景にフォールバックします。
        </div>
      </div>
      <div className="btn-row">
        <button className="btn btn-primary" onClick={handleSave}>保存する</button>
        <button className="btn btn-ghost" onClick={resetDefaults}>初期値に戻す</button>
      </div>
      {saved && <div className="helper-text" style={{ marginTop: 8 }}>保存しました。</div>}
    </div>
  )
}
