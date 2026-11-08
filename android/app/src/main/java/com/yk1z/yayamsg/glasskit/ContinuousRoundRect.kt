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

    // =====================================================================
    // it.15 方案 A：Kyant0 连续曲率 Path 精确复刻（不经超椭圆近似）
    // =====================================================================
    // 逐行移植自 jadx 反编译（规格源 D:/glass/hc-src/sources/com/kyant/shapes/）：
    //   ContinuousCurvatureRoundedRectangleCornerBuilder.java:35-50,75-94,120-202
    //   ContinuousCurvatureRoundedRectangleCornerBuilderKt.java:14-35（两个 solver）
    //   RoundedRectangleOutlineKt.java:84-143（4 角 × 3 段 cubic + 4 条直边）
    //   Capsule.java:29,42-52 / RoundedRectangleOutlineKt.java:28-32（形状判定）
    //
    // 为什么必须精确移植：实测（r=112.5px，tH=1/tV=0）Kyant0 真曲线与
    // 超椭圆 n=3 的 SDF 零点最大偏差 13.77px（端帽被拉方 → 「不够圆润」），
    // 而与圆弧 n=2 只差 1.84px。故 Path 用精确 Bezier（外形 100% 复刻），
    // AGSL uCornerExponent 传 2.0（sdContinuous 退化为圆弧 SDF，shader 零改动），
    // Path / SDF 零点偏差落在 edgeAA(1px) 与 dispFade(≈10px) 的安全带内。
    //
    // 基准值（Python 独立复现反编译数学，tH=1.0 / tV=0.0）：
    //   P20 = [-0.666667, 0, -0.096298, 0, 0.180052, 0, 0.413445, 0.096674,
    //          0.663991, 0.200454, 0.835377, 0.403357, 0.924201, 0.617798,
    //          1, 0.800793, 1, 0.954345, 1, 1]
    // =====================================================================
    private const val SQRT_2 = 1.4142135623730951
    private const val FRAC_1_SQRT_2 = 0.7071067811865476
    private const val FRAC_PI_4 = 0.7853981633974483
    private const val EXTENDED_FRACTION = 2.0 / 3.0
    private const val ARC_FRACTION = 0.5

    private val THETA = (1.0 - ARC_FRACTION) * FRAC_PI_4
    private val COS = Math.cos(THETA)
    private val SIN = Math.sin(THETA)
    private val COT = 1.0 / Math.tan(THETA)
    private val COS2 = COS * COS
    private val SIN2 = SIN * SIN
    private val COS3 = COS2 * COS
    private val SIN3 = SIN2 * SIN

    private val K0: Double =
        ((SQRT_2 - COS * 6.0 + COS2 * 8.485281374238571 - COS3 * 4.0) * 27.0 * COT) +
            (SIN * 2.0 * ((((SQRT_2 - SIN * 2.0) * 2.0) * SIN3 - 9.0) +
                (COS * 2.8284271247461903) * (SIN2 + 9.0) -
                (COS2 * 2.0) * ((SIN2 * 2.0) + 9.0)))
    private val K1: Double =
        (((COS * 1.6568542494923806 - 0.5857864376269049) +
            COS2 * -1.1715728752538097) * -81.0 * COT) -
            (SIN * 4.0 * ((SIN3 * 1.4142135623730951 + 3.727922061357857) +
                (COS * -0.5857864376269049) * (SIN2 + 9.0)))
    private val K2: Double =
        (((COS * -0.3431457505076194 + 0.24264068711928566) * 9.0 * COT) +
            SIN * -0.3431457505076194) * 9.0
    private val K3: Double = COT * 2.7136367114850355

    /** ContinuousCurvatureRoundedRectangleCornerBuilderKt.java:14-20（Cardano 单根）。 */
    private fun solveCubicSingle(a: Double, b: Double, c: Double, d: Double): Double {
        val f = ((c * 3.0) / a - (b * b) / (a * a)) / 3.0
        val g = ((((b * 2.0) * b * b) / ((a * a) * a)) -
            ((9.0 * b * c) / (a * a)) + ((d * 27.0) / a)) / 27.0
        val h = (g * g) / 4.0 + (f * f * f) / 27.0
        val sh = Math.sqrt(h)
        return Math.cbrt(-g / 2.0 + sh) + Math.cbrt(-g / 2.0 - sh) - b / (3.0 * a)
    }

    /** ContinuousCurvatureRoundedRectangleCornerBuilderKt.java:23-35。 */
    private fun solveDepressedQuarticSingle(p: Double, q: Double, r: Double): Double {
        val b = -p / 2.0
        val c = -r
        val d = (r * p) / 2.0 - (q * q) / 8.0
        val f = ((c * 3.0) - (b * b)) / 3.0
        val g = ((((b * 2.0) * b * b) - (9.0 * b * c) + (d * 27.0))) / 27.0
        val phi = Math.acos((-g) / (Math.sqrt(((-f) * f * f) / 27.0) * 2.0))
        val y = Math.sqrt(-f / 3.0) * 2.0 * Math.cos(phi / 3.0)
        val z = y - b / 3.0
        val u = Math.sqrt(z * 2.0 - p)
        return (u - Math.sqrt((u * u) - ((z + (q / (u * 2.0))) * 4.0))) / 2.0
    }

    /** buildEvenCornerBezierPoints(t) — Java :120-148。 */
    private fun evenCorner(t: Double): DoubleArray {
        val k = EXTENDED_FRACTION * t
        val kappa = solveCubicSingle(K3, K2, K1 + (-k) * 8.0 * SIN3 * SIN, K0)
        val x3 = (SIN - FRAC_1_SQRT_2) / kappa + FRAC_1_SQRT_2
        val y3 = (FRAC_1_SQRT_2 - COS) / kappa + 0.2928932188134524
        val x2 = x3 - COT * y3
        val x1 = x2 - (kappa * 1.5 * y3 * y3) / SIN3
        val x0 = -k
        val x6 = 1.0 - y3
        val y6 = 1.0 - x3
        val y7 = 1.0 - x2
        val y8 = 1.0 - x1
        val y9 = 1.0 - x0
        val a = 1.5 * kappa
        val g = COS2 - SIN2
        val x36 = x6 - x3
        val y36 = y6 - y3
        val cc = -((COS * y36) - (SIN * x36))
        val lambda = (-g + Math.sqrt((g * g) - (4.0 * a * cc))) / (2.0 * a)
        val x4 = COS * lambda + x3
        val y4 = SIN * lambda + y3
        val x7 = x6 - SIN * lambda
        val y10 = y6 - COS * lambda
        return doubleArrayOf(x0, 0.0, x1, 0.0, x2, 0.0, x3, y3, x4, y4,
            x7, y10, x6, y6, 1.0, y7, 1.0, y8, 1.0, y9)
    }

    /** buildUnevenCornerBezierPoints(tH,tV) — Java :160-202。 */
    private fun unevenCorner(tH: Double, tV: Double): DoubleArray {
        val kH = EXTENDED_FRACTION * tH
        val kV = EXTENDED_FRACTION * tV
        val ka3 = solveCubicSingle(K3, K2, K1 + (-kH) * 8.0 * SIN3 * SIN, K0)
        val ka6 = solveCubicSingle(K3, K2, K1 + (-kV) * 8.0 * SIN3 * SIN, K0)
        val x3 = (SIN - FRAC_1_SQRT_2) / ka3 + FRAC_1_SQRT_2
        val y3 = (FRAC_1_SQRT_2 - COS) / ka3 + 0.2928932188134524
        val x2 = x3 - COT * y3
        val x1 = x2 - (ka3 * 1.5 * y3 * y3) / SIN3
        val k7 = -kH
        val x3p = (SIN - FRAC_1_SQRT_2) / ka6 + FRAC_1_SQRT_2
        val y3p = (FRAC_1_SQRT_2 - COS) / ka6 + 0.2928932188134524
        val x2p = x3p - COT * y3p
        val x1p = x2p - (ka6 * 1.5 * y3p * y3p) / SIN3
        val x1p2 = -kV
        val x6 = 1.0 - y3p
        val y6 = 1.0 - x3p
        val y7 = 1.0 - x2p
        val y8 = 1.0 - x1p
        val y9 = 1.0 - x1p2
        val a = ka3 * 1.5
        val b = 1.5 * ka6
        val g = COS2 - SIN2
        val x36 = x6 - x3
        val y36 = y6 - y3
        val cc = -((COS * y36) - (SIN * x36))
        val dd = (SIN * y36) - (COS * x36)
        val p = (dd / b) * 2.0
        val q = (g * g * g) / ((a * b) * b)
        val r = ((a * dd * dd) + (cc * g * g)) / ((a * b) * b)
        val l6 = solveDepressedQuarticSingle(p, q, r)
        val l3 = ((-dd) - (b * l6 * l6)) / g
        val x4 = COS * l3 + x3
        val y4 = SIN * l3 + y3
        val x7 = x6 - SIN * l6
        val y10 = y6 - COS * l6
        return doubleArrayOf(k7, 0.0, x1, 0.0, x2, 0.0, x3, y3, x4, y4,
            x7, y10, x6, y6, 1.0, y7, 1.0, y8, 1.0, y9)
    }

    /** getCornerBezierPoints(tH,tV) — Java :75-94（cache 与实时计算数值一致）。 */
    fun kyant0CornerBezierPoints(tH: Double, tV: Double): DoubleArray =
        if (tH == tV) evenCorner(tH) else unevenCorner(tH, tV)

    /** 按路径顺序追加 3 段 cubic（pts 为该角的 10 个点，索引 0 是起点）。 */
    private fun appendCornerCubics(
        path: Path,
        pts: DoubleArray,
        ox: Double,
        oy: Double,
        sx: Double,
        sy: Double,
        radius: Double,
    ) {
        for (seg in 0..2) {
            val i = 2 + seg * 6
            path.cubicTo(
                (ox + sx * pts[i] * radius).toFloat(),
                (oy + sy * pts[i + 1] * radius).toFloat(),
                (ox + sx * pts[i + 2] * radius).toFloat(),
                (oy + sy * pts[i + 3] * radius).toFloat(),
                (ox + sx * pts[i + 4] * radius).toFloat(),
                (oy + sy * pts[i + 5] * radius).toFloat(),
            )
        }
    }

    /**
     * 精确复刻 Kyant0 `Outline.Generic` 连续曲率路径（4 角 × 3 段 cubic）。
     * 与 RoundedRectangleOutlineKt.java:122-141 逐点同构；tH/tV 由 :101-120
     * 的 (half − r)/r clamp 得到。仅 capsuleContinuous 组件调用。
     */
    fun buildKyant0ContinuousRoundRect(path: Path, w: Float, h: Float, r: Float) {
        if (w <= 0f || h <= 0f) return
        val wd = w.toDouble()
        val hd = h.toDouble()
        val radius = minOf(r.toDouble(), minOf(wd, hd) / 2.0)
        path.reset()
        if (radius <= 0.0) {
            path.moveTo(0f, 0f)
            path.lineTo(w, 0f)
            path.lineTo(w, h)
            path.lineTo(0f, h)
            path.close()
            return
        }
        val tH = (((wd * 0.5) - radius) / radius).coerceIn(0.0, 1.0)
        val tV = (((hd * 0.5) - radius) / radius).coerceIn(0.0, 1.0)
        val p = kyant0CornerBezierPoints(tH, tV)
        // 反序点（右下 / 左上角按 Java :130-140 的倒序索引）
        val pr = DoubleArray(20) { idx -> p[(9 - idx / 2) * 2 + idx % 2] }
        val xRight = wd - radius
        // 右上角：起点 (xRight + p0·r, p1·r)，sx=+1 sy=+1
        path.moveTo((xRight + p[0] * radius).toFloat(), (p[1] * radius).toFloat())
        appendCornerCubics(path, p, xRight, 0.0, 1.0, 1.0, radius)
        // 右下角：lineTo(xRight + p18·r, h − p19·r)，sx=+1 sy=−1，反序点
        path.lineTo((xRight + pr[0] * radius).toFloat(), (hd - pr[1] * radius).toFloat())
        appendCornerCubics(path, pr, xRight, hd, 1.0, -1.0, radius)
        // 左下角：lineTo(r − p0·r, h − p1·r)，sx=−1 sy=−1，正序点
        path.lineTo((radius - p[0] * radius).toFloat(), (hd - p[1] * radius).toFloat())
        appendCornerCubics(path, p, radius, hd, -1.0, -1.0, radius)
        // 左上角：lineTo(r − p18·r, p19·r)，sx=−1 sy=+1，反序点
        path.lineTo((radius - pr[0] * radius).toFloat(), (pr[1] * radius).toFloat())
        appendCornerCubics(path, pr, radius, 0.0, -1.0, 1.0, radius)
        path.close()
    }
}
