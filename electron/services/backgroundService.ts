// 自定义背景图服务：把用户选择的图片复制到 {userData}/backgrounds，
// 渲染层经 ireader://background/{name} 取图（与封面同套路：不向渲染层暴露本地路径）

import fs from 'node:fs'
import path from 'node:path'

/** 允许的图片扩展名；.jpeg 统一存成 .jpg */
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'])

/** 文件名白名单：只允许安全字符且不含 ..，杜绝路径穿越 */
const NAME_RE = /^[A-Za-z0-9._-]+$/

let backgroundsDir: string | null = null

export function initBackgroundService(userDataDir: string): void {
  backgroundsDir = path.join(userDataDir, 'backgrounds')
  fs.mkdirSync(backgroundsDir, { recursive: true })
}

function getDir(): string {
  if (!backgroundsDir) throw new Error('Background service not initialized. Call initBackgroundService() first.')
  return backgroundsDir
}

/** 文件名是否安全（仅字符白名单 + 无 ..） */
export function isSafeBackgroundName(name: string): boolean {
  return NAME_RE.test(name) && !name.includes('..')
}

/** 逻辑地址：渲染层只认这个名字，拿不到磁盘路径 */
export function getBackgroundUrl(name: string): string {
  return `ireader://background/${encodeURIComponent(name)}`
}

/** 按文件名取磁盘路径；文件不存在或名字非法返回 null */
export function getBackgroundPath(name: string): string | null {
  if (!isSafeBackgroundName(name)) return null
  const filePath = path.join(getDir(), name)
  return fs.existsSync(filePath) ? filePath : null
}

/** 清空全部自定义背景（选新图前与「恢复默认」时调用） */
export function clearBackgrounds(): void {
  const dir = getDir()
  for (const file of fs.readdirSync(dir)) {
    try {
      fs.unlinkSync(path.join(dir, file))
    } catch {
      // 单个文件删不掉不影响换图：下次选择时还会再清一遍
    }
  }
}

/**
 * 保存用户选择的图片：先清旧图再复制，返回新文件名（带时间戳，天然避免缓存）。
 * @param sourcePath 用户在对话框里选中的图片绝对路径
 */
export function saveBackground(sourcePath: string): string {
  const ext = path.extname(sourcePath).toLowerCase()
  if (!ALLOWED_EXT.has(ext)) {
    throw { code: 'INVALID_PARAMS', message: '背景图片仅支持 jpg / png / webp / gif / bmp' }
  }
  const name = `bg-${Date.now()}${ext === '.jpeg' ? '.jpg' : ext}`
  clearBackgrounds()
  fs.copyFileSync(sourcePath, path.join(getDir(), name))
  return name
}
