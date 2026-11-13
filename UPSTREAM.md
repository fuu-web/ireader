# 上游来源与改动说明（UPSTREAM）


本仓库是 [hi-done/ireader](https://github.com/hi-done/ireader) 的**修改版**（derivative
work），不是上游官方仓库，也不代表原作者的任何背书。

| 项 | 值 |
| --- | --- |
| 上游项目 | https://github.com/hi-done/ireader |
| 上游作者 | hi-done <https://github.com/hi-done> |
| 上游分支 | `main` |
| 采用的上游版本 | **[`v2.0.0`](https://github.com/hi-done/ireader/releases/tag/v2.0.0)** |
| v2.0.0 对应提交 | `7c54341a1be3caf07dacd09023855e350b502efd` |
| 许可证 | MIT（见 [LICENSE](./LICENSE)、[NOTICE](./NOTICE)） |

## 与上游的 git 关系

本仓库的提交是**独立的根提交**（没有 `parent` 指向上游）。原因是发布环境到 GitHub 的
git 协议带宽受限，上游 30 MiB 全量历史无法在合理时间内拉全；为保证仓库可正常克隆、
可继续维护，首个提交以"上游 v2.0.0 的文件树 + 本地改动"为内容，而**不是**上游提交的
下游提交。

因此：

- 正确看改动：本仓库首个提交 = 上游 v2.0.0 全量文件 **+** 下面列出的本地改动；
  拿 `v2.0.0` 的 tarball 与本仓库 `main` 对比，即可看到纯改动。
- 不要指望 `git log` 能看到上游历史；需要时按下面命令把上游历史补进本地仓库。

```bash
git remote add upstream https://github.com/hi-done/ireader.git
git fetch upstream main --depth=1      # 只取上游最新
git diff upstream/main --stat          # 看差异
```

## 相对上游 v2.0.0 的改动

### 新增

- **目录漫画格式（`dir`）**：一个图片文件夹即一本书。`electron/services/dirService.ts`
  负责页表与单页读取，`libraryScan.ts` 负责递归扫描导入候选：目录直接含图片即整目录算一本，
  否则递归子目录；隐藏目录、`__MACOSX`、符号链接跳过；图片按文件名自然序（1 < 2 < 10）排列，
  支持 jpg/jpeg/png/webp/gif。协议新增 `ireader://dir/{id}/{page}`。
- **画廊元数据（`info.json`）**：`electron/services/galleryInfo.ts` 解析含 `id` + `num_pages`
  的 `info.json`，书名只取 `full_title`（中文段 > 日文段 > 原文，不读 `title` 字段与文件夹名），
  `gallery_id` 去重，同一作者 ≥2 本自动建作者合集（手建合集不抢，作者改名不重复建）。
- **分卷子目录合并**：图片只在一个像分卷名的子目录（`1/`、`第2话/`、`vol.1/`）里时，
  整本按外层书名算一本；子目录是正常书名时仍逐个识别。
- **自定义背景图**：`electron/services/backgroundService.ts` + `ireader://background/{name}`，
  选图后复制进 `userData/backgrounds`，设置存文件名，`null` = 内置图。
- **新单测**：`dirService.test.ts`、`libraryScan.test.ts`、`galleryInfo.test.ts`。

### 调整

- 「导入书籍」语义改为**选文件夹**（一个文件夹 = 一本，可多选；选总目录则逐本导入），
  另加「导入文件」单文件入口；主进程 handler、preload、`src/services/ipc.ts` 与三语 i18n 同步。
- 界面：文库首屏去掉 hero 标题；顶部栏改悬浮玻璃胶囊（`corner-shape: squircle`）；
  书卡整卡玻璃化并把书名底座收窄；合集侧栏改悬浮玻璃卡；设置页内容右对齐；
  书卡悬停提示框改液态玻璃质感。
- 数据库迁移追加 v8（画廊/分卷相关列），沿用「只追加 + `hasColumn()` 判重」的约定。

### 修复

- 卡片上写 `overflow: hidden` 会触发 Chromium 网格行高计算 bug（文库书卡被压成 18px 一条并
  互相堆叠）；裁剪改由内层元素承担。
- 删书后「自动创建且已空」的作者合集未清理（`pruneEmptyAuthorCollections`）。

### 与上游一致的还原项

上游 `package.json` 里有三处仅为本机调试所加的改动，发布前已还原为上游默认值：
`electron` 版本锁定（改回 `^42.11.12`）、`build.asar: false`（删除）、
`build.win.signAndEditExecutable: false`（删除）。

## 同步上游

上游使用 npm（`package-lock.json`）与 GitHub Actions 双平台构建；本仓库同样保留
`.github/workflows/ci.yml`、`release.yml`，推 `v*` tag 即触发构建与 Release。
如需把上游新版本合入，建议先按上面的 `git fetch upstream` 拿到上游，再逐步合并。

## 许可证与署名要求

上游为 MIT。MIT 允许修改与再分发，但要求**保留原版权声明与许可声明**：

- [LICENSE](./LICENSE)：上游原始许可文本，请勿删除或修改版权行。
- [NOTICE](./NOTICE)：本仓库对上游来源的署名说明。

如果你在本仓库基础上再分发（含打包成安装包），请一并保留这两份文件。
