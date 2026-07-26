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
  angleKey?: string // 生成前に選んだ切り口キー
  angleLabel?: string // 生成前に選んだ切り口名
  angleInstruction?: string // AIへ渡した切り口指示
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
  noteCtaBlock: string // NOTE記事末尾の固定CTA文(公式LINE誘導)
  noteFixedHashtags: string[] // NOTEハッシュタグの固定タグ(可変のテーマタグと組み合わせる)
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
  angleKey?: string // 使用済み切り口キー
  angleLabel?: string // 使用済み切り口名
  angleInstruction?: string // AIへ渡した切り口指示
  problemFingerprint?: string // 2枚目「問題提起」の重複回避用
  slideFingerprints?: string[] // 中ページ本文の重複回避用
  slideMainTexts?: string[] // OpenAIへの重複禁止指示用
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

// ---------- NOTE／Threads下書き生成(フェーズ1) ----------
// ネタ元は同じ日のInstagram5投稿のうち1テーマ。NOTE用の別テーマローテーションは組まない。

export interface NoteSection {
  heading: string // ## 見出し
  body: string // - 箇条書きや**太字**を含む本文(NOTE対応Markdownのみ)
}

export interface NoteDraft {
  id: string
  createdAt: string
  printDate: string
  sourceTheme: Theme
  sourcePostTitle: string // ネタ元にしたIG投稿のタイトル
  sourceAngleLabel?: string
  title: string // 断定・逆説型タイトル
  lead: string // リード文(2〜4行)
  sections: NoteSection[] // 見出し3〜5個
  summary: string // まとめ(箇条書きまたは対比フレーズ)
  ctaBlock: string // 固定CTA文＋公式LINE誘導リンク
  hashtags: string[] // 3〜4個
  bodyMarkdown: string // 上記を組み立てた最終コピペ用本文
  imagePrompt: string
  imageDataUrl?: string
  regenerationCount: number
  source: 'ai' | 'local'
}

export type ThreadsPatternKey = 'link_share' | 'assertive' | 'mantra'

export interface ThreadsDraft {
  id: string
  createdAt: string
  printDate: string
  sourceTheme: Theme
  sourcePostTitle: string
  sourceAngleLabel?: string
  pattern: ThreadsPatternKey
  noteUrl?: string // A(リンクシェア型)で使用。未公開の場合は空でプレースホルダーを表示
  bodyText: string // コピペ用の最終本文
  regenerationCount: number
  source: 'ai' | 'local'
}

export interface NoteThreadsHistoryEntry {
  id: string
  createdAt: string
  printDate: string
  theme: Theme
  angleLabel?: string
  noteTitle?: string
  noteLead?: string
  noteTitleFingerprint?: string
  threadsPattern?: ThreadsPatternKey
  threadsBody?: string
  threadsBodyFingerprint?: string
}
