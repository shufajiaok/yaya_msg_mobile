// 全局 UI 常量（P0 第 4 项）
// 依据：03 §9 P0「去半透明卡底」/ §2.5 C1b / §13.6 F 组；02 D1 / M9 / M23。
//
// 本轮三处收口：
//  1. 删除 `card` / `cardOnImage` 两块半透明卡底（C1b：控件 / 卡片自身底板半透明违规）。
//     ⚠️ 承载全屏背景的透明容器（usePageBackground / App.tsx 根层遮罩）属 C1a，合规且保留，未动。
//  2. `tabBar` 数值并入 src/theme/glass.ts（TAB_BAR_STYLE / TAB_BAR_TARGET），此处仅保留废弃转发。
//  3. `contentScrim` 归一：唯一来源为 glass.ts 的 CONTENT_SCRIM（0.88 / 0.92 / 0.34 收敛，不删除）。

/** contentScrim 归一后的单一来源（由 glass.ts 转发，禁止在别处再定义一套） */
export { CONTENT_SCRIM as contentScrim, resolveContentScrim } from './glass';

/** @deprecated tabBar 数值已并入 src/theme/glass.ts，请改从 TAB_BAR_STYLE / TAB_BAR_TARGET 取值 */
export { TAB_BAR_STYLE as tabBar } from './glass';

export const ui = {
  colors: {
    primary: '#ff6f91',
    text: '#333333',
    muted: '#3f3f3f',
    softBg: '#fff7fb',
    pageBg: '#f6f6f6',
    // `card` / `cardOnImage`（rgba(255,255,255,0.88) / (…,0.72)）已按 C1b 删除：
    // 内容层卡片一律用 usePalette() 的实色 surface / surfaceElevated。
    border: 'rgba(230,230,230,0.95)',
    borderOnImage: 'rgba(255,255,255,0.62)',
  },
  text: {
    tabIconSize: 15,
    tabLabelSize: 12,
    tabIconLineHeight: 19,
    tabLabelLineHeight: 17,
  },
  motion: {
    // navigation/index.tsx 的 withPageMotion 全量依赖，P0 保留原值（P1 起接 motion.ts 动效档）
    tabDuration: 180,
    stackDuration: 220,
  },
};
