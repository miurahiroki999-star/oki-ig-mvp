import React, { useState } from 'react'
import GenerateScreen from './components/GenerateScreen'
import SettingsScreen from './components/SettingsScreen'

type Tab = 'generate' | 'settings'

const TABS: { key: Tab; label: string }[] = [
  { key: 'generate', label: '投稿生成・出力確認' },
  { key: 'settings', label: '設定' }
]

export default function App() {
  const [tab, setTab] = useState<Tab>('generate')

  return (
    <div className="app-shell">
      <div className="app-header">
        <div className="app-title">
          吉澤瑛さん カルーセル投稿生成
          <small>人生の質向上コンサルタント｜1日5回カルーセル投稿を量産</small>
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
      {tab === 'settings' && <SettingsScreen />}
    </div>
  )
}
