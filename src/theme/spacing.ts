// iOS 26 间距梯度（4pt baseline）—— 容器、卡片、控件、文本配对间距
//
// P0 第 5 项依据：02 §4.2（组间 ≥24 / 组内 8–12 / 屏幕水平 ≥16 / 容器 spacing 20–40 /
// 胶囊与边缘 ≥8 / 触控目标 ≥48）/ §4.4；03 §3.4 间距与阴影 / §9 P0。
// 引擎尺寸档（22dp 工具条 / 32dp 胶囊 / 8·10·12·14dp blur）见 radii.ts 的 glassGeometry
// 与 glass.ts 的 BLUR_DP_BY_KIND，本文件不重抄数值。
export const spacing = {
  '2xs': 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 56,

  // --- P0 新增档位（02 §4.2 / 03 §3.4） ---
  /** 英雄档：功能层大容器留白（与 radii.hero 成对） */
  hero: 32,
  /** 组间最小留白 ≥24dp */
  group: 24,
  /** 组内间距下限 8dp（引擎 GlassChipsRow spacedBy(8.dp) 可作参照） */
  groupTight: 8,
  /** 组内间距上限 12dp */
  groupLoose: 12,
  /** 屏幕水平安全边距 ≥16dp（大悬浮 UI 基线） */
  screenEdge: 16,
  /** 胶囊与屏幕边缘另留 ≥8dp */
  capsuleEdge: 8,
  /** GlassEffectContainer(spacing:) 统一常量下限 20dp */
  glassContainer: 20,
  /** GlassEffectContainer(spacing:) 统一常量上限 40dp */
  glassContainerMax: 40,
  /** Android 触控目标 ≥48×48dp */
  touchTarget: 48,
  /** 麦位 / 播放按钮可接受下限 44dp */
  touchTargetCompact: 44,
  /** 相邻触控按钮间距 ≥8dp */
  touchGap: 8,
} as const;

export type SpacingToken = keyof typeof spacing;

/** iOS standard edge insets（屏幕左右安全留白 20，列表 inset 行 16） */
export const insets = {
  screenHorizontal: 20,
  screenHorizontalCompact: 16,
  listInset: 20,
  cardPadding: 16,
  cardPaddingCompact: 12,
} as const;

/** 全局 SafeArea 顶部/底部留白由 navigation 提供，这里只提供水平间距 */
