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
 *   blurDp 10 × blurScale、tintAlpha = resolveTintAlpha(0.06, tintScale)、
 *   refraction 5dp × lensScale、dispersion 0、highlightScale / glow 三倍率来自 store。
 * - 指示器：backdropTag 指向 bar 原生 handle（玻璃叠玻璃）、内缩 = dockInnerPadDp、
 *   capsuleContinuous、indicatorBoostAlpha 0.05（Kotlin GlassKitKt.java:1434-1435,1451
 *   的 White@0.05）、highlightScale 0（INDICATOR 不画 18dp 顶缘，GlassLevel.java:37）、
 *   blur 2dp × blurScale、refraction 8dp × lensScale、
 *   dispersion 10dp × lensScale × (dispersionLevel/0.35)（与实验页同一公式）。
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
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  findNodeHandle,
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
  GLASS_INDICATOR_FALLBACK,
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

/** bar 的基准模糊半径 dp（Kotlin BAR 档 = 10dp，最终半径 = 10 × blurScale × density）。 */
const BAR_BLUR_DP = 10;
/** bar 折射基准 dp（最终 = 5 × lensScale px，与实验页 dock bar 同一基准）。 */
const BAR_REFRACTION_DP = 5;
/** 指示器折射基准 dp（最终 = 8 × lensScale px）。 */
const INDICATOR_REFRACTION_DP = 8;
/** 指示器色散基准 dp（最终 = 10 × lensScale × dispersionLevel/0.35 px）。 */
const INDICATOR_DISPERSION_DP = 10;
/** 色散强度归一基准（实验页 dispersionLevel 滑块默认 1.0 时 = 10dp × lensScale）。 */
const DISPERSION_LEVEL_BASE = 0.35;
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
  // it.19：真机色值是 #7CA6FF / #9CA8BC，但守卫硬规则 D7 禁止落地 Accent 色值
  //（03 §3.1）⇒ 仍走 palette.tint / labelSecondary，色值差异待用户定夺。
  const activeColor = palette.tint;
  const inactiveColor = palette.labelSecondary;

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
  const { blurScale, tintScale, lensScale, glowScale } = useGlassScales();
  // 22 项可调参数（开关 / 几何 / 高光 / 扩展调试）：与实验页同一份 store。
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
  // tint：resolveTintAlpha 是 glass.ts 的 H1 唯一出口（0.06 × tintScale，≤0.12）。
  // 原生侧最终 alpha = min(tintAlpha × tintScale, 0.12)＝若再传 tintScale 会二次乘算，
  // 故显式传 tintScale={1}，让 JS 的 resolveTintAlpha 成为唯一一次乘算。
  const barTintAlpha = resolveTintAlpha(TINT_ALPHA_BASE, tintScale);
  const barRefractionPx = Math.round(BAR_REFRACTION_DP * lensScale);
  const indicatorBlurDp = Math.round(2 * blurScale);
  const indicatorRefractionPx = Math.round(INDICATOR_REFRACTION_DP * lensScale);
  const indicatorDispersionPx = Math.round(
    INDICATOR_DISPERSION_DP * lensScale * (dispersionLevel / DISPERSION_LEVEL_BASE),
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

  const onFrameLayout = (evt: LayoutChangeEvent) => {
    setDockWidth(evt.nativeEvent.layout.width);
  };

  // 指示器真实渲染条件：有透镜能力 + 玻璃叠玻璃开关打开 + bar 采集源就绪。
  const showIndicatorGlass = !degraded && glassOnGlass && barGlassTag != null;

  return (
    <View pointerEvents="box-none" style={[styles.outer, { paddingBottom: dockFloatDp }]}>
      <View
        style={[
          styles.frame,
          {
            width: frameWidth,
            height: frameHeight,
            alignSelf: 'center',
            borderRadius: frameRadius,
            backgroundColor: degraded
              ? isDark
                ? GLASS_BAR_FALLBACK.dark
                : GLASS_BAR_FALLBACK.light
              : 'transparent',
          },
        ]}
        onLayout={onFrameLayout}
      >
        {/* bar 玻璃层：capturable = 指示器的采集源（玻璃叠玻璃）。
            it.17 起 backdropTag 回到 App 级采集源 ⇒ 透视玻璃（不再是卡纸底衬）。 */}
        {/* it.18 采集排除子树：dock（bar 玻璃 + 指示器 + 图标）整体不进入 App 级
            backdrop 的采集纹理 ⇒ bar 采到的是 dock **下方**的真实内容：
            ① 透视实时背景 ② 图标/文字不会被自己的透镜折射（旧行为是自采样：
            bar 采 App backdrop 时把自己的图标与上一帧玻璃烘进纹理）。
            注意：指示器采集 bar（目标在本容器内）时照常绘制，玻璃叠玻璃不受影响。 */}
        <GlassKitBackdrop excludeFromCapture style={StyleSheet.absoluteFill} pointerEvents="box-none">
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

        {/* 指示器：track 宽 = (dockWidth − 2×内缩)/N，弹簧平移目标绝对定位 */}
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
                blurDp={indicatorBlurDp}
                cornerRadiusDp={dockRadiusDp}
                capsuleContinuous={true}
                indicatorBoostAlpha={INDICATOR_BOOST_ALPHA}
                refractionPx={indicatorRefractionPx}
                dispersionPx={indicatorDispersionPx}
                highlightScale={0}
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
  frame: {},
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
