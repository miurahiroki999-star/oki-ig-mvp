// 共通型定義

export type Theme =
  | '人間関係'
  | '健康'
  | 'お金'
  | '使命'
  | 'ご縁'
  | '瞑想'
  | '無料診断'

export const ALL_THEMES: Theme[] = ['人間関係', '健康', 'お金', '使命', 'ご縁', '瞑想', '無料診断']

export type FeedRole = '問題提起' | '教育気づき' | '信頼形成導線'
export type StoryRole = '問題提起' | '教育気づき' | '日常人柄' | '信頼形成' | 'LINE診断誘導'

export type PostKind = 'フィード' | 'ストーリーズ'

export interface GeneratedPost {
  id: string
  dayIndex: number // このセット内の◯日目 (1始まり)
  orderIndex: number // このカテゴリ内の◯回目 (1始まり)
  kind: PostKind
  role: FeedRole | StoryRole
  theme: Theme
  title: string // 画像内タイトル(強い一言)
  body: string // 投稿本文 or ストーリーズ添え文
  approach: string // 切り口(重複回避用ラベル)
  claim: string // 主張(重複回避用ラベル)
  cta: string
  hashtags: string[]
  templateId: string
  imageDataUrl?: string
  regenerationCount: number
  createdAt: string
  printDate: string // 打ち出し日 YYYY-MM-DD
  printRun: number // 打ち出し回
  source: 'ai' | 'local' // OpenAI生成かローカルフレーズバンク生成か
  photoId?: string // 本人写真を背景に使った場合の写真素材ID(優先度B拡張)
}

export interface GenerationBatch {
  printDate: string
  printRun: number
  days: number
  memo: string
  posts: GeneratedPost[]
  createdAt: string
}

export interface BackgroundTemplate {
  id: string
  kind: PostKind
  name: string
  // 単純な見た目パラメータ（Canvas描画用）
  style: 'gradient' | 'blob' | 'wave' | 'frame' | 'dot'
  colorFrom: string
  colorTo: string
  accent: string
  createdAt: string
}

// 信頼形成・導線系投稿で本人写真を背景として使う際に、
// どのタグの写真を優先的に使うかを役割ごとに紐づけるための定義(優先度B拡張)。
export const PHOTO_ELIGIBLE_ROLES: string[] = ['信頼形成導線', '信頼形成', 'LINE診断誘導']

export interface PhotoAsset {
  id: string
  name: string
  dataUrl: string
  tags: string[]
  createdAt: string
}

export interface AppSettings {
  displayName: string
  title: string
  lineUrl: string
  openaiModel: string
  brandColorFrom: string
  brandColorTo: string
  forbiddenWords: string[]
  baseHashtags: string[]
  usePhotosForTrustPosts: boolean // 信頼形成・導線系投稿で登録済み本人写真を背景に使うか(優先度B拡張・既定はOFF)
}

export type HistoryEntryType = 'generated' | 'regenerated' | 'edited'

export interface HistoryEntry {
  id: string
  createdAt: string
  printDate: string
  printRun: number
  dayIndex: number
  orderIndex: number
  kind: PostKind
  theme: Theme
  role: string
  title: string
  body: string
  approach: string
  claim: string
  cta: string
  hashtags: string[]
  templateId: string
  regenerationCount: number
  entryType: HistoryEntryType // 生成済み / 再生成済み / 編集済み(上書きせず全て残す)
  source: 'ai' | 'local'
}
