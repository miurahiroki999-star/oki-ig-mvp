import React, { useState } from 'react'
import GenerateScreen from './components/GenerateScreen'
import NoteScreen from './components/NoteScreen'
import ThreadsScreen from './components/ThreadsScreen'
import SettingsScreen from './components/SettingsScreen'
import { SourceSelection } from './lib/noteThreadsPlan'

type Tab = 'generate' | 'note' | 'threads' | 'settings'

const TABS: { key: Tab; label: string }[] = [
  { key: 'generate', label: '投稿生成・出力確認' },
  { key: 'note', label: 'NOTE' },
  { key: 'threads', label: 'Threads' },
  { key: 'settings', label: '設定' }
]

export default function App() {
  const [tab, setTab] = useState<Tab>('generate')

  // NOTE・Threadsタブ共通のネタ元(同じ日のInstagram5投稿のうち1テーマ)
  const [noteThreadsSource, setNoteThreadsSource] = useState<SourceSelection | null>(null)
  const [noteThreadsMemo, setNoteThreadsMemo] = useState('')

  return (
    <div className="app-shell">
      <div className="app-header">
        <div className="app-title">
          吉澤瑛さん カルーセル投稿生成
          <small>人生の質向上コンサルタント｜1日5回カルーセル投稿＋NOTE・Threads下書きを量産</small>
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
      {tab === 'note' && (
        <NoteScreen
          source={noteThreadsSource}
          onSourceChange={setNoteThreadsSource}
          memo={noteThreadsMemo}
          onMemoChange={setNoteThreadsMemo}
        />
      )}
      {tab === 'threads' && (
        <ThreadsScreen
          source={noteThreadsSource}
          onSourceChange={setNoteThreadsSource}
          memo={noteThreadsMemo}
          onMemoChange={setNoteThreadsMemo}
        />
      )}
      {tab === 'settings' && <SettingsScreen />}
    </div>
  )
}
