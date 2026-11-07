// iOS 26 调色板：4 套语义 token（light / dark / inc-contrast light / inc-contrast dark）
// 命名遵循 Apple HIG 的语义色模式：bg / surface / label / separator / tint / glass.*
//
// P0 批次②依据：03 §3.1 四套色 token、§9 P0 第 3 项；02 M18（自定义色必须 4 套变体）、
// M19 / §4.3（ink 变体必须修对比度到 ≥4.5:1）、§5.1 Increase Contrast 降级矩阵。
//
// ⚠️ 明确不落地（03 §3.1 差距列 / §13.6 F 组）：
//   - GlassColors.kt 的「单一深色优先调色板」；
//   - Accent #7CA6FF 固定蓝（品牌粉只作唯一 tinted prominent 主行动）；
//   - 硬编码 Color(0xFF...) 系统色值；本文件全部走语义 token。
//
// ⚠️ 主理人裁决 C1a：usePageBackground() 的 transparent 分支承载全屏背景 bleed（02 M9），
//    合规且必须保留，禁止删除；本轮一字不改其语义。

/** 品牌 accent：保留口袋粉 #ff6f91 同时新增 iOS 26 强调色变体 */
export const accent = {
  pink: '#ff6f91',
  pinkDark: '#ff8fa8',
  pinkSoft: 'rgba(255, 111, 145, 0.16)',
  pinkOnDark: '#ff8fa8',
} as const;

/** 官方口袋48风格：白底 + 粉点缀 + 实心卡片（2026-08-15 改版）
 *  2026-09-06 用户嫌「功能选项底色太白了」+「tab 玻璃感不足」
 *  bg #F5F5F7→#ECEDF1、surface 全白 #FFFFFF→#F4F5F9（柔和卡片，非惨白）、
 *  muted/glass 系列同调:卡片白块与背景灰层次舒适,iOS 26 group 卡片观感 */
interface NeutralTokens {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  /**
   * @deprecated P0 命名清理：与 surface 同值，请改用语义 token `surface`。
   * 现有 4 处调用方（GlassCard / MemberPicker / MiniPlayerBar / ScreenHeader）属 P1–P3 范围，
   * 本轮不批量改页面，保留别名以免破坏类型；静态守卫禁止新增使用。
   */
  surfaceGlass: string;
  /** @deprecated P0 命名清理：请改用语义 token `surfaceElevated`。 */
  surfaceGlassStrong: string;
  hairline: string;
  separator: string;
  label: string;
  labelSecondary: string;
  labelTertiary: string;
  fill1: string;
  fill2: string;
  fill3: string;
  innerStroke: string;
}

const neutralLight: NeutralTokens = {
  background: '#ECEDF1',
  surface: '#F4F5F9',
  surfaceElevated: '#F4F5F9',
  surfaceMuted: '#ECEDF1',
  surfaceGlass: '#F4F5F9',
  surfaceGlassStrong: '#F4F5F9',
  hairline: 'rgba(0,0,0,0.06)',
  separator: 'rgba(60,60,67,0.14)',
  label: '#111114',
  labelSecondary: '#55555C',
  labelTertiary: '#9A9AA1',
  fill1: 'rgba(0,0,0,0.06)',
  fill2: 'rgba(0,0,0,0.05)',
  fill3: 'rgba(0,0,0,0.04)',
  innerStroke: 'rgba(0,0,0,0.06)',
};

const neutralDark: NeutralTokens = {
  background: '#0B0B0F',
  surface: '#1C1C1F',
  surfaceElevated: '#26262B',
  surfaceMuted: '#17171B',
  surfaceGlass: '#1C1C1F',
  surfaceGlassStrong: '#232327',
  hairline: 'rgba(255,255,255,0.10)',
  separator: 'rgba(84,84,88,0.40)',
  label: '#F5F5F7',
  labelSecondary: '#C9C9CE',
  labelTertiary: '#8E8E93',
  fill1: 'rgba(255,255,255,0.10)',
  fill2: 'rgba(255,255,255,0.08)',
  fill3: 'rgba(255,255,255,0.06)',
  innerStroke: 'rgba(255,255,255,0.09)',
};

/** inc-contrast light（03 §3.1）：三级文字 #4A4A52 必须 ≥4.5:1，分隔线加深 */
const neutralIncLight: NeutralTokens = {
  ...neutralLight,
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#FFFFFF',
  surfaceGlass: '#FFFFFF',
  surfaceGlassStrong: '#FFFFFF',
  hairline: 'rgba(0,0,0,0.20)',
  separator: 'rgba(0,0,0,0.28)',
  label: '#000000',
  labelSecondary: '#33333A',
  labelTertiary: '#4A4A52',
  innerStroke: 'rgba(0,0,0,0.20)',
};

/** inc-contrast dark（03 §3.1）：三级文字 #C4C4CC，分隔线提亮 */
const neutralIncDark: NeutralTokens = {
  ...neutralDark,
  background: '#000000',
  surface: '#16161A',
  surfaceElevated: '#16161A',
  surfaceMuted: '#16161A',
  surfaceGlass: '#16161A',
  surfaceGlassStrong: '#16161A',
  hairline: 'rgba(255,255,255,0.28)',
  separator: 'rgba(255,255,255,0.36)',
  label: '#FFFFFF',
  labelSecondary: '#DEDEE4',
  labelTertiary: '#C4C4CC',
  innerStroke: 'rgba(255,255,255,0.28)',
};

export const semantic = {
  success: '#34C759',
  warning: '#FF9F0A',
  danger: '#FF3B30',
  info: '#5AC8FA',
} as const;

/** 外观名（只保留 light / dark，确保既有 `palette.name === 'dark'` 判断不变） */
export type PaletteName = 'light' | 'dark';
/** 4 套色变体（02 M18 / 03 §3.1） */
export type ColorVariant = 'light' | 'dark' | 'incLight' | 'incDark';

export type Palette = NeutralTokens & typeof accent & typeof semantic & {
  name: PaletteName;
  variant: ColorVariant;
  contrast: 'normal' | 'increased';
  tint: string;
  tintSoft: string;
  /** tint 填充之上的前景色（按钮/胶囊文字） */
  onTint: string;
  /** 玻璃上的文字/符号：vibrant 语义，随底内容明暗自适应（02 M19 / §4.3） */
  glassLabel: string;
  glassLabelSecondary: string;
};

function makePalette(
  neutral: NeutralTokens,
  name: PaletteName,
  variant: ColorVariant,
  contrast: 'normal' | 'increased',
  tint: string,
  tintSoft: string,
  onTint: string,
  glassLabel: string,
  glassLabelSecondary: string,
): Palette {
  return {
    ...neutral,
    ...accent,
    ...semantic,
    name,
    variant,
    contrast,
    tint,
    tintSoft,
    onTint,
    glassLabel,
    glassLabelSecondary,
  };
}

const light = makePalette(
  neutralLight, 'light', 'light', 'normal',
  accent.pink, accent.pinkSoft, '#FFFFFF', '#111114', '#55555C',
);

const dark = makePalette(
  neutralDark, 'dark', 'dark', 'normal',
  accent.pinkOnDark, 'rgba(255,143,168,0.20)', '#FFFFFF', '#F5F5F7', '#C9C9CE',
);

/** inc-contrast light：tint #d94f73（03 §3.1） */
const incLight = makePalette(
  neutralIncLight, 'light', 'incLight', 'increased',
  '#d94f73', 'rgba(217,79,115,0.16)', '#FFFFFF', '#000000', '#33333A',
);

/** inc-contrast dark：tint #ffb0c2（03 §3.1） */
const incDark = makePalette(
  neutralIncDark, 'dark', 'incDark', 'increased',
  '#ffb0c2', 'rgba(255,176,194,0.20)', '#000000', '#FFFFFF', '#DEDEE4',
);

export const Palettes: Record<ColorVariant, Palette> = {
  light,
  dark,
  incLight,
  incDark,
};

/** 通过 useAppTheme / useResolvedTheme 选其一返回 */
import { useSettingsStore } from '../store';
import { useResolvedTheme } from '../hooks/useAppTheme';
import { useA11yStore } from '../store/a11y';

/**
 * 4 套色订阅：解析「外观 × 对比度」变体。
 * 系统 Increase Contrast 在 RN 0.81.5 无内置 AccessibilityInfo API，
 * 由 App 内 a11y 开关兜底（02 §5.1「提供 App 内开关」），系统侧见 store/a11y.ts 的启发式同步。
 */
export function useResolvedColorVariant(): ColorVariant {
  const resolved = useResolvedTheme();
  const increaseContrast = useA11yStore((state) => state.increaseContrast);
  if (!increaseContrast) return resolved;
  return resolved === 'dark' ? 'incDark' : 'incLight';
}

export function usePalette(): Palette {
  return Palettes[useResolvedColorVariant()];
}

/**
 * 页面根容器背景色：
 * - 未设置自定义背景图 → 正常不透明 palette.background
 * - 已设置背景图 → 返回 transparent，让 App 根层 ImageBackground 透出（否则会被不透明底色盖住）
 *
 * 🛑 C1a 裁决：此 transparent 分支承载全屏背景 bleed（02 M9），合规且必须保留，禁止删除。
 */
export function usePageBackground(): string {
  const hasBg = !!useSettingsStore((s) => s.settings.customBackgroundFile?.trim());
  const palette = usePalette();
  return hasBg ? 'transparent' : palette.background;
}

/** 兼容旧 Colors 引用：返回扁平 token 对象（默认 light）—— 旧 screens 不爆炸 */
export const Colors = {
  ...light,
  // 兼容旧字段（其它模块残留引用）
  bgDark: dark.background,
  darkTextPrimary: dark.label,
  darkTextSecondary: dark.labelSecondary,
  darkTextTertiary: dark.labelTertiary,
  btnSecondaryBg: light.fill3,
  btnSecondaryBgDark: dark.fill3,
};

export const DarkColors = dark;
