// 图片文件夹漫画服务（主进程）：把一个装满图片的目录当作一本书，按文件名自然序逐页供给
// 与 cbzService 同构（只依赖 node 标准库，可单测）：按需读单页，不预读整本
// 目录结构约定：目录内直接存放图片文件（子目录不参与），一个目录 = 一本漫画

import fs from 'node:fs'
import path from 'node:path'

/** 可识别的图片扩展名（小写）：与 CBZ 同口径，额外支持 gif 逐帧静态页 */
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

/** 是否为可当作一页的图片文件名：排除隐藏文件（.DS_Store 等）与 __MACOSX 旁车目录 */
export function isImageFile(fileName: string): boolean {
  const base = path.basename(fileName)
  if (base.startsWith('.')) return false
  return IMAGE_EXTS.has(path.extname(base).toLowerCase())
}

/** 条目名比较：字典序 + 数字段按数值排序（与 cbzService 同口径，兼容 1/2/10 与 001） */
function compareNames(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true })
}

/** 目录内的图片文件名（已排序） */
export function sortImageNames(names: readonly string[]): string[] {
  return names.filter(isImageFile).sort(compareNames)
}

/** 同步读某目录直属的图片文件名（已排序）；读不了返回空数组 */
function listImageNamesSync(dirPath: string): string[] {
  try {
    return sortImageNames(fs.readdirSync(dirPath))
  } catch {
    return []
  }
}

/**
 * 子目录名是否像「分卷 / 分话 / 下载批次」，如 `1`、`001`、`ch1`、`vol.2`、`第3话`、`1-5`。
 * 只有这种名字的单层子目录才会被并进外层书名；`漫画A` 这种正常书名不能并被吞掉。
 */
const PART_DIR_RE =
  /^(?:\d+|[cC][hH]\.?\s*\d+|[vV][oO][lL]\.?\s*\d+|第\s*\d+\s*[话話卷回章回]|\d+\s*[-~]\s*\d+)$/

export function isPartDirName(name: string): boolean {
  return PART_DIR_RE.test(name.trim())
}

/**
 * 页面根目录：真正的图片放在哪一层。
 * - 目录直属就有图片 → 就是它自己；
 * - 否则若**恰好只有一个**含图片的子目录、且该子目录名像分卷/分话/批次（`1`、`第2话`…），
 *   就用那个子目录（下载器常见的 `<书名>/1/001.jpg` 结构，整本仍按外层书名算一本）；
 * - 其它情况（没有图 / 多个含图子目录 / 子目录是正常书名）返回 null，交回递归扫描逐层判定。
 */
export function resolvePageRoot(dirPath: string): string | null {
  if (listImageNamesSync(dirPath).length > 0) return dirPath
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return null
  }
  const withImages = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== '__MACOSX')
    .map((entry) => entry.name)
    .filter((name) => listImageNamesSync(path.join(dirPath, name)).length > 0)
  if (withImages.length !== 1) return null
  return isPartDirName(withImages[0]) ? path.join(dirPath, withImages[0]) : null
}

/** 该目录（含「唯一子目录」情形）是否有可当页面的图片 */
export function hasPageImages(dirPath: string): boolean {
  return resolvePageRoot(dirPath) !== null
}

/** 已解析的目录图片表 */
interface DirIndex {
  /** 参与缓存判断的时间戳：页面根目录的 mtime */
  mtimeMs: number
  /** 已排序的图片绝对路径 */
  files: string[]
}

/** 索引缓存上限：首页侧栏与阅读页来回切书，8 本足够 */
const MAX_INDEX_CACHE = 8
const indexCache = new Map<string, DirIndex>()

/**
 * 列一本书的全部图片（自然序绝对路径）。
 * 页面根可能是书目录本身，也可能是它唯一的含图子目录（见 resolvePageRoot）。
 * 以页面根的 mtime 判缓存新鲜度：用户往文件夹里补图后重新打开即生效。
 */
export async function listImagePaths(dirPath: string): Promise<string[]> {
  const root = resolvePageRoot(dirPath) ?? dirPath
  let mtimeMs = 0
  try {
    mtimeMs = (await fs.promises.stat(root)).mtimeMs
  } catch {
    return []
  }
  const cached = indexCache.get(dirPath)
  if (cached && cached.mtimeMs === mtimeMs) return cached.files

  let names: string[]
  try {
    names = await fs.promises.readdir(root)
  } catch {
    return []
  }
  const files = sortImageNames(names).map((name) => path.join(root, name))

  indexCache.delete(dirPath)
  indexCache.set(dirPath, { mtimeMs, files })
  while (indexCache.size > MAX_INDEX_CACHE) {
    const oldest = indexCache.keys().next().value
    if (oldest === undefined) break
    indexCache.delete(oldest)
  }
  return files
}

/** 统计页数（导入建档用） */
export async function countPages(dirPath: string): Promise<number> {
  return (await listImagePaths(dirPath)).length
}

/** 按扩展名映射图片 MIME 类型（仅覆盖受支持扩展名） */
function contentTypeOf(name: string): string {
  const ext = path.extname(name).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  return 'image/jpeg'
}

/**
 * 读取单页图片：page 从 1 起。越界 / 文件已被移走返回 null（协议层转 404）。
 */
export async function readPage(
  dirPath: string,
  page: number
): Promise<{ data: Buffer; contentType: string } | null> {
  if (!Number.isInteger(page) || page < 1) return null
  const files = await listImagePaths(dirPath)
  const filePath = files[page - 1]
  if (!filePath) return null
  try {
    return { data: await fs.promises.readFile(filePath), contentType: contentTypeOf(filePath) }
  } catch {
    return null
  }
}
