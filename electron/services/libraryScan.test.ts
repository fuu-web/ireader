// 导入扫描与图片文件夹排序单测
// 覆盖：目录即一本书 / 大目录下逐本识别 / 父目录含图不再拆分 / 普通文件照常导入 / 排序与过滤

import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { collectImportCandidates, detectFormat } from './libraryScan'
import { sortImageNames } from './dirService'

const tmpRoots: string[] = []

/** 建临时根目录（用例结束统一清理） */
function makeTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ireader-scan-'))
  tmpRoots.push(dir)
  return dir
}

/** 写一个占位文件（内容无所谓，扫描只看名字与是否存在） */
function touch(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, 'x')
}

afterEach(() => {
  for (const dir of tmpRoots.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('导入扫描', () => {
  it('一个装满图片的文件夹识别为一本 dir 书', () => {
    const root = makeTmp()
    const comic = path.join(root, '第一卷')
    touch(path.join(comic, '001.jpg'))
    touch(path.join(comic, '002.png'))

    const got = collectImportCandidates([comic])
    expect(got).toEqual([{ path: fs.realpathSync(comic), format: 'dir' }])
  })

  it('目录里有可解析的 info.json 时附带画廊元数据', () => {
    const root = makeTmp()
    const gallery = path.join(root, '567889_某本漫画')
    touch(path.join(gallery, '0001.jpg'))
    fs.writeFileSync(
      path.join(gallery, 'info.json'),
      JSON.stringify({
        id: '567889',
        num_pages: 1,
        full_title: 'English Title | 中文标题',
        artists: ['Some Artist'],
      }),
      'utf8'
    )

    const got = collectImportCandidates([root])
    expect(got).toHaveLength(1)
    expect(got[0].format).toBe('dir')
    expect(got[0].gallery).toMatchObject({
      id: '567889',
      title: '中文标题',
      authorKey: 'some artist',
      authorName: 'Some Artist',
    })
  })

  it('info.json 损坏时仍按普通图片文件夹导入（元数据为空）', () => {
    const root = makeTmp()
    const comic = path.join(root, '坏元数据')
    touch(path.join(comic, '1.jpg'))
    fs.writeFileSync(path.join(comic, 'info.json'), '{ broken', 'utf8')

    const got = collectImportCandidates([root])
    expect(got).toHaveLength(1)
    expect(got[0].format).toBe('dir')
    expect(got[0].gallery).toBeUndefined()
  })

  it('大文件夹下的每个小文件夹各识别为一本', () => {
    const root = makeTmp()
    touch(path.join(root, '漫画A', '1.jpg'))
    touch(path.join(root, '漫画B', '1.jpg'))
    touch(path.join(root, '漫画B', '2.jpg'))

    const got = collectImportCandidates([root])
    expect(got.map((c) => [path.basename(c.path), c.format])).toEqual([
      ['漫画A', 'dir'],
      ['漫画B', 'dir'],
    ])
  })

  it('父目录直接含图片时整目录算一本，不向下拆分子目录', () => {
    const root = makeTmp()
    touch(path.join(root, '封面.jpg'))
    touch(path.join(root, '子目录', '1.jpg'))

    const got = collectImportCandidates([root])
    expect(got).toHaveLength(1)
    expect(got[0].format).toBe('dir')
    expect(got[0].path).toBe(fs.realpathSync(root))
  })

  it('图片只在一个「1」子目录里时，按外层书名算一本（<书名>/1/001.jpg 结构）', () => {
    const root = makeTmp()
    const comic = path.join(root, '[作者] 某本漫画')
    touch(path.join(comic, '1', '0001.jpg'))
    touch(path.join(comic, '1', '0002.jpg'))

    const got = collectImportCandidates([root])
    expect(got).toHaveLength(1)
    expect(got[0].path).toBe(fs.realpathSync(comic))
    expect(got[0].format).toBe('dir')
  })

  it('唯一子目录是正常书名时不被吞并，仍按子目录识别', () => {
    const root = makeTmp()
    touch(path.join(root, '漫画A', '1.jpg'))

    const got = collectImportCandidates([root])
    expect(got.map((c) => path.basename(c.path))).toEqual(['漫画A'])
  })

  it('有两个装图子目录时仍逐个子目录识别（分话结构交给后续版本）', () => {
    const root = makeTmp()
    const comic = path.join(root, '分话漫画')
    touch(path.join(comic, '第1话', '1.jpg'))
    touch(path.join(comic, '第2话', '1.jpg'))

    const got = collectImportCandidates([root])
    expect(got.map((c) => path.basename(c.path))).toEqual(['第1话', '第2话'])
  })

  it('普通漫画文件仍按文件格式导入（与文件夹混选）', () => {
    const root = makeTmp()
    touch(path.join(root, 'a.pdf'))
    touch(path.join(root, 'b.CBZ'))
    touch(path.join(root, '漫画C', '1.webp'))

    const got = collectImportCandidates([root])
    const byName = new Map(got.map((c) => [path.basename(c.path), c.format]))
    expect(byName.get('a.pdf')).toBe('pdf')
    expect(byName.get('b.CBZ')).toBe('cbz')
    expect(byName.get('漫画C')).toBe('dir')
    expect(got).toHaveLength(3)
  })

  it('隐藏目录、__MACOSX 与非图片文件不参与识别', () => {
    const root = makeTmp()
    touch(path.join(root, '.hidden', '1.jpg'))
    touch(path.join(root, '__MACOSX', '1.jpg'))
    touch(path.join(root, '说明.txt'))
    touch(path.join(root, '正常', '1.jpg'))

    const got = collectImportCandidates([root])
    expect(got.map((c) => path.basename(c.path))).toEqual(['正常'])
  })

  it('不存在的路径被忽略', () => {
    expect(collectImportCandidates([path.join(makeTmp(), '不存在')])).toEqual([])
  })
})

describe('格式判定', () => {
  it('目录判定为 dir，扩展名优先', () => {
    const root = makeTmp()
    const dir = path.join(root, '一本漫画')
    fs.mkdirSync(dir, { recursive: true })
    expect(detectFormat(dir)).toBe('dir')
    expect(detectFormat(path.join(root, 'x.pdf'))).toBe('pdf')
    expect(detectFormat(path.join(root, 'x.zip'))).toBe('cbz')
  })
})

describe('图片文件夹排序', () => {
  it('数字段按数值排序，过滤非图片与隐藏文件', () => {
    const names = ['10.jpg', '2.jpg', '1.jpg', '.DS_Store', 'note.txt', '03.PNG', 'Thumbs.db']
    expect(sortImageNames(names)).toEqual(['1.jpg', '2.jpg', '03.PNG', '10.jpg'])
  })
})
