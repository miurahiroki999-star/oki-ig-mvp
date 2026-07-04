import React, { useState } from 'react'
import { BackgroundTemplate, PostKind } from '../types'
import { getTemplates, saveTemplates } from '../lib/storage'

export default function TemplateManager() {
  const [templates, setTemplates] = useState<BackgroundTemplate[]>(getTemplates())
  const [kind, setKind] = useState<PostKind>('フィード')
  const [name, setName] = useState('')
  const [colorFrom, setColorFrom] = useState('#FAFCF8')
  const [colorTo, setColorTo] = useState('#EDF9EA')
  const [style, setStyle] = useState<BackgroundTemplate['style']>('whitespace')

  function persist(next: BackgroundTemplate[]) {
    setTemplates(next)
    saveTemplates(next)
  }

  function addTemplate() {
    const tpl: BackgroundTemplate = {
      id: `${kind}-tpl-${Date.now()}`,
      kind,
      name: name || `${kind}テンプレート`,
      style,
      colorFrom,
      colorTo,
      accent: '#8EDB84',
      createdAt: new Date().toISOString()
    }
    persist([...templates, tpl])
    setName('')
  }

  function remove(id: string) {
    persist(templates.filter((t) => t.id !== id))
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="section-title">テンプレート追加</div>
        <div className="form-row">
          <label>種別</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as PostKind)}>
            <option value="フィード">フィード（1080×1080）</option>
            <option value="ストーリーズ">ストーリーズ（1080×1920）</option>
          </select>
        </div>
        <div className="form-row">
          <label>名前</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：やわらか葉っぱグリーン" />
        </div>
        <div className="form-row">
          <label>スタイル</label>
          <select value={style} onChange={(e) => setStyle(e.target.value as any)}>
            <option value="whitespace">白場中心（whitespace）</option>
            <option value="leaf">淡い葉モチーフ（leaf）</option>
            <option value="line">細い罫線フレーム（line）</option>
          </select>
        </div>
        <div className="form-row">
          <label>背景色（グラデーション開始 / 終了）</label>
          <div style={{ display: 'flex', gap: 10 }}>
            <input type="color" value={colorFrom} onChange={(e) => setColorFrom(e.target.value)} />
            <input type="color" value={colorTo} onChange={(e) => setColorTo(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={addTemplate}>追加する</button>
      </div>

      <div className="card">
        <div className="section-title">登録済みテンプレート（{templates.length}）</div>
        <div className="template-grid">
          {templates.map((t) => (
            <div key={t.id}>
              <div
                className="template-swatch"
                style={{ background: `linear-gradient(135deg, ${t.colorFrom}, ${t.colorTo})` }}
              />
              <div style={{ fontSize: 12, marginTop: 4 }}>{t.kind} ・ {t.name}</div>
              <button className="mini-btn" style={{ marginTop: 4 }} onClick={() => remove(t.id)}>削除</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
