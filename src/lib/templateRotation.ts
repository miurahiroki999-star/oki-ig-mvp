import { BackgroundTemplate, HistoryEntry, PhotoAsset, PostKind } from '../types'

// 同じテンプレートが連続しすぎないよう、直近の使用履歴を見てローテーションする
export function pickTemplate(
  kind: PostKind,
  templates: BackgroundTemplate[],
  history: HistoryEntry[],
  alreadyPickedInThisBatch: string[]
): BackgroundTemplate {
  const pool = templates.filter((t) => t.kind === kind)
  if (pool.length === 0) throw new Error(`テンプレートが登録されていません: ${kind}`)

  const recentIds = [
    ...alreadyPickedInThisBatch.slice(-2),
    ...history
      .filter((h) => h.kind === kind)
      .slice(-3)
      .map((h) => h.templateId)
  ]

  const candidates = pool.filter((t) => !recentIds.includes(t.id))
  const finalPool = candidates.length > 0 ? candidates : pool
  return finalPool[Math.floor(Math.random() * finalPool.length)]
}

// 役割ごとに適したタグが付いた本人写真をローテーションで選ぶ(優先度B拡張)。
// 該当する写真が登録されていない場合はundefinedを返し、呼び出し側は通常の背景テンプレートにフォールバックする。
const ROLE_TAG_HINTS: Record<string, string[]> = {
  信頼形成導線: ['信頼形成向き', '導線向き'],
  信頼形成: ['信頼形成向き'],
  LINE診断誘導: ['導線向き', 'セッション案内向き']
}

export function pickPhotoForRole(
  role: string,
  photos: PhotoAsset[],
  recentlyUsedPhotoIds: string[]
): PhotoAsset | undefined {
  const hints = ROLE_TAG_HINTS[role]
  if (!hints || photos.length === 0) return undefined

  const tagged = photos.filter((p) => p.tags.some((t) => hints.includes(t)))
  const pool = tagged.length > 0 ? tagged : photos
  const fresh = pool.filter((p) => !recentlyUsedPhotoIds.includes(p.id))
  const finalPool = fresh.length > 0 ? fresh : pool
  return finalPool[Math.floor(Math.random() * finalPool.length)]
}
