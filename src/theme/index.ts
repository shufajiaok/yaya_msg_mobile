// 统一主题入口：iOS 26 风格 tokens
export { usePalette, Palettes, Colors, DarkColors, semantic, accent, usePageBackground } from './colors';
export { typography, fontFamily } from './typography';
export type { TypographyToken } from './typography';
export { spacing, insets } from './spacing';
export type { SpacingToken } from './spacing';
export { radii, radiiAlias } from './radii';
export type { RadiusToken } from './radii';
export { makeShadows } from './shadows';
export { motion } from './motion';

// P0 批次①：玻璃参数单一来源（03 §3.5 / §3.6 / §9 P0）
export {
  // ① 全局状态与三段式
  useGlassStore,
  glassSettings,
  initGlassSettings,
  persistGlassSettings,
  resetGlassSettings,
  DEFAULT_SCALES,
  SCALE_RANGES,
  GLOW_SCALE_MIN,
  clampScale,
  GLASS_STORAGE_KEY,
  // ② 四倍率 / ④ 基础参数
  TINT_ALPHA_MAX,
  TINT_ALPHA_BASE,
  BLUR_DP_BY_KIND,
  EDGE_HIGHLIGHT,
  GLASS_DIMMING,
  CONTENT_SCRIM,
  LENS_BASE,
  TAB_BAR_STYLE,
  TAB_BAR_TARGET,
  resolveContentScrim,
  // ③ 三项硬约束
  resolveTintAlpha,
  androidApiLevel,
  canBlur,
  canLens,
  DEGRADE_REASONS,
  DEGRADE_POLICY,
  degrade,
  clearDegrade,
  getActiveDegradeReasons,
  isGlassDegraded,
  ensurePlatformDegradation,
  // ⑤ 分派 / 白名单 / 预算 / 同心几何
  GLASS_KINDS,
  GLASS_KIND_TABLE,
  GLASS_LAYER_WHITELIST,
  assertGlassLayer,
  childRadius,
  GLASS_BUDGET,
  registerGlassContainer,
  unregisterGlassContainer,
  useGlassBudget,
  snapshotGlass,
  useGlassSnapshot,
  resolveGlass,
  GlassSurface,
} from './glass';
export type {
  GlassKind,
  GlassVariant,
  GlassLayer,
  DegradeReason,
  GlassScaleKey,
  ScaleRange,
  GlassScales,
  GlassState,
  EdgeHighlight,
  GlassDimming,
  ScrimSpec,
  GlassLens,
  GlassPolicyMask,
  GlassDegradeResult,
  GlassSnapshot,
  GlassSpec,
  ResolveGlassOptions,
  GlassBudgetEntry,
  GlassBudgetView,
  GlassSurfaceProps,
} from './glass';
