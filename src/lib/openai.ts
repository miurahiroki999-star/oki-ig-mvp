// OpenAI連携。Netlify Functions経由で呼び出し、
// 失敗時・未設定時・タイムアウト時は呼び出し元(contentPlan.ts)でローカルフレーズバンクにフォールバックする。
// APIキーはこのファイルには一切登場しない(サーバー側のNetlify Functionsのみが保持する)。

import { GeneratedPost, PostKind, Theme } from '../types'

export interface AIAvoidLists {
  titles: string[]
  approaches: string[]
  claims: string[]
  ctas: string[]
}

export interface AIGeneratedContent {
  title: string
  body: string
  approach: string
  claim: string
  cta: string
  hashtags: string[]
}

export interface TryGenerateParams {
  kind: PostKind
  role: string
  theme: Theme
  memo?: string
  avoid: AIAvoidLists
  brand: { displayName: string; title: string; lineUrl: string }
  forbiddenWords: string[]
  model: string
}

// Netlify Functionsの実行時間制限内で確実にフォールバックへ抜けられるよう、
// フロント側でも短めのタイムアウトを設ける。
const REQUEST_TIMEOUT_MS = 12000

export async function tryGenerateWithOpenAI(params: TryGenerateParams): Promise<AIGeneratedContent | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch('/.netlify/functions/generate-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal
    })
    if (!res.ok) return null

    const data = await res.json().catch(() => null)
    if (!data || typeof data.title !== 'string' || typeof data.body !== 'string') return null
    if (!data.title.trim() || !data.body.trim()) return null

    return {
      title: data.title,
      body: data.body,
      approach: typeof data.approach === 'string' ? data.approach : '',
      claim: typeof data.claim === 'string' ? data.claim : '',
      cta: typeof data.cta === 'string' ? data.cta : '',
      hashtags: Array.isArray(data.hashtags) ? data.hashtags.filter((h: unknown) => typeof h === 'string') : []
    }
  } catch {
    // ネットワークエラー・タイムアウト・JSON異常など、理由を問わずnullを返しフォールバックさせる
    return null
  } finally {
    clearTimeout(timer)
  }
}

// 「プロンプト生成モード」: OpenAI APIキーが無くても、
// ClaudeやChatGPTにそのまま貼れる生成プロンプトを作る(PostCardの「AIプロンプト」ボタン用)。
export function buildManualPrompt(post: Pick<GeneratedPost, 'kind' | 'role' | 'theme' | 'title'>): string {
  return [
    `あなたはウェルネス系Instagram運用のコピーライターです。`,
    `以下条件で、Instagram${post.kind === 'フィード' ? '投稿本文' : 'ストーリーズ添え文'}を1本作ってください。`,
    ``,
    `# 前提`,
    `・アカウント名義：吉澤瑛｜人生の質向上コンサルタント`,
    `・全体コンセプト：健康・お金・人間関係・使命を整えることで人生の質を上げる`,
    `・CBDやセッション等の商材は主語にせず、選択肢として自然に触れる程度にする`,
    `・売り込み感、医療効果の断定、過度な収入保証はNG`,
    ``,
    `# 今回の指定`,
    `・テーマ：${post.theme}`,
    `・役割：${post.role}`,
    `・画像内タイトル案：${post.title}`,
    ``,
    `# 出力`,
    post.kind === 'フィード'
      ? '・冒頭の強い一文→共感→気づき→健康/お金/人間関係/使命への接続→公式LINE誘導→締め→ハッシュタグ8〜15個、の順で日本語で書いてください。'
      : '・1〜2文の短いストーリーズ添え文を日本語で書いてください。',
    `・「絶対」「必ず」「治る」等の断定表現は使わないでください。`
  ].join('\n')
}
