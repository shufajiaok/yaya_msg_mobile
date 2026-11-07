// 圆角：档位 + 同心几何 + 引擎尺寸档（P0 第 5 项）
// 依据：02 §4.2 同心圆角 / §4.4；03 §3.2 同心公式与引擎尺寸对照 / §9 P0 / §13.6 F 组；
//       04 §2.3 硬编码尺寸汇总 / §6.2 A3。
//
// ⚠️ 378 处硬编码圆角（工作副本实测 borderRadius: 字面量 374 处，差异已登记 CHANGELOG）
// 的收敛属 P1–P3：P0 只做「token 定义 + scripts/ 静态守卫」，不批量改 30 个页面。

import { BLUR_DP_BY_KIND, TAB_BAR_TARGET } from './glass';

/** 同心公式 child = parent − padding（唯一实现在 glass.ts，此处只转发，避免重复实现） */
export { childRadius } from './glass';

export const radii = {
  none: 0,
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  '2xl': 36,
  pill: 999, // capsule / fully rounded
  /** 底部弹层（sheet）顶部圆角 */
  sheet: 22,

  // --- P0 新增档位（03 §3.2 / 04 §2.3） ---
  /** 英雄档：功能层大容器 28–32dp 上限（Dock / 播放器控制底坞 / 大 Sheet） */
  hero: 32,
  /** GlassTopBar 56dp 高 → 22dp 圆角（引擎 RoundedCornerShape(22.dp)） */
  toolbar: 22,
  /** 胶囊 Capsule：高度 ≤64dp 的按钮 / chip / bar = 高度 / 2（64dp → 32dp） */
  capsule: 32,
  /** 中等控件 16–22dp */
  control: 20,
  /** 内容层卡片 12–16dp */
  contentCard: 14,
} as const;

export type RadiusToken = keyof typeof radii;

/** 推荐组合：卡片 20（适中圆润）、按钮 18、输入 14、chip/avatar 胶囊 */
export const radiiAlias = {
  card: radii.lg,         // 20 —— 实心卡片（适中圆润, 不胖圆）
  cardCompact: radii.md,  // 14 —— 紧凑卡片
  button: 18,             // 18 —— 主按钮
  buttonSquare: radii.md, // 14 —— 方按钮
  input: radii.md,        // 14
  chip: radii.pill,       // 999
  avatar: radii.pill,     // 圆形

  // --- P0 新增（引擎尺寸档对照） ---
  /** 悬浮工具条 */
  topBar: radii.toolbar,          // 22
  /** 底部悬浮 Dock / 控制底坞 */
  dock: radii.capsule,            // 32
  /** 大 Sheet / Modal 高不透明膜层 */
  sheetLarge: radii.hero,         // 32
  /** 内容层消息气泡 / 榜单行 / 房间卡 */
  content: radii.contentCard,     // 14
  /** 同心反例修正：bar 28 / padding 8 → cell 20（03 §3.2、§13.6） */
  tabBarCell: 20,
} as const;

/**
 * 引擎尺寸档单一对照（22dp 工具条 / 32dp 胶囊 / 8·10·12·14dp blur）。
 * blur 四档直接引用 glass.ts 的 BLUR_DP_BY_KIND，不在此重抄数值。
 */
export const glassGeometry = {
  toolbarRadiusDp: radii.toolbar,
  capsuleRadiusDp: radii.capsule,
  blurDp: BLUR_DP_BY_KIND,
  dockHeightDp: TAB_BAR_TARGET.height,
  dockRadiusDp: TAB_BAR_TARGET.radius,
  indicatorRadiusDp: TAB_BAR_TARGET.indicatorRadius,
} as const;
