// 文库服务：导入扫描、去重、缺失检测、Book 行转换
// 对应设计文档 §4.1 / §8.1

import fs from 'node:fs'
import path from 'node:path'
import { booksRepo, type BookRow } from '../db/repos/booksRepo'
import { collectionsRepo } from '../db/repos/collectionsRepo'
import { progressRepo, toReadingProgress } from '../db/repos/progressRepo'
// [改动] 引 PagedImageFormat
import type { Book, PagedImageFormat } from '../../shared/types'
import { isPagedImageFormat } from '../../shared/types'
import { getCoverUrl } from './coverService'
import { countPages as countCbzPages } from './cbzService'
import { countPages as countMobiPages } from './mobiService'
// [新增] 引 dir 页数 / 导入扫描
import { countPages as countDirPages } from './dirService'
import { collectImportCandidates, detectFormat } from './libraryScan'
import * as logger from './logger'

// 格式判定与导入扫描集中在 libraryScan（纯 IO，可单测）；此处再导出，保持 protocol 等旧调用点不变
export { detectFormat }

function rowToBook(row: BookRow): Book {
  const missing = !fs.existsSync(row.file_path)
  const progressRow = progressRepo.findByBookId(row.id)
  return {
    id: row.id,
    title: row.title,
    filePath: row.file_path,
    format: detectFormat(row.file_path),
    fileSize: row.file_size,
    totalPages: row.total_pages,
    coverUrl: row.cover_path ? getCoverUrl(row.id) : null,
    addedAt: row.added_at,
    lastOpenedAt: row.last_opened_at,
    collectionId: row.collection_id,
    author: row.author_name,  // [新增] 映射 author
    missing,
    progress: progressRow ? toReadingProgress(progressRow) : null,
  }
}

/**
 * 「同时删除文件」的落盘动作。
 * 图片文件夹漫画（dir）不删目录：递归删掉一个装着用户原始图片的目录风险过高且不可恢复，
 * 这里只移除文库记录并留日志，目录由用户自行决定是否清理。
 */
function removeSourceFile(filePath: string): void {
  try {
    if (fs.statSync(filePath).isDirectory()) {
      logger.warn(`[libraryService] 图片文件夹不随记录删除，已保留：${filePath}`)
      return
    }
    fs.unlinkSync(filePath)
  } catch (e) {
    // 单本失败不中断整批：记录已删，残留文件可手工清理
    logger.warn(
      `[libraryService] 删除文件失败：${filePath}（${e instanceof Error ? e.message : String(e)}）`
    )
  }
}

/**
 * 同一作者的书自动整理进一个合集：
 * - 该作者的书总数 < 2、或「未归属合集」的书 < 2 时不建合集（不制造只有一本的合集）；
 * - 已归属其它合集的书（用户手动放的）不抢，只收编未分组的；
 * - 只认领**自动创建**的合集（`author_key` 非空）；同名的手建合集可以复用，但不写 author_key，
 *   这样用户手建的合集永远不会被 `pruneEmptyAuthorCollections` 当成自动合集删掉。
 */
function ensureAuthorCollection(authorKey: string, authorName: string): void {
  const rows = booksRepo.listByAuthorKey(authorKey)
  if (rows.length < 2) return
  const loose = rows.filter((row) => row.collection_id == null)
  if (loose.length < 2) return

  let collection = collectionsRepo.findByAuthorKey(authorKey)
  if (!collection) {
    // 同名的用户手建合集：复用它，但不打 author_key（该合集由用户管理，空置也不清理）
    collection = collectionsRepo.findByTitle(authorName)
  }
  if (!collection) {
    collection = collectionsRepo.create(authorName, Date.now(), authorKey)
    logger.info(`[libraryService] 按作者新建合集：${authorName}`)
  }
  booksRepo.moveToCollection(
    loose.map((row) => row.id),
    collection.id
  )
  logger.info(`[libraryService] 作者「${authorName}」归组 ${loose.length} 本 → 合集 ${collection.id}`)
}

/**
 * 删书后清理「按作者自动建、且已经空了」的合集：
 * 作者归组建出来的合集只是书的附属物，最后一本书被删掉后它不该继续留在文库页上。
 * 用户手建的合集（author_key 为 NULL）不在此列——空手建合集可能是用户先建后填。
 */
function pruneEmptyAuthorCollections(): void {
  for (const collection of collectionsRepo.listAutoCreated()) {
    if (booksRepo.countByCollection(collection.id) > 0) continue
    collectionsRepo.remove(collection.id)
    logger.info(`[libraryService] 清理空作者合集：${collection.title}（id=${collection.id}）`)
  }
}

/** 逐页图片格式的页数统计：三种格式各一个实现，新增格式只在这里加一行 */
const PAGE_COUNTERS: Record<PagedImageFormat, (filePath: string) => Promise<number>> = {
  cbz: countCbzPages,
  mobi: countMobiPages,
  dir: countDirPages,
}

export const libraryService = {
  /**
   * 导入文件/文件夹列表，递归扫描 PDF/EPUB/CBZ/MOBI 与「图片文件夹漫画」，按路径去重落库。
   * 画廊格式（目录含 info.json）额外带：full_title 选出的书名、作者（自动归合集）、画廊 id（去重）。
   * collectionId 非 null 时新导入的书直接归属该合集（合集视图内导入）。
   * CBZ/MOBI/图片文件夹在导入时统计图片页数写入 total_pages，避免「封面队列未完成时打开页数为 0」竞态。
   */
  async importPaths(
    inputPaths: string[],
    collectionId: number | null = null
  ): Promise<{ added: Book[]; skipped: number }> {
    if (collectionId !== null && !collectionsRepo.exists(collectionId)) {
      throw { code: 'FILE_NOT_FOUND', message: 'collection not found' }
    }
    const candidates = collectImportCandidates(inputPaths)  // [改动] 一个文件夹 = 一本
    const added: Book[] = []
    let skipped = 0
    /** 本次导入涉及到的作者（导入结束后统一整理合集） */
    const touchedAuthors = new Map<string, string>()

    for (const candidate of candidates) {
      const bookPath = candidate.path
      if (booksRepo.findByPath(bookPath)) {
        skipped++
        continue
      }
      const gallery = candidate.gallery
      // 同一本画廊重复下载（换了目录名/换了位置）不重复入库
      if (gallery && booksRepo.findByGalleryId(gallery.id)) {
        logger.info(`[libraryService] 画廊 ${gallery.id} 已存在，跳过：${bookPath}`)
        skipped++
        continue
      }
      const stat = fs.statSync(bookPath)
      const format = candidate.format
      // 书名：画廊格式用 info.json 里选出的标题；普通文件夹用目录名；文件去掉扩展名
      const title =
        gallery?.title ||
        (format === 'dir'
          ? path.basename(bookPath)
          : path.basename(bookPath, path.extname(bookPath)))
      let totalPages = 0
      if (isPagedImageFormat(format)) {  // [改动] dir/cbz/mobi 共用页数统计
        try {
          totalPages = await PAGE_COUNTERS[format](bookPath)  // [改动] 导入时写 total_pages
        } catch (e) {
          // 统计失败不中止导入：书仍入库（0 页），由封面队列与打开时错误兜底
          logger.warn(
            `[libraryService] ${format} 页数统计失败：${bookPath}（${e instanceof Error ? e.message : String(e)}）`
          )
        }
      }
      // 元数据页数与磁盘实际图片数不一致时以磁盘为准（用户可能删过页），只记日志
      if (gallery && gallery.numPages > 0 && totalPages > 0 && gallery.numPages !== totalPages) {
        logger.warn(
          `[libraryService] 画廊 ${gallery.id} 页数不一致：info=${gallery.numPages} 实际=${totalPages}`
        )
      }
      const row = booksRepo.insert({
        title,
        filePath: bookPath,
        // 文件夹没有单一文件大小：记 0，避免用整目录体积误导
        fileSize: format === 'dir' ? 0 : stat.size,
        addedAt: Date.now(),
        collectionId,
        totalPages,
        // [新增] 入库带作者 + gallery_id
        authorKey: gallery?.authorKey ?? null,
        authorName: gallery?.authorName ?? null,
        galleryId: gallery?.id ?? null,
      })
      // [新增] 记录涉及作者
      if (gallery?.authorKey && gallery.authorName) {
        touchedAuthors.set(gallery.authorKey, gallery.authorName)
      }
      added.push(rowToBook(row))
    }

    // 作者归合集：同一作者≥2 本才建合集，且只收编还没归属合集的书
    for (const [authorKey, authorName] of touchedAuthors) {
      try {
        ensureAuthorCollection(authorKey, authorName)
      } catch (e) {
        logger.warn(
          `[libraryService] 作者合集整理失败：${authorName}（${e instanceof Error ? e.message : String(e)}）`
        )
      }
    }

    return { added, skipped }
  },

  list(): Book[] {
    return booksRepo.listAll().map(rowToBook)
  },

  getById(id: number): Book | undefined {
    const row = booksRepo.findById(id)
    return row ? rowToBook(row) : undefined
  },

  rename(id: number, title: string): Book | undefined {
    booksRepo.rename(id, title)
    return this.getById(id)
  },

  remove(id: number, deleteFile: boolean): void {
    const row = booksRepo.findById(id)
    booksRepo.remove(id) // reading_progress 通过外键 ON DELETE CASCADE 级联删除
    // [新增] 删书后清空作者合集
    if (deleteFile && row) removeSourceFile(row.file_path)
    pruneEmptyAuthorCollections()
  },

  /**
   * 批量移除书籍：按存在性过滤后单事务删库，事务提交后再删文件（反序会在 DB 失败时已不可恢复地删掉文件）。
   * @param ids 待移除书 id（调用方已做非空 / 正整数过滤）
   * @param deleteFile 是否同时删除磁盘原文件
   * @returns 实际移除的 id 列表（库中不存在的 id 被忽略）
   */
  removeMany(ids: number[], deleteFile: boolean): number[] {
    // 只保留正整数 id（脏值过滤而非报错，避免一批里一个坏 id 拖垮整批），去重后为空则拒绝
    const uniqueIds = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))]
    if (!uniqueIds.length) throw { code: 'INVALID_PARAMS', message: 'bookIds 不能为空' }
    const rows = uniqueIds
      .map((id) => booksRepo.findById(id))
      .filter((row): row is BookRow => Boolean(row))
    if (!rows.length) return []

    booksRepo.removeMany(rows.map((row) => row.id)) // 进度 / 统计随外键级联清理
    if (deleteFile) {
      for (const row of rows) removeSourceFile(row.file_path)  // [改动] 批量删除走 removeSourceFile
    }
    // 整批删完后作者合集会空出来，一并清掉（否则文库页会留下空合集卡片）
    pruneEmptyAuthorCollections()
    return rows.map((row) => row.id)
  },

  relink(id: number, newPath: string): Book | undefined {
    const real = fs.realpathSync(newPath)
    const stat = fs.statSync(real)
    booksRepo.updatePath(id, real, stat.size)
    return this.getById(id)
  },

  markOpened(id: number): void {
    booksRepo.updateLastOpened(id, Date.now())
  },

  /** 批量移动书至合集；校验合集存在与归属变化，返回无变化时 false */
  moveToCollection(ids: number[], collectionId: number | null): boolean {
    if (!ids.length) return false
    if (collectionId !== null && !collectionsRepo.exists(collectionId)) {
      throw { code: 'FILE_NOT_FOUND', message: 'collection not found' }
    }
    const before = ids.map((id) => booksRepo.findById(id)?.collection_id ?? null)
    const changed = before.some((cid) => cid !== collectionId)
    if (changed) booksRepo.moveToCollection(ids, collectionId)
    return changed
  },
}
