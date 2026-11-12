# theme-and-guard · 主题常量与守卫白名单

## 1. 必须复制的主题文件（companion `src/theme/`）
- `glass.ts` —— 四倍率 store（`useGlassStore`）+ `canBlur()` / `canLens()` / `resolveTintAlpha()` /
  `TINT_ALPHA_BASE`。dock 的 tint 唯一出口，H1 上界 0.24。
- `glassProfile.ts` —— 全部默认值常量（下表）。
- `glassDockStore.ts` —— 25 项运行时状态 + `useDockSettings()` / `useGlassScales()` / `setGlassScale()`。

## 2. glassProfile.ts 关键常量（dock 直接引用，勿内联）
```ts
export const GLASS_TINT_COLOR = { light: '#FFFFFF', dark: '#1B242B' } as const;

export const GLASS_LENS_PROFILE = {
  barRefractionDp: 5,
  barBandDp: 3,
  indicatorRefractionDp: 2.6667,   // 原版真值反算：10dp × 0.8 ÷ 3.0
  indicatorBandDp: 2.1333,         // 8dp × 0.8 ÷ 3.0
  indicatorDispersionDp: 2.6667,   // 已停用：色散基数恒等于运行时的 indicatorRefractionDp
  dispersionLevelBase: 1,
  controlRefractionDp: 8, controlBandDp: 5,
  overlayRefractionDp: 5, overlayBandDp: 3,
} as const;

export const GLASS_INDICATOR_BLUR_DP = 0;   // 指示器默认 0，叠加在已模糊 bar 之上

export const GLASS_SHAPE = { panel: 28, card: 22, control: 16, capsule: 999 } as const;

// 降级实底（!canBlur() || !canLens() 时使用）
export const GLASS_BAR_FALLBACK = { dark: 'rgba(30,31,36,0.94)', light: 'rgba(245,246,250,0.94)' } as const;
export const GLASS_INDICATOR_FALLBACK = { color: '#FFFFFF', opacity: 0.25 } as const;

// dock tab 品牌玻璃色（D7 白名单仅限本文件 + 这两个常量名）
export const GLASS_DOCK_ACTIVE = '#7CA6FF';
export const GLASS_DOCK_INACTIVE = '#9CA8BC';
```
几何默认值（来自 `GLASS_PROFILE` / `GLASS_DEBUG_DEFAULTS`）：`dockWidthScale 0.81`、`dockHeightDp 56.86`、
`dockInnerPadDp 5.36`、`dockFloatDp 15.3`、`dockRadiusDp 999`(真胶囊)。

## 3. 守卫白名单（scripts/glass-guard.js，D7 例外）
品牌色硬编码仅允许落在 `src/theme/glassProfile.ts` 的 `GLASS_DOCK_ACTIVE` / `GLASS_DOCK_INACTIVE` 两个常量：
```js
const engineHardcode = /#7CA6FF|Color\(\s*0x/i;
const brandGlassColorFile = 'src/theme/glassProfile.ts';
const brandGlassColorLine = /\bGLASS_DOCK_(?:ACTIVE|INACTIVE)\b/;
// ...
const isBrandGlassColor = rel === brandGlassColorFile && brandGlassColorLine.test(line);
if (engineHardcode.test(line) && !isBrandGlassColor) {
  problems.push('[引擎硬编码色] ... 禁止落地 Accent #7CA6FF / Color(0xFF...)（D7）');
}
```
并保留 `GLASS_BUDGET.maxContainers = 3`。整份 `scripts/glass-guard.js` + `scripts/glass-guard.baseline.json`
已随 skill `references/` 附带，直接复制即可。
