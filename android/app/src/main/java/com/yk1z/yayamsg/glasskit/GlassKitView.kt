package com.yk1z.yayamsg.glasskit

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import android.os.SystemClock
import android.view.View
import android.view.ViewTreeObserver

/**
 * GlassKit 渲染核心（引擎重写清单 §二，纯 Kotlin View，零依赖）。
 *
 * onDraw 管线：
 * 1. 捕获：GlassCaptureEngine 按 backdropTag 找背景视图，采玻璃覆盖区（失败画兜底底色）；
 * 2. 模糊：API 31+ 且画布硬件加速 → RenderNode + RenderEffect.createBlurEffect；
 *    API 26–30 / 软件画布 / 透镜路径 → 降采样 1/4 + 双线性放大近似（H2 单档语义）；
 * 3. 透镜：API 33+ 且 lensScale>0 且 refraction/dispersion>0 → BitmapShader(模糊结果)
 *    喂 RuntimeShader（uRefractionPx / uDispersionPx 已乘 lensScale）；否则直接画模糊位图；
 * 4. tint：tintColor withAlpha(min(tintAlpha * tintScale, 0.12)) —— H1 硬约束钳制；
 * 5. 压暗：#000 @ dimmingAlpha；
 * 6. 高光：1dp #FFF @0.14 描边；
 * 7. 裁剪：圆角矩形 Path clip。
 *
 * 重绘触发：背景视图挂 OnPreDrawListener（返回 true 不拦截绘制），33ms 节流
 * （≈30fps），postInvalidateDelayed 排队；onDetachedFromWindow 清理。
 * 注意：不设 LAYER_TYPE_HARDWARE（任务书明确不设，保持默认 NONE，让 RenderNode
 * 路径直接落在父级硬件画布上）；isHardwareAvailable 只判 SDK_INT。
 */
class GlassKitView(context: Context) : View(context) {

    companion object {
        /** JS reduceTransparency 门控的总开关默认值由 Manager 传入，此处为视图默认。 */
        const val DEFAULT_TINT_ALPHA_MAX: Float = 0.12f
        /** 边缘高光描边宽度（dp）——glass.ts EDGE_HIGHLIGHT.widthDp 单层 1dp。 */
        const val EDGE_HIGHLIGHT_DP: Float = 1f
        /** 边缘高光 alpha ——glass.ts EDGE_HIGHLIGHT.alpha 0.14。 */
        const val EDGE_HIGHLIGHT_ALPHA: Float = 0.14f
        /** 26–30 / 透镜输入的近似模糊降采样档（清单 §二.2：降采样 1/4）。 */
        const val BLUR_DOWNSAMPLE: Int = 4
        /** 重绘节流间隔（ms，≈30fps）。 */
        const val FRAME_INTERVAL_MS: Long = 33L
        /** 捕获失败兜底底色：半透明白灰。 */
        const val FALLBACK_COLOR: Int = 0x4DFFFFFF
    }

    /* ---------------- props（GlassKitManager @ReactProp 一一对应） ---------------- */

    /** 背景容器 tag（GlassKitBackdrop 的原生 view id）。 */
    var backdropTag: Int = View.NO_ID
        set(value) {
            if (field == value) return
            field = value
            resolveTarget()
            invalidate()
        }

    /** 基准模糊半径（dp；最终半径 = blurDp * blurScale * density）。 */
    var blurDp: Float = 0f
        set(value) {
            if (field == value) return
            field = value
            invalidate()
        }

    /** tint 基准 alpha（最终 alpha = min(tintAlpha * tintScale, 0.12)）。 */
    var tintAlpha: Float = 0f
        set(value) {
            if (field == value) return
            field = value
            invalidate()
        }

    /** tint 颜色（ColorInt；alpha 分量被 withAlpha 覆盖，只取 RGB）。 */
    var tintColor: Int = 0
        set(value) {
            if (field == value) return
            field = value
            invalidate()
        }

    /** 折射位移基准（px；透镜时乘 lensScale）。 */
    var refractionPx: Float = 0f
        set(value) {
            if (field == value) return
            field = value
            invalidate()
        }

    /** 色散位移基准（px；透镜时乘 lensScale）。 */
    var dispersionPx: Float = 0f
        set(value) {
            if (field == value) return
            field = value
            invalidate()
        }

    /** 圆角半径（dp）。 */
    var cornerRadiusDp: Float = 0f
        set(value) {
            if (field == value) return
            field = value
            invalidate()
        }

    /** 压暗层 alpha（#000，独立于 tint）。 */
    var dimmingAlpha: Float = 0f
        set(value) {
            if (field == value) return
            field = value
            invalidate()
        }

    /** 模糊倍率（glass.ts blurScale，区间 0–2.5 由 JS store 钳制）。 */
    var blurScale: Float = 1f
        set(value) {
            if (field == value) return
            field = value
            invalidate()
        }

    /** tint 倍率（glass.ts tintScale，区间 0–3 由 JS store 钳制）。 */
    var tintScale: Float = 1f
        set(value) {
            if (field == value) return
            field = value
            invalidate()
        }

    /** 透镜倍率（glass.ts lensScale，区间 0–2 由 JS store 钳制；0 = 关透镜）。 */
    var lensScale: Float = 1f
        set(value) {
            if (field == value) return
            field = value
            invalidate()
        }

    /** 模糊总开关（JS reduceTransparency 门控用）。 */
    var blurEnabled: Boolean = true
        set(value) {
            if (field == value) return
            field = value
            invalidate()
        }

    /* ---------------- 内部状态 ---------------- */

    private val density: Float = resources.displayMetrics.density

    private val capturePaint: Paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
    private val tintPaint: Paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val dimmingPaint: Paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val strokePaint: Paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        color = Color.WHITE
        alpha = Math.round(EDGE_HIGHLIGHT_ALPHA * 255f)
    }
    private val clipPath: Path = Path()
    private val clipRect: RectF = RectF()

    /** 背景目标视图（弱注册表解析结果，附 PreDraw 监听）。 */
    private var targetView: View? = null

    /** 采集位图缓存（尺寸随视图 / 降采样档变化重建）。 */
    private var captureBitmap: Bitmap? = null
    /** 近似模糊的小位图缓存（宽高 = 视图 / BLUR_DOWNSAMPLE）。 */
    private var smallBlurBitmap: Bitmap? = null

    /** API 31+ RenderNode 模糊路径的复用节点。 */
    private var blurRenderNode: RenderNode? = null

    /** API 33+ 透镜 RuntimeShader 缓存（位图实例变化时重建，uniform 每次 draw 重设）。 */
    private var lensRuntimeShader: RuntimeShader? = null
    private var lensShaderBitmap: Bitmap? = null

    private val preDrawListener = ViewTreeObserver.OnPreDrawListener {
        scheduleThrottledInvalidate()
        true // 恒返回 true：只监听，不拦截背景树自身的绘制
    }
    private var lastInvalidateAt: Long = 0L

    /** 硬件模糊能力：只按 SDK_INT 判（清单 §二.2 / 任务书「isHardwareAvailable」）。 */
    val isHardwareAvailable: Boolean
        get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

    /* ---------------- 生命周期与重绘触发 ---------------- */

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        resolveTarget()
    }

    override fun onDetachedFromWindow() {
        detachPreDraw()
        super.onDetachedFromWindow()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        releaseBitmaps()
        invalidate()
    }

    /** 解析背景目标并挂 PreDraw 监听（幂等；onDraw 中目标缺失时也会惰性重试）。 */
    private fun resolveTarget() {
        val newTarget = if (backdropTag == View.NO_ID) null else GlassCaptureEngine.find(backdropTag)
        val oldTarget = targetView
        if (oldTarget === newTarget) return
        detachPreDraw()
        targetView = newTarget
        attachPreDraw()
    }

    private fun attachPreDraw() {
        val target = targetView ?: return
        target.viewTreeObserver.addOnPreDrawListener(preDrawListener)
    }

    private fun detachPreDraw() {
        val target = targetView ?: return
        val observer = target.viewTreeObserver
        if (observer.isAlive) {
            observer.removeOnPreDrawListener(preDrawListener)
        }
    }

    /** 33ms 节流：到点直接 invalidate，未到点用 postInvalidateDelayed 排队到下一拍。 */
    private fun scheduleThrottledInvalidate() {
        val now = SystemClock.uptimeMillis()
        val elapsed = now - lastInvalidateAt
        if (elapsed >= FRAME_INTERVAL_MS) {
            lastInvalidateAt = now
            postInvalidate()
        } else {
            postInvalidateDelayed(FRAME_INTERVAL_MS - elapsed)
        }
    }

    private fun releaseBitmaps() {
        captureBitmap?.recycle()
        captureBitmap = null
        smallBlurBitmap?.recycle()
        smallBlurBitmap = null
        blurRenderNode = null
        lensRuntimeShader = null
        lensShaderBitmap = null
    }

    /* ---------------- 渲染管线 ---------------- */

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width
        val h = height
        if (w <= 0 || h <= 0) return

        // ⑦ 圆角裁剪：所有层（含采集 / 模糊 / tint / 压暗 / 描边）统一走 clip
        val cornerRadiusPx = cornerRadiusDp * density
        if (cornerRadiusPx > 0f) {
            clipRect.set(0f, 0f, w.toFloat(), h.toFloat())
            clipPath.reset()
            clipPath.addRoundRect(clipRect, cornerRadiusPx, cornerRadiusPx, Path.Direction.CW)
            canvas.clipPath(clipPath)
        }

        // 目标缺失时惰性重试（backdrop 可能晚于玻璃面板挂载）
        if (targetView == null && backdropTag != View.NO_ID) {
            resolveTarget()
        }

        // ① 捕获
        val capture = obtainCaptureBitmap(w, h)
        val captureOk = capture != null &&
            targetView != null &&
            GlassCaptureEngine.capture(targetView!!, this, capture!!)

        if (blurEnabled && captureOk && capture != null) {
            // ② 模糊 + ③ 透镜
            val blurRadiusPx = blurDp * blurScale * density
            val lensActive = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                lensScale > 0f && (refractionPx > 0f || dispersionPx > 0f)
            if (lensActive) {
                drawLensLayer(canvas, capture, w, h, cornerRadiusPx)
            } else if (blurRadiusPx >= 0.5f) {
                drawBlurredLayer(canvas, capture, blurRadiusPx)
            } else {
                // 无模糊需求（blurDp=0 或 blurScale=0）：直接画清晰采集结果
                drawCaptureScaled(canvas, capture, w, h)
            }
        } else if (!blurEnabled || !captureOk) {
            // ① 失败兜底：半透明底色（总开关关闭时同样走兜底，不做任何采集）
            canvas.drawColor(FALLBACK_COLOR)
        }

        // ④ tint：H1 硬约束——任何 tint 计算最后一步钳到 0.12
        val finalTintAlpha = (tintAlpha * tintScale).coerceIn(0f, DEFAULT_TINT_ALPHA_MAX)
        if (tintColor != 0 && finalTintAlpha > 0f) {
            tintPaint.color = tintColor
            tintPaint.alpha = Math.round(finalTintAlpha * 255f)
            canvas.drawRect(0f, 0f, w.toFloat(), h.toFloat(), tintPaint)
        }

        // ⑤ 压暗：#000 @ dimmingAlpha（独立于 tint）
        if (dimmingAlpha > 0f) {
            dimmingPaint.color = Color.BLACK
            dimmingPaint.alpha = Math.round(dimmingAlpha.coerceIn(0f, 1f) * 255f)
            canvas.drawRect(0f, 0f, w.toFloat(), h.toFloat(), dimmingPaint)
        }

        // ⑥ 边缘高光：1dp #FFF @0.14（描边宽度受圆角影响画在边界内）
        if (cornerRadiusPx > 0f) {
            strokePaint.strokeWidth = EDGE_HIGHLIGHT_DP * density
            canvas.drawPath(clipPath, strokePaint)
        }
    }

    /**
     * 采集位图缓存：宽度超 MAX_CAPTURE_WIDTH_PX 时按比例降采样，
     * 视图尺寸变化时重建。返回 null 表示无法预算（视图尺寸异常）。
     */
    private fun obtainCaptureBitmap(w: Int, h: Int): Bitmap? {
        if (w <= 0 || h <= 0) return null
        val scale = minOf(1f, GlassCaptureEngine.MAX_CAPTURE_WIDTH_PX.toFloat() / w.toFloat())
        val bw = Math.max(1, Math.round(w * scale))
        val bh = Math.max(1, Math.round(h * scale))
        var bitmap = captureBitmap
        if (bitmap == null || bitmap.width != bw || bitmap.height != bh) {
            if (bitmap != null && !bitmap.isRecycled) bitmap.recycle()
            bitmap = Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888)
            captureBitmap = bitmap
        }
        return bitmap
    }

    /** 采集位图 → 视图尺寸的等比缩放绘制（清晰 / 非模糊路径共用）。 */
    private fun drawCaptureScaled(canvas: Canvas, capture: Bitmap, w: Int, h: Int) {
        canvas.drawBitmap(capture, null, RectF(0f, 0f, w.toFloat(), h.toFloat()), capturePaint)
    }

    /**
     * ② 模糊路径：
     * - API 31+ 且硬件画布：RenderNode + RenderEffect.createBlurEffect（真高斯）；
     * - 否则（API 26–30 / 软件画布）：降采样 1/4 + 双线性放大近似。
     */
    private fun drawBlurredLayer(canvas: Canvas, capture: Bitmap, blurRadiusPx: Float) {
        val w = width
        val h = height
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && canvas.isHardwareAccelerated) {
            val node = obtainBlurRenderNode(w, h)
            val radius = blurRadiusPx.coerceAtLeast(0.5f)
            node.setRenderEffect(
                RenderEffect.createBlurEffect(radius, radius, Shader.TileMode.CLAMP)
            )
            val recording = node.beginRecording()
            try {
                recording.drawBitmap(capture, null, RectF(0f, 0f, w.toFloat(), h.toFloat()), capturePaint)
            } finally {
                node.endRecording()
            }
            canvas.drawRenderNode(node)
        } else {
            // API 26–30 降级：1/4 降采样 + 双线性放大（近似模糊，H2 单档语义）
            val small = obtainSmallBlurBitmap(w, h, capture) ?: return
            canvas.drawBitmap(
                small,
                null,
                RectF(0f, 0f, w.toFloat(), h.toFloat()),
                capturePaint,
            )
        }
    }

    /**
     * ③ 透镜路径（API 33+）：模糊结果（小位图）作 BitmapShader 喂 RuntimeShader，
     * uRefractionPx / uDispersionPx 乘 lensScale，一次 drawRect 逐像素求值。
     */
    private fun drawLensLayer(
        canvas: Canvas,
        capture: Bitmap,
        w: Int,
        h: Int,
        cornerRadiusPx: Float,
    ) {
        // 透镜输入统一用降采样近似模糊位图（软件位图才能喂 BitmapShader；
        // RenderEffect 离屏出位图需 HardwareRenderer/ImageReader，登记为未来增强）
        val small = obtainSmallBlurBitmap(w, h, capture) ?: return
        val shader = obtainLensShader(small, w, h, cornerRadiusPx) ?: return
        val refraction = refractionPx * lensScale
        val dispersion = dispersionPx * lensScale
        shader.setFloatUniform("uRefractionPx", refraction)
        shader.setFloatUniform("uDispersionPx", dispersion)
        val lensPaint = Paint(Paint.ANTI_ALIAS_FLAG)
        lensPaint.shader = shader
        canvas.drawRect(0f, 0f, w.toFloat(), h.toFloat(), lensPaint)
    }

    /** 降采样小位图缓存：视图 / BLUR_DOWNSAMPLE，含采集内容的等比缩小。 */
    private fun obtainSmallBlurBitmap(w: Int, h: Int, capture: Bitmap): Bitmap? {
        val sw = Math.max(1, w / BLUR_DOWNSAMPLE)
        val sh = Math.max(1, h / BLUR_DOWNSAMPLE)
        var small = smallBlurBitmap
        if (small == null || small.width != sw || small.height != sh) {
            if (small != null && !small.isRecycled) small.recycle()
            small = Bitmap.createBitmap(sw, sh, Bitmap.Config.ARGB_8888)
            smallBlurBitmap = small
        }
        // 复用位图先清空上一帧内容（采集结果可能含透明区域，避免残影）
        small.eraseColor(Color.TRANSPARENT)
        val smallCanvas = Canvas(small)
        smallCanvas.drawBitmap(capture, null, RectF(0f, 0f, sw.toFloat(), sh.toFloat()), capturePaint)
        return small
    }

    /** RenderNode 复用：尺寸变化时重建（setPosition 在此处统一设置）。 */
    private fun obtainBlurRenderNode(w: Int, h: Int): RenderNode {
        var node = blurRenderNode
        if (node == null || node.width != w || node.height != h) {
            node = RenderNode("GlassKitBlur")
            node.setPosition(0, 0, w, h)
            blurRenderNode = node
        }
        return node
    }

    /** RuntimeShader 缓存：位图实例变化时重建（避免每帧解析 AGSL），uniform 每次 draw 重设。 */
    private fun obtainLensShader(
        small: Bitmap,
        w: Int,
        h: Int,
        cornerRadiusPx: Float,
    ): RuntimeShader? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return null
        var shader = lensRuntimeShader
        if (shader == null || lensShaderBitmap !== small) {
            shader = GlassLensShader.create(
                blurSource = small,
                viewWidthPx = w.toFloat(),
                viewHeightPx = h.toFloat(),
                refractionPx = 1f, // 占位：每次 draw 用 setFloatUniform 覆盖
                dispersionPx = 0f,
                cornerRadiusPx = cornerRadiusPx,
                scaleX = w.toFloat() / small.width.toFloat(),
                scaleY = h.toFloat() / small.height.toFloat(),
            )
            lensRuntimeShader = shader
            lensShaderBitmap = small
        } else {
            shader.setFloatUniform("uSize", w.toFloat(), h.toFloat())
            shader.setFloatUniform("uCornerRadiusPx", cornerRadiusPx)
        }
        return shader
    }
}
