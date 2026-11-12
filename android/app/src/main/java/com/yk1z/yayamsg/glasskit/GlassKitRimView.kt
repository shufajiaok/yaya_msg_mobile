package com.yk1z.yayamsg.glasskit

import android.content.Context
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RuntimeShader
import android.os.Build
import android.util.Log
import android.view.View
import com.facebook.react.uimanager.PointerEvents
import com.facebook.react.uimanager.ReactPointerEventsView
import kotlin.math.ceil
import kotlin.math.min

/**
 * it.19 P0-1：**轮廓光独立组件**（`GlassKitRimView`）。
 *
 * ## 为什么必须是独立 View，而不是改 `GlassKitView`
 * 原版 `HighlightNode`（`com/kyant/backdrop/highlight/HighlightNode.java:87-140`）在
 * `drawContent()` **之后**画轮廓 —— 也就是盖在内容上面。我们的 `GlassKitView` 是
 * RN 树里的**背景层**：图标 / 文字是它的兄弟或子 View，绘制顺序在它之上，所以
 * 在 `GlassKitView.onDraw` 里画 rim 永远会被内容盖住（inv-engine §5.1 的结论）。
 * ⇒ 结构裁决：**独立透明 View，RN 侧绝对定位铺在内容之上**（`pointerEvents="none"`）。
 * 不动 `GlassKitView` 的 ViewGroup 形态，也不动任何既有绘制阶段编号。
 *
 * ## 视觉参数（全部逐值对齐原版源码，勿"凭感觉"调）
 * | 项 | 值 | 出处 |
 * |---|---|---|
 * | 描边宽度（视觉） | **0.5dp** | `Highlight.java:99-114` 默认 `width = 0.5.dp` |
 * | 描边实现 | `strokeWidth = ceil(widthPx) × 2` + `clipPath` | `HighlightNode.java:171-179` |
 * | 模糊半径 | `widthPx / 2` = **0.25dp** | `Highlight.java:108-113` 默认 `blurRadius = width / 2` |
 * | 颜色 | White **@0.5** | `HighlightStyle$Default`（`HighlightStyle.java:207-215`） |
 * | 叠加 | **Plus** ⇒ `PorterDuff.Mode.ADD` | 同上 `BlendMode.Plus` |
 * | 方向角 | **45°**（下发前 × 0.017453292 转弧度） | `HighlightStyle$Default.angle = 45.0f` |
 * | falloff | **1.0** | `HighlightStyle$Default.falloff = 1.0f` |
 * | 亮度曲线 | `pow(|dot(gradSdf, normal)|, falloff)` | `ShadersKt.java:10 DefaultHighlightShaderString` |
 * | 层 alpha | **1.0** | `Highlight.java:114` 默认 `alpha = 1.0f` |
 *
 * ### 「画 2 裁 1」
 * 原版不是直接画 0.5dp 细线，而是把 stroke 画成 `2 × width`，再 `clipPath` 到形状本身，
 * 只留**内侧一半** ⇒ 视觉宽度回到 `width`。这样做的好处是抗锯齿能量集中在内侧，
 * 边缘不会因为亚像素宽度而忽明忽暗。我们逐位照抄（`strokePx = ceil(widthPx) × 2`）。
 * 注意 @3x 的实际值：`0.5dp × 3 = 1.5px → ceil = 2 → strokePx = 4px → 内侧可见 2px`
 * （≈0.667dp，比标称 0.5dp 略粗，这是 `ceil` 的必然结果，原版同样如此）。
 *
 * ### 颜色 alpha 的两条路径（原版就是两套值）
 * - **AGSL 路径**：原版在 `HighlightStyle$Default.createShader` 里把 uniform 颜色写成
 *   `color.copy(alpha = 1.0f)`（`HighlightStyle.java:241`，`14 & 1 == 0` ⇒ 走 `1.0f`
 *   分支），亮度**完全由 intensity 决定**，`White@0.5` 里的 0.5 不参与。本项目照抄 ⇒
 *   [rimAlpha] 在 AGSL 路径**不生效**（唯一生效处是降级路径）。
 * - **降级路径**（API<33 / AGSL 编译失败）：没有 shader，只剩 `paint.color` ⇒
 *   按 `White@` [rimAlpha]（默认 0.5）画纯色描边，与原版无 RuntimeShader 设备一致。
 *
 * ## 降级
 * - API < 33（无 `RuntimeShader`）：跳过 AGSL，画**纯白 @0.5 描边**（无方向性调制）。
 * - AGSL 编译失败（构造抛异常）：永久降级为纯色描边 + 打一条 error 日志，
 *   绝不每帧重试（与 `GlassKitView.lensShaderFailed` 同策略）。
 *
 * ## 圆形 / 胶囊（与 ② 之后的口径严格一致，不新增第三种形状分支）
 * `capsuleContinuous = true` 且半径已钳到半短边时，clipPath 走 it.14 的精确 Kyant0
 * Bezier（与 dock bar / 指示器同形），否则走 it.19 起恒为圆弧的
 * `ContinuousRoundRect.buildContinuousRoundRect`。两者与 `GlassKitView.kt:1305-1322`
 * **同源同参** —— 轮廓必须与玻璃边缘严格重合，差 1px 就会露出「双线」。
 */
class GlassKitRimView(context: Context) : View(context), ReactPointerEventsView {

    /**
     * it.19 hotfix：**触摸穿透的唯一有效实现**。
     *
     * Paper（newArchEnabled=false）下 `TouchTargetHelper.findTouchTargetViewWithPointerEvents`
     * 的判定是：
     * ```
     * pointerEvents = if (view is ReactPointerEventsView) view.pointerEvents else PointerEvents.AUTO
     * ```
     * 而 `pointerEvents` 这个 JS prop 只有 `ReactViewManager` 会给 **ReactViewGroup** 设置
     * （`ReactViewManager.kt:251-254`）—— 自定义 `SimpleViewManager` 根本没有这个 @ReactProp，
     * JS 侧写的 `pointerEvents="none"` 会被**静默丢弃**。
     *
     * ⇒ 结果是本 View 按 `AUTO` 参与命中测试。`AUTO` 是叶子 View 时直接返回自身
     * （`TouchTargetHelper.kt` AUTO 分支），于是这个铺满 dock 的透明轮廓层把整条 dock 的
     * 触摸全部吃掉 —— 现象就是「dock 图标看得见、按下去毫无反应，切不了页」。
     *
     * 实现 [ReactPointerEventsView] 并恒为 [PointerEvents.NONE] 才是真正的穿透：
     * NONE 分支直接 `return null`，连子节点都不递归。本 View 是纯绘制层，
     * 永远不该成为触摸目标（原版 HighlightNode 也只是绘制节点）。
     */
    override val pointerEvents: PointerEvents = PointerEvents.NONE

    companion object {
        private const val LOG_TAG = "GlassKitBlur"

        /** 原版 `Highlight.width` 默认值（dp）。 */
        private const val DEFAULT_RIM_WIDTH_DP: Float = 0.5f

        /** 原版 `HighlightStyle$Default.color` 的 alpha（只用于降级路径）。 */
        private const val DEFAULT_RIM_ALPHA: Float = 0.5f

        /** 原版 `HighlightStyle$Default.angle`（度）。 */
        private const val DEFAULT_RIM_ANGLE_DEG: Float = 45f

        /** 原版 `HighlightStyle$Default.falloff`。 */
        private const val DEFAULT_RIM_FALLOFF: Float = 1f

        /** 角度转弧度的系数（原版下发时用的同一个常量）。 */
        private const val DEG_TO_RAD: Float = 0.017453292f

        /**
         * AGSL 路径的 uniform alpha：原版强制 1.0（`HighlightStyle.java:241`）。
         * 视觉亮度只由 `intensity` 调制，不要改成 [DEFAULT_RIM_ALPHA]。
         */
        private const val SHADER_COLOR_ALPHA: Float = 1f
    }

    /** 圆角半径（dp）。与 `GlassKitView.cornerRadiusDp` 传同一个值。 */
    var cornerRadiusDp: Float = 0f
        set(value) {
            val v = if (value.isFinite()) value.coerceAtLeast(0f) else 0f
            if (field == v) return
            field = v
            invalidate()
        }

    /** 视觉描边宽度（dp，默认 0.5 = 原版 `Highlight.width`）。 */
    var rimWidthDp: Float = DEFAULT_RIM_WIDTH_DP
        set(value) {
            val v = if (value.isFinite()) value.coerceIn(0f, 4f) else DEFAULT_RIM_WIDTH_DP
            if (field == v) return
            field = v
            invalidate()
        }

    /** 描边模糊半径（dp）。负数（默认 -1）= 取 `rimWidthDp / 2`（原版语义）。 */
    var rimBlurDp: Float = -1f
        set(value) {
            val v = if (value.isFinite()) value.coerceIn(-1f, 4f) else -1f
            if (field == v) return
            field = v
            invalidate()
        }

    /** 降级路径的描边 alpha（默认 0.5 = 原版 `White@0.5`）。AGSL 路径忽略此值。 */
    var rimAlpha: Float = DEFAULT_RIM_ALPHA
        set(value) {
            val v = if (value.isFinite()) value.coerceIn(0f, 1f) else DEFAULT_RIM_ALPHA
            if (field == v) return
            field = v
            invalidate()
        }

    /** 方向角（度，默认 45 = 原版）。 */
    var rimAngleDeg: Float = DEFAULT_RIM_ANGLE_DEG
        set(value) {
            val v = if (value.isFinite()) value else DEFAULT_RIM_ANGLE_DEG
            if (field == v) return
            field = v
            invalidate()
        }

    /** 方向性衰减指数（默认 1.0 = 原版）。 */
    var rimFalloff: Float = DEFAULT_RIM_FALLOFF
        set(value) {
            val v = if (value.isFinite()) value.coerceIn(0.1f, 8f) else DEFAULT_RIM_FALLOFF
            if (field == v) return
            field = v
            invalidate()
        }

    /** 颜色（ARGB）。默认白，只取 RGB，alpha 见 [rimAlpha]。 */
    var rimColor: Int = Color.WHITE
        set(value) {
            if (field == value) return
            field = value
            invalidate()
        }

    /** 是否走 it.14 精确 Kyant0 胶囊 Path（dock bar / 指示器 / 顶栏传 true）。 */
    var capsuleContinuous: Boolean = false
        set(value) {
            if (field == value) return
            field = value
            invalidate()
        }

    /** 总开关（false 时 onDraw 直接返回，零绘制开销）。 */
    var rimEnabled: Boolean = true
        set(value) {
            if (field == value) return
            field = value
            invalidate()
        }

    /** 复用实例：Path / Paint 每次 onDraw 重置，不产生每帧分配。 */
    private val rimPath: Path = Path()
    private val rimPaint: Paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        isDither = true
        strokeJoin = Paint.Join.ROUND
        strokeCap = Paint.Cap.ROUND
    }
    private val addXfermode: PorterDuffXfermode = PorterDuffXfermode(PorterDuff.Mode.ADD)

    private var rimShader: RuntimeShader? = null
    private var rimShaderFailed: Boolean = false
    private var loggedRimFlags: String? = null

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (!rimEnabled) return
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val density = resources.displayMetrics.density
        val halfMin = min(w, h) / 2f
        // 与 GlassKitView.kt:1292 同式：夹到 min(w,h)/2 ⇒ 标准胶囊语义
        val radius = min(cornerRadiusDp * density, halfMin).coerceAtLeast(0f)

        // clipPath 与 GlassKitView.kt:1305-1322 同源同参 —— 轮廓必须与玻璃边缘严格重合
        val isCapsule = radius >= halfMin - 0.5f
        val useKyant0 = capsuleContinuous && isCapsule
        rimPath.reset()
        if (radius > 0f) {
            if (useKyant0) {
                ContinuousRoundRect.buildKyant0ContinuousRoundRect(rimPath, w, h, radius)
            } else {
                ContinuousRoundRect.buildContinuousRoundRect(
                    rimPath, w, h, radius,
                    ContinuousRoundRect.cornerExponent(w, h, radius),
                )
            }
        } else {
            rimPath.addRect(0f, 0f, w, h, Path.Direction.CW)
        }

        // 原版：widthPx 先 coerceAtMost(minDimension/2)，再 ceil × 2（HighlightNode:174-179）
        val widthPx = min(rimWidthDp * density, halfMin)
        if (widthPx <= 0f) return
        val strokePx = ceil(widthPx) * 2f
        val blurDp = if (rimBlurDp >= 0f) rimBlurDp else rimWidthDp * 0.5f
        val blurPx = blurDp * density
        rimPaint.strokeWidth = strokePx
        rimPaint.maskFilter = if (blurPx >= 0.05f) {
            BlurMaskFilter(blurPx, BlurMaskFilter.Blur.NORMAL)
        } else {
            null
        }
        // 原版 layer blendMode = BlendMode.Plus（加法）⇒ PorterDuff.Mode.ADD
        rimPaint.xfermode = addXfermode

        val shader = obtainShader()
        if (shader != null) {
            // 本 shader 不采样任何输入（纯计算），只需要 float uniform
            shader.setFloatUniform("uSize", w, h)
            shader.setFloatUniform("uCornerRadiusPx", radius)
            val r = Color.red(rimColor) / 255f
            val g = Color.green(rimColor) / 255f
            val b = Color.blue(rimColor) / 255f
            shader.setFloatUniform("uRimColor", r, g, b, SHADER_COLOR_ALPHA)
            shader.setFloatUniform("uAngle", rimAngleDeg * DEG_TO_RAD)
            shader.setFloatUniform("uFalloff", rimFalloff)
            rimPaint.shader = shader
            rimPaint.alpha = 255
        } else {
            // 降级：纯色描边（API<33 / AGSL 编译失败），alpha 走 paint
            rimPaint.shader = null
            rimPaint.color = rimColor
            rimPaint.alpha = (rimAlpha * 255f).toInt().coerceIn(0, 255)
        }

        logFlagsOnce(w, h, radius, useKyant0, widthPx, strokePx, blurPx, shader != null)

        canvas.save()
        try {
            // 「画 2 裁 1」：clip 到形状本身，只保留 stroke 的内侧一半
            canvas.clipPath(rimPath)
            canvas.drawPath(rimPath, rimPaint)
        } finally {
            canvas.restore()
        }
    }

    /**
     * 惰性创建 RuntimeShader；失败即永久降级（画布上仍有纯色描边，不崩帧）。
     * AGSL 只在运行时编译 ⇒ 语法错误在这里抛，必须兜住。
     */
    private fun obtainShader(): RuntimeShader? {
        if (rimShaderFailed) return null
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return null
        rimShader?.let { return it }
        return try {
            val shader = GlassHighlightShader.createRuntimeShader()
            rimShader = shader
            shader
        } catch (t: Throwable) {
            rimShaderFailed = true
            Log.e(LOG_TAG, "rim shader create failed → flat stroke: ${t.message}", t)
            null
        }
    }

    /** 一次性取证日志（w/h/r/描边/模糊/是否 AGSL），便于真机核对轮廓几何。 */
    private fun logFlagsOnce(
        w: Float,
        h: Float,
        radius: Float,
        useKyant0: Boolean,
        widthPx: Float,
        strokePx: Float,
        blurPx: Float,
        shaderOn: Boolean,
    ) {
        // it.19 2076029：显式打 bodyWH —— rim 要画在**玻璃本体**上。当前接线把 rim 放进
        // dockBody（本体容器）里，所以 view 尺寸 == 本体尺寸（bodyWH == size）；
        // 若哪天改贴到外扩后的 frame 上，bodyWH 必须先减去 2×inset，否则边光浮在玻璃外。
        val flags = "rim: view=$id size=${w.toInt()}x${h.toInt()}" +
            " bodyWH=${w.toInt()}x${h.toInt()} r=$radius" +
            " widthPx=$widthPx strokePx=$strokePx blurPx=$blurPx" +
            " alpha=$rimAlpha angle=${rimAngleDeg} falloff=$rimFalloff" +
            " kyant0=$useKyant0 capsule=$capsuleContinuous agsl=$shaderOn"
        if (loggedRimFlags == flags) return
        loggedRimFlags = flags
        Log.i(LOG_TAG, flags)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        rimShader = null
    }
}
