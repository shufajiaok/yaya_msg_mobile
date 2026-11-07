// 死代码兼容层（P0 第 8 项前半）
// 依据：03 §9 P0「死代码删除或改从 glass.ts 取值」/ §3.5 禁止内联清单 / §3.2 同心公式。
//
// 全 src 无 import 本文件（mainTabBarStyle 0 调用方）。原实现内联了
// 0.96 / 0.94 / 0.76 / 0.72 四组 rgba 玻璃底色 + ui.tabBar.radius，
// 与「所有玻璃数值只能来自 src/theme/glass.ts」冲突。本轮保留文件与函数签名（避免误删
// 造成 import 悬空），把全部取值改为 glass.ts 单一来源，内联 rgba 全部清除。
// P1 可整体删除本文件：AppTabBar 将直接消费 resolveGlass('tabs')。

import {
  EDGE_HIGHLIGHT,
  TAB_BAR_STYLE,
  resolveContentScrim,
  type ScrimSpec,
} from '../theme/glass';

/** 把归一 contentScrim 的 {color, opacity} 合成 8 位十六进制色（RN 支持），避免内联 rgba */
function withAlpha(hexColor: string, alpha: number): string {
  const clamped = Math.min(1, Math.max(0, alpha));
  const channel = Math.round(clamped * 255).toString(16).padStart(2, '0').toUpperCase();
  return `${hexColor}${channel}`;
}

/** 归一压暗：hasBackground 时按导航档，否则按根层档；深浅色由同一 ScrimSpec 决定 */
function resolveScrimColor(hasBackground: boolean, isDark: boolean): string {
  const scrim: ScrimSpec = resolveContentScrim(
    isDark ? 'dark' : 'light',
    hasBackground ? 'nav' : 'root',
  );
  return withAlpha(scrim.color, scrim.opacity);
}

/**
 * @deprecated 死代码（0 调用方）。玻璃 / 压暗 / 边缘高光数值一律来自 src/theme/glass.ts。
 * CONTENT_SCRIM.legacyInlineValues 登记了原 0.96/0.94/0.76/0.72 旧值（归一，不删除语义）。
 */
export function mainTabBarStyle(hasBackground: boolean, isDark = false) {
  return {
    position: 'absolute' as const,
    left: TAB_BAR_STYLE.horizontalInset,
    right: TAB_BAR_STYLE.horizontalInset,
    bottom: TAB_BAR_STYLE.bottom,
    height: TAB_BAR_STYLE.height,
    paddingTop: 7,
    paddingBottom: 11,
    paddingHorizontal: 4,
    borderRadius: TAB_BAR_STYLE.radius,
    overflow: 'hidden' as const,
    backgroundColor: resolveScrimColor(hasBackground, isDark),
    borderWidth: EDGE_HIGHLIGHT.widthDp,
    borderTopWidth: EDGE_HIGHLIGHT.widthDp,
    borderColor: withAlpha(EDGE_HIGHLIGHT.color, EDGE_HIGHLIGHT.alpha),
    elevation: 0,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    alignSelf: 'stretch' as const,
  };
}
