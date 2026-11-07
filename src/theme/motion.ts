// iOS 26 动效曲线：弹性 spring 反馈 + P0 动效档（四条降级矩阵之 Reduce Motion）
//
// 依据：02 §4.5（出现 200–300ms / 按压 80–150ms / morph 300–400ms / scale 1.0→0.97）、
//       §5.1 Reduce Motion（关 morph / lift / z 轴 / 进出模糊，位移改 fade，提供替代反馈）、
//       §5.2 第 7 条（动画不得锁住输入）；03 §7 末 / §9 P0「动效档」。
// ⚠️ 原有 `motion` 对象保持原样：navigation/index.tsx 与多个组件依赖其 duration / spring 字段。
export const motion = {
  duration: {
    fast: 160,
    base: 240,
    slow: 360,
  },
  // iOS spring response/dampingFriction：response 越小越快，damping 越大越稳
  spring: {
    /** 弹性反馈按钮/列表 */
    bouncy: { damping: 14, mass: 1, stiffness: 180, overshootClamping: false },
    /** 全局默认 transition */
    default: { damping: 22, mass: 1, stiffness: 220, overshootClamping: false },
    /** 精确不抖动（页面过渡） */
    precise: { damping: 30, mass: 1, stiffness: 250, overshootClamping: true },
  },
} as const;

export type MotionProfile = 'full' | 'reduced' | 'off';

export interface MotionTokens {
  /** 出现 / 消失时长（ms） */
  appearMs: number;
  /** 按压反馈时长（ms） */
  pressMs: number;
  /** morph 过渡时长（ms） */
  morphMs: number;
  /** 按压缩放（1 = 不缩放） */
  pressScale: number;
  /** Reduce Motion 下只允许静态 / 短 fade */
  useFadeOnly: boolean;
  allowMorph: boolean;
  allowLift: boolean;
  allowZAxis: boolean;
  allowBlurTransition: boolean;
  note: string;
}

/**
 * 三档动效：full（默认）/ reduced（系统或 App 内 Reduce Motion）/ off（全部关闭）。
 * 数值取 02 §4.5 区间中值；reduced 关掉一切形变与深度变化，只保留静态或短 fade。
 */
export const MOTION_TIERS: Record<MotionProfile, MotionTokens> = {
  full: {
    appearMs: 240,
    pressMs: 120,
    morphMs: 360,
    pressScale: 0.97,
    useFadeOnly: false,
    allowMorph: true,
    allowLift: true,
    allowZAxis: true,
    allowBlurTransition: true,
    note: '官方 brief & precise；动效参数是折光 / 高光 / 模糊强度，不得只用 opacity',
  },
  reduced: {
    appearMs: 160,
    pressMs: 80,
    morphMs: 0,
    pressScale: 1,
    useFadeOnly: true,
    allowMorph: false,
    allowLift: false,
    allowZAxis: false,
    allowBlurTransition: false,
    note: '02 §5.1：关 morph / lift / z 轴 / 进出模糊；位移改静态或短 fade；补触觉 / 音频 / 文案替代反馈',
  },
  off: {
    appearMs: 0,
    pressMs: 0,
    morphMs: 0,
    pressScale: 1,
    useFadeOnly: true,
    allowMorph: false,
    allowLift: false,
    allowZAxis: false,
    allowBlurTransition: false,
    note: '全部动效关闭；不阻塞交互（02 §5.2 第 7 条）',
  },
} as const;

export function resolveMotion(profile: MotionProfile): MotionTokens {
  return MOTION_TIERS[profile];
}

/** 由 a11y 开关 + 系统读数解析动效档（App 内开关优先，二者任一开启即 reduced） */
export function resolveMotionProfile(options: {
  reduceMotion?: boolean;
  systemReduceMotion?: boolean;
  assistiveAccess?: boolean;
} = {}): MotionProfile {
  if (options.assistiveAccess === true) return 'off';
  if (options.reduceMotion === true || options.systemReduceMotion === true) return 'reduced';
  return 'full';
}
