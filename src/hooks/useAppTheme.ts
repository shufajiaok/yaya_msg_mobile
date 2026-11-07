// 主题与 a11y 统一 hook（P0 第 6 项）
// 依据：02 §5.1 四条降级矩阵 / §4.1 AX1 Dynamic Type / §4.5 动效；
//       03 §8.1 / §8.3 / §8.4 / §9 P0；04 §2.4 契约缺口③。
// 只用 RN 内置 API（useColorScheme / useWindowDimensions）+ AccessibilityInfo（在 store/a11y.ts）。
// ⚠️ 原有 useAppTheme() / useResolvedTheme() 语义与返回值保持不变，全 src 既有调用不受影响。
import { useEffect, useMemo } from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';
import { useSettingsStore } from '../store';
import { useA11yStore, syncA11yGlassPolicy, type A11yFlags, type A11ySystemFlags } from '../store/a11y';
import { ensurePlatformDegradation } from '../theme/glass';
import { DYNAMIC_TYPE, scaleFontSize } from '../theme/typography';
import { resolveMotion, resolveMotionProfile, type MotionProfile, type MotionTokens } from '../theme/motion';

export type ResolvedTheme = 'light' | 'dark';

function resolveTheme(theme: 'light' | 'dark' | 'system', system: 'light' | 'dark' | null | undefined): ResolvedTheme {
  if (theme === 'system') return system === 'dark' ? 'dark' : 'light';
  return theme === 'dark' ? 'dark' : 'light';
}

/**
 * 解析后的深色判断（boolean）。'system' 跟随系统（useColorScheme 自动订阅系统切换）。
 * 全局统一用本 hook 代替 `settings.theme === 'dark'` 判断。
 */
export function useAppTheme(): boolean {
  const theme = useSettingsStore((s) => s.settings.theme);
  const system = useColorScheme();
  return resolveTheme(theme, system) === 'dark';
}

/** 解析后的实际主题字符串（'light' | 'dark'），导航主题等需要字符串处使用。 */
export function useResolvedTheme(): ResolvedTheme {
  const theme = useSettingsStore((s) => s.settings.theme);
  const system = useColorScheme();
  return resolveTheme(theme, system);
}

/* ------------------------------------------------------------------ *
 * P0 新增：4 套色订阅 / Dynamic Type / 动效档 / a11y 同步
 * ------------------------------------------------------------------ */

/** a11y 全量读数（App 内开关 + 系统能力），逐项 selector 订阅，避免无关重建 */
export function useA11yFlags(): A11yFlags & A11ySystemFlags {
  const reduceTransparency = useA11yStore((s) => s.reduceTransparency);
  const increaseContrast = useA11yStore((s) => s.increaseContrast);
  const reduceMotion = useA11yStore((s) => s.reduceMotion);
  const dimFlashingLights = useA11yStore((s) => s.dimFlashingLights);
  const assistiveAccess = useA11yStore((s) => s.assistiveAccess);
  const systemReduceTransparency = useA11yStore((s) => s.systemReduceTransparency);
  const systemReduceMotion = useA11yStore((s) => s.systemReduceMotion);
  const systemBoldText = useA11yStore((s) => s.systemBoldText);
  const systemGrayscale = useA11yStore((s) => s.systemGrayscale);
  return useMemo(
    () => ({
      reduceTransparency,
      increaseContrast,
      reduceMotion,
      dimFlashingLights,
      assistiveAccess,
      systemReduceTransparency,
      systemReduceMotion,
      systemBoldText,
      systemGrayscale,
    }),
    [
      reduceTransparency,
      increaseContrast,
      reduceMotion,
      dimFlashingLights,
      assistiveAccess,
      systemReduceTransparency,
      systemReduceMotion,
      systemBoldText,
      systemGrayscale,
    ],
  );
}

export interface DynamicTypeState {
  /** RN useWindowDimensions().fontScale */
  fontScale: number;
  /** fontScale ≥ 1.3：房间头 / 麦位行 / 榜单行 / 输入区横排改纵向堆叠 */
  isLarge: boolean;
  layout: 'row' | 'stack';
  /** 英雄文字 31 → 44sp（AX1） */
  heroFontSize: number;
  /** 行距 38 → 52 */
  heroLineHeight: number;
  /** 正文 → 28sp */
  bodyFontSize: number;
  /** 图标同步放大倍率 */
  iconScale: number;
}

/** Dynamic Type 全档：字号随 fontScale，钳在官方 AX1 上限，最小 11sp */
export function useDynamicType(): DynamicTypeState {
  const { fontScale } = useWindowDimensions();
  return useMemo(() => {
    const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
    const heroFontSize = scaleFontSize(DYNAMIC_TYPE.heroFontSizeSp, scale, DYNAMIC_TYPE.heroMaxFontSizeSp);
    const heroLineHeight = scaleFontSize(DYNAMIC_TYPE.heroLineHeightSp, scale, DYNAMIC_TYPE.heroMaxLineHeightSp);
    const bodyFontSize = scaleFontSize(DYNAMIC_TYPE.bodyFontSizeSp, scale, DYNAMIC_TYPE.bodyMaxFontSizeSp);
    const isLarge = scale >= DYNAMIC_TYPE.stackLayoutFontScale;
    return {
      fontScale: scale,
      isLarge,
      layout: isLarge ? 'stack' : 'row',
      heroFontSize,
      heroLineHeight,
      bodyFontSize,
      iconScale: Math.min(scale, DYNAMIC_TYPE.heroMaxFontSizeSp / DYNAMIC_TYPE.heroFontSizeSp),
    };
  }, [fontScale]);
}

export interface MotionPreference {
  profile: MotionProfile;
  tokens: MotionTokens;
}

/** 动效档：Reduce Motion / 精简模式 → reduced / off（02 §5.1 / §4.5） */
export function useMotionPreference(): MotionPreference {
  const reduceMotion = useA11yStore((s) => s.reduceMotion);
  const systemReduceMotion = useA11yStore((s) => s.systemReduceMotion);
  const assistiveAccess = useA11yStore((s) => s.assistiveAccess);
  return useMemo(() => {
    const profile = resolveMotionProfile({ reduceMotion, systemReduceMotion, assistiveAccess });
    return { profile, tokens: resolveMotion(profile) };
  }, [reduceMotion, systemReduceMotion, assistiveAccess]);
}

/**
 * 启动同步钩子：P0 的 App.tsx 冻结不改，降级已由 store/a11y.ts 模块级 init 生效；
 * 本 hook 供 P1 在根组件挂载，确保系统设置变化 / 冷启动持久化回读后策略仍一致。
 */
export function useA11ySync(): void {
  useEffect(() => {
    syncA11yGlassPolicy();
    ensurePlatformDegradation();
  }, []);
}
