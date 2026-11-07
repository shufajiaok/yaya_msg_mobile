/**
 * 安全区：集中单一来源 + max 兜底（P0 第 7 项选定的分支）
 * 依据：02 M22「遵守安全区与 size classes」/ §4.2；03 §4.4 / §9 P0「集中单一来源 + max 兜底」。
 *
 * ⚠️ 本轮不解禁依赖：package.json 的 expo.autolinking.exclude 明确排除
 * `react-native-safe-area-context`，且 P0 禁止新增依赖 / 改 package.json。
 * 因此真实 native insets 仍待 P1 / Phase 2 解禁；本文件先做到：
 *   1. 单一来源：所有 insets 只由 resolveSafeAreaInsets() 计算，任何模块不得自行估算；
 *   2. max 兜底：将来注册真实 provider 时，逐边取 max(经验下限, 真实值)，
 *      保证缺失 / 异常读数不会让内容被挖孔或系统栏遮挡；
 *   3. 用 RN 内置 useWindowDimensions() 订阅尺寸 / 横竖屏变化（P0 无视觉变化）。
 *
 * 经验值（沿用原实现，逐边等价）：
 *  - Android 顶部 status bar ~24dp；iOS 顶部 44pt 下限
 *  - Android 底部 navigation bar 48dp；iOS home indicator 34pt
 *  - 左右默认 0（真实 provider 注册后由 max 兜底接管）
 */
import { useMemo } from 'react';
import { Dimensions, Platform, StatusBar, useWindowDimensions } from 'react-native';

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface WindowMetrics {
  width: number;
  height: number;
  scale: number;
  fontScale: number;
}

const IOS_TOP_FLOOR = 44;
const ANDROID_TOP_FLOOR = 24;
const IOS_HOME_INDICATOR = 34;
const ANDROID_NAV_BAR = 48;
const SIDE_FLOOR = 0;

/** 未来真实 insets 的注入点（P1 / Phase 2 解禁 react-native-safe-area-context 后调用） */
type InsetsProvider = () => Partial<SafeAreaInsets> | null | undefined;
let nativeInsetsProvider: InsetsProvider | null = null;

/**
 * 注册真实安全区来源。未注册时 resolveSafeAreaInsets 纯走经验值；
 * 注册后逐边取 max(经验下限, 真实值)，即「max 兜底」。
 */
export function registerSafeAreaInsetsProvider(provider: InsetsProvider | null): void {
  nativeInsetsProvider = provider;
}

/** 集中单一来源：唯一计算 insets 的函数 */
export function resolveSafeAreaInsets(window: WindowMetrics): SafeAreaInsets {
  const isIOS = Platform.OS === 'ios';
  const statusBarHeight = Number(StatusBar.currentHeight) || 0;
  const topFloor = isIOS ? IOS_TOP_FLOOR : ANDROID_TOP_FLOOR;
  const bottomFloor = isIOS ? IOS_HOME_INDICATOR : ANDROID_NAV_BAR;

  const native = nativeInsetsProvider ? nativeInsetsProvider() : null;
  const nativeTop = Number(native?.top) || 0;
  const nativeBottom = Number(native?.bottom) || 0;
  const nativeLeft = Number(native?.left) || 0;
  const nativeRight = Number(native?.right) || 0;

  // window 参数保留供将来按横竖屏 / 尺寸类调整经验下限；P0 不改变现有数值。
  void window;

  return {
    top: Math.max(topFloor, statusBarHeight, nativeTop),
    bottom: Math.max(bottomFloor, nativeBottom),
    left: Math.max(SIDE_FLOOR, nativeLeft),
    right: Math.max(SIDE_FLOOR, nativeRight),
  };
}

/** 非 React 场景读取（ Dimensions.get('window') 为同一集中来源的入口） */
export function getSafeAreaInsets(): SafeAreaInsets {
  return resolveSafeAreaInsets(Dimensions.get('window') as WindowMetrics);
}

/** React hook：useWindowDimensions 订阅尺寸变化，取值仍走单一来源 */
export function useSafeAreaInsets(): SafeAreaInsets {
  const { width, height, scale, fontScale } = useWindowDimensions();
  return useMemo(
    () => resolveSafeAreaInsets({ width, height, scale, fontScale }),
    [width, height, scale, fontScale],
  );
}
