// OpenAI連携。Netlify Functions経由で呼び出し、
// 失敗時・未設定時・タイムアウト時は呼び出し元(contentPlan.ts)でローカルフレーズバンクにフォールバックする。
// APIキーはこのファイルには一切登場しない(サーバー側のNetlify Functionsのみが保持する)。

import { Slide, Theme } from '../types'

export interface TryGenerateParams {
  theme: Theme
  memo?: string
  avoidHeadlines: string[]
  avoidLeads: string[]
  avoidSlideTexts: string[]
  brand: { displayName: string; title: string; lineUrl: string }
  forbiddenWords: string[]
  model: string
}

export interface AIGeneratedPost {
  postTitle: string
  topSub: string
  topHeadline: string
  slides6: Pick<Slide, 'label' | 'mainText' | 'highlights' | 'bullets'>[]
  captionLead: string
  hashtags: string[]
}

// Netlify Functionsの実行時間制限内で確実にフォールバックへ抜けられるよう、
// フロント側でも短めのタイムアウトを設ける。
const REQUEST_TIMEOUT_MS = 15000

export async function tryGenerateWithOpenAI(params: TryGenerateParams): Promise<AIGeneratedPost | null> {
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
    if (!data || typeof data.topHeadline !== 'string' || !Array.isArray(data.slides6)) return null
    if (!data.topHeadline.trim() || data.slides6.length !== 6) return null

    return {
      postTitle: typeof data.postTitle === 'string' ? data.postTitle : '',
      topSub: typeof data.topSub === 'string' ? data.topSub : '',
      topHeadline: data.topHeadline,
      slides6: data.slides6.map((s: any) => ({
        label: typeof s.label === 'string' ? s.label : 'POINT',
        mainText: typeof s.mainText === 'string' ? s.mainText : '',
        highlights: Array.isArray(s.highlights) ? s.highlights.filter((h: unknown) => typeof h === 'string') : [],
        bullets: Array.isArray(s.bullets) ? s.bullets.filter((b: unknown) => typeof b === 'string') : []
      })),
      captionLead: typeof data.captionLead === 'string' ? data.captionLead : '',
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
// ClaudeやChatGPTにそのまま貼れる生成プロンプトを作る(出力確認画面の「AIプロンプト」ボタン用)。
export function buildManualPrompt(themeOrPost: Theme | { theme?: Theme; title?: string; postTitle?: string }, postTitleArg?: string): string {
  const theme = typeof themeOrPost === 'string' ? themeOrPost : (themeOrPost.theme || 'ご縁')
  const postTitle = typeof themeOrPost === 'string' ? (postTitleArg || '') : (themeOrPost.postTitle || themeOrPost.title || '')
  return [
    'あなたはウェルネス系Instagramのカルーセル投稿を作るプロの日本語コピーライターです。',
    '',
    '# 前提',
    '・アカウント名義：吉澤瑛｜人生の質向上コンサルタント',
    '・全体コンセプト：健康・お金・人間関係・使命を整えることで人生の質を上げる',
    '・CBDやセッション等の商材は主語にせず、選択肢として自然に触れる程度にする',
    '・売り込み感、医療効果の断定、過度な収入保証はNG',
    '',
    '# 今回の指定',
    `・テーマ：${theme}`,
    `・現在のTOP見出し案：${postTitle}`,
    '',
    '# 出力',
    '・カルーセル構成(TOP→問題提起→相談→見立て→具体例→気づき→行動提案→CTA)の中身と、投稿欄本文の冒頭を日本語で書いてください。',
    '・「絶対」「必ず」「治る」等の断定表現は使わないでください。'
  ].join('\n')
}
