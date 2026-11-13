// 导入扫描与格式判定（纯 IO，不依赖 electron / 数据库，可单测）
// 职责：把用户选中的文件/目录展开成「待导入项」，其中图片文件夹漫画（dir）按目录识别

import fs from 'node:fs'
import path from 'node:path'
import type { BookFormat } from '../../shared/types'
import { hasPageImages } from './dirService'
import { readGalleryInfo, type GalleryInfo } from './galleryInfo'

/** 受支持的单文件格式扩展名 */
const SUPPORTED_EXTS = ['.pdf', '.epub', '.zip', '.cbz', '.mobi']

/**
 * 按路径派生书格式（.zip/.cbz 归一为 cbz）。
 * 无扩展名或未知扩展名的路径再 stat 一次：目录视为「图片文件夹漫画」（dir），
 * 其余仍按 PDF 兜底，兼容旧数据与异常路径。
 */
export function detectFormat(filePath: string): BookFormat {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.epub') return 'epub'
  if (ext === '.zip' || ext === '.cbz') return 'cbz'
  if (ext === '.mobi') return 'mobi'
  if (ext === '.pdf') return 'pdf'
  try {
    return fs.statSync(filePath).isDirectory() ? 'dir' : 'pdf'
  } catch {
    return 'pdf'
  }
}

/** 一个待导入项：单文件（pdf/epub/cbz/mobi）或图片文件夹（dir） */
export interface ImportCandidate {
  path: string
  format: BookFormat
  /**
   * 画廊格式元数据（目录里有可解析的 info.json 才有）：
   * 书名取 full_title 的中文/日文段，作者用于自动归合集，id 用于去重。
   */
  gallery?: GalleryInfo
}

/**
 * 递归展开文件/文件夹路径为去重后的待导入项。
 *
 * 目录判定规则（图片文件夹漫画）：
 * - 目录里能取到页面图片 → 整个目录即一本漫画，不再向下递归。取图范围见 dirService.resolvePageRoot：
 *   图片直接在目录里，或目录下**只有一个**装图的子目录（`<书名>/1/001.jpg`）都算同一本；
 *   目录里若还有可解析的 info.json，则附带画廊元数据（书名 / 作者 / id）；
 * - 取不到页面图片 → 继续向下递归，于是「一个大文件夹里放着很多本小文件夹漫画」会逐本识别；
 * - 隐藏目录与 __MACOSX 旁车目录跳过，符号链接不跟随（防环）。
 */
export function collectImportCandidates(inputPaths: readonly string[]): ImportCandidate[] {
  const found = new Map<string, ImportCandidate>()

  function walk(p: string) {
    let real: string
    try {
      real = fs.realpathSync(p)
    } catch {
      return // 路径不存在，忽略
    }
    let stat: fs.Stats
    try {
      stat = fs.statSync(real)
    } catch {
      return
    }

    if (stat.isDirectory()) {
      const name = path.basename(real)
      if (name.startsWith('.') || name === '__MACOSX') return
      if (hasPageImages(real)) {
        const gallery = readGalleryInfo(real)
        found.set(real, gallery ? { path: real, format: 'dir', gallery } : { path: real, format: 'dir' })
        return
      }
      for (const entry of fs.readdirSync(real, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue // 防环：跳过符号链接
        walk(path.join(real, entry.name))
      }
      return
    }

    if (stat.isFile() && SUPPORTED_EXTS.includes(path.extname(real).toLowerCase())) {
      found.set(real, { path: real, format: detectFormat(real) })
    }
  }

  for (const p of inputPaths) walk(p)
  return [...found.values()]
}
