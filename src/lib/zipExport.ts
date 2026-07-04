import JSZip from 'jszip'
import { GeneratedPost } from '../types'

function dataUrlToUint8(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function fileBaseName(post: GeneratedPost): string {
  return `${post.printDate}_${post.printRun}回目打ち出し_${post.dayIndex}日目_${post.orderIndex}回目_${post.kind}`
}

export async function exportBatchZip(posts: GeneratedPost[], printDate: string, printRun: number) {
  const zip = new JSZip()
  const byDay = new Map<number, GeneratedPost[]>()
  posts.forEach((p) => {
    const arr = byDay.get(p.dayIndex) ?? []
    arr.push(p)
    byDay.set(p.dayIndex, arr)
  })

  const manifest: any[] = []
  const listLines: string[] = []

  Array.from(byDay.keys())
    .sort((a, b) => a - b)
    .forEach((dayIndex) => {
      const folder = zip.folder(`${dayIndex}日目`)!
      const dayPosts = byDay.get(dayIndex)!.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'フィード' ? -1 : 1
        return a.orderIndex - b.orderIndex
      })
      dayPosts.forEach((post) => {
        const base = fileBaseName(post)
        if (post.imageDataUrl) {
          folder.file(`${base}.png`, dataUrlToUint8(post.imageDataUrl))
        }
        folder.file(`${base}.txt`, post.body)
        manifest.push({
          dayIndex: post.dayIndex,
          orderIndex: post.orderIndex,
          kind: post.kind,
          role: post.role,
          theme: post.theme,
          title: post.title,
          approach: post.approach,
          claim: post.claim,
          cta: post.cta,
          hashtags: post.hashtags,
          templateId: post.templateId,
          regenerationCount: post.regenerationCount,
          source: post.source,
          fileName: base
        })
        listLines.push(`${dayIndex}日目 ${post.orderIndex}回目 ${post.kind}｜テーマ:${post.theme}｜役割:${post.role}｜タイトル:${post.title}`)
      })
    })

  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  zip.file('投稿一覧.txt', listLines.join('\n'))

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${printDate}_${printRun}回目打ち出し.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
