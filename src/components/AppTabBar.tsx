/**
 * AppTabBar · it.16 App 底栏（GlassKit dock：连续曲率 + 指示器透镜）
 *
 * 视觉 / 交互以 GlassTestScreen dock 渲染段为唯一模板，几何全部来自
 * src/theme/glassProfile.ts（用户 2026-11-08 指定的 HealthCheckIn 实测配置），
 * 不自创尺寸：
 * - frame：宽 = 屏宽 × 0.81、高 56.86、圆角 999（引擎钳到 min(w,h)/2 = 真胶囊）；
 *   **不加 overflow:'hidden'**（it.14 结论：圆弧父 View 的 clip 会先裁掉连续曲率
 *   端帽的外扩部分，加回去会让端帽被切平）。
 * - bar 玻璃层：GlassKitView capturable（作为指示器的采集源），blurDp 10 /
 *   tintAlpha 0.06 / cornerRadiusDp 999 + capsuleContinuous（n=3 连续曲率端帽）。
 * - 指示器：Animated track + GlassKitView（backdropTag 指向 bar 原生 handle =
 *   玻璃叠玻璃），top/left/right/bottom = 内缩 5.36、capsuleContinuous、
 *   indicatorBoostAlpha 0.05（Kotlin GlassKitKt.java:1434-1435,1451 的 White@0.05）、
 *   highlightScale 0（INDICATOR 不画 18dp 顶缘，GlassLevel.java:37）。
 *   spring 目标 x = 内缩 + activeIndex × tabWidth（绝对定位，it.10 漂移修复口径，
 *   绝不用累加增量）。
 * - tabs：每 tab flex:1 居中，图标 size 23、label typography.caption2（11sp，守卫 R6
 *   合规）；active 色 palette.tint / 未选中 palette.labelSecondary；active 图标
 *   spring pop 保留原实现（motion.spring.bouncy）。
 * - 降级（!canBlur() || !canLens()）：bar 用半透明实底、指示器退化为半透明实底
 *   View，不渲染任何 GlassKitView。实底色值来自 glassProfile.ts（theme 目录豁免
 *   inline-rgba 基线），本文件零内联 rgba。
 *
 * 契约：AppTabBarProps（items / activeKey / onSelect）与 MCI 导出签名不变，
 * src/navigation/index.tsx 零改动。
 */
import React, { useEffect, useRef, useState } from 'react';
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
import { canBlur, canLens } from '../theme/glass';
import {
  GLASS_BAR_FALLBACK,
  GLASS_BAR_SURFACE,
  GLASS_EFFECT_DEFAULTS,
  GLASS_INDICATOR_FALLBACK,
  GLASS_PROFILE,
  GLASS_SWITCH_DEFAULTS,
  GLASS_TINT_COLOR,
  useGlassScales,
} from '../theme/glassProfile';

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
  const pop = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    pop.stopAnimation();
    if (active) {
      pop.setValue(0.92);
      const animation = Animated.spring(pop, {
        toValue: 1,
        ...motion.spring.bouncy,
        useNativeDriver: true,
      });
      animation.start();
      return () => animation.stop();
    }
    pop.setValue(1);
  }, [active, pop]);

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      hitSlop={6}
      onPress={onSelect}
      style={styles.cell}
    >
      <Animated.View style={[styles.cellIcon, { transform: [{ scale: pop }] }]}>
        {item.icon({ color: active ? palette.tint : palette.labelSecondary, size: 23 })}
      </Animated.View>
      <Text
        style={[
          typography.caption2,
          styles.cellLabel,
          {
            color: active ? palette.tint : palette.labelSecondary,
            fontWeight: active ? '700' : '600',
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
  // 四倍率实时值：订阅收敛在 glassProfile.ts（守卫 glass-api-access 基线为 0 新增）。
  const { blurScale, lensScale } = useGlassScales();
  const winWidth = useWindowDimensions().width;

  // 降级：无模糊能力（API<31）或无透镜能力（API<33）时整条 dock 退实底。
  const degraded = !canBlur() || !canLens();

  const barGlassRef = useRef(null);
  const [barGlassTag, setBarGlassTag] = useState<number | undefined>(undefined);
  // 卡纸底衬的采集源 tag（bar 玻璃只采它，不透页面内容）
  const barBaseRef = useRef(null);
  const [barBaseTag, setBarBaseTag] = useState<number | undefined>(undefined);
  const [dockWidth, setDockWidth] = useState(0);

  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.key === activeKey),
  );
  const innerPad = GLASS_PROFILE.dockInnerPadDp;
  const tabWidth =
    dockWidth > 0 && items.length > 0 ? (dockWidth - innerPad * 2) / items.length : 0;
  const dockIndicatorX = useRef(new Animated.Value(innerPad)).current;

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

  // 卡纸底衬 tag：bar 玻璃以它为采集源（覆盖 App 级 backdrop = 整棵内容树的语义）
  const onBarBaseLayout = () => {
    const handle = findNodeHandle(barBaseRef.current);
    if (handle != null) setBarBaseTag(handle);
  };

  const onFrameLayout = (evt: LayoutChangeEvent) => {
    setDockWidth(evt.nativeEvent.layout.width);
  };

  const frameHeight = GLASS_PROFILE.dockHeightDp;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.outer, { paddingBottom: GLASS_PROFILE.dockFloatDp }]}
    >
      <View
        style={[
          styles.frame,
          {
            width: Math.round(winWidth * GLASS_PROFILE.dockWidthScale),
            height: frameHeight,
            alignSelf: 'center',
            borderRadius: Math.min(999, frameHeight / 2),
            backgroundColor: degraded
              ? isDark
                ? GLASS_BAR_FALLBACK.dark
                : GLASS_BAR_FALLBACK.light
              : 'transparent',
          },
        ]}
        onLayout={onFrameLayout}
      >
        {/* 卡纸底衬（不透明 surface 色）+ 注册为采集源：bar 玻璃只采它，
            页面内容不会透上来（用户 2026-11-08：「dock 应该被卡纸遮罩挡住」）。
            渲染顺序：底衬 → bar 玻璃 → 指示器 → tabs，后者依次覆盖前者。 */}
        {!degraded && (
          <GlassKitBackdrop
            ref={barBaseRef}
            style={StyleSheet.absoluteFill}
            onLayout={onBarBaseLayout}
            pointerEvents="none"
          >
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: isDark
                    ? GLASS_BAR_SURFACE.dark
                    : GLASS_BAR_SURFACE.light,
                },
              ]}
            />
          </GlassKitBackdrop>
        )}

        {/* bar 玻璃层：capturable = 指示器的采集源（玻璃叠玻璃）；
            backdropTag 指向卡纸底衬（未就绪时退回 App 级 backdrop，避免首帧空采） */}
        {!degraded && (
          <GlassKitView
            ref={barGlassRef}
            style={StyleSheet.absoluteFill}
            onLayout={onBarLayout}
            backdropTag={barBaseTag ?? backdropTag}
            capturable={true}
            blurDp={10}
            tintAlpha={0.06}
            tintColor={isDark ? GLASS_TINT_COLOR.dark : GLASS_TINT_COLOR.light}
            cornerRadiusDp={999}
            capsuleContinuous={true}
            refractionPx={Math.round(5 * lensScale)}
            dispersionPx={0}
            highlightScale={GLASS_PROFILE.highlightScale}
            chromaticEnabled={GLASS_EFFECT_DEFAULTS.chromaticEnabled}
            depthEffect={GLASS_EFFECT_DEFAULTS.depthEffect}
            vibrancyEnabled={GLASS_EFFECT_DEFAULTS.vibrancyEnabled}
            blurEnabled={GLASS_SWITCH_DEFAULTS.blurEnabled}
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
            {degraded ? (
              <View
                style={[
                  styles.indicatorFallback,
                  {
                    top: innerPad,
                    left: innerPad,
                    right: innerPad,
                    bottom: innerPad,
                    borderRadius: Math.max(0, (frameHeight - innerPad * 2) / 2),
                    backgroundColor: GLASS_INDICATOR_FALLBACK.color,
                    opacity: GLASS_INDICATOR_FALLBACK.opacity,
                  },
                ]}
              />
            ) : barGlassTag != null ? (
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
                blurDp={Math.round(2 * blurScale)}
                cornerRadiusDp={999}
                capsuleContinuous={true}
                indicatorBoostAlpha={0.05}
                refractionPx={Math.round(8 * lensScale)}
                dispersionPx={Math.round(10 * lensScale)}
                highlightScale={0}
              />
            ) : null}
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
    // paddingBottom 由 JSX inline 从 GLASS_PROFILE.dockFloatDp 驱动
  },
  // 宽 / 高 / 圆角全部由 JSX inline 从 GLASS_PROFILE 驱动；不写死圆角（守卫 R3）。
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
  cellLabel: { marginTop: 3 },
});

// 辅助：复用项目里的 MaterialCommunityIcons（navigation/index.tsx 依赖此签名）。
export function MCI(name: string) {
  return ({ color, size }: { color: string; size: number }) => (
    <MaterialCommunityIcons name={name} color={color} size={size} />
  );
}

export { motion };
