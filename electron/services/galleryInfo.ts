// 画廊格式（下载器产出）元数据解析：只读目录里的 info.json
// 约定：看得到 info.json 且能解析出 id + num_pages 才算画廊格式
// 书名只用 info.json 的字段（full_title / title_jp），不读 title 字段、不解析文件夹名；
// 仅当两个标题字段都解析不出时才退回目录名，避免整本无标题

import fs from 'node:fs'
import path from 'node:path'

/** 汉字（含扩展 A）与日文假名：用于判断一段文字是中文 / 日文 / 英文 */
const HAN_RE = /[\u3400-\u4dbf\u4e00-\u9fff]/g
const KANA_RE = /[\u3040-\u30ff]/g

export type TitleScript = 'zh' | 'ja' | 'en'

/**
 * 判断一段文字的语种：有假名 → 日文；只有汉字（≥2 个）→ 中文；其余 → 英文。
 * 纯汉字的日文标题无法与中文区分，按中文处理（用户规则：有中文优先中文）。
 */
export function detectScript(text: string): TitleScript {
  const source = String(text ?? '')
  const kana = (source.match(KANA_RE) ?? []).length
  if (kana > 0) return 'ja'
  const han = (source.match(HAN_RE) ?? []).length
  return han >= 2 ? 'zh' : 'en'
}

/**
 * 把 full_title 切成译名分段：`|`、`｜`、`/`、`／` 以及两侧带空格的下划线都是分隔符。
 * 下划线必须带空格才算分隔符，避免把 Sissy_Life 这类词切开。
 */
export function splitTitleSegments(fullTitle: string): string[] {
  return String(fullTitle ?? '')
    .split(/\s*[|｜/／]\s*|\s+_\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
}

/**
 * 书名选择（第一层）：中文段 > 日文段 > 原文整串。
 * 单段（没有分隔符）时原样返回——本身是中文就是中文，是英文就是英文。
 */
export function pickDisplayTitle(fullTitle: string): string {
  return pickGalleryTitle(fullTitle, '').title
}

/**
 * 去掉方括号段：`[ぶらっぴ (ブラザーピエロ)]`、`[中国翻訳]`、`【DL版】`、`［漢化組］` 这类
 * 社团名/版本标记不是书名的一部分。覆盖半角 `[]`、全角 `【】`、全角方括号 `［］`、六角括号 `〔〕`。
 * 反复剥离直到稳定：嵌套写法（`[[a]]`）需要多轮才能清干净。
 */
export function stripBracketSegments(text: string): string {
  let current = String(text ?? '')
  for (let i = 0; i < 5; i++) {
    const next = current
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/【[^】]*】/g, ' ')
      .replace(/［[^］]*］/g, ' ')
      .replace(/〔[^〕]*〕/g, ' ')
    if (next === current) break
    current = next
  }
  return current.replace(/\s+/g, ' ').trim()
}

/**
 * 书名选择（完整规则）：
 * 1. full_title 里有中文段 → 用中文段（有中文就优先中文，不再看 title_jp）；
 * 2. full_title 没有中文 → 用 title_jp 去掉方括号后的正文（例如 `[汐乃コウ] 淫乱女教師と僕 [中国翻訳]` → `淫乱女教師と僕`）；
 * 3. 两者都拿不到 → 退回 full_title 的日文段，再退回原文（英文）。
 *
 * @param fullTitle info.json 的 full_title
 * @param titleJp info.json 的 title_jp（可能为空串）
 */
export function pickGalleryTitle(
  fullTitle: string,
  titleJp: string
): { title: string; source: 'full-zh' | 'title-jp' | 'full-raw' } {
  const full = String(fullTitle ?? '').trim()
  const segments = splitTitleSegments(full)

  // 中文段逐个尝试：剥掉方括号后为空（例如整段就是 `[中国翻訳]`）则跳过，继续找下一个中文段
  const zhSegments =
    segments.length > 1
      ? segments.filter((segment) => detectScript(segment) === 'zh')
      : segments.length === 1 && detectScript(segments[0]) === 'zh'
        ? segments
        : []
  for (const segment of zhSegments) {
    const cleaned = stripBracketSegments(segment)
    if (cleaned) return { title: cleanTitleTail(cleaned), source: 'full-zh' }
  }

  const jp = stripBracketSegments(titleJp)
  if (jp) return { title: cleanTitleTail(jp), source: 'title-jp' }

  // 兜底：优先日文段（规则 c：只有日语就用日语），其次按段序取第一个剥括号后非空的段
  // （`[完整] | English` → `English`），都不行才用整串原文——避免把 `[中国翻訳]` 当书名
  const usable = segments
    .map((segment) => ({ script: detectScript(segment), text: stripBracketSegments(segment) }))
    .filter((item) => item.text.length > 0)
  const japanese = usable.find((item) => item.script === 'ja')
  const fallback = japanese?.text ?? usable[0]?.text ?? (stripBracketSegments(full) || full)
  return { title: cleanTitleTail(fallback), source: 'full-raw' }
}

/**
 * 去掉标题末尾悬空的分隔符：full_title 被下载器截断时会留下 `Sissy Life ch.1~20 -` 这种尾巴。
 * 只清尾部，标题里的 `#3`、`!`、`~` 等内容符号保持不动。
 */
function cleanTitleTail(title: string): string {
  return title.replace(/[\s\-–—_|/／]+$/u, '').trim()
}

/** 作者规范化：同名不同大小写/多空格视为同一作者；多作者按 `A & B` 合并 */
export function normalizeArtists(raw: unknown): { key: string; name: string } | null {
  const list = Array.isArray(raw)
    ? raw
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : []
  if (!list.length) return null
  const name = list.join(' & ')
  const key = name.toLowerCase().replace(/\s+/g, ' ').trim()
  return { key, name }
}

/** info.json 解析结果 */
export interface GalleryInfo {
  /** 画廊 id（下载器全局唯一，用于导入去重） */
  id: string
  /** 元数据里记录的页数（仅用于与磁盘实际图片数交叉校验） */
  numPages: number
  /** 展示书名（full_title 段选择后的结果） */
  title: string
  /** 原始 full_title（日志/兜底用） */
  fullTitle: string
  /** 作者归组键；无作者为 null */
  authorKey: string | null
  /** 作者展示名；无作者为 null */
  authorName: string | null
}

/**
 * 读取目录下的 info.json。
 * 文件缺失、JSON 非法、缺 id / num_pages 一律返回 null（调用方按普通图片文件夹处理）。
 */
export function readGalleryInfo(dirPath: string): GalleryInfo | null {
  const filePath = path.join(dirPath, 'info.json')
  let text: string
  try {
    text = fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  if (!json || typeof json !== 'object') return null
  const source = json as Record<string, unknown>

  const rawId = source.id
  const id = typeof rawId === 'string' || typeof rawId === 'number' ? String(rawId).trim() : ''
  const numPages = Number(source.num_pages)
  if (!id || !Number.isFinite(numPages)) return null

  const fullTitle = typeof source.full_title === 'string' ? source.full_title.trim() : ''
  const titleJp = typeof source.title_jp === 'string' ? source.title_jp.trim() : ''
  // 书名只从 full_title / title_jp 选（title 字段与文件夹名不参与）；解析不出时退回目录名
  const picked = pickGalleryTitle(fullTitle, titleJp)
  const title = picked.title || path.basename(dirPath)
  const author = normalizeArtists(source.artists)

  return {
    id,
    numPages,
    title,
    fullTitle,
    authorKey: author?.key ?? null,
    authorName: author?.name ?? null,
  }
}
