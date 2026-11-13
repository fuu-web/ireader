<template>
  <div ref="cardEl" class="book-card tilt-card" @click="$emit('open', book.id)">
    <!-- 整卡光感层：封面放大模糊后铺满卡壳，让封面光透到卡片边框与圆角上（光感玻璃） -->
    <!-- [新增] 整卡光感层 -->
    <span class="card-bleed-clip" aria-hidden="true">
      <span class="card-bleed" :style="bleedStyle" />
    </span>
    <div class="cover">
      <img v-if="book.coverUrl" :src="book.coverUrl" :alt="book.title" />
      <div v-else class="cover-placeholder">
        <!-- 无封面占位：折角书页轮廓（SF Symbols doc 风），比纯文字更精致 -->
        <svg
          class="placeholder-icon"
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M7 3.5h6.5L18 8v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z" />
          <path d="M13.5 3.5V8H18" />
        </svg>
        <span>{{ t('common.noCover') }}</span>
      </div>

      <!-- 跟随指针的封面高光：纯装饰层，不参与命中 -->
      <div class="cover-glare" aria-hidden="true" />

      <span v-if="book.missing" class="badge-missing cover-badge">
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 4.6 20.2 19.2a.9.9 0 0 1-.8 1.3H4.6a.9.9 0 0 1-.8-1.3L12 4.6z" />
          <path d="M12 10.2v3.9" />
          <path d="M12 17.3h.01" />
        </svg>
        {{ t('library.book.missingBadge') }}
      </span>

      <!-- 阅读进度圆环：悬浮在封面右上角，hover 时让位给操作按钮；
           无进度的卡片不渲染，封面高度不变，卡片尺寸保持一致。
           进度文本并入书名提示框，此处只保留读屏语义 -->
      <div
        v-if="progressPercent !== null"
        class="progress-ring"
        role="img"
        :aria-label="t('library.book.progress', { percent: progressPercent })"
      >
        <svg viewBox="0 0 36 36">
          <circle class="ring-bg" cx="18" cy="18" r="15.5" />
          <circle
            class="ring-fill"
            cx="18"
            cy="18"
            r="15.5"
            :stroke-dasharray="RING_CIRC"
            :stroke-dashoffset="RING_CIRC * (1 - progressPercent / 100)"
          />
        </svg>
        <span class="ring-text">{{ progressPercent }}<i>%</i></span>
      </div>
    </div>
    <!-- 书名行：hover 触发上方提示框（书名 + 阅读进度两行）；
         .title 的 overflow:hidden 只影响自身，浮层由 CardTip 渲染到 body -->
    <div class="card-foot">
      <div class="card-title-row" @pointerenter="openTitleTip" @pointerleave="closeTip">
        <div class="title">{{ book.title }}</div>
      </div>
    </div>
    <div class="card-actions">
      <!-- 三个操作按钮统一为 SF Symbols 风格描边图标 + 毛玻璃圆钮 -->
      <button
        class="action-btn move-btn"
        :aria-label="MOVE_LABEL"
        @click.stop="$emit('move', book.id)"
        @pointerenter="openActionTip($event, MOVE_LABEL, 'center')"
        @pointerleave="closeTip"
        @focus="openActionTip($event, MOVE_LABEL, 'center')"
        @blur="closeTip"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            d="M3.5 8A2.5 2.5 0 0 1 6 5.5h3.1c.6 0 1.2.2 1.6.7l1.1 1.1H18A2.5 2.5 0 0 1 20.5 9.8v7.7A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5V8z"
          />
        </svg>
      </button>
      <button
        class="action-btn rename-btn"
        :aria-label="RENAME_LABEL"
        @click.stop="$emit('rename', book.id)"
        @pointerenter="openActionTip($event, RENAME_LABEL, 'center')"
        @pointerleave="closeTip"
        @focus="openActionTip($event, RENAME_LABEL, 'center')"
        @blur="closeTip"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 20l.9-3.9L15.8 5.2a1.9 1.9 0 0 1 2.7 0l.3.3a1.9 1.9 0 0 1 0 2.7L7.9 19.1 4 20z" />
          <path d="M14.6 6.4l3 3" />
        </svg>
      </button>
      <button
        class="action-btn remove-btn"
        :aria-label="removeText"
        @click.stop="$emit('remove', book.id)"
        @pointerenter="openActionTip($event, removeText, 'right')"
        @pointerleave="closeTip"
        @focus="openActionTip($event, removeText, 'right')"
        @blur="closeTip"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M6.8 6.8l10.4 10.4M17.2 6.8 6.8 17.2" />
        </svg>
      </button>
    </div>
    <!-- 唯一的提示框实例：5 个触发源共用，同一时刻最多一个 -->
    <CardTip
      :visible="tipAnchor !== null"
      :anchor="tipAnchor"
      :text="tipText"
      :meta="tipMeta"
      :placement="tipPlacement"
      :align="tipAlign"
      :max-width="tipMaxWidth"
      @dismiss="closeTip"
    />
  </div>
</template>
<script setup lang="ts">
// 文库书卡片：封面 / 进度环 / 缺失徽章 / 三个操作按钮；卡壳与 3D 倾斜由全局 .tilt-card 承载
// 对应设计文档 specs/图书卡片交互与图标苹果风美化设计方案-20261021.md §5.2
// 悬停提示框（按钮 / 书名）见 specs/图书卡片提示框苹果风美化设计方案-20261021.md §5.5
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Book } from '../../../shared/types'
import { t } from '../../i18n'
import { attachCardTilt, type CardTiltHandle } from '../../services/cardTilt'
import { progressPercentOf } from '../../services/bookProgress'
import type { TipAlign, TipPlacement } from '../../services/cardTip'
import CardTip from '../ui/CardTip.vue'

const props = defineProps<{ book: Book; /** 合集视图内 × 的语义变为移出合集 */ removeLabel?: string }>()
defineEmits<{ open: [bookId: number]; remove: [bookId: number]; rename: [bookId: number]; move: [bookId: number] }>()

/** 操作按钮文案：aria-label（读屏）与提示框文本共用，避免两处漂移；均在模板渲染时读取语言 */
const MOVE_LABEL = computed(() => t('library.book.move'))
const RENAME_LABEL = computed(() => t('library.book.rename'))
/** × 按钮语义：合集视图传入「移出合集」，主页缺省为「从文库移除」 */
const removeText = computed(() => props.removeLabel ?? t('library.book.remove'))

/** 进度口径与侧栏内页共用 bookProgress.progressPercentOf，避免两处漂移 */
const progressPercent = computed(() => progressPercentOf(props.book))

// [新增] 封面图作为整卡光感层背景
const bleedStyle = computed(() => {
  const style: Record<string, string> = {}
  if (props.book.coverUrl) style.backgroundImage = `url("${props.book.coverUrl}")`
  return style
})

/** 进度圆环周长（r=15.5） */
const RING_CIRC = 2 * Math.PI * 15.5

// —— 悬停提示框：浮层 Teleport 到 body，避开卡片 3D 倾斜造成的文字重采样 ——
const tipAnchor = ref<HTMLElement | null>(null)
const tipText = ref('')
const tipMeta = ref('')
const tipPlacement = ref<TipPlacement>('below')
const tipAlign = ref<TipAlign>('center')
const tipMaxWidth = ref<number | undefined>()

/** 写入提示状态；同一时刻只允许一个浮层，直接整体覆盖 */
function openTip(
  anchor: HTMLElement,
  options: { text: string; meta?: string; placement: TipPlacement; align: TipAlign; maxWidth?: number }
) {
  tipAnchor.value = anchor
  tipText.value = options.text
  tipMeta.value = options.meta ?? ''
  tipPlacement.value = options.placement
  tipAlign.value = options.align
  tipMaxWidth.value = options.maxWidth
}

function closeTip() {
  tipAnchor.value = null
}

/** 操作按钮提示：向下展开；触屏无 hover 语义，鼠标点击不产生 focus-visible，两处都要过滤 */
function openActionTip(event: PointerEvent | FocusEvent, text: string, align: TipAlign) {
  if (event instanceof PointerEvent && event.pointerType === 'touch') return
  const el = event.currentTarget as HTMLElement
  if (event.type === 'focus' && !el.matches(':focus-visible')) return
  openTip(el, { text, placement: 'below', align })
}

/** 书名提示：向上展开，宽度锁定为书名行宽；有进度时补第二行 */
function openTitleTip(event: PointerEvent) {
  if (event.pointerType === 'touch') return
  const el = event.currentTarget as HTMLElement
  openTip(el, {
    text: props.book.title,
    meta: progressPercent.value !== null ? t('library.book.progress', { percent: progressPercent.value }) : '',
    placement: 'above',
    align: 'center',
    maxWidth: el.offsetWidth,
  })
}

// —— 3D 倾斜跟随：指针位置写 CSS 变量，减弱动效 / 触屏下 attach 返回空句柄 ——
const cardEl = ref<HTMLElement | null>(null)
let tilt: CardTiltHandle | null = null

onMounted(() => {
  if (cardEl.value) tilt = attachCardTilt(cardEl.value)
})

onBeforeUnmount(() => {
  tilt?.detach()
  tilt = null
})
</script>

<style scoped>
/* 卡壳（背景 / 边框 / 圆角 / 阴影 / 倾斜）由全局 .tilt-card 提供，此处只留内容布局 */
.book-card {
  /* 整张卡是一块玻璃：封面色层 + 白色玻璃纱都铺满整卡（含 4px 边框与底部底座），
     边框与底座因此是同一材质的上下两段，颜色从上到下连续；底座不再单独上色。
     注意：不能写 overflow: hidden——会触发 Chromium 网格行高 bug（首页书卡堆叠） */
  position: relative;
  isolation: isolate;
  padding: 4px;
  background: transparent;
  border-color: rgba(255, 255, 255, 0.55);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.5),
    0 1px 2px rgba(28, 28, 26, 0.06);
}

/* 玻璃层裁剪容器：绝对定位、不参与网格尺寸计算，只负责按卡片圆角裁剪 */
.card-bleed-clip {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  border-radius: var(--card-radius);
  pointer-events: none;
}

/* 封面色层：放大模糊铺满整卡，为整块玻璃提供颜色 */
.card-bleed {
  position: absolute;
  inset: -8%;
  background-position: center;
  background-size: cover;
  filter: blur(34px) saturate(175%);
  opacity: 0.55;
  transform: scale(1.12);
}

/* 玻璃纱：盖在色层上、内容下；边框与底座共用同一层 → 颜色完全一致 */
.card-bleed-clip::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.62);
}

:global(:root[data-theme='dark']) .book-card {
  border-color: rgba(255, 255, 255, 0.14);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 1px 2px rgba(0, 0, 0, 0.4);
}

:global(:root[data-theme='dark']) .card-bleed {
  opacity: 0.45;
}

:global(:root[data-theme='dark']) .card-bleed-clip::after {
  background: rgba(28, 28, 30, 0.62);
}

.cover {
  position: relative;
  aspect-ratio: 3 / 4;
  background: var(--placeholder);
  /* 只圆上面两角：下缘与玻璃底座齐平相接，避免圆角处露出卡片底色形成一道断带 */
  border-radius: var(--card-cover-radius) var(--card-cover-radius) 0 0;
  overflow: hidden;
  /* 封面细描边；底边不描线、不投影——任何下缘阴影都会在接缝处压出一条暗线 */
  border: 1px solid var(--border);
  border-bottom: none;
  box-shadow: none;
}

.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 11px;
}

.cover-placeholder svg {
  color: var(--text-faint);
}

.badge-missing {
  position: absolute;
  top: 6px;
  left: 6px;
}

/* 警告图标取 iOS 深色系统黄，红色语义不再占用整块底色 */
.badge-missing svg {
  color: #ffd60a;
}

/* 书名底座：本身完全透明——它只是同一块玻璃的下半段（玻璃层由卡壳的 .card-bleed-clip 提供），
   所以边框与底座颜色天然一致，不会出现"另一块颜色" */
.card-foot {
  position: relative;
  isolation: isolate;
  /* 吃掉卡片内边距；上移 1px 与封面重叠，消除亚像素缝隙 */
  margin: -1px -4px -4px;
  /* 底部收窄：原 11px 四周内边距让书名条显得过厚，压到 7/10/8 */
  padding: 7px 10px 8px;
  overflow: hidden;
  border-radius: 0 0 var(--card-radius) var(--card-radius);
  background: transparent;
}

.title {
  position: relative;
  z-index: 1;
  /* 书名排版：字号收一档、行高收紧，底部不再抢封面的视觉重量 */
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.35;
  letter-spacing: 0.1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* —— 阅读进度圆环（封面右上角悬浮）—— */
.progress-ring {
  position: absolute;
  top: 6px;
  right: 6px;
  box-sizing: border-box;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  /* 毛玻璃圆底：深色封面上也能看清环与数字 */
  background: rgba(0, 0, 0, 0.35);
  -webkit-backdrop-filter: blur(10px) saturate(180%);
  backdrop-filter: blur(10px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.24);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.18s ease;
}

.progress-ring svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* 从 12 点方向顺时针起始 */
  transform: rotate(-90deg);
}

.ring-bg {
  fill: none;
  stroke: rgba(255, 255, 255, 0.24);
  stroke-width: 3;
}

.ring-fill {
  fill: none;
  stroke: var(--brand);
  stroke-width: 3;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.3s ease;
}

.ring-text {
  position: relative;
  color: #fff;
  font-size: 10.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}

.ring-text i {
  font-style: normal;
  font-size: 8px;
}

/* hover 时圆环让位给右上角的操作按钮 */
.book-card:hover .progress-ring {
  opacity: 0;
}

/* —— 操作按钮组：封面右上角内缩 6px（与进度环边距接近），毛玻璃圆钮逐个错峰淡入 —— */
.card-actions {
  position: absolute;
  /* 11 = 卡片 border 1 + padding 4 + 内缩 6px，避免圆钮压在封面圆角边缘上 */
  top: 11px;
  right: 11px;
  display: flex;
  gap: 6px;
}

.action-btn {
  /* 覆盖全局 button 的尺寸 / 边框 / 底色，视觉尺寸 26px 含 1px 描边 */
  box-sizing: border-box;
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background-color: rgba(0, 0, 0, 0.38);
  -webkit-backdrop-filter: blur(12px) saturate(180%);
  backdrop-filter: blur(12px) saturate(180%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  /* 隐藏态：略上移待淡入；pointer-events 关掉，避免截获封面点击 */
  opacity: 0;
  transform: translateY(-4px);
  pointer-events: none;
  transition: opacity 0.18s ease, transform 0.18s cubic-bezier(0.22, 0.8, 0.24, 1),
    background-color 0.15s ease, border-color 0.15s ease;
}

/* 第 2、3 个按钮依次延后 20ms，形成轻微错峰 */
.card-actions .action-btn:nth-child(2) {
  transition-delay: 20ms;
}

.card-actions .action-btn:nth-child(3) {
  transition-delay: 40ms;
}

/* hover 或键盘聚焦到按钮时显示（display 常驻才能保留焦点可达性） */
.book-card:hover .action-btn,
.book-card:focus-within .action-btn {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}

/* 悬停规则必须带 :not(:disabled)，否则会被全局 button:hover 的 --surface-2 底刷掉 */
.action-btn:hover:not(:disabled) {
  background-color: rgba(0, 0, 0, 0.62);
  border-color: rgba(255, 255, 255, 0.42);
}

/* 移除 / 移出合集属破坏性操作：悬停转危险色 */
.action-btn.remove-btn:hover:not(:disabled) {
  background-color: var(--danger);
  border-color: transparent;
}

.action-btn:active:not(:disabled) {
  transform: scale(0.94);
}
</style>
