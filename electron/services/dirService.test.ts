// 图片文件夹页面根判定单测：分卷子目录识别、目录名白名单、空目录/多子目录行为
// 对应 dirService.resolvePageRoot / isPartDirName（扫描与逐页读取共用同一判定）

import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isPartDirName, resolvePageRoot } from './dirService'

const tmpRoots: string[] = []

function makeTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ireader-dir-'))
  tmpRoots.push(dir)
  return dir
}

function touch(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, 'x')
}

afterEach(() => {
  for (const dir of tmpRoots.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('分卷目录名判定', () => {
  it('数字 / 第N话 / vol / ch / 区间都算分卷目录', () => {
    for (const name of ['1', '007', '第2话', '第3卷', 'vol.1', 'Vol 2', 'ch3', '1-5', '1~5']) {
      expect(isPartDirName(name), name).toBe(true)
    }
  })

  it('正常书名不算分卷目录', () => {
    for (const name of ['漫画A', '第1卷 特典', 'chapter one', '']) {
      expect(isPartDirName(name), name).toBe(false)
    }
  })
})

describe('页面根判定', () => {
  it('图片直接在目录里 → 页面根是自己', () => {
    const dir = makeTmp()
    touch(path.join(dir, '0001.jpg'))
    expect(resolvePageRoot(dir)).toBe(dir)
  })

  it('唯一一个「1」子目录里有图 → 页面根是那个子目录', () => {
    const dir = makeTmp()
    touch(path.join(dir, '1', '0001.jpg'))
    expect(resolvePageRoot(dir)).toBe(path.join(dir, '1'))
  })

  it('唯一子目录是正常书名 → 不吞并，返回 null 交给递归扫描', () => {
    const dir = makeTmp()
    touch(path.join(dir, '漫画A', '1.jpg'))
    expect(resolvePageRoot(dir)).toBeNull()
  })

  it('两个含图子目录 → 返回 null（分话合并留给后续版本）', () => {
    const dir = makeTmp()
    touch(path.join(dir, '第1话', '1.jpg'))
    touch(path.join(dir, '第2话', '1.jpg'))
    expect(resolvePageRoot(dir)).toBeNull()
  })

  it('没有图片 → 返回 null', () => {
    const dir = makeTmp()
    touch(path.join(dir, '说明.txt'))
    expect(resolvePageRoot(dir)).toBeNull()
  })

  it('隐藏子目录与 __MACOSX 不参与判定', () => {
    const dir = makeTmp()
    touch(path.join(dir, '.cache', '1.jpg'))
    touch(path.join(dir, '__MACOSX', '1.jpg'))
    touch(path.join(dir, '2', '1.jpg'))
    expect(resolvePageRoot(dir)).toBe(path.join(dir, '2'))
  })
})
