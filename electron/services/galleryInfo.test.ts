// 画廊元数据解析单测：语种判断、书名段选择、作者规范化、info.json 读取容错
// 用例文案使用中性示例，结构与真实下载器数据一致（英文 | 中文）

import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  detectScript,
  normalizeArtists,
  pickDisplayTitle,
  pickGalleryTitle,
  readGalleryInfo,
  splitTitleSegments,
  stripBracketSegments,
} from './galleryInfo'

const tmpRoots: string[] = []

function makeTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ireader-gallery-'))
  tmpRoots.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tmpRoots.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('语种判断', () => {
  it('纯汉字≥2 个判为中文', () => {
    expect(detectScript('催眠魔之魔鬼人奸')).toBe('zh')
  })

  it('含假名判为日文（即使有汉字）', () => {
    expect(detectScript('淫乱女教師と僕')).toBe('ja')
    expect(detectScript('ギャルとめっちゃ')).toBe('ja')
  })

  it('无汉字无假名判为英文', () => {
    expect(detectScript('Discipline I+II')).toBe('en')
    expect(detectScript('#3')).toBe('en')
  })
})

describe('书名段选择', () => {
  it('中英并存（| 分隔）取中文段', () => {
    const full = 'Some English Title #3 | 关于这件事的中文标题 #3'
    expect(pickDisplayTitle(full)).toBe('关于这件事的中文标题 #3')
  })

  it('只有英文保持英文', () => {
    expect(pickDisplayTitle('Inran Onna Kyoushi to Boku')).toBe('Inran Onna Kyoushi to Boku')
  })

  it('整串就是中文时原样返回', () => {
    expect(pickDisplayTitle('催眠魔之魔鬼人奸')).toBe('催眠魔之魔鬼人奸')
  })

  it('只有日文时取日文段', () => {
    expect(pickDisplayTitle('English Title | 淫乱女教師と僕')).toBe('淫乱女教師と僕')
  })

  it('两侧带空格的下划线也是分隔符', () => {
    expect(splitTitleSegments('English #3 _ 中文标题 #3')).toEqual(['English #3', '中文标题 #3'])
  })

  it('词内下划线不当作分隔符', () => {
    expect(splitTitleSegments('Sissy_Life ch.1')).toEqual(['Sissy_Life ch.1'])
  })

  it('空串返回空串', () => {
    expect(pickDisplayTitle('   ')).toBe('')
  })

  it('清掉末尾悬空的分隔符（下载器截断留下的尾巴）', () => {
    expect(pickDisplayTitle('Sissy Life ch.1~20 -')).toBe('Sissy Life ch.1~20')
    expect(pickDisplayTitle('Title | ')).toBe('Title')
  })

  it('中文段里的方括号也要剥掉', () => {
    expect(pickGalleryTitle('English | [汉化组] 中文标题 [完整]', '')).toEqual({
      title: '中文标题',
      source: 'full-zh',
    })
  })

  it('中文段剥完括号为空时跳过该段，继续取下一个可用段', () => {
    expect(pickGalleryTitle('[完整] | English', '').title).toBe('English')
  })
})

describe('title_jp 兜底（full_title 是英文时）', () => {
  it('取 title_jp 去掉方括号后的正文', () => {
    const picked = pickGalleryTitle(
      'Some English Title',
      '[ぶらっぴ (ブラザーピエロ)] オトコの娘教師 校長室でのエッチな告白 [中国翻訳]'
    )
    expect(picked).toEqual({
      title: 'オトコの娘教師 校長室でのエッチな告白',
      source: 'title-jp',
    })
  })

  it('full_title 有中文时不看 title_jp', () => {
    const picked = pickGalleryTitle('English | 中文标题', '[作者] 日本語タイトル [DL版]')
    expect(picked.source).toBe('full-zh')
    expect(picked.title).toBe('中文标题')
  })

  it('title_jp 只有方括号段时不采用，退回 full_title', () => {
    const picked = pickGalleryTitle('Some English Title', '[作者名] [DL版]')
    expect(picked).toEqual({ title: 'Some English Title', source: 'full-raw' })
  })

  it('title_jp 去括号后与英文同名时结果不变', () => {
    const picked = pickGalleryTitle('Discipline I+II', '[ratatatat74] Discipline I+II')
    expect(picked.title).toBe('Discipline I+II')
  })

  it('方括号剥离支持全角【】与全角方括号［］', () => {
    expect(stripBracketSegments('【DL版】[作者] 标题')).toBe('标题')
    expect(stripBracketSegments('［漢化組］中文標題［完整］')).toBe('中文標題')
    expect(pickGalleryTitle('English | ［漢化組］中文標題［完整］', '')).toEqual({
      title: '中文標題',
      source: 'full-zh',
    })
  })
})

describe('作者规范化', () => {
  it('大小写与多空格归一为同一作者键，展示名保留原样', () => {
    expect(normalizeArtists(['SkyZen'])).toEqual({ key: 'skyzen', name: 'SkyZen' })
    expect(normalizeArtists(['  skyzen  '])).toEqual({ key: 'skyzen', name: 'skyzen' })
  })

  it('多作者按 & 合并', () => {
    expect(normalizeArtists(['a b', 'c'])).toEqual({ key: 'a b & c', name: 'a b & c' })
  })

  it('空数组 / 非法值返回 null', () => {
    expect(normalizeArtists([])).toBeNull()
    expect(normalizeArtists(undefined)).toBeNull()
    expect(normalizeArtists([1, null])).toBeNull()
  })
})

describe('读取 info.json', () => {
  it('正常解析出 id / 页数 / 中文书名 / 作者', () => {
    const dir = makeTmp()
    fs.writeFileSync(
      path.join(dir, 'info.json'),
      JSON.stringify({
        id: 567889,
        num_pages: 54,
        full_title: 'Some English Title #3 | 中文标题 #3',
        title: '不应被使用的 title 字段',
        title_jp: '[作者] 日本語タイトル [DL版]',
        artists: ['Shiono Kou'],
      }),
      'utf8'
    )
    const info = readGalleryInfo(dir)
    expect(info).toMatchObject({
      id: '567889',
      numPages: 54,
      title: '中文标题 #3',
      authorKey: 'shiono kou',
      authorName: 'Shiono Kou',
    })
  })

  it('full_title 是英文时用 title_jp 的正文作书名', () => {
    const dir = makeTmp()
    fs.writeFileSync(
      path.join(dir, 'info.json'),
      JSON.stringify({
        id: '567751',
        num_pages: 256,
        full_title: 'Inran Onna Kyoushi to Boku',
        title_jp: '[汐乃コウ] 淫乱女教師と僕 [中国翻訳] [DL版]',
        artists: ['shiono kou'],
      }),
      'utf8'
    )
    expect(readGalleryInfo(dir)?.title).toBe('淫乱女教師と僕')
  })

  it('没有 info.json 返回 null（按普通图片文件夹处理）', () => {
    expect(readGalleryInfo(makeTmp())).toBeNull()
  })

  it('JSON 损坏返回 null', () => {
    const dir = makeTmp()
    fs.writeFileSync(path.join(dir, 'info.json'), '{ not json', 'utf8')
    expect(readGalleryInfo(dir)).toBeNull()
  })

  it('缺 id 或 num_pages 视为非画廊格式', () => {
    const dir = makeTmp()
    fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify({ full_title: '只有标题' }), 'utf8')
    expect(readGalleryInfo(dir)).toBeNull()
  })

  it('full_title 为空时退回目录名，不报错', () => {
    const dir = makeTmp()
    const sub = path.join(dir, '某本漫画')
    fs.mkdirSync(sub)
    fs.writeFileSync(path.join(sub, 'info.json'), JSON.stringify({ id: '1', num_pages: 3 }), 'utf8')
    expect(readGalleryInfo(sub)?.title).toBe('某本漫画')
  })

  it('无 authors 字段时作者为 null（不归合集）', () => {
    const dir = makeTmp()
    fs.writeFileSync(
      path.join(dir, 'info.json'),
      JSON.stringify({ id: '2', num_pages: 5, full_title: 'Title', artists: [] }),
      'utf8'
    )
    const info = readGalleryInfo(dir)
    expect(info?.authorKey).toBeNull()
    expect(info?.authorName).toBeNull()
  })
})
