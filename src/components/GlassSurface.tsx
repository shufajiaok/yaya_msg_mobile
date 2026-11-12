/**
 * GlassSurface —— 全 App 统一「真玻璃」表面（it.21）。
 *
 * 起因（用户 2026-11-09）：「其他的组件都用上啊，我们有那么多写好的玻璃组件。
 * 很多大小形状类似的按钮可以直接用玻璃版替换。主要是这些按钮都用上我们同款曲率
 * 圆角，设计语言要统一啊」。
 *
 * 做法：把 `GlassKitView` 的 20 多个 props（模糊 / tint / 高光 / 透镜 / 降级）
 * 收成一个组件，形状只从 `GLASS_SHAPE` 取，任何页面都不要再手写 blurDp、
 * tintAlpha、cornerRadiusDp：
 *
 * - `shape="capsule"`：999 + `capsuleContinuous` ⇒ 与 dock 完全同款的连续曲率端帽；
 * - `shape="card" / "control" / "panel"`：引擎默认超椭圆（n≈4）。
 *
 * 语义与 dock 一致：
 * - 背景源默认取 App 级 `useBackdropTag()`（`App.tsx` 的 GlassKitBackdrop），
 *   所以卡片采的是「卡片下方真实内容」，不会采到自己；
 * - tint 走 `resolveTintAlpha(TINT_ALPHA_BASE, tintScale)` 且显式 `tintScale={1}`
 *   （唯一一次乘算在 JS，原生不再二次乘）；
 * - 模糊 / 高光三倍率跟随全局 store，实验页拖滑块，全 App 玻璃一起变。
 *
 * 降级（API<31 无模糊 / API<33 无透镜）：不渲染 GlassKitView，退半透明实底
 * （`palette.surfaceGlassStrong`），保证老机型文字可读。
 *
 * ⚠️ 性能口径：每个 GlassSurface 都是一次 backdrop 采集 + 一次 GPU 模糊。
 * 一屏同时可见的数量建议 ≤8；列表项（几十个）不要用本组件，用 GlassCard 的
 * 纯色版即可。
 */
import React from 'react';
import { PixelRatio, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import GlassKitView from '../native/GlassKitView';
import GlassKitBackdrop from '../native/GlassKitBackdrop';
import { useBackdropTag } from '../native/backdropTagStore';
import { usePalette } from '../theme';
import { canBlur, canLens, BLUR_DP_BY_KIND, resolveTintAlpha, TINT_ALPHA_BASE } from '../theme/glass';
import { GLASS_LENS_PROFILE, GLASS_SHAPE, GLASS_TINT_COLOR, type GlassShapeKey } from '../theme/glassProfile';
import { useGlassScales } from '../theme/glassDockStore';

export interface GlassSurfaceProps {
  children?: React.ReactNode;
  /** 形状档（唯一来源 GLASS_SHAPE）。默认 card。 */
  shape?: GlassShapeKey;
  /** 覆盖圆角（dp）。默认取 GLASS_SHAPE[shape]。 */
  radius?: number;
  /** 覆盖模糊基准 dp。默认按 shape 取：capsule 10 / 其他 12。 */
  blurDp?: number;
  /** 内容内边距（dp）。 */
  padding?: number;
  /** 是否启用透镜（折射 + 色散）。默认 false —— 只有条状控件（capsule）需要。 */
  refraction?: boolean;
  /** 覆盖背景采集源 tag；默认 App 级 backdrop。 */
  backdropTag?: number;
  style?: StyleProp<ViewStyle>;
  /** 内容层额外样式（padding 之外的对齐 / 方向）。 */
  contentStyle?: StyleProp<ViewStyle>;
  /** 是否画发丝内描边（默认 true）：浅色页面上玻璃本身没有边界，靠它定形。 */
  hairline?: boolean;
}

/** 形状 → 默认模糊档（与 glass.ts BLUR_DP_BY_KIND 对齐：tabs 10 / detail 12）。 */
const DEFAULT_BLUR: Record<GlassShapeKey, number> = {
  capsule: BLUR_DP_BY_KIND.tabs,
  panel: BLUR_DP_BY_KIND.detail,
  card: BLUR_DP_BY_KIND.detail,
  control: BLUR_DP_BY_KIND.compact,
};

export function GlassSurface({
  children,
  shape = 'card',
  radius,
  blurDp,
  padding = 0,
  refraction = false,
  backdropTag,
  style,
  contentStyle,
  hairline = true,
}: GlassSurfaceProps) {
  const palette = usePalette();
  const isDark = palette.name === 'dark';
  const appBackdropTag = useBackdropTag();
  const { blurScale, tintScale, glowScale } = useGlassScales();
  const density = PixelRatio.get();

  const degraded = !canBlur() || !canLens();
  const cornerRadius = radius ?? GLASS_SHAPE[shape];
  const isCapsule = shape === 'capsule';
  const effectiveBlur = blurDp ?? DEFAULT_BLUR[shape];

  // 透镜只在条状控件（capsule）上启用；卡片类刻意不折，避免正文被拉扯。
  const refractionPx = refraction ? GLASS_LENS_PROFILE.controlRefractionDp * density : 0;
  const lensBandPx = refraction ? GLASS_LENS_PROFILE.controlBandDp * density : 0;
  const dispersionPx = refraction ? GLASS_LENS_PROFILE.controlRefractionDp * density : 0;

  return (
    /*
      根节点就是排除采集容器（而不是再套一层 View）：容器必须**包住内容**，否则
      卡片自己的图标 / 文字仍会被 App 级采集烘进背景纹理（自采样 → 粉色虚影）；
      同时容器本身参与普通流式布局（子节点里玻璃是 absoluteFill、内容是普通流），
      高度由内容撑开 —— 用 View 套 absoluteFill 容器会让卡片高度塌成 0（工具区
      首版就是这么整块消失的）。
    */
    <GlassKitBackdrop
      excludeFromCapture
      pointerEvents="box-none"
      style={[style, { borderRadius: cornerRadius }]}
    >
      {degraded ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: cornerRadius,
              backgroundColor: palette.surfaceGlassStrong,
            },
          ]}
        />
      ) : (
        <GlassKitView
          style={StyleSheet.absoluteFill}
          backdropTag={backdropTag ?? appBackdropTag}
          blurDp={effectiveBlur}
          blurScale={blurScale}
          tintAlpha={resolveTintAlpha(TINT_ALPHA_BASE, tintScale)}
          tintScale={1}
          tintColor={isDark ? GLASS_TINT_COLOR.dark : GLASS_TINT_COLOR.light}
          cornerRadiusDp={cornerRadius}
          capsuleContinuous={isCapsule}
          refractionPx={refractionPx}
          lensBandPx={lensBandPx}
          dispersionPx={dispersionPx}
          highlightScale={0.2}
          glowScale={glowScale}
        />
      )}
      {/* 玻璃在浅色页面上几乎没有边界：补一条发丝线定形（不是投影，不破坏材质）。 */}
      {hairline ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: cornerRadius,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: palette.innerStroke,
            },
          ]}
        />
      ) : null}
      <View style={[padding > 0 ? { padding } : null, contentStyle]}>{children}</View>
    </GlassKitBackdrop>
  );
}

export default GlassSurface;
