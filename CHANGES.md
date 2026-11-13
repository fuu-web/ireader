# 我改了哪里（相对上游 v2.0.0）

本仓库 = [hi-done/ireader](https://github.com/hi-done/ireader) 的 **v2.0.0** 全量文件 **＋** 下面这些改动。
上游作者：**hi-done** · 上游项目：<https://github.com/hi-done/ireader> · 基线提交：`7c54341a`

## 注释怎么看

改动**直接标在代码旁边**：

- 新增一整块 → 块上方一行：`// [新增] 这是什么`
- 只改一行 → 该行行尾：`// [改动] 改了什么`
- Vue 模板里用 `<!-- [新增] … -->`；`<script>` 里用 `//`
- **上游原有的注释一律保留原样，不再重复写一遍**

## 总览

| 类别 | 数量 |
| --- | --- |
| 🆕 新增文件 | 14 个（4 个源码 + 3 个单测 + 3 个文档 + 4 张截图） |
| ✏️ 修改文件 | 33 个 |
| 📦 合计入库 | 242 个文件 |

> 仓库文件总数 242 = 上游 v2.0.0 的 228 个 + 新增 14 个。其余上游文件与 v2.0.0 逐字节一致。

## 一、新增源码（4 个）

| 文件 | 说明 |
| --- | --- |
| `electron/services/dirService.ts` | 图片文件夹漫画：一个目录 = 一本书，自然序列页、分卷子目录上提、单页读图 |
| `electron/services/libraryScan.ts` | 导入扫描与格式判定：目录含图即整目录算一本，否则递归下钻 |
| `electron/services/galleryInfo.ts` | 画廊 `info.json`：书名三级、作者规范化、`gallery_id` 去重 |
| `electron/services/backgroundService.ts` | 自定义背景图：存 `userData/backgrounds`，经 `ireader://background/{name}` 供图 |

单测：`dirService.test.ts`、`libraryScan.test.ts`、`galleryInfo.test.ts`。

## 二、修改源码（33 个）

### 主进程

`shared/types.ts`、`electron/services/protocol.ts`、`electron/services/libraryService.ts`、
`electron/services/appLocale.ts`、`electron/db/database.ts`、`electron/db/repos/booksRepo.ts`、
`electron/db/repos/collectionsRepo.ts`、`electron/ipc/handlers.ts`、`electron/preload.ts`、
`electron/main.ts`

### 渲染层

`src/services/ipc.ts`、`src/services/imagePage.ts`、`src/services/pageThumbnail.ts`、
`src/services/coverQueue.ts`、`src/stores/reader.ts`、`src/i18n/locales/zh-CN.ts`、
`src/i18n/locales/en.ts`、`src/i18n/locales/ja.ts`、`src/services/libraryList.test.ts`、
`src/services/libraryManage.test.ts`

### 界面

`src/views/LibraryView.vue`、`src/views/LibraryManageView.vue`、`src/views/SettingsView.vue`、
`src/views/AiConfigView.vue`、`src/views/ReadingStatsView.vue`、
`src/components/library/BookCard.vue`、`src/components/library/CollectionCard.vue`、
`src/components/ui/CardTip.vue`、`src/style.css`、`src/theme.ts`

### 文档

`readme.md`、`readme.en.md`、`readme.ja.md`（加署名与改动清单）

## 三、新增文档

`CHANGES.md`（本文）、`UPSTREAM.md`（上游来源与同步方法）、`NOTICE`（MIT 署名），
以及 `pics/feat-01..04`（新增功能截图）。

## 四、与上游保持一致的还原项

上游 `package.json` 里三处只为本机调试所加的改动，发布前已还原：
`electron` 版本锁 → `^42.11.12`、删除 `build.asar: false`、删除 `build.win.signAndEditExecutable: false`。

## 五、有意没进仓库的东西

`node_modules/`、`dist/`、`dist-electron/`、`release/`（构建产物）、`pnpm-lock.yaml`
（本机用 pnpm，上游用 npm + `package-lock.json`）、`dev-app-update.yml`（含本机更新地址）。
