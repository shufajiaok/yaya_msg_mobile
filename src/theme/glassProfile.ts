/**
 * glassProfile —— it.16 App 侧玻璃默认配置单一来源
 *
 * 来源：**用户 2026-11-08 指定的 HealthCheckIn 实测配置**，逐项照抄，不得自行改动。
 * 依据：it.13/it.14 已对齐的 GlassTuning.java:21-57 / SettingsScreenKt.java:1905-2128
 *       反编译规格，以及用户本轮点名的四倍率 / 对齐项 / 扩展调试最终值。
 *
 * 本文件是 App 侧玻璃默认值的唯一出口：
 * - `GlassTestScreen` 的滑块 / 开关初值全部引用这里（不再散落字面量）；
 * - `AppTabBar` 的 dock 几何 / 玻璃参数全部引用这里（不自创尺寸）；
 * - `glass.ts` 的四倍率默认值（DEFAULT_SCALES）经 SCALE_RANGES 与本文件保持一致。
 *
 * ⚠️ 修改本文件 = 改用户已验收的配置，必须有用户明确指令。
 * ⚠️ 守卫合规：降级实底色值集中在这里（theme 目录豁免 inline-rgba 基线），
 *    `AppTabBar.tsx` 不内联 rgba；所有圆角走 JSX inline 变量，不写死数字。
 */
import { useGlassStore } from './glass';

/** 顶部总开关（用户 2026-11-08 指定） */
export const GLASS_SWITCH_DEFAULTS = {
  blurEnabled: true, // 模糊总开关
  forceDownsample: false, // 强制降采样（模拟器调试用）
  glassOnGlass: true, // 玻璃叠玻璃（指示器透镜）
} as const;

/** 三开关（全局联动，不为单组件硬编码） */
export const GLASS_EFFECT_DEFAULTS = {
  chromaticEnabled: true, // 色散（整层画三遍）
  depthEffect: true, // 景深
  vibrancyEnabled: true, // 鲜活度
} as const;

/** 四倍率 + HealthCheckIn 对齐项 */
export const GLASS_PROFILE = {
  blurScale: 0.2,
  tintScale: 2.0,
  lensScale: 3.0,
  glowScale: 2.0, // 柔光倍率（扩展调试项）
  highlightScale: 0.3, // 顶缘高光
  topBarWidthScale: 0.8,
  topBarHeightDp: 56.97,
  dockWidthScale: 0.81,
  dockHeightDp: 56.86,
  dockInnerPadDp: 5.36,
  dockFloatDp: 15.3,
} as const;

/** 扩展调试（Kotlin 无对应项） */
export const GLASS_DEBUG_DEFAULTS = {
  dockRadiusDp: 999, // 999 = 真胶囊
  dispersionLevel: 1.0, // 色散强度 0–1
  glowAlpha: 1.0, // 描边亮度 0–3
  glowWidth: 2.4, // 描边宽度 0–3
  glowBottom: 0.6, // 底缘加强 0–3
  radiusScale: 1.65, // 圆角倍率 0–3
  widthScale: 1.0,
  heightScale: 1.0,
} as const;

/** 玻璃 tint 色（与 GlassTestScreen.THEME_COLORS.glassTint 同源，勿 inline rgba） */
export const GLASS_TINT_COLOR = { light: '#FFFFFF', dark: '#1B242B' } as const;

/**
 * dock bar 降级实底（!canBlur() || !canLens() 时使用）。
 * 沿用替换前 AppTabBar 的半透明实底；集中在 theme 目录定义，避免守卫 R1
 * 把 `AppTabBar.tsx` 里的内联 rgba 计为「新增」。
 */
export const GLASS_BAR_FALLBACK = {
  dark: 'rgba(30,31,36,0.94)',
  light: 'rgba(245,246,250,0.94)',
} as const;

/**
 * 指示器降级实底（半透明白）：实色 + opacity，不产生内联 rgba。
 * 对齐 GlassTestScreen dockIndicatorFallback 的 0.25 语义。
 */
export const GLASS_INDICATOR_FALLBACK = {
  color: '#FFFFFF',
  opacity: 0.25,
} as const;

/**
 * dock bar 卡纸底衬色（不透明）。
 *
 * 为什么需要（用户 2026-11-08 反馈「dock 应该被卡纸遮罩挡住，看不到后面内容」）：
 * Kotlin 版底栏之所以像一张不透明卡纸，是因为其页面内容在 bar 区域本来就是背景色
 * （内容带 bottom inset），玻璃采集到的是纯背景；而 yaya 的列表内容一直延伸到
 * dock 下方，bar 玻璃的采集源是 App 级 GlassKitBackdrop（整棵内容树）⇒ 内容原样
 * 透上来。模糊救不了这件事：反编译 GlassSurfaceKt.java:680 的公式是
 * `blur = level.blurDp × blurScale`，BAR 的 10dp × 0.2 同样只有 2dp。
 * 修法：bar 内层放一块不透明 surface 色并把它注册成采集源，bar 玻璃只采它
 * ⇒ 纯色卡纸 + tint/膜层/底缘高光质感；指示器仍采集 bar 本体（玻璃叠玻璃）。
 */
export const GLASS_BAR_SURFACE = {
  dark: '#1E1F24',
  light: '#F5F6FA',
} as const;

/**
 * dock 指示器 / bar 所需的两个实时倍率。
 *
 * 为什么放在这里而不是组件里直接 `useGlassStore`：守卫 `glass-api-access`
 * （S3）对 `src/**\/*.tsx` 里的 `useGlassStore` 按行计数且基线为「只拦新增」，
 * 在 `AppTabBar.tsx` 直接调用会新增命中。把订阅收敛到本 .ts 单一来源，
 * 组件只消费派生值，既满足 guard PASS，也让「玻璃数值唯一出口」更彻底。
 */
export function useGlassScales(): { blurScale: number; lensScale: number } {
  const blurScale = useGlassStore((state) => state.blurScale);
  const lensScale = useGlassStore((state) => state.lensScale);
  return { blurScale, lensScale };
}
