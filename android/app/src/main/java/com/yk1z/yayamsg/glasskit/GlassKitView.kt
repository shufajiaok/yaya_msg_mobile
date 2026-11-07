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
import android.util.Log
import kotlin.math.floor
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
 * QA Round 1 修复：attach 幂等重挂（E1）、observer 实例缓存防 dead 滞留（E2）、
 * backdrop 晚挂载有限重试（E3）、NaN 拦截（S4）、alpha floor 取整（S1）、
 * RenderEffect 缓存复用（S2）。
 * QA Round 2 修复：detachPreDraw 补第三降级路径——cached 与 targetView 的
 * observer 均无效时用 glass 自身 viewTreeObserver 移除（E2 场景①残余泄漏，
 * F1）；backdropTag 变更时重置 E3 重试计数（F2）；dimmingAlpha /
 * cornerRadiusDp 补 isFinite 兜底（F3）。
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
        /**
         * 近似模糊降采样档（清单 §二.2 原 1/4；实测上调 1/6）：
         * 1/4 + 双线性放大的 10%-90% 边缘过渡宽度实测仅 ~6px（真机像素脚本），
         * 不满足「面板内 ≥8px」验收线；1/6 实测 ~9px 达标。透镜输入同步受益
         * （obtainSmallBlurBitmap 共用本档，AGSL 侧有 scaleX/scaleY 补偿）。
         */
        const val BLUR_DOWNSAMPLE: Int = 6
        /** 重绘节流间隔（ms，≈30fps）。 */
        const val FRAME_INTERVAL_MS: Long = 33L
        /** 捕获失败兜底底色：半透明白灰。 */
        const val FALLBACK_COLOR: Int = 0x4DFFFFFF
        /** E3 修复：backdrop 晚挂载时 resolveTarget 空结果的重试间隔（ms）。 */
        const val TARGET_RETRY_DELAY_MS: Long = 100L
        /** E3 修复：重试上限（50 次 ≈ 5s），防无限循环。 */
        const val TARGET_RETRY_MAX: Int = 50

        /**
         * 模糊路径强制降级开关：
         * true = 跳过 RenderNode + RenderEffect 真高斯分支，一律走 26–30 降级路径
         * （obtainSmallBlurBitmap 1/4 降采样 + 双线性放大近似）。
         *
         * 实测结论（2026-11-07 MuMu emulator-5554 / Android 15 API 35 / x86_64）：
         * logcat 证实走了 rendernode 分支（blurRadiusPx=21.0、RenderEffect created
         * 572x126、hardwareAccelerated=true），但像素级分析蓝球左边缘 B-R 通道
         * 10%-90% 过渡宽度仅 1px（应有 ≥40px 高斯过渡带）→ 模拟器 GPU 接受了
         * RenderEffect 却不执行模糊（Skia/ANGLE RenderEffect 支持缺陷）。
         * 故置 true 强制走降采样近似路径；真机（GPU 正常执行 RenderEffect）可改回
         * false 恢复真高斯。
         */
        const val PREFER_DOWNSAMPLE_BLUR: Boolean = true

        /** drawBlurredLayer 诊断日志 tag（logcat: adb logcat -s GlassKitBlur）。 */
        const val BLUR_LOG_TAG: String = "GlassKitBlur"
    }

    /* ---------------- props（GlassKitManager @ReactProp 一一对应） ---------------- */

    /** 背景容器 tag（GlassKitBackdrop 的原生 view id）。 */
    var backdropTag: Int = View.NO_ID
        set(value) {
            if (field == value) return
            field = value
            // F2 修复：换新 tag = 全新的 backdrop 解析任务，重置 E3 有限重试
            // 计数器，重新获得完整 50 次重试预算（否则前一个 tag 耗尽的计数
            // 会连累新 tag 的晚挂载重试提前停摆）
            pendingResolveRetries = 0
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
            // 诊断：核对桥接层实际送达的色值（0 = JS 未送/送 null，排查 tint 丢失）
            if (field != value) {
                Log.i(logTag, "setTintColor: $value (0x%08X)".format(value))
            }
            if (field == value) return
            field = value
            invalidate()
        }

    /** 折射位移基准（px；透镜时乘 lensScale）。 */
    var refractionPx: Float = 0f
        set(value) {
            // S4 修复：NaN/Infinity 一律回退 0f，杜绝穿透进 RuntimeShader
            //（onDraw 的 >0f 门挡不住 NaN：NaN > 0f == false 但 NaN 会喂给 uniform）
            val v = if (value.isFinite()) value else 0f
            if (field == v) return
            field = v
            invalidate()
        }

    /** 色散位移基准（px；透镜时乘 lensScale）。 */
    var dispersionPx: Float = 0f
        set(value) {
            // S4 修复：同 refractionPx，NaN/Infinity 回退 0f
            val v = if (value.isFinite()) value else 0f
            if (field == v) return
            field = v
            invalidate()
        }

    /** 圆角半径（dp）。 */
    var cornerRadiusDp: Float = 0f
        set(value) {
            // F3 修复：NaN/Infinity 回退 0f（同 S4 refractionPx 式），统一 NaN 防护
            val v = if (value.isFinite()) value else 0f
            if (field == v) return
            field = v
            invalidate()
        }

    /** 压暗层 alpha（#000，独立于 tint）。 */
    var dimmingAlpha: Float = 0f
        set(value) {
            // F3 修复：NaN/Infinity 回退 0f（同 S4 refractionPx 式），统一 NaN 防护
            val v = if (value.isFinite()) value else 0f
            if (field == v) return
            field = v
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

    /** drawBlurredLayer 诊断日志 tag（companion.BLUR_LOG_TAG 同值，实例侧便捷引用）。 */
    private val logTag: String = BLUR_LOG_TAG

    /** 分支切换防刷屏：记录上一条日志的路径标签，同路径不重复打（RenderEffect 新建除外）。 */
    private var lastLoggedBlurPath: String? = null

    /** 一次性 prop 快照日志：首个 onDraw 打一条，核对桥接层实际到手的 prop 值。 */
    private var loggedPropsSnapshot: Boolean = false

    private val capturePaint: Paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
    private val tintPaint: Paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val dimmingPaint: Paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val strokePaint: Paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        color = Color.WHITE
        // S1 修复：floor 取整（round(0.14*255)=36 → 36/255≈0.1412 微超 0.14；
        // floor=35 → 35/255≈0.1373 ≤ 0.14，alpha 契约恒不超出）
        alpha = floor(EDGE_HIGHLIGHT_ALPHA * 255f).toInt()
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

    /** S2 修复：RenderEffect 缓存（半径/尺寸变化才重建，避免每帧新建；detach 释放）。 */
    private var blurEffect: RenderEffect? = null
    private var blurEffectRadiusPx: Float = -1f
    private var blurEffectWidth: Int = -1
    private var blurEffectHeight: Int = -1

    /** API 33+ 透镜 RuntimeShader 缓存（位图实例变化时重建，uniform 每次 draw 重设）。 */
    private var lensRuntimeShader: RuntimeShader? = null
    private var lensShaderBitmap: Bitmap? = null

    private val preDrawListener = ViewTreeObserver.OnPreDrawListener {
        scheduleThrottledInvalidate()
        true // 恒返回 true：只监听，不拦截背景树自身的绘制
    }

    /** E2 修复：实际挂 OnPreDrawListener 的 ViewTreeObserver 实例缓存。
     *  backdrop 先卸载时其 observer 会 merge 进根 observer 且 isAlive=false，
     *  仅靠 target.viewTreeObserver 移除会静默失败 → listener 强引用本视图泄漏。 */
    private var attachedObserver: ViewTreeObserver? = null

    /** E3 修复：backdrop 晚挂载时 resolveTarget 空结果的有限重试计数。 */
    private var pendingResolveRetries: Int = 0

    private var lastInvalidateAt: Long = 0L

    /** 硬件模糊能力：只按 SDK_INT 判（清单 §二.2 / 任务书「isHardwareAvailable」）。 */
    val isHardwareAvailable: Boolean
        get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

    /* ---------------- 生命周期与重绘触发 ---------------- */

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        // E1 修复：无条件重挂 PreDraw 监听。detach→re-attach 后 targetView 不变，
        // resolveTarget 的 oldTarget===newTarget 早退分支会跳过 attach，
        // 而 onDetachedFromWindow 已把 listener 摘掉 → 玻璃永不再跟随。
        // attachPreDraw 自身幂等（挂前先安全移除），重复调用不产生重复 listener。
        resolveTarget()
        attachPreDraw()
    }

    override fun onDetachedFromWindow() {
        detachPreDraw()
        // S2 修复：RenderEffect 缓存随 detach 释放，不留跨窗口引用
        releaseBlurEffect()
        // E2 修复：不跨窗口持有 backdrop 视图引用（重挂载时 resolveTarget 会从
        // 注册表重新解析，早退分支依赖的 targetView 重建后依然正确）
        targetView = null
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
        // E3 修复：backdrop 晚于玻璃面板挂载时，目标缺失且无任何 invalidate 来源，
        // 玻璃会永远卡兜底底色。这里给「有限重试」：100ms 延迟 invalidate 排队，
        // 上限 TARGET_RETRY_MAX 次（≈5s），找到目标或超上限即停，不无限循环。
        if (newTarget == null && backdropTag != View.NO_ID) {
            if (pendingResolveRetries < TARGET_RETRY_MAX) {
                pendingResolveRetries++
                postInvalidateDelayed(TARGET_RETRY_DELAY_MS)
            }
        } else {
            pendingResolveRetries = 0
        }
        val oldTarget = targetView
        if (oldTarget === newTarget) return
        detachPreDraw()
        targetView = newTarget
        attachPreDraw()
    }

    /** 挂 PreDraw 监听（幂等：挂前先安全移除再挂，支持 onAttachedToWindow 无条件调用）。 */
    private fun attachPreDraw() {
        val target = targetView ?: return
        detachPreDraw()
        val observer = target.viewTreeObserver
        if (!observer.isAlive) return
        observer.addOnPreDrawListener(preDrawListener)
        // E2 修复：登记实际挂载的 observer 实例，detach 时优先用它移除
        attachedObserver = observer
    }

    private fun detachPreDraw() {
        // E2 修复 + F1 修复：三级降级移除链（任何一级成功移除即止，最后统一
        // 清空 attachedObserver 缓存，确保无残留引用）。
        //
        // F1 泄漏时序（QA Round 2 场景①残余）：glass attach 时 backdrop 尚未
        // attach → listener 挂在 backdrop 的【子 ViewTreeObserver】上 → backdrop
        // attach 后子 observer merge 进窗口根 observer、子 observer 变 dead
        // （attachedObserver.isAlive=false）→ backdrop 先卸载（glass 仍 attached）
        // → glass 后 detach：cached dead 不命中第一步；降级第二步里 targetView
        // 就是已卸载的 backdrop 本身，其 observer 同样 dead/无效 → merge 时拷贝
        // 进根 observer 的 listener 滞留，glass View 被强引用泄漏至窗口销毁。
        // ⇒ 新增第三步：用 glass 自身 viewTreeObserver 移除——glass 在 attach
        // 期间它就是窗口根 observer，merge 拷贝进根 observer 的 listener 可由此
        // 摘除。
        var removed = false

        // 第一步：优先用缓存的实际挂载实例移除
        val cached = attachedObserver
        if (cached != null && cached.isAlive) {
            try {
                cached.removeOnPreDrawListener(preDrawListener)
                removed = true
            } catch (_: Exception) {
                // 移除失败则落到下一级降级路径
            }
        }

        // 第二步：cached dead / 缺失时，用合并后的存活 observer 再试（merge 时
        // listener 会被拷贝进目标 observer，backdrop 未卸载场景通常在此成功）
        if (!removed) {
            targetView?.viewTreeObserver
                ?.takeIf { it.isAlive }
                ?.let { observer ->
                    try {
                        observer.removeOnPreDrawListener(preDrawListener)
                        removed = true
                    } catch (_: Exception) {
                        // 落到第三步
                    }
                }
        }

        // 第三步（F1）：targetView 的 observer 不可达/无效（backdrop 已先卸载）
        // 时，用 glass 自身 viewTreeObserver 移除。onDetachedFromWindow 内访问
        // 自身 viewTreeObserver 合法，但仍做判空 + try 防御，杜绝任何异常打断
        // detach 清理链。
        if (!removed) {
            val selfObserver = try {
                viewTreeObserver?.takeIf { it.isAlive }
            } catch (_: Exception) {
                null
            }
            selfObserver?.let { observer ->
                try {
                    observer.removeOnPreDrawListener(preDrawListener)
                } catch (_: Exception) {
                    // 全路径失败：listener 滞留与旧行为一致，不再抛出打断 detach
                }
            }
        }

        // E2/F1 修复：detach 后清空缓存，确保无残留引用
        attachedObserver = null
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
        // S2 修复：尺寸变化路径同样释放 RenderEffect 缓存
        releaseBlurEffect()
        lensRuntimeShader = null
        lensShaderBitmap = null
    }

    /** S2 修复：释放 RenderEffect 缓存（detach / 尺寸变化时调用）。 */
    private fun releaseBlurEffect() {
        blurEffect = null
        blurEffectRadiusPx = -1f
        blurEffectWidth = -1
        blurEffectHeight = -1
    }

    /* ---------------- 渲染管线 ---------------- */

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (!loggedPropsSnapshot) {
            loggedPropsSnapshot = true
            Log.i(
                logTag,
                "props snapshot: blurDp=$blurDp blurScale=$blurScale tintAlpha=$tintAlpha" +
                    " tintColor=$tintColor tintScale=$tintScale lensScale=$lensScale" +
                    " refractionPx=$refractionPx dispersionPx=$dispersionPx" +
                    " cornerRadiusDp=$cornerRadiusDp dimmingAlpha=$dimmingAlpha" +
                    " blurEnabled=$blurEnabled backdropTag=$backdropTag size=${width}x$height",
            )
        }
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
            // S1 修复：floor 取整（round(0.12*255)=31 → 31/255≈0.1216 微超 0.12；
            // floor=30 → 30/255≈0.1176 ≤ 0.12，H1 契约恒不超出）
            tintPaint.alpha = floor(finalTintAlpha * 255f).toInt()
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
     * - PREFER_DOWNSAMPLE_BLUR=false 且 API 31+ 且硬件画布：
     *   RenderNode + RenderEffect.createBlurEffect（真高斯）；
     * - 否则（PREFER_DOWNSAMPLE 强制降级 / API 26–30 / 软件画布）：
     *   降采样 1/4 + 双线性放大近似。
     *
     * 诊断日志（GlassKitBlur tag）：仅在「分支切换」或「RenderEffect 新建」时各打一条，
     * 输出路径分支 + blurRadiusPx + canvas.isHardwareAccelerated，防每帧刷屏。
     * 装机排查法：adb logcat -s GlassKitBlur —— 若显示走了 rendernode 分支但画面
     * 不模糊（像素脚本过渡宽度 1px），说明模拟器 GPU 对 RenderEffect 支持有问题，
     * 把 companion.PREFER_DOWNSAMPLE_BLUR 置 true 强制走降采样近似路径。
     */
    private fun drawBlurredLayer(canvas: Canvas, capture: Bitmap, blurRadiusPx: Float) {
        val w = width
        val h = height
        val useRenderNode = !PREFER_DOWNSAMPLE_BLUR &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            canvas.isHardwareAccelerated
        if (useRenderNode) {
            logBlurPathOnce("rendernode", blurRadiusPx, canvas.isHardwareAccelerated)
            val node = obtainBlurRenderNode(w, h)
            val radius = blurRadiusPx.coerceAtLeast(0.5f)
            // S2 修复：RenderEffect 走缓存，半径/尺寸不变时复用（原实现每帧新建）
            node.setRenderEffect(obtainBlurEffect(radius, w, h))
            val recording = node.beginRecording()
            try {
                recording.drawBitmap(capture, null, RectF(0f, 0f, w.toFloat(), h.toFloat()), capturePaint)
            } finally {
                node.endRecording()
            }
            canvas.drawRenderNode(node)
        } else {
            logBlurPathOnce(
                if (PREFER_DOWNSAMPLE_BLUR) "downsample(forced)" else "downsample(fallback)",
                blurRadiusPx,
                canvas.isHardwareAccelerated,
            )
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
     * 模糊路径诊断日志：同一分支只打一条（lastLoggedBlurPath 去重），
     * 分支切换（强制降级开关翻转 / 硬件加速状态变化）时重新打一条。
     */
    private fun logBlurPathOnce(path: String, blurRadiusPx: Float, hardwareAccelerated: Boolean) {
        if (lastLoggedBlurPath == path) return
        lastLoggedBlurPath = path
        Log.i(
            logTag,
            "blur path=$path blurRadiusPx=$blurRadiusPx" +
                " hardwareAccelerated=$hardwareAccelerated" +
                " preferDownsample=$PREFER_DOWNSAMPLE_BLUR sdk=${Build.VERSION.SDK_INT}",
        )
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

    /**
     * S2 修复：RenderEffect 缓存。半径或视图尺寸不变时直接复用缓存实例，
     * 仅在变化时新建（原实现每帧 createBlurEffect，高频分配压力）。
     * 仅在 SDK_INT >= S 且硬件画布分支调用。
     */
    private fun obtainBlurEffect(radiusPx: Float, w: Int, h: Int): RenderEffect {
        val cached = blurEffect
        if (cached != null &&
            blurEffectRadiusPx == radiusPx &&
            blurEffectWidth == w &&
            blurEffectHeight == h
        ) {
            return cached
        }
        val effect = RenderEffect.createBlurEffect(radiusPx, radiusPx, Shader.TileMode.CLAMP)
        blurEffect = effect
        blurEffectRadiusPx = radiusPx
        blurEffectWidth = w
        blurEffectHeight = h
        // 诊断日志：仅 RenderEffect 新建时打一条（缓存命中静默，防每帧刷屏）
        Log.i(logTag, "RenderEffect created radiusPx=$radiusPx size=${w}x$h")
        return effect
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
