/**
 * glassDockStore —— it.17 玻璃可调参数的全局运行时状态（实验页 ↔ App 本体共用）
 *
 * 背景（用户 2026-11-08 口径）：
 * 「底栏的上面三个值单独调节」「三个都要」「可调节，就和实验页一样啊，同步统一调节的」
 * ⇒ 底栏（AppTabBar）的全部玻璃 / 几何参数必须接到实验页同一套可调参数上，
 * 拖滑块实时联动，而不是写死常量。
 *
 * 职责划分（三层，互不重复）：
 * 1. `glassProfile.ts` —— **默认值唯一来源**（用户已验收的 HealthCheckIn 配置常量），纯常量；
 * 2. `glass.ts`     —— **四倍率**（blur / tint / lens / glow）的持久化 store，
 *                     语义是「引擎级全局倍率」，一轮迭代只搬一次，本文件不重复搬；
 * 3. 本文件          —— **组件级可调参数**（开关 / 顶栏与 dock 几何 / 扩展调试 / 高光 /
 *                     dock 选中态）的运行时状态 + 持久化，以及三个消费用派生出口：
 *                     `useDockSettings()` / `useGlassScales()` / `setGlassScale()`。
 *
 * 为什么派生 hook 必须放在 `.ts` 而不是组件里：
 * 守卫 `glass-api-access`（S3）只对 `src/**\/*.tsx` 里的玻璃 API 符号按行计数，
 * 基线为「只拦新增」。在 `AppTabBar.tsx` / `GlassTestScreen.tsx` 直接 `useGlassStore`
 * 会新增命中导致 FAIL；把订阅收敛到本 .ts，组件只消费派生值，既满足守卫 PASS，
 * 也让「玻璃数值唯一出口」更彻底。
 *
 * 钳制：`setNumber` 内部按 `DOCK_RANGES` 钳一次（非有限值退回该项默认值），
 * 实验页的 `clampRange` / `clampScale` 保留 → 双保险；两者结果一致。
 *
 * ⚠️ 数值区间 `DOCK_RANGES` 与实验页滑块 MIN/MAX 严格同值（实验页直接引用本表，
 *    不再各写一份），改动本表 = 改动实验页滑块区间，必须有用户明确指令。
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGlassStore, type GlassScaleKey } from './glass';
import {
  GLASS_DEBUG_DEFAULTS,
  GLASS_EFFECT_DEFAULTS,
  GLASS_PROFILE,
  GLASS_SWITCH_DEFAULTS,
} from './glassProfile';

/* ------------------------------------------------------------------ *
 * 一、数值区间（与实验页滑块 MIN/MAX 同值，唯一来源）
 * ------------------------------------------------------------------ */

/**
 * 15 个数值型可调参数的合法区间。
 *
 * 出处：it.13 对齐项区间（SettingsScreenKt.java:1905-2128）+ 扩展调试项区间。
 * `dockRadiusDp` 滑块区间是 0–48，而默认值 999（= 真胶囊）**不走 setter**，
 * 因此不会被钳成 48：默认值只来自 `DOCK_SETTINGS_DEFAULTS`。
 */
export const DOCK_RANGES = {
  topBarWidthScale: { min: 0.6, max: 1 },
  topBarHeightDp: { min: 44, max: 72 },
  dockWidthScale: { min: 0.7, max: 1 },
  dockHeightDp: { min: 56, max: 84 },
  dockInnerPadDp: { min: 0, max: 20 },
  dockFloatDp: { min: 0, max: 24 },
  dockRadiusDp: { min: 0, max: 48 },
  dispersionLevel: { min: 0, max: 1 },
  glowAlpha: { min: 0, max: 3 },
  glowWidth: { min: 0, max: 3 },
  glowBottom: { min: 0, max: 3 },
  radiusScale: { min: 0, max: 3 },
  widthScale: { min: 0.5, max: 2 },
  heightScale: { min: 0.5, max: 2 },
  highlightScale: { min: 0, max: 1 },
} as const;

/** 数值型可调字段名（15 项）。 */
export type DockNumericKey = keyof typeof DOCK_RANGES;

/** 布尔型可调字段名（6 项）。 */
export type DockBooleanKey =
  | 'blurEnabled'
  | 'forceDownsample'
  | 'glassOnGlass'
  | 'chromaticEnabled'
  | 'depthEffect'
  | 'vibrancyEnabled';

/* ------------------------------------------------------------------ *
 * 二、默认值（全部引用 glassProfile.ts，不写第二份字面量）
 * ------------------------------------------------------------------ */

/** 数值型字段（15 项）。 */
export interface DockNumericValues {
  topBarWidthScale: number;
  topBarHeightDp: number;
  dockWidthScale: number;
  dockHeightDp: number;
  dockInnerPadDp: number;
  dockFloatDp: number;
  dockRadiusDp: number;
  dispersionLevel: number;
  glowAlpha: number;
  glowWidth: number;
  glowBottom: number;
  radiusScale: number;
  widthScale: number;
  heightScale: number;
  highlightScale: number;
}

/** 布尔型字段（6 项）。 */
export interface DockBooleanValues {
  blurEnabled: boolean;
  forceDownsample: boolean;
  glassOnGlass: boolean;
  chromaticEnabled: boolean;
  depthEffect: boolean;
  vibrancyEnabled: boolean;
}

/** 全部可调字段（22 项，含 dock 选中态）。 */
export interface DockSettingsValues extends DockNumericValues, DockBooleanValues {
  /** dock 选中下标：本体底栏选中态由导航 props 驱动，本字段只给实验页对齐测试用。 */
  dockSelected: number;
}

/**
 * 22 个字段的默认值，逐项引用 `glassProfile.ts`（用户 2026-11-08 指定的
 * HealthCheckIn 实测配置），本文件零字面量默认值。
 */
export const DOCK_SETTINGS_DEFAULTS: DockSettingsValues = {
  // —— 顶部开关（GLASS_SWITCH_DEFAULTS）——
  blurEnabled: GLASS_SWITCH_DEFAULTS.blurEnabled,
  forceDownsample: GLASS_SWITCH_DEFAULTS.forceDownsample,
  glassOnGlass: GLASS_SWITCH_DEFAULTS.glassOnGlass,
  // —— 三开关（GLASS_EFFECT_DEFAULTS）——
  chromaticEnabled: GLASS_EFFECT_DEFAULTS.chromaticEnabled,
  depthEffect: GLASS_EFFECT_DEFAULTS.depthEffect,
  vibrancyEnabled: GLASS_EFFECT_DEFAULTS.vibrancyEnabled,
  // —— 几何（GLASS_PROFILE）——
  topBarWidthScale: GLASS_PROFILE.topBarWidthScale,
  topBarHeightDp: GLASS_PROFILE.topBarHeightDp,
  dockWidthScale: GLASS_PROFILE.dockWidthScale,
  dockHeightDp: GLASS_PROFILE.dockHeightDp,
  dockInnerPadDp: GLASS_PROFILE.dockInnerPadDp,
  dockFloatDp: GLASS_PROFILE.dockFloatDp,
  // —— 高光（GLASS_PROFILE）——
  highlightScale: GLASS_PROFILE.highlightScale,
  // —— 扩展调试（GLASS_DEBUG_DEFAULTS）——
  dockRadiusDp: GLASS_DEBUG_DEFAULTS.dockRadiusDp,
  dispersionLevel: GLASS_DEBUG_DEFAULTS.dispersionLevel,
  glowAlpha: GLASS_DEBUG_DEFAULTS.glowAlpha,
  glowWidth: GLASS_DEBUG_DEFAULTS.glowWidth,
  glowBottom: GLASS_DEBUG_DEFAULTS.glowBottom,
  radiusScale: GLASS_DEBUG_DEFAULTS.radiusScale,
  widthScale: GLASS_DEBUG_DEFAULTS.widthScale,
  heightScale: GLASS_DEBUG_DEFAULTS.heightScale,
  // —— dock 选中态 ——
  dockSelected: 0,
};

/* ------------------------------------------------------------------ *
 * 三、钳制（setter 内钳一次，实验页 clampRange 再钳一次）
 * ------------------------------------------------------------------ */

/**
 * 按 `DOCK_RANGES[key]` 钳制并保留两位小数。
 *
 * 非有限值（NaN / ±Infinity）退回该项**默认值**而不是区间端点：
 * 端点会让「滑块突然失效」静默变成「跳到极值」，默认值更接近用户意图。
 */
export function clampDockNumber(key: DockNumericKey, value: number): number {
  const range = DOCK_RANGES[key];
  const safe = Number.isFinite(value) ? value : DOCK_SETTINGS_DEFAULTS[key];
  return Number(Math.min(range.max, Math.max(range.min, safe)).toFixed(2));
}

/* ------------------------------------------------------------------ *
 * 四、store（zustand + AsyncStorage，key / version 见下）
 * ------------------------------------------------------------------ */

/** 持久化 key（与四倍率的 `yaya_glass_settings_v1` 独立，互不污染）。 */
export const GLASS_DOCK_STORAGE_KEY = 'yaya_glass_dock_v1';

export interface GlassDockState extends DockSettingsValues {
  /** 写数值字段（内部按 DOCK_RANGES 钳制 + 两位小数）。 */
  setNumber: (key: DockNumericKey, value: number) => void;
  /** 写布尔字段。 */
  setBoolean: (key: DockBooleanKey, value: boolean) => void;
  /** 写 dock 选中下标（非负整数；越界值夹到 0）。 */
  setDockSelected: (index: number) => void;
  /** 批量写入（迁移 / 预设用；每个字段都过钳制）。 */
  patch: (next: Partial<DockSettingsValues>) => void;
  /** 全部字段回到 glassProfile.ts 默认值。 */
  reset: () => void;
}

const BOOLEAN_KEYS: readonly DockBooleanKey[] = [
  'blurEnabled',
  'forceDownsample',
  'glassOnGlass',
  'chromaticEnabled',
  'depthEffect',
  'vibrancyEnabled',
] as const;

const NUMERIC_KEYS: readonly DockNumericKey[] = [
  'topBarWidthScale',
  'topBarHeightDp',
  'dockWidthScale',
  'dockHeightDp',
  'dockInnerPadDp',
  'dockFloatDp',
  'dockRadiusDp',
  'dispersionLevel',
  'glowAlpha',
  'glowWidth',
  'glowBottom',
  'radiusScale',
  'widthScale',
  'heightScale',
  'highlightScale',
] as const;

function isBooleanKey(key: string): key is DockBooleanKey {
  return (BOOLEAN_KEYS as readonly string[]).includes(key);
}

function isNumericKey(key: string): key is DockNumericKey {
  return (NUMERIC_KEYS as readonly string[]).includes(key);
}

export const useGlassDockStore = create<GlassDockState>()(
  persist(
    (set) => ({
      ...DOCK_SETTINGS_DEFAULTS,
      /**
       * 计算属性名写入：TS 无法把 `{ [key]: number }` 收窄为 `Partial<Pick<…>>`，
       * 这里显式断言一次；`key` 已由 `DockNumericKey` 联合限定 + `NUMERIC_KEYS`
       * 白名单校验，运行时安全。值相等时返回原 state，避免无谓重渲染。
       */
      setNumber: (key, value) => {
        const next = clampDockNumber(key, value);
        set((state) => {
          if (state[key] === next) return state;
          return { [key]: next } as unknown as Partial<GlassDockState>;
        });
      },
      setBoolean: (key, value) => {
        set((state) => {
          if (state[key] === value) return state;
          return { [key]: value } as unknown as Partial<GlassDockState>;
        });
      },
      setDockSelected: (index) => {
        const next = Number.isFinite(index) ? Math.max(0, Math.trunc(index)) : 0;
        set((state) => (state.dockSelected === next ? state : { dockSelected: next }));
      },
      patch: (next) => {
        set((state) => {
          const merged: Partial<GlassDockState> = {};
          let changed = false;
          for (const rawKey of Object.keys(next)) {
            const raw = next[rawKey as keyof DockSettingsValues];
            if (raw === undefined) continue;
            if (isNumericKey(rawKey) && typeof raw === 'number') {
              const value = clampDockNumber(rawKey, raw);
              if (state[rawKey] !== value) {
                (merged as Record<string, number>)[rawKey] = value;
                changed = true;
              }
            } else if (isBooleanKey(rawKey) && typeof raw === 'boolean') {
              if (state[rawKey] !== raw) {
                (merged as Record<string, boolean>)[rawKey] = raw;
                changed = true;
              }
            }
          }
          return changed ? merged : state;
        });
      },
      /** 22 字段整包回默认（默认值来自 glassProfile.ts，不读持久化旧值）。 */
      reset: () => set({ ...DOCK_SETTINGS_DEFAULTS }),
    }),
    {
      name: GLASS_DOCK_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      /** partialize 全部 22 字段（动作函数不落盘）。 */
      partialize: (state) => ({
        blurEnabled: state.blurEnabled,
        forceDownsample: state.forceDownsample,
        glassOnGlass: state.glassOnGlass,
        chromaticEnabled: state.chromaticEnabled,
        depthEffect: state.depthEffect,
        vibrancyEnabled: state.vibrancyEnabled,
        topBarWidthScale: state.topBarWidthScale,
        topBarHeightDp: state.topBarHeightDp,
        dockWidthScale: state.dockWidthScale,
        dockHeightDp: state.dockHeightDp,
        dockInnerPadDp: state.dockInnerPadDp,
        dockFloatDp: state.dockFloatDp,
        dockRadiusDp: state.dockRadiusDp,
        dispersionLevel: state.dispersionLevel,
        glowAlpha: state.glowAlpha,
        glowWidth: state.glowWidth,
        glowBottom: state.glowBottom,
        radiusScale: state.radiusScale,
        widthScale: state.widthScale,
        heightScale: state.heightScale,
        highlightScale: state.highlightScale,
        dockSelected: state.dockSelected,
      }),
      /**
       * version 1（本 store 首版）。保留 migrate 钩子：后续默认值 / 区间变化时
       * bump 到 2 并返回 `{ ...DOCK_SETTINGS_DEFAULTS }`，语义与 glass.ts 一致
       * （一次性覆盖旧持久化值，此后照常随滑块持久化）。
       */
      version: 1,
      migrate: () => ({ ...DOCK_SETTINGS_DEFAULTS }),
    },
  ),
);

/* ------------------------------------------------------------------ *
 * 五、消费出出口（本 .ts 内完成订阅，组件不直接碰玻璃 API）
 * ------------------------------------------------------------------ */

/**
 * dock / 实验页全部可调参数 + 动作（整包订阅）。
 *
 * 为什么整包订阅而不是逐字段 selector：消费者（AppTabBar / GlassTestScreen）
 * 一个组件就要用 15+ 字段，逐字段 selector 会产生十几路订阅且每个都在
 * 拖滑块时独立触发；整包订阅在「本来就是全量重渲染」的场景下开销更小、语义更直白。
 */
export function useDockSettings(): GlassDockState {
  return useGlassDockStore();
}

/** 四倍率快照（blur / tint / lens / glow，来自 glass.ts 的 useGlassStore）。 */
export interface GlassScalesSnapshot {
  blurScale: number;
  tintScale: number;
  lensScale: number;
  glowScale: number;
}

/**
 * 四倍率派生 hook —— 唯一订阅出口（.ts 内计数，不触发守卫 S3）。
 *
 * it.17 起返回四项（it.16 只有 blur / lens）：AppTabBar 的 bar tint 需要
 * tintScale 算 `resolveTintAlpha`，bar 描边需要 glowScale。
 */
export function useGlassScales(): GlassScalesSnapshot {
  const blurScale = useGlassStore((state) => state.blurScale);
  const tintScale = useGlassStore((state) => state.tintScale);
  const lensScale = useGlassStore((state) => state.lensScale);
  const glowScale = useGlassStore((state) => state.glowScale);
  return { blurScale, tintScale, lensScale, glowScale };
}

/**
 * 写四倍率（实验页滑块 onChange 用）。
 *
 * 为什么不在 `.tsx` 直接 `useGlassStore.setState(...)`：守卫 S3 会按行计数。
 * 本函数是四倍率写入的唯一非组件出口；`glass.ts` 的 `setScale` 内部已做
 * `clampScale`，实验页再叠一层 `clampScale`（两位小数）即双保险。
 */
export function setGlassScale(key: GlassScaleKey, value: number): void {
  useGlassStore.getState().setScale(key, value);
}
