/**
 * AppTabBar · it.17 App 底栏（GlassKit dock：连续曲率 + 指示器透镜 + 参数全量接 store）
 *
 * 视觉 / 交互以 GlassTestScreen dock 渲染段为唯一模板。it.17 的核心变化：
 * **本组件不再有任何写死的玻璃 / 几何数值**，全部从 `glassDockStore` 与
 * `useGlassScales()` 读取 —— 实验页拖滑块，本体底栏实时联动（「同步统一调节」）。
 *
 * 几何（全部来自 store，默认值来自 glassProfile.ts）：
 * - frame：宽 = 屏宽 × dockWidthScale(0.81)、高 = dockHeightDp(56.86)、
 *   圆角 = min(dockRadiusDp, 高/2)（默认 999 → 真胶囊）；
 *   **不加 overflow:'hidden'**（it.14 结论：圆弧父 View 的 clip 会先裁掉连续曲率
 *   端帽的外扩部分，加回去会让端帽被切平）。
 * - 内缩 = dockInnerPadDp(5.36)、底部留白 = dockFloatDp(15.3)。
 *
 * 玻璃（与实验页 dock 同一套派生逻辑，保证「实验页所见 = 本体所得」）：
 * - bar：capturable（指示器的采集源）+ capsuleContinuous（n=3 连续曲率端帽）、
 *   blurDp 10 × blurScale、tintAlpha = resolveTintAlpha(0.10, tintScale)（H1 上界 0.24）、
 *   refraction 5dp × density、带高 3dp × density（native 再乘 lensScale 一次）、
 *   dispersion 0、highlightScale / glow 三倍率来自 store。
 * - 指示器：it.25 起 backdropTag 主 tag 指 bar 玻璃，另加 blurBackdropTag /
 *   iconBackdropTag 双源，native 双源合成后喂 lens（只糊背景、图标保持清晰
 *   且仍被放大/折射）。
 *   **it.26 改口径**：blurBackdropTag 不再指 bar 玻璃（bar 的快照是软件画布回放，
 *   只有 1/6 降采样近似、无真高斯，见 drawBlurredLayer 的 isHardwareAccelerated
 *   门槛），改为指 **App 级 backdrop**（bar 下方真实内容、未模糊）⇒ bar 一次高斯
 *   + 指示器再一次高斯 = 真正的「两层高斯串行叠加」。指示器 blurDp 随之传
 *   **叠加半径** √(barBlurDp² + indicatorBlurDp²)（两次串行高斯 σ 合成公式），
 *   故 indicatorBlurDp=0 时指示器与 bar 同糊、拉满时严格比 bar 更糊；
 *   内缩 = dockInnerPadDp、capsuleContinuous、indicatorBoostAlpha
 *   0.05（Kotlin GlassKitKt.java:1434-1435,1451 的 White@0.05）、highlightScale 0
 *   （INDICATOR 不画 18dp 顶缘，GlassLevel.java:37）、
 *   blur / refraction / band 三项 **it.22 起取 store（实验页滑块实时可调）**，
 *   默认 0 / 0.5dp / 4.0dp；dispersion 基数恒等于 refraction 基数。
 *   透镜量纲：`dp × density`，native 再乘 lensScale 一次。
 *   liveBackdrop = true ⇒ 每帧（native 16ms 节流 ≈60fps 上限）重采双源，不会停在旧快照。
 *   spring 目标 x = 内缩 + activeIndex × tabWidth（绝对定位，it.10 漂移修复口径，
 *   绝不用累加增量）。
 *
 * it.17 撤销卡纸底衬（用户 2026-11-08：「确实有一层卡纸」→ 要求透视玻璃）：
 * 已删除 it.16-fix1 的 `GlassKitBackdrop` 内层渲染与 barBaseRef / barBaseTag /
 * onBarBaseLayout，bar 的 backdropTag 回到 `useBackdropTag()`（App 级采集源）。
 * `GLASS_BAR_SURFACE` 常量保留在 glassProfile.ts 并注明恢复方式。
 *
 * tabs：每 tab flex:1 居中。it.19 按真机库源码（GlassKitKt.java GlassBottomTabs）
 * 精确对齐：图标 **20dp**、选中 Bold / 未选中 Normal、**删除 it.10 自创的选中
 * spring pop**（原版零按下反馈）。标签维持 11sp（真值 10sp，但违反「最小 11sp」
 * 硬规则 02 §4.1）；选中/未选中色维持 palette（真值 #7CA6FF/#9CA8BC，但违反
 * 守卫 D7「禁止落地 Accent」）—— 两项差异待用户定夺。
 *
 * 降级（!canBlur() || !canLens()）：bar 用半透明实底、指示器退化为半透明实底
 * View，不渲染任何 GlassKitView。实底色值来自 glassProfile.ts（theme 目录豁免
 * inline-rgba 基线），本文件零内联 rgba。
 *
 * 契约：AppTabBarProps（items / activeKey / onSelect）与 MCI 导出签名不变，
 * src/navigation/index.tsx 零改动。tab 选中态仍由 props 的 activeKey 驱动
 * （导航真相源），**不**用 store 的 dockSelected 覆盖（后者只给实验页对齐测试用）。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  findNodeHandle,
  PanResponder,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { usePalette, motion } from '../theme';
import { typography } from '../theme/typography';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import GlassKitView from '../native/GlassKitView';
import GlassKitBackdrop from '../native/GlassKitBackdrop';
import { useBackdropTag } from '../native/backdropTagStore';
import { canBlur, canLens, resolveTintAlpha, TINT_ALPHA_BASE } from '../theme/glass';
import {
  GLASS_BAR_FALLBACK,
  GLASS_DOCK_ACTIVE,
  GLASS_DOCK_INACTIVE,
  GLASS_INDICATOR_FALLBACK,
  GLASS_LENS_PROFILE,
  GLASS_TINT_COLOR,
} from '../theme/glassProfile';
import { useDockSettings, useGlassScales } from '../theme/glassDockStore';

export interface TabBarItem {
  key: string;
  label: string;
  icon: (props: { color: string; size: number }) => React.ReactNode;
}

export interface AppTabBarProps {
  items: TabBarItem[];
  activeKey: string;
  onSelect: (key: string) => void;
}

/** dock 指示器弹簧：spring(0.85, 380) → RN damping 0.85×2×√380 ≈ 33.14（与测试页同源）。 */
const DOCK_SPRING = { stiffness: 380, damping: 33.14, mass: 1 } as const;

/**
 * it.20 P0-回退：dock 外投影与轮廓光**全部撤销**（用户 2026-11-09 21:45 裁决）。
 *
 * 撤销原因（用户原话）：「投影是你接手后擅自改动的，为什么会影响到之前的尺寸？
 * 只要保留现在的新曲率圆角就行」—— 32dp inset 外扩是为了让 24dp 模糊的影子不被
 * Android View 边界裁掉，代价是整个 dock 的宿主矩形被撑到本体 1.6 倍，布局基线与
 * 触摸区都跟着漂。它不该以「改几何」为代价，直接撤掉。
 *
 * 保留：`capsuleContinuous` 的 Kyant0 连续曲率胶囊圆角（用户明确要求保留）。
 * 撤销：`GlassKitRimView`（轮廓光，it.19 新增）、`glassInsetDp` 外扩、外投影。
 */

/** bar 的基准模糊半径 dp（Kotlin BAR 档 = 10dp，最终半径 = 10 × blurScale × density）。 */
const BAR_BLUR_DP = 10;
/** 指示器专属提亮 alpha（Kotlin GlassKitKt.java:1434-1435,1451，无对应滑块）。 */
const INDICATOR_BOOST_ALPHA = 0.05;

/** 单个 tab：图标 + label；active 时图标 spring pop（保留替换前实现）。 */
function TabCell({
  item,
  active,
  onSelect,
}: {
  item: TabBarItem;
  active: boolean;
  onSelect: () => void;
}) {
  const palette = usePalette();
  // it.19（用户 2026-11-09 裁决「只放开颜色」）：深色主题取原版 glasskit 库的
  // 品牌玻璃色 #7CA6FF / #9CA8BC；浅色主题仍走 palette（库色板写死深色，
  // #9CA8BC 在浅底上对比度不足）。
  const useBrandColor = palette.name === 'dark';
  const activeColor = useBrandColor ? GLASS_DOCK_ACTIVE : palette.tint;
  const inactiveColor = useBrandColor ? GLASS_DOCK_INACTIVE : palette.labelSecondary;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      hitSlop={6}
      onPress={onSelect}
      style={styles.cell}
    >
      {/*
        it.19：删除 it.10 自创的「选中 spring pop」（0.92→1）。
        原版 tab cell 是 clickable(indication=null)，**零按下反馈、零选中动画**——
        图标 20dp（只限高）+ 标签 10sp，状态变化只靠颜色。
      */}
      <View style={styles.cellIcon}>
        {item.icon({ color: active ? activeColor : inactiveColor, size: 20 })}
      </View>
      <Text
        style={[
          typography.caption2,
          styles.cellLabel,
          {
            color: active ? activeColor : inactiveColor,
            // 真值：选中 Bold(700) / 未选中 Normal(400)
            fontWeight: active ? '700' : '400',
          },
        ]}
      >
        {item.label}
      </Text>
    </Pressable>
  );
}

export function AppTabBar({ items, activeKey, onSelect }: AppTabBarProps) {
  const palette = usePalette();
  const isDark = palette.name === 'dark';
  // App 级 backdrop 容器 tag（App.tsx 经模块级 store 广播；未就绪时原生走兜底底色）。
  const backdropTag = useBackdropTag();
  // 四倍率实时值（订阅收敛在 .ts，守卫 glass-api-access 只对 .tsx 计数）。
  const { blurScale, tintScale, glowScale } = useGlassScales();
  // 25 项可调参数（开关 / 几何 / 高光 / 指示器 / 扩展调试）：与实验页同一份 store。
  const {
    blurEnabled,
    forceDownsample,
    glassOnGlass,
    chromaticEnabled,
    depthEffect,
    vibrancyEnabled,
    dockWidthScale,
    dockHeightDp,
    dockInnerPadDp,
    dockFloatDp,
    dockRadiusDp,
    highlightScale,
    glowAlpha,
    glowWidth,
    glowBottom,
    dispersionLevel,
    indicatorBlurDp,
    indicatorRefractionDp,
    indicatorBandDp,
  } = useDockSettings();

  const winWidth = useWindowDimensions().width;

  // 降级：无模糊能力（API<31）或无透镜能力（API<33）时整条 dock 退实底。
  const degraded = !canBlur() || !canLens();

  const barGlassRef = useRef<any>(null);
  const [barGlassTag, setBarGlassTag] = useState<number | undefined>(undefined);

  /**
   * it.17-fix1：bar 采集源 tag 的 ref callback 主路径（onLayout 保留为兜底）。
   *
   * 只在 onLayout 单点取 findNodeHandle 时，bar 若重新挂载（导航切换 / 重渲染导致
   * 原生实例 tag 变化）而 layout 不再触发，barGlassTag 会一直停在旧 tag ⇒ 指示器
   * 的 backdropTag 指向已失效视图，采集不到 dock 本体，跌回引擎兜底色。
   * ref callback 在每次挂载/卸载同步触发，必然拿到当前实例。
   */
  const attachBarGlass = useCallback((node: any) => {
    barGlassRef.current = node;
    if (node == null) return;
    const handle = findNodeHandle(node);
    if (handle != null) setBarGlassTag(handle);
  }, []);
  const [dockWidth, setDockWidth] = useState(0);

  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.key === activeKey),
  );

  // —— 几何（全部 store 驱动）——
  const innerPad = dockInnerPadDp;
  const frameHeight = dockHeightDp;
  const frameWidth = Math.round(winWidth * dockWidthScale);
  // frame 的圆角钳到高的一半（真胶囊）；999 默认值即取到半高。
  const frameRadius = Math.min(dockRadiusDp, frameHeight / 2);
  const tabWidth =
    dockWidth > 0 && items.length > 0 ? (dockWidth - innerPad * 2) / items.length : 0;
  const dockIndicatorX = useRef(new Animated.Value(innerPad)).current;

  // —— 玻璃派生值（与实验页 dock 段同一套公式）——
  // tint：resolveTintAlpha 是 glass.ts 的 H1 唯一出口（0.10 × tintScale，≤0.24；
  // it.19 P0-5：上界 0.12 → 0.24，对齐原版 GlassSurfaceKt.java:317 的 0.24f）。
  // 原生侧最终 alpha = min(tintAlpha × tintScale, 0.24)＝若再传 tintScale 会二次乘算，
  // 故显式传 tintScale={1}，让 JS 的 resolveTintAlpha 成为唯一一次乘算。
  const barTintAlpha = resolveTintAlpha(TINT_ALPHA_BASE, tintScale);
  /**
   * it.22 指示器 blur / 折射 / 带高**全部解除硬锁**，改取 store（用户 2026-11-09：
   * 「原版锁死指示器折射是因为调试好跑了，你不要盲目锁，我还要调试」）。
   *
   * it.23 修掉两处语义错位（用户：「依旧是最小模糊状态，不受滑块调节；调 bar 的
   * 模糊也不影响指示器」）：
   * ① 默认值回到原版真值（blur 0 / refraction 2.6667 / band 2.1333 =
   *    `GlassLevel.INDICATOR` 的 0 / 8 / 10 dp × lockedRefraction 0.8 ÷ lensScale 3）。
   *    it.21 那版 0.5 / 4.0 位移只有 5px，胶囊就是 bar 的 1:1 复制（挖洞观感来源）。
   * ② 指示器显式 `blurScale={1}`（见 JSX），不再被全局「模糊」倍率隐式相乘 —— 默认
   *    0 时乘积恒为 0，这才是「拖什么都没有反应」的真正原因。
   *
   * 量纲口径不变：JS 只做 dp × density，lensScale 由 native 乘一次。色散基数**恒等于**
   * 折射基数（`dispK = dispersionPx / refractionPx` 必须等于色散滑块本身）：折射变、
   * 色散必须同步变，否则 dispK 会随折射滑块漂移。
   */
  const density = PixelRatio.get();
  const barRefractionPx = GLASS_LENS_PROFILE.barRefractionDp * density;
  const barLensBandPx = GLASS_LENS_PROFILE.barBandDp * density;
  const indicatorRefractionPx = indicatorRefractionDp * density;
  const indicatorLensBandPx = indicatorBandDp * density;
  const indicatorDispersionPx =
    indicatorRefractionDp * density * (dispersionLevel / GLASS_LENS_PROFILE.dispersionLevelBase);

  /**
   * it.26 指示器模糊 = **叠加在 bar 之上**（用户实测：「bar 拉满、指示器最低」时
   * 指示器几乎无模糊，没有叠加观感）。
   *
   * 根因：it.25 的 blurBackdropTag 指 bar 玻璃，靠 replayFrameCache 回放 bar 的屏幕帧；
   * 但快照是在 `Canvas(frameCacheBitmap)` 软画布上重跑的，drawBlurredLayer 的真高斯
   * 分支要求 `canvas.isHardwareAccelerated`，软画布只能走 1/6 降采样近似 ⇒ 指示器
   * 拿到的背景本身就只弱糊，blur=0 时看着「几乎无模糊」。
   *
   * 改法（两次高斯串行叠加）：blurBackdropTag 改指 App 级 backdrop（未模糊的真实
   * 背景），指示器的 blurDp 传**叠加半径**。两次串行高斯的合成标准差
   * σ = √(σ₁² + σ₂²)，故：
   *   barBlurDp = BAR_BLUR_DP × blurScale（bar 档的实际 dp 半径）
   *   indicatorOverlayBlurDp = √(barBlurDp² + indicatorBlurDp²)
   * ⇒ indicatorBlurDp = 0 时指示器与 bar 同糊（不做二次弱化），拉满时严格比 bar 更糊。
   * 与 it.23 不冲突：指示器仍 `blurScale={1}`，全局「模糊」只通过 barBlurDp 进这条
   * 公式一次，不会被二次相乘。
   */
  const barBlurDp = BAR_BLUR_DP * blurScale;
  const indicatorOverlayBlurDp = Math.sqrt(
    barBlurDp * barBlurDp + indicatorBlurDp * indicatorBlurDp,
  );

  // 指示器只做「绝对目标 x」的 spring，不累加增量（it.10 漂移根因）。
  useEffect(() => {
    if (tabWidth <= 0) return;
    Animated.spring(dockIndicatorX, {
      toValue: innerPad + activeIndex * tabWidth,
      ...DOCK_SPRING,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, tabWidth, innerPad, dockIndicatorX]);

  const onBarLayout = () => {
    const handle = findNodeHandle(barGlassRef.current);
    if (handle != null) setBarGlassTag(handle);
  };

  /**
   * it.25 双纹理分流：把 it.21 的「复合采集层」拆成两个互不污染的采集源。
   *
   * 根因（用户实测）：指示器把整棵 [bar 玻璃 + 图标文字] 子树录进一张纹理，
   * `drawLensLayer` 的前置高斯把图标也卷积糊掉，而 `:2006` 的满矩形 lens 输出
   * 又把屏幕上那份清晰图标盖住 ⇒ 胶囊覆盖的那个 tab 图标发糊。
   *
   * 分流后：
   * ① 背景源 = **App 级 backdrop**（it.26 起；it.25 曾指 bar 玻璃）：未模糊的真实
   *    背景，native 对这条纹理做唯一一次 GPU 高斯，半径 = 叠加半径
   *    √(barBlurDp² + indicatorBlurDp²)，与 bar 自己那次高斯串行叠加。
   *    `barGlassTag` 仍作 backdropTag 保留（双源未就绪时的回退锚点）。
   * ② `iconLayerTag`（= attachIconLayer，新的 GlassKitBackdrop）只包
   *    `dockBody`（tabsRow / TabCell），非 degraded 时背景 **transparent**，
   *    是**透明底图标源**；native 以 SRC_OVER 覆盖到模糊背景之上，
   *    图标不透明像素覆盖、透明像素保留背景 ⇒ 图标永不进卷积。
   * ③ 两张纹理合成后一起喂 lens（单 uBlurred 约束，不改 AGSL）：
   *    lens 折射放大的是「背景糊 + 图标清晰」，it.23 的放大/折射效果保留。
   *
   * 结构约束（顺序不能改）：
   * - 两层都在**外层 excludeFromCapture 容器内** ⇒ 不进入 App 级采集纹理；
   * - bar 玻璃在图标层**之前**（压在图标下方，视觉层级不变）；
   * - 指示器在两层**之后**（同级、其后）⇒ 采不到自己上一帧（无拖影），
   *   且绘制顺序压在图标上方（放大镜观感）；
   * - `panResponder.panHandlers` 仍挂在 dockBody 上，触摸命中链逐位不动。
   */
  const attachIconLayer = useCallback((node: any) => {
    if (node == null) return;
    const handle = findNodeHandle(node);
    if (handle != null) setIconLayerTag(handle);
  }, []);
  const [iconLayerTag, setIconLayerTag] = useState<number | undefined>(undefined);

  const onFrameLayout = (evt: LayoutChangeEvent) => {
    setDockWidth(evt.nativeEvent.layout.width);
  };

  // 指示器真实渲染条件：有透镜能力 + 玻璃叠玻璃开关打开 + 双采集源（纯背景 / 图标）都就绪。
  const showIndicatorGlass = !degraded && glassOnGlass && barGlassTag != null && iconLayerTag != null;

  /**
   * it.21 指示器可拖动（用户 2026-11-09：「改成可以滑动指示胶囊，而不是只能点按」）。
   *
   * 手感对齐 iOS 分段控件：
   * - 只在「明显横向」的手势上接管（|dx| > 6 且 |dx| > |dy|）⇒ 页面纵向滚动不受影响；
   * - 接管瞬间 stopAnimation 取当前动画值为起点（弹簧未收敛时不会跳变）；
   * - 拖动期间 setValue 跟手，松手取最近 tab 吸附并回调 onSelect；
   * - `onStartShouldSetPanResponder = false` ⇒ 轻点仍由 tab 的 Pressable 处理，
   *   手势层不会吃掉点击。
   */
  const dragOriginX = useRef(0);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          tabWidth > 0 &&
          Math.abs(gesture.dx) > 6 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: () => {
          dockIndicatorX.stopAnimation((value: number) => {
            dragOriginX.current = value;
          });
        },
        onPanResponderMove: (_evt, gesture) => {
          if (tabWidth <= 0) return;
          const min = innerPad;
          const max = innerPad + (items.length - 1) * tabWidth;
          dockIndicatorX.setValue(Math.min(max, Math.max(min, dragOriginX.current + gesture.dx)));
        },
        onPanResponderRelease: (_evt, gesture) => {
          if (tabWidth <= 0) return;
          const raw = (dragOriginX.current + gesture.dx - innerPad) / tabWidth;
          const index = Math.min(items.length - 1, Math.max(0, Math.round(raw)));
          onSelect(items[index].key);
          Animated.spring(dockIndicatorX, {
            toValue: innerPad + index * tabWidth,
            ...DOCK_SPRING,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () => {
          // 手势被上层（如页面滚动）抢走：回到当前选中 tab，不留半途位置。
          Animated.spring(dockIndicatorX, {
            toValue: innerPad + activeIndex * tabWidth,
            ...DOCK_SPRING,
            useNativeDriver: true,
          }).start();
        },
      }),
    [tabWidth, innerPad, items, activeIndex, onSelect, dockIndicatorX],
  );

  /**
   * it.19 P0-2：dock bar 外投影的内缩环带（dp）。
   * 32dp = 24dp 模糊半径 + 4dp 下移 + 4dp 余量（24dp 会切掉约 35% 尾部、边缘突然消失）。
   *
   * ⚠️ 补偿全部写在 **frame 层**：frame 尺寸 +2×inset、内容层 absolute 内缩 inset、
   * outer 的 paddingBottom 同步 −inset（否则 dock 会整体上移 inset）。
   * `dockWidth`（onLayout 在内容层量）→ `tabWidth` → 弹簧目标 x **全部不动**。
   */
  return (
    <View pointerEvents="box-none" style={[styles.outer, { paddingBottom: dockFloatDp }]}>
      <View
        pointerEvents="box-none"
        style={[
          styles.frame,
          {
            width: frameWidth,
            height: frameHeight,
            alignSelf: 'center',
          },
        ]}
      >
        {/* bar 玻璃层：capturable = 保留「玻璃叠玻璃」被采集能力（it.26 起指示器的
            模糊背景源已改指 App 级 backdrop，bar 仍作 backdropTag 回退锚点）。
            it.17 起 backdropTag 回到 App 级采集源 ⇒ 透视玻璃（不再是卡纸底衬）。 */}
        {/* it.18 采集排除子树：dock（bar 玻璃 + 指示器 + 图标）整体不进入 App 级
            backdrop 的采集纹理 ⇒ bar 采到的是 dock **下方**的真实内容：
            ① 透视实时背景 ② 图标/文字不会被自己的透镜折射（旧行为是自采样：
            bar 采 App backdrop 时把自己的图标与上一帧玻璃烘进纹理）。
            注意：指示器采集 App backdrop（目标在本容器之外）时，本容器同样被排除 ⇒
            指示器也采不到自己与 bar，玻璃叠玻璃的叠加语义不受影响。 */}
        <GlassKitBackdrop excludeFromCapture style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {/* it.25 ① bar 玻璃：叶子 GlassKitView，不含任何图标/文字。
            capturable + liveBackdrop ⇒ 可被下游采集、且始终采当前背景（不停在首帧）。
            it.26：指示器模糊的背景源已改为 App 级 backdrop，本视图的 blur 只决定
            bar 自己的观感（指示器的叠加半径由 JS 侧 √(barBlurDp² + 滑块²) 算出）。 */}
        {!degraded && (
          <GlassKitView
            ref={attachBarGlass}
            style={StyleSheet.absoluteFill}
            onLayout={onBarLayout}
            backdropTag={backdropTag}
            capturable={true}
            liveBackdrop={true}
            blurDp={BAR_BLUR_DP}
            blurScale={blurScale}
            tintAlpha={barTintAlpha}
            tintScale={1}
            tintColor={isDark ? GLASS_TINT_COLOR.dark : GLASS_TINT_COLOR.light}
            cornerRadiusDp={dockRadiusDp}
            capsuleContinuous={true}
            refractionPx={barRefractionPx}
            lensBandPx={barLensBandPx}
            dispersionPx={0}
            highlightScale={highlightScale}
            glowScale={glowScale}
            glowAlphaScale={glowAlpha}
            glowWidthScale={glowWidth}
            glowBottomScale={glowBottom}
            chromaticEnabled={chromaticEnabled}
            depthEffect={depthEffect}
            vibrancyEnabled={vibrancyEnabled}
            blurEnabled={blurEnabled}
            forceDownsample={forceDownsample}
          />
        )}

        {/* it.25 ② 图标采集源：只含 dockBody（tabsRow / TabCell），非 degraded
            背景为 transparent。native 采到透明底图标，以 SRC_OVER 覆盖到
            「模糊背景」之上：不透明像素覆盖、透明像素保留背景。 */}
        <GlassKitBackdrop
          ref={attachIconLayer}
          style={StyleSheet.absoluteFill}
          pointerEvents="box-none"
        >
        {/* it.20：内容层 == 本体矩形（投影撤销后不再有 inset 环带）。 */}
        <View
          style={[
            styles.dockBody,
            {
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              borderRadius: frameRadius,
              backgroundColor: degraded
                ? isDark
                  ? GLASS_BAR_FALLBACK.dark
                  : GLASS_BAR_FALLBACK.light
                : 'transparent',
            },
          ]}
          onLayout={onFrameLayout}
          {...panResponder.panHandlers}
        >

        {/* tabs：flex:1 居中，padding = 内缩，与指示器 track 同宽同中心 */}
        <View style={[styles.tabsRow, { padding: innerPad }]} pointerEvents="box-none">
          {items.map((item) => (
            <TabCell
              key={item.key}
              item={item}
              active={item.key === activeKey}
              onSelect={() => onSelect(item.key)}
            />
          ))}
        </View>

        {/* it.20：轮廓光（GlassKitRimView）已撤销 —— 用户 2026-11-09 裁决
            「高光只删除你接手以后自己添加的部分」。玻璃自带的 highlightScale /
            glassScale 顶缘高光（it.19 之前就有）保留，仍由上面 GlassKitView 的
            highlightScale / glowScale 三个倍率控制。 */}
        </View>{/* /it.20 内容层（== 本体矩形） */}
        </GlassKitBackdrop>{/* /it.25 图标采集层（透明底，仅图标文字） */}

        {/* it.25 指示器：位置在两层**之后**（压住图标），双采集源分别指向
            ① App 级背景（it.26 起，未模糊的真实背景）② 透明底图标层。
            ① 绘制顺序 ⇒ 胶囊盖在图标上方，图标经透镜放大/折射（原版观感）；
            ② 采集源在外部 ⇒ 胶囊不会把自己上一帧采进纹理（无拖影）；
            ③ backdropTag 主 tag 保留指向 bar 玻璃：双源未就绪 / 其它降级场景
               时 native 原样回退到单纹理路径（干净的玻璃帧），零回归。
            ④ it.26：blurBackdropTag 若为 -1（App 级 backdrop 未就绪）⇒ native
               `dualBg == null` 直接走 ③ 的回退路径，不解引用空视图、不 NPE。 */}
        {dockWidth > 0 && (
          <Animated.View
            style={[
              styles.indicatorTrack,
              {
                width: tabWidth,
                height: frameHeight,
                transform: [{ translateX: dockIndicatorX }],
              },
            ]}
            pointerEvents="none"
          >
            {showIndicatorGlass ? (
              <GlassKitView
                style={[
                  styles.indicator,
                  {
                    top: innerPad,
                    left: innerPad,
                    right: innerPad,
                    bottom: innerPad,
                  },
                ]}
                backdropTag={barGlassTag}
                // it.26 双纹理分流：背景源改指 App 级 backdrop（未模糊的真实背景，
                // 两次高斯串行叠加的语义基础；bar 快照只有软件画布的 1/6 近似）。
                // 未就绪时显式传 -1（View.NO_ID）⇒ native 回退单纹理路径。
                blurBackdropTag={backdropTag ?? -1}
                iconBackdropTag={iconLayerTag}
                blurDp={indicatorOverlayBlurDp}
                // it.23：断开全局「模糊」倍率的隐式相乘（见 glassProfile 同名字段注释）。
                // 不传的话 wrapper 会注入 store 的 blurScale ⇒ 胶囊实际模糊 =
                // indicatorBlurDp × blurScale，默认 0 时恒为 0（滑块怎么拖都没反应）。
                // 原版 INDICATOR 的 blur 是独立档，全局模糊只该影响 bar。
                blurScale={1}
                cornerRadiusDp={dockRadiusDp}
                capsuleContinuous={true}
                indicatorBoostAlpha={INDICATOR_BOOST_ALPHA}
                refractionPx={indicatorRefractionPx}
                lensBandPx={indicatorLensBandPx}
                dispersionPx={indicatorDispersionPx}
                highlightScale={0}
                // it.22 关键：双采集源每帧都在变，本视图必须跟着重采，
                // 否则静止后停在最后一次捕获（切换 tab 那几帧的冻结截图）。
                liveBackdrop={true}
                chromaticEnabled={chromaticEnabled}
                depthEffect={depthEffect}
                vibrancyEnabled={vibrancyEnabled}
                blurEnabled={blurEnabled}
                forceDownsample={forceDownsample}
              />
            ) : (
              // 降级 / 关闭「玻璃叠玻璃」：退半透明实底占位（不渲染内层玻璃）。
              <View
                style={[
                  styles.indicatorFallback,
                  {
                    top: innerPad,
                    left: innerPad,
                    right: innerPad,
                    bottom: innerPad,
                    borderRadius: Math.max(
                      0,
                      Math.min(dockRadiusDp, (frameHeight - innerPad * 2) / 2),
                    ),
                    backgroundColor: GLASS_INDICATOR_FALLBACK.color,
                    opacity: GLASS_INDICATOR_FALLBACK.opacity,
                  },
                ]}
              />
            )}
          </Animated.View>
        )}
        </GlassKitBackdrop>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    // paddingBottom 由 JSX inline 从 store 的 dockFloatDp 驱动
  },
  // 宽 / 高 / 圆角全部由 JSX inline 从 store 驱动；不写死圆角（守卫 R3）。
  // it.19 P0-2：frame 只是「本体 + 投影环带」的宿主（无背景、无圆角、不裁剪）。
  frame: {},
  // it.19 P0-2 内容层：absolute + inset 四边内缩，几何等于 it.18 的 frame。
  dockBody: { position: 'absolute' },
  indicatorTrack: { position: 'absolute', top: 0, left: 0 },
  indicator: { position: 'absolute' },
  indicatorFallback: { position: 'absolute' },
  tabsRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cellIcon: { alignItems: 'center', justifyContent: 'center' },
  cellLabel: { marginTop: 2 },
});

// 辅助：复用项目里的 MaterialCommunityIcons（navigation/index.tsx 依赖此签名）。
export function MCI(name: string) {
  return ({ color, size }: { color: string; size: number }) => (
    <MaterialCommunityIcons name={name} color={color} size={size} />
  );
}

export { motion };
