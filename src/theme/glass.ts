// Liquid Glass 玻璃参数单一来源（P0 新建基础能力，无视觉变化）
// 依据：03-liquid-glass-visual-redesign-plan-v2.md §3.5 / §3.6 / §9 P0 / §11 验收；
//       04-engine-swap-architecture-revision.md §2.3 / §2.4 / §2.7 / §6.2 A1–A6 / §8.2 五项必改；
//       02-apple-liquid-glass-spec.md M7 / M9 / M18 / M23 / M24 / D1 / D9 / D18 / §4 可量化参数表。
//
// 本文件是「所有玻璃数值」的唯一出口：页面 / 组件不得内联玻璃底色、blur 半径、tint 或圆角。
// v2.1 已删除的八项旧参数（transparency / refractDp / refractMode / dispersion /
// edgeWidthDp / edgeGlow / legacyBackdrop / scrim）除文档登记处外不得再出现（03 §13.3）。
// 旧引擎收尾（独立分支决策）：resolveGlass / GlassSurface / glassSettings 死骨架已删除，
// 活能力（四倍率 store / 降级 / H1 tint / childRadius / 预算）保留，待 UI 重写接 GlassKitView。

import { useMemo } from 'react';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/* ------------------------------------------------------------------ *
 * 一、类型与常量
 * ------------------------------------------------------------------ */

/** §3.6 七种 kind 分派表（唯一合法取值） */
export type GlassKind = 'compact' | 'regular' | 'large' | 'tabs' | 'detail' | 'media' | 'indicator';

export const GLASS_KINDS: readonly GlassKind[] = [
  'compact', 'regular', 'large', 'tabs', 'detail', 'media', 'indicator',
] as const;

/** 玻璃变体：clear 仅用于视频 / 图片亮底（02 M7） */
export type GlassVariant = 'regular' | 'clear';

/** 视图树分层：内容层零玻璃（02 D1 / 04 §6.2 A1、A3） */
export type GlassLayer = 'content' | 'control';

/** H3 六类降级原因（单一路径，禁止分散判断） */
export type DegradeReason =
  | 'api<31'
  | 'lensUnavailable(api<33)'
  | 'reduceTransparency'
  | 'reduceMotion'
  | 'lowEnd'
  | 'budget';

export const DEGRADE_REASONS: readonly DegradeReason[] = [
  'api<31',
  'lensUnavailable(api<33)',
  'reduceTransparency',
  'reduceMotion',
  'lowEnd',
  'budget',
] as const;

export type GlassScaleKey = 'blurScale' | 'tintScale' | 'lensScale' | 'glowScale';

export interface ScaleRange {
  readonly min: number;
  readonly max: number;
  readonly default: number;
}

/**
 * ② 四倍率区间（04 §2.4 GlassSettings.kt；it.13 起三个对齐项改照抄用户真实 app
 * HealthCheckIn 反编译规格）。
 *
 * it.13 滑块数值完全对齐（SettingsScreenKt.java:1905-2094 / GlassTuning.java:21-30）：
 * - blurScale「模糊」     0.2–3.0，默认 0.2  （:1906 rangeTo(0.2,3.0) / :21 0.2f）
 * - lensScale「折射」     0–3，   默认 3.0  （:1923 rangeTo(0,3)   / :24 3.0f）
 * - tintScale「膜层」     0–2，   默认 2.0  （:1947 rangeTo(0,2)   / :27 2.0f）
 * ⚠️ 「膜层」标签的字段是 tintScale，不是原生 membraneAlpha（后者默认归 0）。
 * ⚠️ H1 tint≤0.12 契约不动：Q1 修正口径，tintAlpha 基准 0.06（不再按 0.5
 *   比例因子折算 0.05），tintScale 0–2 / 默认 2.0 ⇒ 0.06×2.0=0.12 正好用满
 *   H1 上界；native coerceIn(0,0.12)、0.12 常量、floor 一字不动，app 侧
 *   resolveTintAlpha 仍以 TINT_ALPHA_MAX 兜底。滑块区间本身完全对齐。
 *   颜色继续用 panelTintFor(scheme) 亮 #FFFFFF / 暗 #1B242B。
 * - glowScale 属「Kotlin 无对应的扩展调试项」，区间 / 默认保持 it.5 值不变
 *   （04 §2.7 X4 下限 >0，避免柔光三团 alpha 全灭触发铁律③ 反例）。
 * 滑块连续无 steps，数值统一显示两位小数（GlassTestScreen SliderRow toFixed(2)）。
 */
export const SCALE_RANGES: Record<GlassScaleKey, ScaleRange> = {
  blurScale: { min: 0.2, max: 3.0, default: 0.2 },
  tintScale: { min: 0, max: 2, default: 2.0 },
  lensScale: { min: 0, max: 3, default: 3.0 },
  // it.16：glowScale 默认 1.75 → 2.0（用户 2026-11-08 指定配置；区间 0.05–2 不变）
  glowScale: { min: 0.05, max: 2, default: 2.0 },
} as const;

/** glowScale 有效下限（X4） */
export const GLOW_SCALE_MIN: number = SCALE_RANGES.glowScale.min;

export interface GlassScales {
  blurScale: number;
  tintScale: number;
  lensScale: number;
  glowScale: number;
}

export const DEFAULT_SCALES: GlassScales = {
  blurScale: SCALE_RANGES.blurScale.default,
  tintScale: SCALE_RANGES.tintScale.default,
  lensScale: SCALE_RANGES.lensScale.default,
  glowScale: SCALE_RANGES.glowScale.default,
};

/** 倍率钳制：任何写入都必须过区间（NaN / 非有限值退回默认 1） */
export function clampScale(key: GlassScaleKey, value: number): number {
  const range = SCALE_RANGES[key];
  const safe = Number.isFinite(value) ? value : range.default;
  return Math.min(range.max, Math.max(range.min, safe));
}

/** ④ 4 档 blurDp（04 §2.3 / 03 §3.5）：media / indicator 不做 backdrop blur */
export const BLUR_DP_BY_KIND: Record<GlassKind, number> = {
  compact: 8,
  regular: 14,
  large: 14,
  tabs: 10,
  detail: 12,
  media: 0,
  indicator: 0,
} as const;

/** H1 上界：任何 tint 计算最后一步必须过此值（03 §3.5 H1 / 04 §2.7 X2） */
export const TINT_ALPHA_MAX = 0.12;
/**
 * ④ tintAlpha 基准（铁律①）。it.13 Q1 修正口径：0.10 → **0.06**，
 * 使 tintScale 默认 2.0 时 0.06×2.0=0.12 正好用满 H1（未经 coerceIn 截断），
 * 且 0–2 全区间线性有效（旧 0.10 在 tintScale≥1.2 即触顶、滑块后半段失效）。
 * 与测试页透传给 native 的 tintAlpha={0.06} 同源，全项目单一基准。
 */
export const TINT_ALPHA_BASE = 0.06;

/** ④ 单层 1dp / #FFF @0.14 边缘高光（04 §2.3 GlassKit L88-90；无三层渐变 / 无 12dp 白雾） */
export interface EdgeHighlight {
  readonly widthDp: number;
  readonly color: string;
  readonly alpha: number;
  readonly layers: 1;
}

export const EDGE_HIGHLIGHT: EdgeHighlight = {
  widthDp: 1,
  color: '#FFFFFF',
  alpha: 0.14,
  layers: 1,
} as const;

/** ④ glassDimming：#000 @0.35，仅 clear + 亮底（02 M7 官方硬值；保留、不删除） */
export interface GlassDimming {
  readonly color: string;
  readonly opacity: number;
  readonly variant: GlassVariant;
  readonly condition: 'brightBackground';
}

export const GLASS_DIMMING: GlassDimming = {
  color: '#000000',
  opacity: 0.35,
  variant: 'clear',
  condition: 'brightBackground',
} as const;

/**
 * ④ contentScrim 归一单一来源（0.88 / 0.92 / 0.34 收敛为单一来源，保留语义、不删除）。
 * 依据 02 M7 / M9 与 App 背景遮罩；P0 只登记旧内联值，不改 App.tsx / navigation
 * （03 §3.5 禁止内联清单的具体数值属 P1–P3 落地范围）。
 */
export const CONTENT_SCRIM = {
  /** 归一基准不透明度（取代根容器 0.88 / 0.92 两档） */
  opacity: 0.88,
  /** 导航背景压暗（取代 0.34，与归一基准分档管理） */
  navOpacity: 0.34,
  lightColor: '#F5F5F7',
  darkColor: '#0B0B0F',
  /** 旧内联值登记（只登记，P0 不改页面） */
  legacyInlineValues: {
    appRootDark: 0.88,
    appRootLight: 0.92,
    navBgScrim: 0.34,
    mediaPanel: 0.92,
    tabBarDarkPlain: 0.96,
    tabBarLightPlain: 0.94,
    tabBarDarkImage: 0.76,
    tabBarLightImage: 0.72,
  },
} as const;

/**
 * ui.ts 的 tabBar 块并入本文件（P0 第 4 项「tabBar 并入 glass.ts」）。
 * 登记值为现状（P0 不改视觉）；目标值来自 03 §3.2 / 04 §2.3 引擎尺寸档，P1 起切换。
 */
export const TAB_BAR_STYLE = {
  horizontalInset: 42,
  bottom: 14,
  height: 74,
  radius: 32,
  itemHeight: 56,
} as const;

/** §3.2 引擎尺寸档：64dp bar / 32dp Capsule / 5dp padding / 54dp 指示器 / 27dp 同心 */
export const TAB_BAR_TARGET = {
  height: 64,
  radius: 32,
  padding: 5,
  indicatorHeight: 54,
  indicatorRadius: 27,
} as const;

export interface ScrimSpec {
  readonly color: string;
  readonly opacity: number;
}

/** 归一后的 contentScrim 取值（供 P1 起替换内联 rgba，本轮不调用） */
export function resolveContentScrim(
  theme: 'light' | 'dark' = 'light',
  target: 'root' | 'nav' = 'root',
): ScrimSpec {
  return {
    color: theme === 'dark' ? CONTENT_SCRIM.darkColor : CONTENT_SCRIM.lightColor,
    opacity: target === 'nav' ? CONTENT_SCRIM.navOpacity : CONTENT_SCRIM.opacity,
  };
}

/** ④ lens 仅允许 indicator（铁律②）：lens(8, 10, 色散) × lensScale */
export interface GlassLens {
  readonly refractionHeightDp: number;
  readonly refractionAmountDp: number;
  readonly chromaticAberration: boolean;
}

export const LENS_BASE: GlassLens = {
  refractionHeightDp: 8,
  refractionAmountDp: 10,
  chromaticAberration: true,
} as const;

/* ------------------------------------------------------------------ *
 * 二、全局状态：zustand + AsyncStorage（①，不是 React Context / Provider）
 * ------------------------------------------------------------------ */

export const GLASS_STORAGE_KEY = 'yaya_glass_settings_v1';

export interface GlassState extends GlassScales {
  /** 运行时降级原因（不持久化，保证 clearDegrade 可回退） */
  activeReasons: DegradeReason[];
  setScale: (key: GlassScaleKey, value: number) => void;
  setScales: (patch: Partial<GlassScales>) => void;
  reset: () => void;
}

/**
 * 可变全局单例（对应 04 §2.4 GlassSettings 的 object 单例 + mutableFloatStateOf）。
 * 组件用 selector 订阅单个倍率，改值不会重建整棵视图树；无 Provider 包裹。
 */
export const useGlassStore = create<GlassState>()(
  persist(
    (set) => ({
      ...DEFAULT_SCALES,
      activeReasons: [],
      setScale: (key, value) => {
        const next = clampScale(key, value);
        switch (key) {
          case 'blurScale':
            set({ blurScale: next });
            return;
          case 'tintScale':
            set({ tintScale: next });
            return;
          case 'lensScale':
            set({ lensScale: next });
            return;
          case 'glowScale':
            set({ glowScale: next });
            return;
        }
      },
      setScales: (patch) =>
        set((state) => ({
          blurScale: patch.blurScale === undefined ? state.blurScale : clampScale('blurScale', patch.blurScale),
          tintScale: patch.tintScale === undefined ? state.tintScale : clampScale('tintScale', patch.tintScale),
          lensScale: patch.lensScale === undefined ? state.lensScale : clampScale('lensScale', patch.lensScale),
          glowScale: patch.glowScale === undefined ? state.glowScale : clampScale('glowScale', patch.glowScale),
        })),
      /** 四倍率回到默认值（it.13：blur 0.20 / tint 2.00 / lens 3.00 / glow 1.75） */
      reset: () => set({ ...DEFAULT_SCALES, activeReasons: [] }),
    }),
    {
      name: GLASS_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      /** 只持久化四倍率；降级原因属运行时状态，不落盘 */
      partialize: (state) => ({
        blurScale: state.blurScale,
        tintScale: state.tintScale,
        lensScale: state.lensScale,
        glowScale: state.glowScale,
      }),
      /**
       * it.13：v1（it.5 基线 blur 0.10 / tint 1.00 / lens 2.00）→ v2。
       * 三个对齐项区间 / 默认值已变为 HealthCheckIn 规格，旧持久化的 tint=1、
       * lens=2 仍落在新区间内（clampScale 不会纠正），必须 bump 版本让 migrate
       * 一次性覆盖为新 default；blur=0.10 也会被新 min 0.2 钳制，同样需要覆盖。
       * 此后照常随滑块持久化（用户调过的值不再被 migrate 重置）。
       *
       * it.16：v2 → v3。glowScale 默认 1.75 → 2.0（用户 2026-11-08 指定配置）；
       * 旧持久化的 glowScale=1.75 仍落在 0.05–2 区间内，clampScale 不会纠正，
       * 必须 bump 版本让 migrate 一次性覆盖为新 default。migrate 语义不变。
       */
      version: 3,
      migrate: () => ({ ...DEFAULT_SCALES }),
    },
  ),
);

/**
 * ① 三段式 init / persist / reset（对齐 src/store/danmakuSettings.ts 的 zustand 写法，
 * 语义对应 04 §2.4 GlassSettings.kt:26-47）——已随旧引擎一并删除（独立分支决策）：
 * glassSettings 全 src 零调用；持久化由 useGlassStore 的 zustand persist 中间件自动承担。
 */

/* ------------------------------------------------------------------ *
 * 三、三项硬约束 H1 / H2 / H3
 * ------------------------------------------------------------------ */

/**
 * H1：任何 tint 计算的最后一步必须过上界 TINT_ALPHA_MAX = 0.12（等价于 Math.min(tintAlpha, 0.12)）。
 * 修 04 §2.7 X2（历史 tintScale 上限 3、基准 0.10 时 0.10×3=0.30 未夹上界）
 * 与 X1（选中 Chip 0.34）；it.13 基准 0.06 × 上限 2.0 = 0.12 正好触上界，
 * 仍由本函数 Math.min(..., TINT_ALPHA_MAX) 统一兜底。
 * 本函数是全项目唯一的 tint alpha 出口，禁止在别处再算一遍 tint。
 *
 * S1：baseAlpha 先做 Number.isFinite 兜底，非有限值（NaN / Infinity / -Infinity）回退
 *     TINT_ALPHA_BASE，负值夹到 0；否则 `Math.min(NaN, 上界)` 会把 NaN 透传给下游样式。
 * S2：上界统一引用导出的 TINT_ALPHA_MAX，不再写死 0.12，避免改常量时漏改钳制。
 */
export function resolveTintAlpha(baseAlpha: number = TINT_ALPHA_BASE, tintScale?: number): number {
  const scale = tintScale === undefined ? useGlassStore.getState().tintScale : tintScale;
  const safeBase = Number.isFinite(baseAlpha) ? Math.max(0, baseAlpha) : TINT_ALPHA_BASE;
  const tintAlpha = safeBase * clampScale('tintScale', scale);
  return Math.min(tintAlpha, TINT_ALPHA_MAX);
}

/**
 * H2：Android API 双档（04 §7.2 / B8）——blur + vibrancy ≥31、lens / 色散 / gamma ≥33。
 * 非 Android 视作支持；严禁 v1 的「按 API 31 单档一刀切」。
 */
export function androidApiLevel(): number {
  return Platform.OS === 'android' ? Number(Platform.Version) : Number.POSITIVE_INFINITY;
}

export function canBlur(): boolean {
  if (Platform.OS !== 'android') return true;
  return androidApiLevel() >= 31;
}

export function canLens(): boolean {
  if (Platform.OS !== 'android') return true;
  return androidApiLevel() >= 33;
}

export interface GlassPolicyMask {
  readonly disableBlur?: boolean;
  readonly disableLens?: boolean;
  readonly forceOpaque?: boolean;
  readonly disableMotion?: boolean;
  readonly note: string;
}

/** H3 六类降级的统一策略表（单一路径，不写六个 if 分支散落各处） */
export const DEGRADE_POLICY: Record<DegradeReason, GlassPolicyMask> = {
  'api<31': {
    disableBlur: true,
    disableLens: true,
    forceOpaque: true,
    note: 'API 26–30 无任何玻璃效果，降级为高不透明实色（04 §7.2 / B8）',
  },
  'lensUnavailable(api<33)': {
    disableLens: true,
    note: 'API 31–32 有 blur 但无折射，指示器降级为不透明选中胶囊 + 边缘高光（04 §7.2）',
  },
  reduceTransparency: {
    disableBlur: true,
    disableLens: true,
    forceOpaque: true,
    note: '02 §5.1：关 blur / lensing / 折射高光 → 实色 opacity ≥ 0.9；由 degrade 统一收口四倍率，不能只把单个倍率调 0（04 §2.4 契约缺口②）',
  },
  reduceMotion: {
    disableLens: true,
    disableMotion: true,
    note: '02 §5.1：关 morph / lift / z 轴 / 高光流动，位移改静态或短 fade；blur 保留',
  },
  lowEnd: {
    disableBlur: true,
    disableLens: true,
    forceOpaque: true,
    note: '02 §5.2 第 6 条：低端机 / 低电量一键关闭 blur 与 lensing，保留圆角与层级',
  },
  budget: {
    disableBlur: true,
    forceOpaque: true,
    note: '02 M24 / D9：超出同屏玻璃容器上限时，多余容器降级为实色',
  },
} as const;

export interface GlassDegradeResult {
  reason: DegradeReason;
  activeReasons: DegradeReason[];
  degraded: boolean;
  policy: GlassPolicyMask;
}

/** H3 单一入口：六类降级只经此函数写入 activeReasons，可叠加、可回退 */
export function degrade(reason: DegradeReason): GlassDegradeResult {
  if (!DEGRADE_REASONS.includes(reason)) {
    throw new Error(`[glass] 未知降级原因：${String(reason)}`);
  }
  const current = useGlassStore.getState().activeReasons;
  const activeReasons = current.includes(reason) ? current : [...current, reason];
  if (activeReasons !== current) {
    useGlassStore.setState({ activeReasons });
  }
  return {
    reason,
    activeReasons,
    degraded: activeReasons.length > 0,
    policy: DEGRADE_POLICY[reason],
  };
}

/** 回退：传 reason 只清一类，不传则清空全部（§11「均可触发且可回退」） */
export function clearDegrade(reason?: DegradeReason): DegradeReason[] {
  const current = useGlassStore.getState().activeReasons;
  const next = reason === undefined ? [] : current.filter((item) => item !== reason);
  if (next.length !== current.length) {
    useGlassStore.setState({ activeReasons: next });
  }
  return next;
}

export function getActiveDegradeReasons(): DegradeReason[] {
  return useGlassStore.getState().activeReasons;
}

export function isGlassDegraded(): boolean {
  return useGlassStore.getState().activeReasons.length > 0;
}

/** 前置 API 双档降级（由 init() 调用；clearDegrade 保证设备/系统变化时可回退） */
export function ensurePlatformDegradation(): void {
  if (canBlur()) clearDegrade('api<31');
  else degrade('api<31');
  if (canLens()) clearDegrade('lensUnavailable(api<33)');
  else degrade('lensUnavailable(api<33)');
}

/* ------------------------------------------------------------------ *
 * 四、resolveGlass(kind) 七种分派（⑤ §3.6）——已随旧引擎一并删除（独立分支决策）：
 * resolveGlass / GlassSurface / snapshot 全链路在 P0 全 src 零接线（死骨架），
 * UI 重写后由 GlassKitView 原生引擎承接玻璃数值解析。
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 五、childRadius / 玻璃容器预算（⑤ 保留）
 * ------------------------------------------------------------------ */

/**
 * 同心几何 child = parent − padding（02 §4.2 / D1 / S17；⑤ 保留且升格）。
 * 结果下限 0，避免负圆角；radii.ts 直接复用本实现，不另写一份。
 */
export function childRadius(parentRadius: number, padding: number): number {
  const parent = Number.isFinite(parentRadius) ? parentRadius : 0;
  const inset = Number.isFinite(padding) ? padding : 0;
  return Math.max(0, parent - inset);
}

/**
 * useGlassBudget() 计数口径（保留）：只计真玻璃容器，弹幕 / Toast 不计入，直播页 ≤3。
 * 依据：02 §4.4 M24 / D9 建议值 + 待真机实测。
 * ⚠️ 04 §3.2 #18：新引擎「1–3 块 / 5 张掉帧」性能预算数值依据已删除，本处不再引用。
 */
export const GLASS_BUDGET = {
  maxContainers: 3,
  maxElements: 6,
  maxLiveContainers: 3,
  /** 弹幕 / Toast 不计入（04 §6.2 A4） */
  excluded: ['DanmakuOverlay', 'AppToast'],
  /** 直播页真玻璃容器白名单（A4） */
  liveWhitelist: ['AppTabBar', 'PlayerChromeDock', 'MiniPlayer'],
} as const;

export interface GlassBudgetEntry {
  id: string;
  kind: GlassKind;
}

interface GlassBudgetState {
  containers: GlassBudgetEntry[];
  register: (id: string, kind: GlassKind) => void;
  unregister: (id: string) => void;
  reset: () => void;
}

const useGlassBudgetStore = create<GlassBudgetState>((set) => ({
  containers: [],
  register: (id, kind) =>
    set((state) => {
      if (GLASS_BUDGET.excluded.some((excluded) => id.includes(excluded))) return state;
      if (state.containers.some((entry) => entry.id === id)) return state;
      return { containers: [...state.containers, { id, kind }] };
    }),
  unregister: (id) =>
    set((state) => ({ containers: state.containers.filter((entry) => entry.id !== id) })),
  reset: () => set({ containers: [] }),
}));

export function registerGlassContainer(id: string, kind: GlassKind): void {
  useGlassBudgetStore.getState().register(id, kind);
}

export function unregisterGlassContainer(id: string): void {
  useGlassBudgetStore.getState().unregister(id);
}

export interface GlassBudgetView {
  count: number;
  maxContainers: number;
  maxElements: number;
  maxLiveContainers: number;
  withinBudget: boolean;
  overBudget: boolean;
  liveWithinBudget: boolean;
}

/** 只计真玻璃容器；超限时由调用方走 degrade('budget') 单一路径 */
export function useGlassBudget(): GlassBudgetView {
  const containers = useGlassBudgetStore((state) => state.containers);
  return useMemo(() => {
    const count = containers.length;
    return {
      count,
      maxContainers: GLASS_BUDGET.maxContainers,
      maxElements: GLASS_BUDGET.maxElements,
      maxLiveContainers: GLASS_BUDGET.maxLiveContainers,
      withinBudget: count <= GLASS_BUDGET.maxContainers,
      overBudget: count > GLASS_BUDGET.maxContainers,
      liveWithinBudget: count <= GLASS_BUDGET.maxLiveContainers,
    };
  }, [containers]);
}

/* ------------------------------------------------------------------ *
 * 六、GlassSurface 骨架 / 契约——已随旧引擎一并删除（独立分支决策）：
 * P0 骨架从未接入任何页面，UI 重写后由 GlassKitView 原生引擎承接单一容器。
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 七、模块加载即前置 API 双档降级（G1 · QA Round 1 收口）
 * ------------------------------------------------------------------ */

/**
 * G1：`glassSettings.init()` / `ensurePlatformDegradation()` / `useA11ySync()` 在 P0 全 src
 * 无调用方（App.tsx 冻结不改），导致 API 26–32 时 `isGlassDegraded()` 为 false、
 * `getActiveDegradeReasons()` 为空，运行时状态与 H2 / H3 契约不一致。
 *
 * 这里在模块加载时调用一次，让 canBlur(≥31) / canLens(≥33) 的双档判定立即落到
 * activeReasons；开发者无需显式 init 也能拿到正确的降级状态。
 * - partialize 已排除 activeReasons → 不会把运行时状态落盘成脏数据；
 * - clearDegrade 保证设备 / 系统能力变化时可回退；
 * - 非 Android 视作全支持，模块加载只做两次空 clearDegrade，无副作用。
 *
 * ⚠️ 必须放在文件末尾：degrade() 读取的 `DEGRADE_POLICY` 是后方定义的 const，
 *    提前调用会命中暂时性死区（TDZ）抛 ReferenceError。
 */
ensurePlatformDegradation();
