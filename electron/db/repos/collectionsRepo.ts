// collections 表数据访问
// 合集仅存标题与创建时间；封面与数量由渲染层从 books 数据本地计算

import type { Collection } from '../../../shared/types'
import { getDatabase } from '../database'

export interface CollectionRow {
  id: number
  title: string
  created_at: number
  /** 作者归组键（自动按作者建的合集才有；用户手建的为 NULL） */
  author_key: string | null
}

export const collectionsRepo = {
  create(title: string, createdAt: number, authorKey: string | null = null): CollectionRow {  // [改动] create() 加 authorKey 参数
    const result = getDatabase()
      .prepare('INSERT INTO collections (title, created_at, author_key) VALUES (?, ?, ?)')
      .run(title, createdAt, authorKey)
    return getDatabase()
      .prepare('SELECT * FROM collections WHERE id = ?')
      .get(Number(result.lastInsertRowid)) as CollectionRow
  },

  /** 按作者键找自动建过的合集（用户改过名也能命中） */
  // [新增] 改名后仍能认领的自动合集
  findByAuthorKey(authorKey: string): CollectionRow | undefined {
    return getDatabase()
      .prepare('SELECT * FROM collections WHERE author_key = ?')
      .get(authorKey) as CollectionRow | undefined
  },

  /** 按标题找（用户手建的合集没有 author_key，只能靠标题命中） */
  findByTitle(title: string): CollectionRow | undefined {
    return getDatabase()
      .prepare('SELECT * FROM collections WHERE title = ? ORDER BY id LIMIT 1')
      .get(title) as CollectionRow | undefined
  },

  list(): CollectionRow[] {
    return getDatabase()
      .prepare('SELECT * FROM collections ORDER BY created_at DESC')
      .all() as CollectionRow[]
  },

  /** 按作者自动创建/认领的合集（删除书籍后据此清理空合集） */
  // [新增] 自动作者合集（清理空合集用）
  listAutoCreated(): CollectionRow[] {
    return getDatabase()
      .prepare('SELECT * FROM collections WHERE author_key IS NOT NULL')
      .all() as CollectionRow[]
  },

  exists(id: number): boolean {
    return !!getDatabase().prepare('SELECT 1 FROM collections WHERE id = ?').get(id)
  },

  /**
   * 重命名合集
   * @returns 更新后的合集行；合集不存在（已被别处解散）时返回 undefined
   */
  rename(id: number, title: string): CollectionRow | undefined {
    const db = getDatabase()
    const { changes } = db.prepare('UPDATE collections SET title = ? WHERE id = ?').run(title, id)
    if (!changes) return undefined
    return db.prepare('SELECT * FROM collections WHERE id = ?').get(id) as CollectionRow
  },

  /** 解散合集：事务内把成员书移回未分组，再删除合集行 */
  remove(id: number): void {
    const db = getDatabase()
    const tx = db.transaction(() => {
      db.prepare('UPDATE books SET collection_id = NULL WHERE collection_id = ?').run(id)
      db.prepare('DELETE FROM collections WHERE id = ?').run(id)
    })
    tx()
  },
}

/**
 * DB 行 → 渲染层模型（snake_case → camelCase）
 * 必须经此处转换：`SELECT *` 返回的是 `created_at`，而 IPC 契约声明的是 `createdAt`，
 * 直接穿过边界会让合集的「添加时间」排序键取到 undefined（与 progressRepo.toReadingProgress 同构）
 */
export function toCollection(row: CollectionRow): Collection {
  return { id: row.id, title: row.title, createdAt: row.created_at }
}
