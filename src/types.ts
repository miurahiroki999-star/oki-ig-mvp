// 共通型定義（カルーセル投稿生成アプリ版）

export type Theme =
  | '人間関係'
  | '健康'
  | 'お金'
  | '使命'
  | 'ご縁'
  | '瞑想'
  | '無料診断'

export const ALL_THEMES: Theme[] = ['人間関係', '健康', 'お金', '使命', 'ご縁', '瞑想', '無料診断']

// 旧MVPファイルがGitHub上に残っていてもNetlifyビルドが落ちないようにする互換型。
// 新カルーセル版の画面では基本使用しない。
export type PostKind = 'フィード' | 'ストーリーズ'

export interface PhotoAsset {
  id: string
  name: string
  dataUrl: string
  tags: string[]
  createdAt: string
}

export interface BackgroundTemplate {
  id: string
  kind: PostKind
  name: string
  style: 'gradient' | 'blob' | 'wave' | 'frame' | 'dot'
  colorFrom: string
  colorTo: string
  accent?: string
  createdAt: string
}

export interface GeneratedPost {
  id: string
  printDate: string
  printRun: number
  dayIndex: number
  orderIndex: number
  kind: PostKind
  role: 'user' | 'assistant' | string
  theme: Theme
  title: string
  approach: string
  body: string
  templateId?: string
  imageDataUrl?: string
  regenerationCount: number
}


// カルーセル1投稿=8枚基本（山添さん型TTP構成）
export type SlideRole =
  | 'TOP'
  | '問題提起'
  | '相談'
  | '見立て'
  | '具体例'
  | '気づき'
  | '行動提案'
  | 'CTA'

export const SLIDE_ROLE_ORDER: SlideRole[] = ['TOP', '問題提起', '相談', '見立て', '具体例', '気づき', '行動提案', 'CTA']

// TOP/CTAスライドは headline+subheadline、それ以外(中ページ)は label+mainText+highlights+bullets を使う
export interface Slide {
  index: number // 1始まり
  role: SlideRole
  label?: string // 中ページの見出し(基本 "POINT")
  headline?: string // TOP/CTAの大見出し(改行込み)
  subheadline?: string // TOP/CTAの小見出し
  mainText?: string // 中ページの本文(改行込み)
  highlights?: string[] // mainText内で淡いグリーンハイライトする語
  bullets?: string[] // 下部の補足箇条書き
  themeLabel?: string // 画像上部に出す英字＋日本語テーマラベル
  backgroundPostIndex?: number // 背景固定用の投稿番号
  imageDataUrl?: string
}

export interface CarouselPost {
  id: string
  dayIndex: number // このセット内の◯日目 (1始まり)
  postIndex: number // その日の◯投稿目 (1始まり、標準1〜5)
  publishTime: string // 推奨公開時間（例: 06:30）
  theme: Theme
  postTitle: string // 管理用のタイトル(TOP見出しの要約)
  slides: Slide[]
  caption: string // 投稿欄本文(完成形・そのままコピペ用)
  captionLead: string // 投稿欄本文の冒頭部分のみ(重複回避判定用)
  hashtags: string[]
  regenerationCount: number
  createdAt: string
  printDate: string // 打ち出し日 YYYY-MM-DD
  printRun: number // 打ち出し回
  source: 'ai' | 'local' // OpenAI生成かローカルフレーズバンク生成か
}

export interface GenerationBatch {
  printDate: string
  printRun: number
  days: number
  postsPerDay: number
  memo: string
  theme?: Theme | 'auto'
  posts: CarouselPost[]
  createdAt: string
}

// 投稿欄本文の固定ブロック(service/Present/profile/よくある相談)。
// 応樹さんから素材回収中のため、設定画面で差し替えられるようにする(初期実装は仮置き文言)。
export interface AppSettings {
  displayName: string
  title: string
  lineUrl: string
  openaiModel: string
  forbiddenWords: string[]
  baseHashtags: string[]
  postsPerDay: number // 標準5固定
  slidesPerPost: number // 基本8、テーマにより9〜10まで可変
  testimonialBlock: string // よくある相談 / お客様の声
  serviceBlock: string // service紹介
  presentBlock: string // Present導線
  profileBlock: string // profile紹介
}

export type HistoryEntryType = 'generated' | 'regenerated'

export interface HistoryEntry {
  id: string
  createdAt: string
  printDate: string
  printRun: number
  dayIndex: number
  postIndex: number
  publishTime?: string
  theme: Theme
  postTitle: string
  topHeadline: string
  captionLead: string
  entryType: HistoryEntryType // 生成済み / 再生成済み(上書きせず全て残す)
  source: 'ai' | 'local'

  // 旧MVP互換フィールド。GitHubに旧コンポーネントが残存してもビルドを止めないため optional で保持。
  orderIndex?: number
  kind?: PostKind
  role?: 'user' | 'assistant' | string
  title?: string
  approach?: string
  body?: string
  templateId?: string
  regenerationCount?: number
}
