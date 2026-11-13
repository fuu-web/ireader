// books 表数据访问
// 对应设计文档 §5.1

import { getDatabase } from '../database'

export interface BookRow {
  id: number
  title: string
  file_path: string
  file_size: number
  total_pages: number
  cover_path: string | null
  added_at: number
  last_opened_at: number | null
  collection_id: number | null
  /** 规范化作者键（画廊格式才有；普通文件为 NULL） */
  author_key: string | null
  /** 作者展示名 */
  author_name: string | null
  /** 画廊 id（info.json 的 id，用于去重） */
  gallery_id: string | null
}

export interface NewBookInput {
  title: string
  filePath: string
  fileSize: number
  addedAt: number
  /** 导入时直接归属的合集（可选） */
  collectionId?: number | null
  /** 导入时已知的总页数（CBZ 按图片条目统计）；缺省 0，由封面提交流程补写 */
  totalPages?: number
  /** 画廊格式的作者键 / 展示名 */
  authorKey?: string | null
  authorName?: string | null
  /** 画廊 id（去重键） */
  galleryId?: string | null
}

export const booksRepo = {
  findByPath(filePath: string): BookRow | undefined {
    return getDatabase()
      .prepare('SELECT * FROM books WHERE file_path = ?')
      .get(filePath) as BookRow | undefined
  },

  findById(id: number): BookRow | undefined {
    return getDatabase().prepare('SELECT * FROM books WHERE id = ?').get(id) as
      | BookRow
      | undefined
  },

  /** 按画廊 id 查（同一本重复导入时用于去重） */
  findByGalleryId(galleryId: string): BookRow | undefined {
    return getDatabase()
      .prepare('SELECT * FROM books WHERE gallery_id = ?')
      .get(galleryId) as BookRow | undefined
  },

  /** 同一作者的全部书（作者归组用；作者键已规范化） */
  // [新增] 该作者全部书（作者归组）
  listByAuthorKey(authorKey: string): BookRow[] {
    return getDatabase()
      .prepare('SELECT * FROM books WHERE author_key = ? ORDER BY added_at DESC')
      .all(authorKey) as BookRow[]
  },

  insert(input: NewBookInput): BookRow {
    const result = getDatabase()
      .prepare(
        // [改动] INSERT 带作者三列
        `INSERT INTO books
           (title, file_path, file_size, total_pages, cover_path, added_at, last_opened_at,
            collection_id, author_key, author_name, gallery_id)
         VALUES
           (@title, @filePath, @fileSize, @totalPages, NULL, @addedAt, NULL,
            @collectionId, @authorKey, @authorName, @galleryId)`
      )
      .run({
        totalPages: 0,
        collectionId: null,
        authorKey: null,
        authorName: null,
        galleryId: null,
        ...input,
      })
    return this.findById(Number(result.lastInsertRowid))!
  },

  /** 某合集内的书数量（清理空合集用） */
  // [新增] 合集内书数（判空合集）
  countByCollection(collectionId: number): number {
    const row = getDatabase()
      .prepare('SELECT COUNT(*) AS count FROM books WHERE collection_id = ?')
      .get(collectionId) as { count: number }
    return row.count
  },

  listAll(): BookRow[] {
    return getDatabase()
      .prepare('SELECT * FROM books ORDER BY last_opened_at DESC NULLS LAST, added_at DESC')
      .all() as BookRow[]
  },

  updateCover(id: number, coverPath: string, totalPages: number): void {
    getDatabase()
      .prepare('UPDATE books SET cover_path = ?, total_pages = ? WHERE id = ?')
      .run(coverPath, totalPages, id)
  },

  updateLastOpened(id: number, timestamp: number): void {
    getDatabase().prepare('UPDATE books SET last_opened_at = ? WHERE id = ?').run(timestamp, id)
  },

  rename(id: number, title: string): void {
    getDatabase().prepare('UPDATE books SET title = ? WHERE id = ?').run(title, id)
  },

  updatePath(id: number, filePath: string, fileSize: number): void {
    getDatabase()
      .prepare('UPDATE books SET file_path = ?, file_size = ? WHERE id = ?')
      .run(filePath, fileSize, id)
  },

  remove(id: number): void {
    getDatabase().prepare('DELETE FROM books WHERE id = ?').run(id)
  },

  /** 批量删除书行（单事务；阅读进度 / 统计由外键 ON DELETE CASCADE 清理） */
  removeMany(ids: number[]): void {
    const stmt = getDatabase().prepare('DELETE FROM books WHERE id = ?')
    const tx = getDatabase().transaction(() => {
      for (const id of ids) stmt.run(id)
    })
    tx()
  },

  /** 批量移动书至合集（collectionId = NULL 表示移回未分组） */
  moveToCollection(ids: number[], collectionId: number | null): void {
    const stmt = getDatabase().prepare('UPDATE books SET collection_id = ? WHERE id = ?')
    const tx = getDatabase().transaction(() => {
      for (const id of ids) stmt.run(collectionId, id)
    })
    tx()
  },
}
