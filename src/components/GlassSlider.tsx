/**
 * GlassSlider —— 零依赖滑块（GlassTestScreen 四倍率调节专用，替代 ±0.1 步进按钮）。
 *
 * 实现：PanResponder + onLayout 量轨道宽度；按下 / 拖动 / 松开都以
 * evt.nativeEvent.pageX − 容器窗口 x（measureInWindow 实测，存 ref）→ 0–1 分数
 * 线性映射到 [min, max]，实时 onChange（move 与 release 都触发，拖动过程即
 * 所见即所得）。不依赖 @react-native-community/slider 或任何第三方库。
 *
 * it.7 极值跳变修复（弃用 locationX，改 pageX 基准）：Android 上 locationX 在
 * 触摸序列中固定相对「按下时 hit-test 命中的视图」，RN 已知怪癖是该 hit-view
 * 引用在序列中途的重渲染/子视图树变化后会漂移——最小值处 thumb left=0、fill
 * 宽度变化逐帧触发重渲染，滑动中 locationX 可能瞬间变成大值 → fraction 钳到
 * 1 → 值跳到 max（用户实证「拉到最小值时突然跳到最大值」）。pageX 是屏幕
 * 绝对坐标，immune 于参考系漂移；容器窗口 x 由 measureInWindow 实测写入 ref
 * （onLayout 与每次 grant 时刷新），measure 回调未返回前（ref 为 null）忽略
 * 事件作 NaN 防护。PanResponder 闭包陈旧问题照旧用 ref 转发规避。
 *
 * 结构：触摸容器（高 28，放大热区）内含 6dp 轨道 + 已填充段 + 24dp 圆点 thumb
 * （带 shadow / elevation 与 1px 描边保证深浅背景下的对比度）。
 *
 * 守卫合规：无内联 rgba 背景（实色 + 无透明叠加）、圆角全走 radii token、
 * 无 BlurView、无玻璃 API（useGlassStore 等由调用方接线，本组件纯展示）。
 */
import { useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { radii } from '../theme/radii';

export interface GlassSliderProps {
  /** 当前值（调用方已按 SCALE_RANGES 钳制）。 */
  value: number;
  /** 区间下限（含）。 */
  min: number;
  /** 区间上限（含）。 */
  max: number;
  /** 拖动 / 点击时的实时回调（按下、移动、松开都会触发）。 */
  onChange: (next: number) => void;
  /** 外部容器样式（默认 flex: 1，适配「label 左 / 滑块中 / 数值右」行布局）。 */
  style?: StyleProp<ViewStyle>;
}

/** 触摸容器高度（dp）：热区高度，视觉轨道居中其中。 */
const CONTAINER_HEIGHT = 28;
/** 轨道视觉高度（dp）。 */
const TRACK_HEIGHT = 6;
/** thumb 直径（dp）。 */
const THUMB_SIZE = 24;

export default function GlassSlider(props: GlassSliderProps) {
  const { value, min, max, onChange, style } = props;

  // onLayout 量的轨道宽度：state 驱动渲染 + ref 供 PanResponder 回调同步读取
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);

  // it.7：容器左缘的窗口 x（measureInWindow 实测）。null = 未测量，忽略事件。
  // 存 ref 而非 state：PanResponder 回调需要同步读最新值，且 measure 回调
  // 异步返回时不能触发拖动中的重渲染。
  const containerRef = useRef<View | null>(null);
  const containerPageXRef = useRef<number | null>(null);

  // PanResponder 闭包持有的是创建时的引用，用 ref 转发最新 props，避免陈旧闭包
  const latestRef = useRef({ value, min, max, onChange });
  latestRef.current = { value, min, max, onChange };

  /** 实测容器窗口 x 写入 ref（onLayout / 每次 grant 调用，异步回调不影响事件流）。 */
  const measurePageX = () => {
    const node = containerRef.current;
    if (!node || typeof node.measureInWindow !== 'function') return;
    node.measureInWindow((x) => {
      if (Number.isFinite(x)) containerPageXRef.current = x;
    });
  };

  /** 由屏幕绝对 x 换算 0–1 分数并回调（夹取在 [0,1]，未测量/异常坐标忽略）。 */
  const emitFromPageX = (pageX: number) => {
    const origin = containerPageXRef.current;
    const width = trackWidthRef.current;
    if (origin == null || width <= 0 || !Number.isFinite(pageX)) return;
    const fraction = Math.min(1, Math.max(0, (pageX - origin) / width));
    const latest = latestRef.current;
    latest.onChange(latest.min + fraction * (latest.max - latest.min));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        // grant 时刷新测量：重渲染/布局变化后窗口坐标可能已漂移；回调异步
        // 返回，本次 grant 用上一份测量值（通常一致），后续 move 即用新值
        measurePageX();
        emitFromPageX(evt.nativeEvent.pageX);
      },
      onPanResponderMove: (evt) => emitFromPageX(evt.nativeEvent.pageX),
      onPanResponderRelease: (evt) => emitFromPageX(evt.nativeEvent.pageX),
    }),
  ).current;

  const handleLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    trackWidthRef.current = width;
    setTrackWidth(width);
    measurePageX();
  };

  // 值 → 几何：分母防 0；thumb 用「可用行程」定位，保证两端不出轨；
  // 填充段对齐 thumb 中心（thumbLeft + THUMB_SIZE/2），消除末端 ~12px 视觉偏差
  const span = Math.max(1e-6, max - min);
  const fraction = Math.min(1, Math.max(0, (value - min) / span));
  const travel = Math.max(0, trackWidth - THUMB_SIZE);
  const thumbLeft = fraction * travel;
  const fillWidth = Math.max(0, thumbLeft + THUMB_SIZE / 2);

  return (
    <View
      ref={containerRef}
      style={[styles.container, style]}
      onLayout={handleLayout}
      {...panResponder.panHandlers}
    >
      {/* 子视图全部 pointerEvents="none"：hit-test 收口到容器，保证 grant 命中
          目标恒为容器（配合 pageX 基准，测量参考系恒定不漂移）。 */}
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.fill, { width: fillWidth }]} />
      </View>
      <View style={[styles.thumb, { left: thumbLeft }]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: CONTAINER_HEIGHT,
    justifyContent: 'center',
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: radii.xs,
    backgroundColor: '#2a323c',
    overflow: 'hidden',
  },
  fill: {
    height: TRACK_HEIGHT,
    borderRadius: radii.xs,
    backgroundColor: '#8fd3ff',
  },
  thumb: {
    position: 'absolute',
    top: (CONTAINER_HEIGHT - THUMB_SIZE) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radii.pill,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#101418',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 3,
  },
});
