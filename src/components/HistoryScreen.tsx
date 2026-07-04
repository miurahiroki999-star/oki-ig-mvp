import React, { useMemo, useState } from 'react'
import { getHistory } from '../lib/storage'

const ENTRY_TYPE_LABEL: Record<string, string> = {
  generated: '生成済み',
  regenerated: '再生成済み',
  edited: '編集済み'
}

export default function HistoryScreen() {
  const all = useMemo(() => getHistory().slice().reverse(), [])
  const [query, setQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('')

  const filtered = all.filter((h) => {
    const matchesQuery =
      query.trim() === '' ||
      h.title.includes(query) ||
      h.theme.includes(query) ||
      h.approach.includes(query) ||
      h.body.includes(query)
    const matchesDate = dateFilter === '' || h.printDate === dateFilter
    return matchesQuery && matchesDate
  })

  return (
    <div className="card">
      <div className="section-title">生成履歴・再生成履歴</div>
      <div className="helper-text" style={{ marginBottom: 12 }}>
        一括生成・個別再生成・手動編集は、すべて上書きせず追加保存されます。画面上は最新版のみメイン表示され、過去案はここで確認できます。
      </div>
      <div className="form-row" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <input placeholder="タイトル・テーマ・切り口・本文で検索" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
        <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="history-table">
          <thead>
            <tr>
              <th>打ち出し日</th>
              <th>回</th>
              <th>日目</th>
              <th>回目</th>
              <th>種別</th>
              <th>テーマ</th>
              <th>役割</th>
              <th>タイトル</th>
              <th>切り口</th>
              <th>履歴種別</th>
              <th>生成元</th>
              <th>再生成回数</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((h) => (
              <tr key={h.id}>
                <td>{h.printDate}</td>
                <td>{h.printRun}</td>
                <td>{h.dayIndex}</td>
                <td>{h.orderIndex}</td>
                <td>{h.kind}</td>
                <td>{h.theme}</td>
                <td>{h.role}</td>
                <td>{h.title}</td>
                <td>{h.approach}</td>
                <td>{ENTRY_TYPE_LABEL[h.entryType] ?? h.entryType}</td>
                <td>{h.source === 'ai' ? 'AI' : 'ローカル'}</td>
                <td>{h.regenerationCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="helper-text">履歴がまだありません。投稿を生成すると、ここに記録されます。</div>}
      </div>
    </div>
  )
}
