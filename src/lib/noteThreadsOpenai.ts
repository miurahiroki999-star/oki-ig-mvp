// OpenAI連携(NOTE・Threads用)。Netlify Functions経由で呼び出し、
// 失敗時・未設定時・タイムアウト時は呼び出し元(noteThreadsPlan.ts)でローカルフレーズバンクにフォールバックする。
// APIキーはこのファイルには一切登場しない(サーバー側のNetlify Functionsのみが保持する)。

import { NoteSection, Theme } from '../types'

export interface TryGenerateNoteThreadsParams {
  theme: Theme
  sourcePostTitle: string
  sourceAngleLabel?: string
  sourceAngleInstruction?: string
  memo?: string
  avoidNoteTitles: string[]
  avoidNoteLeads: string[]
  avoidThreadsBodies: string[]
  brand: { displayName: string; title: string }
  forbiddenWords: string[]
  model: string
}

export interface AIGeneratedNoteThreads {
  noteTitle: string
  noteLead: string
  noteSections: NoteSection[]
  noteSummary: string
  threadsLinkShareLine: string
  threadsAssertiveBody: string
  threadsMantraHeading: string
  threadsMantraLines: string[]
}

const REQUEST_TIMEOUT_MS = 15000

export async function tryGenerateNoteThreadsWithOpenAI(
  params: TryGenerateNoteThreadsParams
): Promise<AIGeneratedNoteThreads | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch('/.netlify/functions/generate-note-threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal
    })
    if (!res.ok) return null

    const data = await res.json().catch(() => null)
    if (!data || typeof data.noteTitle !== 'string' || !Array.isArray(data.noteSections) || data.noteSections.length < 3) {
      return null
    }

    return {
      noteTitle: data.noteTitle,
      noteLead: typeof data.noteLead === 'string' ? data.noteLead : '',
      noteSections: data.noteSections.map((s: any) => ({
        heading: typeof s.heading === 'string' ? s.heading : '',
        body: typeof s.body === 'string' ? s.body : ''
      })),
      noteSummary: typeof data.noteSummary === 'string' ? data.noteSummary : '',
      threadsLinkShareLine: typeof data.threadsLinkShareLine === 'string' ? data.threadsLinkShareLine : '',
      threadsAssertiveBody: typeof data.threadsAssertiveBody === 'string' ? data.threadsAssertiveBody : '',
      threadsMantraHeading: typeof data.threadsMantraHeading === 'string' ? data.threadsMantraHeading : '',
      threadsMantraLines: Array.isArray(data.threadsMantraLines) ? data.threadsMantraLines.filter((l: unknown) => typeof l === 'string') : []
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
