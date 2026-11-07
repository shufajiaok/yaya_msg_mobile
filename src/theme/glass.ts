// Liquid Glass 玻璃参数单一来源（P0 新建基础能力，无视觉变化）
// 依据：03-liquid-glass-visual-redesign-plan-v2.md §3.5 / §3.6 / §9 P0 / §11 验收；
//       04-engine-swap-architecture-revision.md §2.3 / §2.4 / §2.7 / §6.2 A1–A6 / §8.2 五项必改；
//       02-apple-liquid-glass-spec.md M7 / M9 / M18 / M23 / M24 / D1 / D9 / D18 / §4 可量化参数表。
//
// 本文件是「所有玻璃数值」的唯一出口：页面 / 组件不得内联玻璃底色、blur 半径、tint 或圆角。
// P0 只建契约与骨架：resolveGlass / GlassSurface 不接入任何页面（P1 起接线，本轮零视觉变化）。
// v2.1 已删除的八项旧参数（transparency / refractDp / refractMode / dispersion /
// edgeWidthDp / edgeGlow / legacyBackdrop / scrim）除文档登记处外不得再出现（03 §13.3）。

import { createElement, useMemo, type ReactElement, type ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
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
 * ② 四倍率区间（照抄 04 §2.4 GlassSettings.kt）。
 * glowScale 依据 04 §2.7 X4「滑块下限应设 >0」收口为 0.05：登记的滑块区间仍为 0–2，
 * 但可写下限 >0，避免柔光三团 alpha 全灭、背景变纯色而触发铁律③ 反例。
 */
export const SCALE_RANGES: Record<GlassScaleKey, ScaleRange> = {
  blurScale: { min: 0, max: 2.5, default: 1 },
  tintScale: { min: 0, max: 3, default: 1 },
  lensScale: { min: 0, max: 2, default: 1 },
  glowScale: { min: 0.05, max: 2, default: 1 },
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
/** ④ tintAlpha 基准 0.10（铁律①） */
export const TINT_ALPHA_BASE = 0.10;

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
      /** 四倍率回到 1 */
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
    },
  ),
);

/**
 * ① 三段式 init / persist / reset（对齐 src/store/danmakuSettings.ts 的 zustand 写法，
 * 语义对应 04 §2.4 GlassSettings.kt:26-47）。
 */
export const glassSettings = {
  /** 冷启动读取 AsyncStorage（persist.rehydrate 等价 init(context)），并前置 API 双档降级 */
  async init(): Promise<void> {
    try {
      await useGlassStore.persist.rehydrate();
    } catch {
      // 持久化不可用时退回默认四倍率，绝不阻塞启动
      useGlassStore.setState({ ...DEFAULT_SCALES });
    }
    ensurePlatformDegradation();
  },
  /** 显式落盘：触发 persist 中间件写入，不改变任何 selector 值（不重建视图树） */
  persist(): void {
    useGlassStore.setState({});
  },
  /** 四倍率回到 1 并落盘 */
  reset(): void {
    useGlassStore.getState().reset();
  },
};

export const initGlassSettings = (): Promise<void> => glassSettings.init();
export const persistGlassSettings = (): void => glassSettings.persist();
export const resetGlassSettings = (): void => glassSettings.reset();

/* ------------------------------------------------------------------ *
 * 三、三项硬约束 H1 / H2 / H3
 * ------------------------------------------------------------------ */

/**
 * H1：任何 tint 计算的最后一步必须 Math.min(tintAlpha, 0.12)。
 * 修 04 §2.7 X2（tintScale 上限 3 时 0.10×3=0.30 未夹上界）与 X1（选中 Chip 0.34）。
 * 本函数是全项目唯一的 tint alpha 出口，禁止在别处再算一遍 tint。
 */
export function resolveTintAlpha(baseAlpha: number = TINT_ALPHA_BASE, tintScale?: number): number {
  const scale = tintScale === undefined ? useGlassStore.getState().tintScale : tintScale;
  const tintAlpha = Math.max(0, baseAlpha) * clampScale('tintScale', scale);
  return Math.min(tintAlpha, 0.12);
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
 * 四、resolveGlass(kind) 七种分派（⑤ §3.6）
 * ------------------------------------------------------------------ */

export interface GlassSnapshot extends GlassScales {
  reasons: DegradeReason[];
}

export function snapshotGlass(): GlassSnapshot {
  const state = useGlassStore.getState();
  return {
    blurScale: state.blurScale,
    tintScale: state.tintScale,
    lensScale: state.lensScale,
    glowScale: state.glowScale,
    reasons: state.activeReasons,
  };
}

/** 组件用 selector 逐项订阅，改值不重建视图树（① 读取方式） */
export function useGlassSnapshot(): GlassSnapshot {
  const blurScale = useGlassStore((state) => state.blurScale);
  const tintScale = useGlassStore((state) => state.tintScale);
  const lensScale = useGlassStore((state) => state.lensScale);
  const glowScale = useGlassStore((state) => state.glowScale);
  const reasons = useGlassStore((state) => state.activeReasons);
  return useMemo(
    () => ({ blurScale, tintScale, lensScale, glowScale, reasons }),
    [blurScale, tintScale, lensScale, glowScale, reasons],
  );
}

export interface GlassSpec {
  kind: GlassKind;
  variant: GlassVariant;
  layer: GlassLayer;
  /** 已乘 blurScale 且过降级的最终模糊半径（dp）；0 = 不模糊 */
  blurDp: number;
  /** 已过 H1 上界 */
  tintAlpha: number;
  /** tabs 由 onDrawSurface 承载 tint，而非 1dp 描边（§3.6） */
  tintOnSurface: boolean;
  edgeHighlight: EdgeHighlight | null;
  dimming: GlassDimming | null;
  lens: GlassLens | null;
  /** 1 = 正常；≥ 0.9 = 降级为高不透明实色 */
  opacity: number;
  degraded: boolean;
  reasons: DegradeReason[];
  note: string;
}

interface GlassKindDefinition {
  readonly variant: GlassVariant;
  readonly tintOnSurface: boolean;
  readonly edgeHighlight: boolean;
  readonly dimming: boolean;
  readonly lens: boolean;
  readonly opacity: number;
  readonly note: string;
}

/** §3.6 分派表：kind → 变体 / 模糊 / 边缘光 / dimming / lens */
export const GLASS_KIND_TABLE: Record<GlassKind, GlassKindDefinition> = {
  compact: {
    variant: 'regular', tintOnSurface: false, edgeHighlight: true, dimming: false, lens: false,
    opacity: 1, note: 'glassCompact / GlassRoundButton / Chip；返回键胶囊、Pill、筛选 chip',
  },
  regular: {
    variant: 'regular', tintOnSurface: false, edgeHighlight: true, dimming: false, lens: false,
    opacity: 1, note: 'glassSurface / GlassTopBar；悬浮工具条、输入底坞',
  },
  large: {
    variant: 'regular', tintOnSurface: false, edgeHighlight: true, dimming: false, lens: false,
    opacity: 0.9, note: 'Sheet / Modal 高不透明膜层；大面积禁 lens；独立 window 不做真模糊（R14 / A5）',
  },
  tabs: {
    variant: 'regular', tintOnSurface: true, edgeHighlight: false, dimming: false, lens: false,
    opacity: 1, note: 'GlassBottomTabs bar；tint @0.10 由 onDrawSurface 承载（§3.6）',
  },
  detail: {
    variant: 'regular', tintOnSurface: false, edgeHighlight: true, dimming: false, lens: false,
    opacity: 1, note: 'GlassDetailBar；聊天输入底坞 / 播放器控制底坞',
  },
  media: {
    variant: 'clear', tintOnSurface: false, edgeHighlight: true, dimming: true, lens: false,
    opacity: 1, note: 'SurfaceView 采样不到，不做 backdrop blur；渐变 + #000@0.35 dimming 近似 clear（R3 / M7）',
  },
  indicator: {
    variant: 'regular', tintOnSurface: false, edgeHighlight: false, dimming: false, lens: true,
    opacity: 1, note: '唯一允许 lens：Dock 选中指示器，且必须是 bar 的兄弟节点（A2 / 铁律②）',
  },
} as const;

export interface ResolveGlassOptions {
  layer?: GlassLayer;
  snapshot?: GlassSnapshot;
}

/** 合并六类降级策略（单一循环，单一路径） */
function resolvePolicy(reasons: readonly DegradeReason[]): GlassPolicyMask {
  let disableBlur = false;
  let disableLens = false;
  let forceOpaque = false;
  let disableMotion = false;
  const notes: string[] = [];
  for (const reason of reasons) {
    const policy = DEGRADE_POLICY[reason];
    disableBlur = disableBlur || policy.disableBlur === true;
    disableLens = disableLens || policy.disableLens === true;
    forceOpaque = forceOpaque || policy.forceOpaque === true;
    disableMotion = disableMotion || policy.disableMotion === true;
    notes.push(policy.note);
  }
  return { disableBlur, disableLens, forceOpaque, disableMotion, note: notes.join('; ') };
}

/**
 * ⑤ resolveGlass(kind)：所有玻璃数值的唯一解析出口。
 * 四档 blurDp 统一乘 blurScale；tint 只经 resolveTintAlpha 过 H1；canBlur / canLens 双档生效。
 */
export function resolveGlass(kind: GlassKind, options: ResolveGlassOptions = {}): GlassSpec {
  if (!GLASS_KINDS.includes(kind)) {
    throw new Error(`[glass] 未知 kind：${String(kind)}`);
  }
  const layer: GlassLayer = options.layer ?? 'control';
  const snapshot = options.snapshot ?? snapshotGlass();
  const definition = GLASS_KIND_TABLE[kind];

  const reasons: DegradeReason[] = [];
  if (!canBlur()) reasons.push('api<31');
  if (!canLens()) reasons.push('lensUnavailable(api<33)');
  for (const reason of snapshot.reasons) {
    if (!reasons.includes(reason)) reasons.push(reason);
  }
  const policy = resolvePolicy(reasons);

  const blurDp = policy.disableBlur
    ? 0
    : BLUR_DP_BY_KIND[kind] * clampScale('blurScale', snapshot.blurScale);

  const lensScale = clampScale('lensScale', snapshot.lensScale);
  const lens: GlassLens | null =
    definition.lens && !policy.disableLens && canLens()
      ? {
          refractionHeightDp: LENS_BASE.refractionHeightDp * lensScale,
          refractionAmountDp: LENS_BASE.refractionAmountDp * lensScale,
          chromaticAberration: LENS_BASE.chromaticAberration,
        }
      : null;

  assertGlassLayer(layer, kind);

  return {
    kind,
    variant: definition.variant,
    layer,
    blurDp,
    tintAlpha: resolveTintAlpha(TINT_ALPHA_BASE, snapshot.tintScale),
    tintOnSurface: definition.tintOnSurface,
    edgeHighlight: definition.edgeHighlight ? EDGE_HIGHLIGHT : null,
    dimming: definition.dimming ? GLASS_DIMMING : null,
    lens,
    opacity: policy.forceOpaque ? Math.max(definition.opacity, 0.9) : definition.opacity,
    degraded: reasons.length > 0,
    reasons,
    note: definition.note,
  };
}

/* ------------------------------------------------------------------ *
 * 五、layer 白名单断言 / childRadius / 玻璃容器预算（⑤ 保留且升格）
 * ------------------------------------------------------------------ */

/** A3：layer 白名单断言（对应红线转译 A3，非 RN 侧真实 SIGSEGV） */
export const GLASS_LAYER_WHITELIST: Record<GlassKind, readonly GlassLayer[]> = {
  compact: ['control'],
  regular: ['control'],
  large: ['control'],
  tabs: ['control'],
  detail: ['control'],
  media: ['control'],
  indicator: ['control'],
} as const;

/**
 * 内容层禁止玻璃（02 D1 / 04 §6.2 A3）：开发期直接报错，
 * 生产环境走 degrade('lowEnd') 单一路径降级为实色，并由静态守卫兜底。
 */
export function assertGlassLayer(layer: GlassLayer, kind: GlassKind): boolean {
  const allowed = GLASS_LAYER_WHITELIST[kind];
  if (allowed.includes(layer)) return true;
  const message =
    `[glass] layer='${layer}' 不在 ${kind} 的白名单 ${JSON.stringify(allowed)} 内：` +
    '内容层禁止使用 Liquid Glass（02 D1 / 04 §6.2 A3）';
  if (__DEV__) throw new Error(message);
  degrade('lowEnd');
  return false;
}

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
 * 六、GlassSurface 骨架 / 契约（P0 不接入任何页面，零视觉变化）
 * ------------------------------------------------------------------ */

export interface GlassSurfaceProps {
  kind: GlassKind;
  /** 默认 'control'；传 'content' 会触发 A3 断言 */
  layer?: GlassLayer;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children?: ReactNode;
}

/**
 * 单一容器承载全部玻璃效果（M23 / A2）。
 * ⚠️ P0 仅骨架：渲染普通 View，不挂 BlurView / tint / 渐变，避免任何视觉变化。
 * P1 起在本组件内按 spec 接线 expo-blur 与边缘高光，页面不得自行拼装玻璃视图。
 */
export function GlassSurface(props: GlassSurfaceProps): ReactElement {
  const snapshot = useGlassSnapshot();
  const spec = useMemo(
    () => resolveGlass(props.kind, { layer: props.layer ?? 'control', snapshot }),
    [props.kind, props.layer, snapshot],
  );
  // spec 在 P0 只做契约校验（含 layer 白名单断言），不产生任何样式；P1 在此挂 blur/tint。
  void spec;
  return createElement(View, { style: props.style, testID: props.testID }, props.children);
}
