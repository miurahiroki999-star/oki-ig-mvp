import React, { useMemo, useState } from 'react'
import { ALL_THEMES, Theme } from '../types'
import { getBatches } from '../lib/storage'
import { pickTodaySourceOptions, SourceSelection } from '../lib/noteThreadsPlan'
import { todayStr } from '../lib/dateUtil'

interface Props {
  source: SourceSelection | null
  onSourceChange: (s: SourceSelection) => void
  memo: string
  onMemoChange: (memo: string) => void
}

// NOTE・Threads共通のネタ元選択。「同じ日のInstagram5投稿のうち1テーマを深掘りする」仕様のため、
// 本日生成済みのInstagram投稿があればそこから選び、無ければテーマを直接指定する。
export default function SourceSelector({ source, onSourceChange, memo, onMemoChange }: Props) {
  const [mode, setMode] = useState<'today' | 'manual'>('today')

  const todayOptions = useMemo(() => pickTodaySourceOptions(getBatches(), todayStr()), [])

  function selectManualTheme(theme: Theme) {
    onSourceChange({ theme, postTitle: `${theme}についての投稿` })
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="section-title">ネタ元（NOTE・Threads共通）</div>
      <div className="helper-text" style={{ marginBottom: 12 }}>
        同じ日のInstagram5投稿のうち1テーマを深掘りします。NOTEタブ・Threadsタブで同じネタ元が使われます。
      </div>

      <div className="btn-row" style={{ marginBottom: 12 }}>
        <button className={`mini-btn ${mode === 'today' ? 'active' : ''}`} onClick={() => setMode('today')}>
          本日のInstagram投稿から選ぶ
        </button>
        <button className={`mini-btn ${mode === 'manual' ? 'active' : ''}`} onClick={() => setMode('manual')}>
          テーマを直接指定
        </button>
      </div>

      {mode === 'today' && (
        todayOptions.length === 0 ? (
          <div className="helper-text">
            本日打ち出したInstagram投稿がまだありません。先に「投稿生成・出力確認」タブで生成するか、「テーマを直接指定」に切り替えてください。
          </div>
        ) : (
          <div className="source-option-list">
            {todayOptions.map((opt, i) => (
              <button
                key={i}
                className={`source-option ${source?.postTitle === opt.postTitle && source?.theme === opt.theme ? 'active' : ''}`}
                onClick={() => onSourceChange(opt)}
              >
                <span className="post-tag">テーマ:{opt.theme}</span>
                <span className="source-option-title">{opt.postTitle}</span>
                {opt.angleLabel && <span className="helper-text">切り口: {opt.angleLabel}</span>}
              </button>
            ))}
          </div>
        )
      )}

      {mode === 'manual' && (
        <div className="form-row">
          <label>テーマ</label>
          <select
            value={source?.theme || ''}
            onChange={(e) => selectManualTheme(e.target.value as Theme)}
          >
            <option value="" disabled>選択してください</option>
            {ALL_THEMES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      )}

      <div className="form-row" style={{ marginTop: 12 }}>
        <label>自由メモ（任意）</label>
        <textarea
          value={memo}
          onChange={(e) => onMemoChange(e.target.value)}
          placeholder="例：具体的な相談内容を反映したい"
        />
      </div>

      {source && (
        <div className="helper-text" style={{ marginTop: 8 }}>
          選択中のネタ元：テーマ「{source.theme}」／{source.postTitle}
        </div>
      )}
    </div>
  )
}
