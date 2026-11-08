package com.yk1z.yayamsg.glasskit

import android.graphics.Path
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sign
import kotlin.math.sin

/**
 * it.13：SwiftUI 标准连续曲率圆角（continuous curvature / squircle）统一生成器。
 *
 * 背景：it.12 及以前 GlassKitView 用 Path.addRoundRect（圆弧，G1 连续），
 * GlassLensShader 用 sdRoundRect（圆弧 SDF）。圆弧与四条直边在切点处只有
 * 切线连续（G1），曲率从 1/r 阶跃到 0 —— 高光/折射法线在切点处可见折痕，
 * 与 SwiftUI .continuous 圆角（曲率连续，G2）不一致。本迭代按主理人拍板
 * 走「方案 B：Path + AGSL SDF 统一超椭圆」：几何裁剪与透镜 SDF 用同一个
 * 超椭圆指数 n，保证 clip 边界与法线 / edgeAA / dispFade 的零点严格重合。
 *
 * 参数方程（角部超椭圆，θ∈[0,π/2]）：
 *   x = r · sign(cosθ) · |cosθ|^(2/n)
 *   y = r · sign(sinθ) · |sinθ|^(2/n)
 * n=2 时 2/n=1，逐位退化为圆弧（x=r·cosθ, y=r·sinθ）；n=4 即 Apple
 * squircle 的典型指数。角部由 CORNER_SEGMENTS=24 段 lineTo 采样，配合四条
 * 平直段构造闭合 Path。
 *
 * 与 Kyant0 实现的关系（D:/glass/hc-src/sources/com/kyant/shapes/）：
 * - ContinuousCurvatureRoundedRectangleCornerBuilder.java:35-54 用每角 3 段
 *   cubic Bezier（k0..k3 系数、extendedFraction=2/3、arcFraction=1/2）拟合
 *   G2 连续角部曲线；本实现用等价的超椭圆采样（24 段折线，常见 r≤24dp 时
 *   误差 <0.1px），换取「一个标量 n 同时喂 Path 与 AGSL SDF」的统一性。
 * - RoundedRectangleOutlineKt.java:28-32 的退化判定：radius=0 → 矩形；
 *   style≠Circular 且 (w≠h 或 r<maxRadius) → Generic 连续曲率 Path；
 *   否则（正方形 且 r≥半尺寸）→ Outline.Rounded 圆弧。Capsule.java:42-52
 *   取 radius=min(w,h)/2。
 *
 * ★ 胶囊硬守卫：r ≥ min(w,h)/2 − 0.5px 时强制 n=2（严格圆弧）。
 *   理由：超椭圆 SDF 在 r 逼近半短边时，长胶囊两端的「半圆」会被 n>2 的
 *   超椭圆拉方（|x|^n+|y|^n=r^n 轴向被压平），dock bar / 指示器这类宽高比
 *   悬殊的真胶囊会明显变形 —— it.12 的 Capsule 半圆端是用户已验收的形态，
 *   必须零回归。正方形 r=半尺寸同样命中守卫，与旧 addRoundRect 逐位等价；
 *   同时对齐 RoundedRectangleOutlineKt.java:28-32 的圆弧退化分支。
 *   n=2 时 buildContinuousRoundRect 直接走 Skia 原生 addRoundRect（真圆弧，
 *   非折线近似），确保胶囊 / 正方形与 it.12 逐位等价。
 *
 * 圆角钳制红线：生成前一律 r = min(r, min(w,h)/2)，与 GlassKitView
 * drawGlassFrame 的 cornerRadiusPx 钳制、AGSL SDF 的半尺寸语义一致。
 */
object ContinuousRoundRect {

    /** 每角采样段数（4 角 × 24 段 = 96 段/帧，Skia 折线误差 <0.1px）。 */
    const val CORNER_SEGMENTS: Int = 24

    /** 圆弧指数（n=2：G1，胶囊 / 正方形零回归）。 */
    private const val N_MIN: Float = 2f

    /** Apple squircle 典型指数（n=4：G2 连续）。 */
    private const val N_MAX: Float = 4f

    /** n 混合起点：t=r/(min(w,h)/2) ≤0.75 时取满 nMax。 */
    private const val BLEND_START: Float = 0.75f

    /** n 混合终点：t→1 时平滑回落到 nMin。 */
    private const val BLEND_END: Float = 1f

    /** 胶囊硬守卫容差（px）：r 距半短边 ≤0.5px 即视为胶囊。 */
    private const val CAPSULE_GUARD_PX: Float = 0.5f

    private const val HALF_PI: Float = 1.5707963f

    /**
     * 计算本帧统一超椭圆指数 n（Path 与 AGSL SDF 共用，一次计算全帧复用）。
     * t 小（圆角远小于半短边）→ n=nMax=4；t→1 → n 平滑回落到 2；
     * 胶囊（r≥半短边−0.5px）硬守卫强制 n=2。
     */
    fun cornerExponent(w: Float, h: Float, r: Float): Float {
        val halfMin = 0.5f * minOf(w, h)
        if (halfMin <= 0f) return N_MIN
        val t = (r / halfMin).coerceIn(0f, 1f)
        val blend = 1f - smoothstep(BLEND_START, BLEND_END, t)
        var n = N_MIN + (N_MAX - N_MIN) * blend
        if (r >= halfMin - CAPSULE_GUARD_PX) n = N_MIN
        return n
    }

    /** 手写 smoothstep(edge0, edge1, x)（Kotlin 标准库无该顶层函数）。 */
    private fun smoothstep(edge0: Float, edge1: Float, x: Float): Float {
        val t = ((x - edge0) / (edge1 - edge0)).coerceIn(0f, 1f)
        return t * t * (3f - 2f * t)
    }

    /**
     * 生成连续曲率圆角矩形闭合 Path（覆盖 path 原有内容）。
     * 四条平直段 + 四角各 CORNER_SEGMENTS 段超椭圆折线 + close。
     *
     * @param path 复用的 Path（调用方无需 reset，本函数统一处理）
     * @param w 视图宽（px）
     * @param h 视图高（px）
     * @param r 圆角半径（px，函数内再钳到 min(w,h)/2 —— 红线）
     * @param n 超椭圆指数（由 cornerExponent 计算；≤2 走原生圆弧快路径）
     */
    fun buildContinuousRoundRect(path: Path, w: Float, h: Float, r: Float, n: Float) {
        if (w <= 0f || h <= 0f) return
        // 生成前钳（红线）：与 GlassKitView cornerRadiusPx、AGSL 半尺寸语义一致
        val radius = minOf(r, minOf(w, h) / 2f)
        path.reset()
        if (radius <= 0f) {
            // r=0：矩形（四条直边，close）
            path.moveTo(0f, 0f)
            path.lineTo(w, 0f)
            path.lineTo(w, h)
            path.lineTo(0f, h)
            path.close()
            return
        }
        if (n <= N_MIN + 1e-4f) {
            // ★ 胶囊 / 正方形硬守卫：严格退化为 Skia 原生圆弧，与 it.12
            // addRoundRect 逐位等价（半圆端零回归），且无折线近似误差。
            path.addRoundRect(0f, 0f, w, h, radius, radius, Path.Direction.CW)
            return
        }
        val exponent = 2f / n
        path.moveTo(radius, 0f)
        path.lineTo(w - radius, 0f)
        // 右上角：圆心 (w-r, r)，θ=0 偏移 (0,-r) → θ=π/2 偏移 (r,0)
        appendCorner(path, w - radius, radius, radius, exponent, 0f, -1f, 1f, 0f)
        path.lineTo(w, h - radius)
        // 右下角：圆心 (w-r, h-r)，(r,0) → (0,r)
        appendCorner(path, w - radius, h - radius, radius, exponent, 1f, 0f, 0f, 1f)
        path.lineTo(radius, h)
        // 左下角：圆心 (r, h-r)，(0,r) → (-r,0)
        appendCorner(path, radius, h - radius, radius, exponent, 0f, 1f, -1f, 0f)
        path.lineTo(0f, radius)
        // 左上角：圆心 (r, r)，(-r,0) → (0,-r)
        appendCorner(path, radius, radius, radius, exponent, -1f, 0f, 0f, -1f)
        path.close()
    }

    /**
     * 追加单角超椭圆弧（N 段 lineTo，从 θ=0 到 θ=π/2）。
     * 偏移 = r · (u·(ux,uy) + v·(vx,vy))，其中 (u,v) 为参数方程的
     * sign(cosθ)|cosθ|^(2/n) / sign(sinθ)|sinθ|^(2/n)。θ=0 时 (u,v)=(1,0)
     * 落在起点切点；θ=π/2 时 (u,v)=(0,1) 落在终点切点。端点取整值，
     * 规避 cos(π/2) 浮点残差导致的微小尖点。
     */
    private fun appendCorner(
        path: Path,
        cx: Float,
        cy: Float,
        r: Float,
        exponent: Float,
        ux: Float,
        uy: Float,
        vx: Float,
        vy: Float,
    ) {
        val step = HALF_PI / CORNER_SEGMENTS
        for (i in 1..CORNER_SEGMENTS) {
            val u: Float
            val v: Float
            if (i == CORNER_SEGMENTS) {
                u = 0f
                v = 1f
            } else {
                val theta = step * i
                val c = cos(theta)
                val s = sin(theta)
                u = sign(c) * abs(c).pow(exponent)
                v = sign(s) * abs(s).pow(exponent)
            }
            path.lineTo(cx + r * (u * ux + v * vx), cy + r * (u * uy + v * vy))
        }
    }
}
