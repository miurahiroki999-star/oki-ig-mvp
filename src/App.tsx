import React, { useState } from 'react'
import GenerateScreen from './components/GenerateScreen'
import TemplateManager from './components/TemplateManager'
import PhotoManager from './components/PhotoManager'
import HistoryScreen from './components/HistoryScreen'
import SettingsScreen from './components/SettingsScreen'

type Tab = 'generate' | 'templates' | 'photos' | 'history' | 'settings'

const TABS: { key: Tab; label: string }[] = [
  { key: 'generate', label: '投稿生成' },
  { key: 'templates', label: '背景テンプレート' },
  { key: 'photos', label: '写真素材集' },
  { key: 'history', label: '履歴' },
  { key: 'settings', label: '設定' }
]

export default function App() {
  const [tab, setTab] = useState<Tab>('generate')

  return (
    <div className="app-shell">
      <div className="app-header">
        <div className="app-title">
          応樹さん Instagram投稿生成
          <small>人生の質向上コンサルタント｜フィード＋ストーリーズを量産</small>
        </div>
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`tab-btn ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'generate' && <GenerateScreen />}
      {tab === 'templates' && <TemplateManager />}
      {tab === 'photos' && <PhotoManager />}
      {tab === 'history' && <HistoryScreen />}
      {tab === 'settings' && <SettingsScreen />}
    </div>
  )
}
