/**
 * GlassCard —— 通用卡片（it.21 起 = 真玻璃的薄封装）。
 *
 * 历史：本组件最初是「半透明纯色 + 1px 内描边」的玻璃**近似**（当时工程里没有
 * 原生模糊）。it.19 起我们有了自绘的 GlassKitView 引擎，it.21 用户要求
 * 「其他组件都用上玻璃版、曲率统一」，于是这里直接委托给 `GlassSurface`：
 *
 * - 材质：真 backdrop 采集 + GPU 高斯模糊 + tint（与 dock 同一套引擎参数）；
 * - 曲率：`shape="card"`（GLASS_SHAPE.card = 22dp，引擎超椭圆 n≈4），与 dock 的
 *   连续曲率胶囊属于同一套形状语言；
 * - 边界：GlassSurface 自带 hairline 内描边（玻璃在浅色页上没有边界，靠它定形）；
 * - 降级：API<31/33 自动退 `palette.surfaceGlassStrong` 实底（GlassSurface 内部处理）。
 *
 * 兼容性：props 签名不变。`strong` / `tint` 保留但不再区分 —— 真玻璃只有一种材质，
 * 强弱由全局「模糊 / 膜层」滑块统一控制（it.17 定下的「全局统一调节」口径）。
 */
import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { radiiAlias } from '../theme';
import { spacing } from '../theme/spacing';
import { GlassSurface } from './GlassSurface';

export interface GlassCardProps {
  children?: React.ReactNode;
  /** @deprecated it.21 起真玻璃只有一种材质，本参数不再生效（保留仅为不改调用点） */
  strong?: boolean;
  /** 自定义 padding */
  padding?: number;
  /** 自定义圆角，默认 card (20) */
  radius?: number;
  style?: StyleProp<ViewStyle>;
  /** @deprecated 同 strong：真玻璃不区分染色，保留仅为不改调用点 */
  tint?: 'pink' | 'plain';
}

export function GlassCard({
  children,
  padding = spacing.md,
  radius = radiiAlias.card,
  style,
}: GlassCardProps) {
  return (
    <GlassSurface shape="card" radius={radius} padding={padding} style={style}>
      {children}
    </GlassSurface>
  );
}

export default GlassCard;
