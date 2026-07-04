// 【3. ファイル命名・ZIP構成】に準拠したZIP出力。
// ZIP内は 日別/投稿別 にフォルダ分けし、manifest.json に管理情報を保存する。

import JSZip from 'jszip'
import { CarouselPost, Slide } from '../types'

function dataUrlToUint8(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function slideFileName(printDate: string, dayIndex: number, postIndex: number, slide: Slide): string {
  const num = String(slide.index).padStart(2, '0')
  return `${printDate}_${dayIndex}日目_${postIndex}投稿目_${num}_${slide.role}.png`
}

function captionFileName(printDate: string, dayIndex: number, postIndex: number): string {
  return `${printDate}_${dayIndex}日目_${postIndex}投稿目_投稿本文.txt`
}

interface ManifestEntry {
  generatedAt: string
  days: number
  postsPerDay: number
  postIndex: number
  slideIndex: number
  slideRole: string
  title: string
  theme: string
  source: 'ai' | 'local'
  filename: string
  captionFilename: string
}

function addPostToZip(zip: JSZip, post: CarouselPost, days: number, postsPerDay: number, manifest: ManifestEntry[]) {
  const dayFolder = zip.folder(`${post.dayIndex}日目`)!
  const postFolder = dayFolder.folder(`${post.postIndex}投稿目`)!
  const capFile = captionFileName(post.printDate, post.dayIndex, post.postIndex)

  post.slides.forEach((slide) => {
    const fname = slideFileName(post.printDate, post.dayIndex, post.postIndex, slide)
    if (slide.imageDataUrl) {
      postFolder.file(fname, dataUrlToUint8(slide.imageDataUrl))
    }
    manifest.push({
      generatedAt: post.createdAt,
      days,
      postsPerDay,
      postIndex: post.postIndex,
      slideIndex: slide.index,
      slideRole: slide.role,
      title: post.postTitle,
      theme: post.theme,
      source: post.source,
      filename: fname,
      captionFilename: capFile
    })
  })

  postFolder.file(capFile, post.caption)
}

// 投稿単位でのZIPダウンロード(【13. 画面構成】出力確認画面の「投稿単位でZIPダウンロード」用)
export async function exportSinglePostZip(post: CarouselPost) {
  const zip = new JSZip()
  const manifest: ManifestEntry[] = []
  addPostToZip(zip, post, 1, 1, manifest)
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${post.printDate}_${post.dayIndex}日目_${post.postIndex}投稿目.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// 全体ZIPダウンロード(【3. ファイル命名・ZIP構成】のZIP名例に準拠)
export async function exportBatchZip(posts: CarouselPost[], printDate: string, printRun: number, days: number, postsPerDay: number) {
  const zip = new JSZip()
  const manifest: ManifestEntry[] = []

  const sorted = [...posts].sort((a, b) => (a.dayIndex !== b.dayIndex ? a.dayIndex - b.dayIndex : a.postIndex - b.postIndex))
  sorted.forEach((post) => addPostToZip(zip, post, days, postsPerDay, manifest))

  zip.file('manifest.json', JSON.stringify(manifest, null, 2))

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
