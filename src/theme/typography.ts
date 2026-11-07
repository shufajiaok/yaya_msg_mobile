// iOS 26 排版梯度（基于 SF Pro / 中文 PingFang SC 回退）
// 大标题 + 系统字体梯度，字号与行高按 Apple HIG 节奏给到 round numbers。
// 全局字体跟随系统：iOS 中文即苹方（系统自带）；Android 用系统默认字体（不打包自定义字体）。
//
// P0 第 5 项依据：02 §4.1（最小 11sp 官方硬值 / 字重白名单 400–700 / AX1 44pt / 行距 52）；
//                 03 §3.3（英雄文字 31sp / 700 / lineHeight 38 / 每屏 1 处；引擎 10sp 必须提到 ≥11sp）；
//                 04 §2.3（引擎硬编码 10sp 违规）。
// 断言为「硬约束」：任何字号 < 11sp（尤其引擎的 10sp）直接抛错，禁止照搬。
import { Platform, TextStyle } from 'react-native';

const systemFamily = Platform.select({
  ios: 'System',
  android: undefined,
  default: 'System',
});
const roundedFamily = Platform.select({
  ios: 'System',
  android: undefined,
  default: 'System',
});

export const fontFamily = {
  system: systemFamily,
  rounded: roundedFamily,
};

/** 官方硬值：任何文字（含弹幕角标、时间戳、榜单序号、tab 标签）≥ 11sp；禁止 10sp */
export const MIN_FONT_SIZE_SP = 11;

/** 官方硬值：字重白名单，禁用 100–300 与 800/900 */
export const ALLOWED_FONT_WEIGHTS = ['400', '500', '600', '700'] as const;
export type AllowedFontWeight = (typeof ALLOWED_FONT_WEIGHTS)[number];

/** Dynamic Type 全档参数（03 §3.3 / 02 §4.1 AX1） */
export const DYNAMIC_TYPE = {
  heroFontSizeSp: 31,
  heroLineHeightSp: 38,
  heroMaxFontSizeSp: 44,
  heroMaxLineHeightSp: 52,
  bodyFontSizeSp: 17,
  bodyMaxFontSizeSp: 28,
  /** fontScale ≥ 1.3 时房间头 / 麦位行 / 榜单行 / 输入区横排改纵向堆叠 */
  stackLayoutFontScale: 1.3,
} as const;

/**
 * 字号最小 11sp 断言。P0 起所有字号 token 与 Dynamic Type 计算都必须过此函数，
 * 引擎 10sp（GlassBottomTabs 标签 / GlassDetailBar 动作标签）属明确禁止项。
 */
export function assertFontSizeSp(size: number): number {
  if (!Number.isFinite(size) || size < MIN_FONT_SIZE_SP) {
    throw new Error(
      `[typography] 字号 ${String(size)}sp 违反 02 §4.1 官方最小 11sp 硬值（禁止 10sp）`,
    );
  }
  return size;
}

/** 字重白名单断言：仅 400 / 500 / 600 / 700（现状 ScreenHeader 的 800 由 P1 收敛） */
export function assertFontWeight(weight: TextStyle['fontWeight'] | string | number): string {
  const normalized = String(weight);
  if (!(ALLOWED_FONT_WEIGHTS as readonly string[]).includes(normalized)) {
    throw new Error(
      `[typography] 字重 ${normalized} 不在白名单 400/500/600/700 内（02 §4.1 / 03 §3.3）`,
    );
  }
  return normalized;
}

/** Dynamic Type 缩放：跟随 fontScale，钳在 [11sp, maxSp]，英雄文字最大 44sp、正文 28sp */
export function scaleFontSize(baseSp: number, fontScale: number, maxSp: number): number {
  const safeBase = assertFontSizeSp(baseSp);
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const cap = Number.isFinite(maxSp) ? Math.max(MIN_FONT_SIZE_SP, maxSp) : Number.POSITIVE_INFINITY;
  return Math.max(MIN_FONT_SIZE_SP, Math.min(cap, safeBase * scale));
}

/** 字体梯度（字号 / 行高 / 字重 / 用途） */
export const typography = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' as TextStyle['fontWeight'], letterSpacing: 0.37 },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700' as TextStyle['fontWeight'], letterSpacing: 0.36 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' as TextStyle['fontWeight'], letterSpacing: 0.35 },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600' as TextStyle['fontWeight'], letterSpacing: 0.38 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' as TextStyle['fontWeight'], letterSpacing: -0.41 },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' as TextStyle['fontWeight'], letterSpacing: -0.41 },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' as TextStyle['fontWeight'], letterSpacing: -0.32 },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' as TextStyle['fontWeight'], letterSpacing: -0.24 },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' as TextStyle['fontWeight'], letterSpacing: -0.08 },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: '400' as TextStyle['fontWeight'], letterSpacing: 0 },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: '400' as TextStyle['fontWeight'], letterSpacing: 0.07 },

  // --- P0 新增：英雄文字（官方 Large Title 强调变体，每屏 1 处、左对齐） ---
  hero: {
    fontSize: DYNAMIC_TYPE.heroFontSizeSp,
    lineHeight: DYNAMIC_TYPE.heroLineHeightSp,
    fontWeight: '700' as TextStyle['fontWeight'],
    letterSpacing: 0.37,
    textAlign: 'left' as const,
  },
  /** AX1 最大辅助字号档（44sp / 行距 52），由 useDynamicType() 切换 */
  heroMax: {
    fontSize: DYNAMIC_TYPE.heroMaxFontSizeSp,
    lineHeight: DYNAMIC_TYPE.heroMaxLineHeightSp,
    fontWeight: '700' as TextStyle['fontWeight'],
    letterSpacing: 0.37,
    textAlign: 'left' as const,
  },
} as const;

export type TypographyToken = keyof typeof typography;

/** 模块加载即校验全部 token：字号 ≥11sp、字重在白名单内（禁止残留 10sp / 800） */
(Object.keys(typography) as TypographyToken[]).forEach((token) => {
  assertFontSizeSp(typography[token].fontSize);
  assertFontWeight(typography[token].fontWeight);
});
