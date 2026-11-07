package com.yk1z.yayamsg.glasskit

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
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
 *    API 26–30 / 软件画布 → 固定档降采样 1/6 + 双线性放大近似（H2 单档语义，纯模糊路径不变）；
 * 3. 透镜（it.4 真模糊化输入，QA Round 1 回修版）：API 33+ 且 lensScale>0 且
 *    refraction/dispersion>0 → 透镜输入位图 =「固定适度降采样 1/4 + 小图 CPU
 *    box blur ×3 迭代近似高斯（stack blur，IntArray 逐像素）」（见
 *    obtainLensInputShader）：先把采集结果缩到 1/4 小图，再在小图坐标系内以
 *    radius = blurRadiusPx / 4 做三盒高斯近似，模糊后经 BitmapShader 放大喂
 *    RuntimeShader（uRefractionPx / uDispersionPx 已乘 lensScale）——先模糊后放大，
 *    无硬边、无锯齿。⚠️ 首版 BlurMaskFilter 方案已被 QA 证伪并废弃：
 *    BlurMaskFilter 只作用于绘制图元的 alpha 遮罩（几何边缘），不模糊位图内容
 *    （管线顺序 geometry→mask→maskFilter→×shader color），外扩 pad 后可见区
 *    全在遮罩内部，模糊零视觉贡献。⚠️ it.3 的「降采样系数随模糊半径自适应
 *    （lensDownsampleFactor）」同样已废弃为锯齿源：降采样+双线性放大本质产出
 *    锯齿而非高斯，factor 变化只是锯齿块变大。blurScale≈0（blurRadiusPx<0.5）
 *    时跳过模糊，直接零拷贝绑定全分辨率 capture（清晰折射观感对齐 it.3）；
 *    模糊与透镜不互斥，四面板对 blurScale / lensScale 同时有可见响应；
 *    非透镜面板走纯模糊路径不变；
 * 4. tint：tintColor withAlpha(min(tintAlpha * tintScale, 0.12)) —— H1 硬约束钳制；
 * 5. 压暗：#000 @ dimmingAlpha；
 * 6. 高光：1dp #FFF @0.14 描边；
 * 7. 裁剪：圆角矩形 Path clip。
 *
 * 重绘触发：背景视图挂 OnPreDrawListener（返回 true 不拦截绘制），33ms 节流
 * （≈30fps），postInvalidateDelayed 排队；onDetachedFromWindow 清理。
 * it.4 重绘触发改造：① PreDraw 检测面板 onScreen 位置变化 → 立即 invalidate 绕过
 * 节流（拖动/滚动时 capture offset 与面板框逐帧对齐，修复「拖动内容抖动」）；
 * ② 自激励环打断——自身 postInvalidate 引发的 traversal 不再续期（修复静止期
 * 无限重绘，15s 静止实测 5872 行日志 ~50fps/面板）；③ 透镜输入双缓冲 ping-pong
 * （UI 每帧变异位图 vs RenderThread BitmapShader 采样的跨帧竞态根除，修复
 * 「静止时遮挡/不遮挡切换」闪烁——竞态本身日志不可见，属静态分析定论）。
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

        /**
         * it.4 透镜输入固定降采样档（常量，不再随模糊半径变化——it.3 的
         * lensDownsampleFactor 自适应设计已废弃为锯齿源，见类头注释）。
         * 1/4 是「小图 CPU box blur 成本」与「放大后细节保留」的折中档：
         * hero 1264 宽 → 小图 ~316 宽，box blur 半径 ~12px，单帧成本可控。
         */
        const val LENS_DOWNSAMPLE: Int = 4

        /**
         * it.4-R2：透镜输入 box blur 半径上限（小图坐标系 px，QA 回修规格钳制值）。
         * radius = round(blurRadiusPx / LENS_DOWNSAMPLE)，三盒迭代的 sigma = radius/2。
         */
        const val MAX_LENS_BLUR_RADIUS: Int = 60
        /** 重绘节流间隔（ms，≈30fps）。 */
        const val FRAME_INTERVAL_MS: Long = 33L
        /** 捕获失败兜底底色：半透明白灰。 */
        const val FALLBACK_COLOR: Int = 0x4DFFFFFF
        /** E3 修复：backdrop 晚挂载时 resolveTarget 空结果的重试间隔（ms）。 */
        const val TARGET_RETRY_DELAY_MS: Long = 100L
        /** E3 修复：重试上限（50 次 ≈ 5s），防无限循环。 */
        const val TARGET_RETRY_MAX: Int = 50

        /**
         * 模糊路径强制降级开关：已从编译期常量改为 JS 可控 prop（forceDownsample，
         * GlassKitManager.setForceDownsample 注入）——真机默认走 RenderEffect 真高斯
         *（真机实装反馈：1/6 降采样双线性放大呈锯齿、模糊观感不足），模拟器由测试页
         * 开关按需强制降采样路径。
         *
         * 历史实测结论（2026-11-07 MuMu emulator-5554 / Android 15 API 35 / x86_64）：
         * logcat 证实走了 rendernode 分支（blurRadiusPx=21.0、RenderEffect created
         * 572x126、hardwareAccelerated=true），但像素级分析蓝球左边缘 B-R 通道
         * 10%-90% 过渡宽度仅 1px（应有 ≥40px 高斯过渡带）→ 该模拟器 GPU 接受了
         * RenderEffect 却不执行模糊（Skia/ANGLE RenderEffect 支持缺陷）。
         */
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

    /**
     * 柔光倍率（glass.ts glowScale，区间 0.05–2 由 JS store 钳制）。
     * 迭代接线：此前 glowScale 不进引擎（高光恒 1dp/0.14）——现作用于边缘高光，
     * 宽度 = 1dp × glowScale（clamp 0.5–4dp），alpha = 0.14 × glowScale（clamp 0–1）。
     */
    var glowScale: Float = 1f
        set(value) {
            val v = if (value.isFinite()) value else 1f
            if (field == v) return
            field = v
            invalidate()
        }

    /** it.6 柔光细化：描边亮度倍率（基准 alpha = 0.14 × glowScale × glowAlphaScale，clamp 0–1）。 */
    var glowAlphaScale: Float = 1f
        set(value) {
            val v = if (value.isFinite()) value else 1f
            if (field == v) return
            field = v
            invalidate()
        }

    /** it.6 柔光细化：描边宽度倍率（宽 = 1dp × glowScale × glowWidthScale，clamp 0.5–8dp）。 */
    var glowWidthScale: Float = 1f
        set(value) {
            val v = if (value.isFinite()) value else 1f
            if (field == v) return
            field = v
            invalidate()
        }

    /** it.6 柔光细化：顶缘高光加强倍率（视图上半描边 alpha 再乘本值，clamp 0–1 终值）。 */
    var glowTopScale: Float = 1f
        set(value) {
            val v = if (value.isFinite()) value else 1f
            if (field == v) return
            field = v
            invalidate()
        }

    /** it.6 柔光细化：底缘高光加强倍率（视图下半描边 alpha 再乘本值，clamp 0–1 终值）。 */
    var glowBottomScale: Float = 1f
        set(value) {
            val v = if (value.isFinite()) value else 1f
            if (field == v) return
            field = v
            invalidate()
        }

    /** 强制降采样模糊路径（模拟器 GPU 对 RenderEffect 支持缺陷时由测试页开关开启）。 */
    var forceDownsample: Boolean = false
        set(value) {
            if (field == value) return
            field = value
            // 路径切换后重置日志去重，让新分支重新打一条诊断日志
            lastLoggedBlurPath = null
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
    /** 近似模糊的小位图缓存（宽高 = 视图 / 降采样档；纯模糊路径专用）。 */
    private var smallBlurBitmap: Bitmap? = null
    /** it.3：小位图当前降采样系数（缓存按 (w,h,factor) 三元组判断重建）。 */
    private var smallBlurFactor: Int = 0

    /**
     * it.4：透镜输入位图双缓冲（ping-pong）——闪烁根因修复。
     * 单缓冲时 UI 线程每帧 eraseColor+重绘位图，而 RenderThread 的 BitmapShader
     * 仍在采样同一位图 → 跨帧竞态采样到全透明/半擦除帧 → 玻璃间歇变透明
     * （用户反馈「遮挡和不遮挡之间切换」）。双缓冲后第 N 帧写入的位图与第 N-1 帧
     * 被 RenderThread 采样的位图恒不同实例，竞态根除。
     */
    private val lensInputBuffers: Array<Bitmap?> = arrayOfNulls(2)
    /** it.4：双缓冲各自的 BitmapShader（绑定各自位图实例，位图重建时一并重建）。 */
    private val lensShaderInputs: Array<BitmapShader?> = arrayOfNulls(2)
    /** it.4：本帧写入的双缓冲槽位（0/1 交替）。 */
    private var lensInputSlot: Int = 0

    /* ------- it.4-R2（QA 回修）：小图 CPU box blur 缓冲与复用对象（零每帧分配） ------- */

    /** 各槽位像素缓冲（box blur 原地读写），尺寸随槽位位图复用。 */
    private val lensPixelBuffers: Array<IntArray?> = arrayOfNulls(2)
    /** box blur 水平/垂直 pass 的临时缓冲（UI 单线程使用，尺寸复用）。 */
    private var lensBlurTempBuffer: IntArray? = null
    /** 各槽位复用 Canvas（绑定槽位位图实例，位图重建时一并重建）。 */
    private val lensCanvases: Array<Canvas?> = arrayOfNulls(2)
    /** 三盒半径缓存（boxesForGauss 结果，radius 不变时复用）。 */
    private var lensBoxSizes: IntArray? = null
    private var lensBoxRadius: Int = -1
    /** 复用的输出/源缩放矩阵（避免每帧分配 Matrix）。 */
    private val lensMatrix: Matrix = Matrix()
    /** 复用的透镜输出 Paint（shader 每次 draw 重设）。 */
    private val lensPaint: Paint = Paint(Paint.ANTI_ALIAS_FLAG)
    /** 复用的降采样源矩形（避免每帧分配 RectF）。 */
    private val lensSrcRect: RectF = RectF()
    /**
     * blurScale≈0 清晰路径：零拷贝绑定全分辨率 capture 的 BitmapShader
     * （QA 观察项修复——恢复 it.3 全分辨率清晰折射观感）。capture 位图实例
     * 变化（尺寸重建）时重建；localMatrix 每帧重设（capture 可能超宽降采样）。
     */
    private var lensSharpShader: BitmapShader? = null
    private var lensSharpShaderCapture: Bitmap? = null

    /** API 31+ RenderNode 模糊路径的复用节点。 */
    private var blurRenderNode: RenderNode? = null

    /** S2 修复：RenderEffect 缓存（半径/尺寸变化才重建，避免每帧新建；detach 释放）。 */
    private var blurEffect: RenderEffect? = null
    private var blurEffectRadiusPx: Float = -1f
    private var blurEffectWidth: Int = -1
    private var blurEffectHeight: Int = -1

    /** API 33+ 透镜 RuntimeShader 缓存（源码静态，惰性创建；uBlurred / uniform 每次 draw 重设）。 */
    private var lensRuntimeShader: RuntimeShader? = null

    /** it.4：上次绘制时面板的 onScreen 坐标基线（PreDraw 位置变化检测用）。 */
    private val lastDrawnLocation: IntArray = IntArray(2)
    /** it.4：lastDrawnLocation 是否已初始化（首帧恒视为「位置已变化」）。 */
    private var hasLastDrawnLocation: Boolean = false
    /** it.4：位置检测复用缓冲（PreDraw 高频路径，避免每次分配 IntArray）。 */
    private val preDrawLocation: IntArray = IntArray(2)
    /**
     * it.4：自激励重绘环打断标记。自身 postInvalidate 引发的 traversal 不再续期——
     * 修复静止期无限 30~50fps 重绘（15s 静止日志 5872 行实测），功耗与竞态暴露窗口双降。
     * 外部刺激（backdrop 重绘 / prop 变更 / 面板位移）不设标记，照常调度。
     */
    private var selfInvalidationPending: Boolean = false

    private val preDrawListener = ViewTreeObserver.OnPreDrawListener {
        // it.4 修复（抖动）：面板 onScreen 位置变化（拖动 / 滚动）→ 立即 invalidate
        // 绕过 33ms 节流——重绘帧内 onDraw 用 getLocationOnScreen 现值采集，内容与
        // 面板框逐帧对齐；旧逻辑下未重跑 onDraw 的帧按旧位图在新位置重放，
        // 内容相对面板框瞬移（120Hz 真机上每两帧一跳即「拖动抖动」）。
        getLocationOnScreen(preDrawLocation)
        val moved = !hasLastDrawnLocation ||
            preDrawLocation[0] != lastDrawnLocation[0] ||
            preDrawLocation[1] != lastDrawnLocation[1]
        if (moved) {
            invalidate()
        } else if (selfInvalidationPending) {
            // it.4 修复（闪烁伴生）：本次 traversal 由自身 postInvalidate 触发
            // （静止自激励环）→ 不再续期，静止后自然停绘
            selfInvalidationPending = false
        } else {
            scheduleThrottledInvalidate()
        }
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
        // it.4：重置位置基线与自激励标记（重新 attach 后首帧按「位置已变化」处理）
        hasLastDrawnLocation = false
        selfInvalidationPending = false
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

    /** 33ms 节流：到点直接 invalidate，未到点用 postInvalidateDelayed 排队到下一拍。
     *  it.4：自激励环打断——本方法设置的 selfInvalidationPending 会让「由本调用引发的
     *  traversal」的 PreDraw 不再续期（见 preDrawListener）。 */
    private fun scheduleThrottledInvalidate() {
        val now = SystemClock.uptimeMillis()
        val elapsed = now - lastInvalidateAt
        if (elapsed >= FRAME_INTERVAL_MS) {
            lastInvalidateAt = now
            selfInvalidationPending = true
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
        smallBlurFactor = 0
        // it.4：双缓冲与各自 BitmapShader 一并释放（shader 强引用位图，
        // 不清会持有已 recycle 位图，RenderThread 采样有崩溃风险）
        for (i in lensInputBuffers.indices) {
            lensInputBuffers[i]?.let { if (!it.isRecycled) it.recycle() }
            lensInputBuffers[i] = null
            lensShaderInputs[i] = null
            // it.4-R2：像素缓冲 / Canvas 随槽位位图一并失效
            lensPixelBuffers[i] = null
            lensCanvases[i] = null
        }
        lensInputSlot = 0
        // it.4-R2：box blur 临时缓冲与三盒半径缓存一并失效
        lensBlurTempBuffer = null
        lensBoxSizes = null
        lensBoxRadius = -1
        // it.4-R2：清晰路径 shader 持有 capture 位图引用，一并失效
        lensSharpShader = null
        lensSharpShaderCapture = null
        // it.4：RuntimeShader 经 setInputShader 持有 BitmapShader → 位图引用链，
        // 位图已释放，shader 缓存一并失效（重建成本 = 一次 AGSL 解析，可忽略）
        lensRuntimeShader = null
        blurRenderNode = null
        // S2 修复：尺寸变化路径同样释放 RenderEffect 缓存
        releaseBlurEffect()
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

        // it.4：记录本帧 onScreen 位置基线（PreDraw 位置变化检测用；layout 已完成，
        // 此处取值即本帧最终位置）
        getLocationOnScreen(lastDrawnLocation)
        hasLastDrawnLocation = true

        // ⑦ 圆角裁剪：所有层（含采集 / 模糊 / tint / 压暗 / 描边）统一走 clip
        // it.5 修复：JS 侧惯用 radii.pill=999dp 表达胶囊 → cornerRadiusPx 远超半尺寸时
        // AGSL sdRoundRect 判定整个视图在形外（SDF>0 → shader 全透明）→ 透镜层整块消失
        //（胶囊无模糊/折射/透镜的根因）。钳到 min(w,h)/2 即标准胶囊语义，与 Skia
        // clip 路径自带的钳制行为对齐；普通面板半径小于半尺寸，钳制零影响。
        val cornerRadiusPx = minOf(cornerRadiusDp * density, minOf(w, h) / 2f)
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
                // it.4-R2：透镜输入真模糊化——固定 1/4 降采样 + 小图 CPU box blur ×3
                //（it.3 的自适应降采样近似已废弃为锯齿源，见类头注释）
                drawLensLayer(canvas, capture, w, h, cornerRadiusPx, blurRadiusPx)
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

        // ⑥ 边缘高光：#FFF @0.14 基准（it.6 柔光细化——描边亮度/宽度、顶缘/底缘
        //    加强均独立可调：宽 = 1dp × glowScale × glowWidthScale clamp 0.5–8dp；
        //    alpha = 0.14 × glowScale × glowAlphaScale clamp 0–1；视图上半/下半分别
        //    以 alpha × glowTopScale / glowBottomScale 描 stroke，侧缘上下对半分摊）
        if (cornerRadiusPx > 0f) {
            val glow = glowScale.coerceIn(0.05f, 2f)
            strokePaint.strokeWidth =
                (EDGE_HIGHLIGHT_DP * glow * glowWidthScale.coerceIn(0.2f, 4f)).coerceIn(0.5f, 8f) * density
            val baseAlpha = (EDGE_HIGHLIGHT_ALPHA * glow * glowAlphaScale.coerceIn(0f, 4f)).coerceIn(0f, 1f)
            val topAlpha = (baseAlpha * glowTopScale.coerceIn(0f, 4f)).coerceIn(0f, 1f)
            val bottomAlpha = (baseAlpha * glowBottomScale.coerceIn(0f, 4f)).coerceIn(0f, 1f)
            // 上半：顶缘 + 侧缘上段
            canvas.save()
            canvas.clipRect(0f, 0f, w.toFloat(), h / 2f)
            strokePaint.alpha = floor(topAlpha * 255f).toInt()
            canvas.drawPath(clipPath, strokePaint)
            canvas.restore()
            // 下半：底缘 + 侧缘下段
            canvas.save()
            canvas.clipRect(0f, h / 2f, w.toFloat(), h.toFloat())
            strokePaint.alpha = floor(bottomAlpha * 255f).toInt()
            canvas.drawPath(clipPath, strokePaint)
            canvas.restore()
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
     * - forceDownsample=false 且 API 31+ 且硬件画布：
     *   RenderNode + RenderEffect.createBlurEffect（真高斯，真机默认）；
     * - 否则（forceDownsample 强制 / API 26–30 / 软件画布）：
     *   降采样 1/6 + 双线性放大近似（H2 单档语义）。
     *
     * 诊断日志（GlassKitBlur tag）：仅在「分支切换」或「RenderEffect 新建」时各打一条，
     * 输出路径分支 + blurRadiusPx + canvas.isHardwareAccelerated，防每帧刷屏。
     * 装机排查法：adb logcat -s GlassKitBlur —— 真机若走了 rendernode 分支但画面
     * 不模糊（锯齿/1px 过渡带），在测试页打开「强制降采样」开关切近似路径。
     */
    private fun drawBlurredLayer(canvas: Canvas, capture: Bitmap, blurRadiusPx: Float) {
        val w = width
        val h = height
        val useRenderNode = !forceDownsample &&
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
                if (forceDownsample) "downsample(forced)" else "downsample(fallback)",
                blurRadiusPx,
                canvas.isHardwareAccelerated,
            )
            // API 26–30 降级：1/6 降采样 + 双线性放大（近似模糊，H2 单档语义）
            // 纯模糊路径保持固定档 BLUR_DOWNSAMPLE 行为不变（it.3 仅透镜路径自适应）
            val small = obtainSmallBlurBitmap(w, h, capture, BLUR_DOWNSAMPLE) ?: return
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
     * 分支切换（forceDownsample 翻转 / 硬件加速状态变化）时重新打一条。
     */
    private fun logBlurPathOnce(path: String, blurRadiusPx: Float, hardwareAccelerated: Boolean) {
        if (lastLoggedBlurPath == path) return
        lastLoggedBlurPath = path
        Log.i(
            logTag,
            "blur path=$path blurRadiusPx=$blurRadiusPx" +
                " hardwareAccelerated=$hardwareAccelerated" +
                " forceDownsample=$forceDownsample sdk=${Build.VERSION.SDK_INT}",
        )
    }

    /**
     * it.4 起废弃：透镜输入降采样系数随模糊半径自适应的设计（原
     * factor = clamp(round(blurRadiusPx / (K × density)), 1, MAX)）已从管线移除——
     * 「降采样+双线性放大」本质产出锯齿而非高斯，factor 变化只是锯齿块变大
     * （用户真机反馈：「模糊倍率有效果，但不是模糊效果而是锯齿的数量在变化」）。
     * 透镜输入现走固定 LENS_DOWNSAMPLE 档 + 小图 CPU box blur ×3（obtainLensInputShader）。
     */

    /**
     * ③ 透镜路径（API 33+）：it.4-R2 真模糊输入——「1/4 降采样 + 小图 CPU
     * box blur ×3 近似高斯」（见 obtainLensInputShader），模糊结果经双缓冲
     * BitmapShader 喂 RuntimeShader，uRefractionPx / uDispersionPx 乘 lensScale，
     * 一次 drawRect 逐像素求值。lensPaint 为复用实例（QA GC churn 顺带修）。
     */
    private fun drawLensLayer(
        canvas: Canvas,
        capture: Bitmap,
        w: Int,
        h: Int,
        cornerRadiusPx: Float,
        blurRadiusPx: Float,
    ) {
        val lensShaderInput = obtainLensInputShader(w, h, capture, blurRadiusPx)
        val shader = obtainLensShader(lensShaderInput, w, h, cornerRadiusPx) ?: return
        val refraction = refractionPx * lensScale
        val dispersion = dispersionPx * lensScale
        shader.setFloatUniform("uRefractionPx", refraction)
        shader.setFloatUniform("uDispersionPx", dispersion)
        lensPaint.shader = shader
        canvas.drawRect(0f, 0f, w.toFloat(), h.toFloat(), lensPaint)
    }

    /**
     * it.4-R2（QA 回修）：透镜输入 =「固定 1/4 降采样 + 小图 CPU box blur ×3
     * 迭代近似高斯」+ 双缓冲。
     *
     * 首版 BlurMaskFilter 方案被 QA 证伪废弃：BlurMaskFilter 只作用于绘制图元的
     * alpha 遮罩（Skia 管线 geometry→mask→maskFilter→×shader color），不参与
     * shader 采样的位图内容；外扩 pad 绘制后可见区全部落在遮罩内部（coverage
     * ≈99.5%），模糊输出全在位图外不可见区，视觉零贡献——等价于纯 1/4 双线性
     * 降采样放大。回修为标准 CPU 三盒高斯近似（Ivan Kutskir fast-gaussian：
     * boxesForGauss(sigma, 3)，每盒水平 + 垂直各一次 O(n) 滑窗）：
     * - radius（小图坐标系）= round(blurRadiusPx / LENS_DOWNSAMPLE)，钳 1–60；
     *   sigma = radius / 2（对齐 Skia「radius≈2σ」口径，hero 默认档 sigma≈6）。
     * - 像素走 ARGB IntArray，先预乘（premultiply）再模糊后反预乘，杜绝
     *   半透明像素通道串色的暗边；滑窗边界 clamp（不引入透明 padding，
     *   天然无边缘透明衰减，首版 CLAMP 外扩 pad 方案一并废弃）。
     * - blur 在槽位位图副本（IntArray）上原地完成，本帧写入槽位 (slot+1)%2，
     *   与 RenderThread 正在采样的上一帧槽位恒不同实例——双缓冲竞态防护不变。
     * - blurRadiusPx < 0.5（blurScale≈0）：跳过整条降采样+模糊管线，零拷贝绑定
     *   全分辨率 capture（localMatrix 映射回视图坐标；capture 超宽降采样时
     *   为 ~1.04× 轻微放大，观感对齐 it.3 清晰折射）。已知的理论暴露：
     *   RenderThread 采样 captureBitmap 与下一帧 capture() 变异跨帧竞态——与
     *   raw/RenderNode 路径既有暴露等价，非本回修引入。
     * 纯模糊路径（drawBlurredLayer 固定 1/6 档）行为不动，不经此处。
     *
     * @return 本帧输入的 BitmapShader（模糊路径 = 新写入槽位；清晰路径 = capture
     *         零拷贝），已设好位图→视图坐标放大矩阵；null = 位图/缓冲创建失败。
     */
    private fun obtainLensInputShader(
        w: Int,
        h: Int,
        capture: Bitmap,
        blurRadiusPx: Float,
    ): BitmapShader? {
        // ---- blurScale≈0：全分辨率清晰折射（零拷贝，QA 观察项恢复） ----
        if (blurRadiusPx < 0.5f) {
            var sharp = lensSharpShader
            if (sharp == null || lensSharpShaderCapture !== capture) {
                sharp = BitmapShader(capture, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
                lensSharpShader = sharp
                lensSharpShaderCapture = capture
            }
            // capture 位图可能超宽降采样（>1080 宽时 captureScale<1），映射回视图坐标
            lensMatrix.setScale(
                w.toFloat() / capture.width.toFloat(),
                h.toFloat() / capture.height.toFloat(),
            )
            sharp.setLocalMatrix(lensMatrix)
            return sharp
        }

        // ---- 模糊路径：1/4 降采样 → box blur ×3 ----
        val sw = Math.max(1, w / LENS_DOWNSAMPLE)
        val sh = Math.max(1, h / LENS_DOWNSAMPLE)
        // ping-pong：切到「非上一帧采样中」的槽位再写入
        lensInputSlot = (lensInputSlot + 1) % 2
        val slot = lensInputSlot
        var small = lensInputBuffers[slot]
        if (small == null || small.width != sw || small.height != sh) {
            if (small != null && !small.isRecycled) small.recycle()
            small = Bitmap.createBitmap(sw, sh, Bitmap.Config.ARGB_8888)
            lensInputBuffers[slot] = small
            // 位图实例更换：该槽位的 BitmapShader / Canvas / 像素缓冲一并重建
            lensShaderInputs[slot] = null
            lensCanvases[slot] = null
            lensPixelBuffers[slot] = null
            lensBlurTempBuffer = null
        }
        var smallCanvas = lensCanvases[slot]
        if (smallCanvas == null) {
            smallCanvas = Canvas(small)
            lensCanvases[slot] = smallCanvas
        }
        // 复用位图先清空上一帧内容（采集结果可能含透明区域，避免残影）
        small.eraseColor(Color.TRANSPARENT)
        lensSrcRect.set(0f, 0f, sw.toFloat(), sh.toFloat())
        smallCanvas.drawBitmap(capture, null, lensSrcRect, capturePaint)

        // CPU 三盒高斯近似（原地像素 blur，IntArray 复用零分配）
        val radius = Math.round(blurRadiusPx / LENS_DOWNSAMPLE).coerceIn(1, MAX_LENS_BLUR_RADIUS)
        var pixels = lensPixelBuffers[slot]
        if (pixels == null || pixels.size != sw * sh) {
            pixels = IntArray(sw * sh)
            lensPixelBuffers[slot] = pixels
            lensBlurTempBuffer = IntArray(sw * sh)
        }
        small.getPixels(pixels, 0, sw, 0, 0, sw, sh)
        boxBlurPixels(pixels, sw, sh, radius)
        small.setPixels(pixels, 0, sw, 0, 0, sw, sh)

        // 输出侧 BitmapShader：绑定本帧位图，放大矩阵每帧重设（复用 Matrix）
        var input = lensShaderInputs[slot]
        if (input == null) {
            input = BitmapShader(small, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
            lensShaderInputs[slot] = input
        }
        lensMatrix.setScale(
            w.toFloat() / sw.toFloat(),
            h.toFloat() / sh.toFloat(),
        )
        input.setLocalMatrix(lensMatrix)
        return input
    }

    /**
     * it.4-R2：CPU 三盒高斯近似（原地）。sigma = radius / 2（对齐 Skia
     * 「blur radius ≈ 2σ」口径，与 it.2 用户认可的 RenderEffect 真高斯观感衔接；
     * 如观感偏差可调此系数）。预乘 → 逐盒（水平滑窗 + 垂直滑窗）→ 反预乘。
     * 复杂度 O(6·n)（3 盒 × H/V 各一次线性滑窗），hero 小图 ~33k 像素，
     * 单帧 ~20 万次整型累加，UI 线程成本可忽略。
     */
    private fun boxBlurPixels(pixels: IntArray, w: Int, h: Int, radius: Int) {
        val sigma = (radius / 2f).coerceAtLeast(0.5f)
        var boxes = lensBoxSizes
        if (boxes == null || lensBoxRadius != radius) {
            boxes = boxesForGauss(sigma, 3)
            lensBoxSizes = boxes
            lensBoxRadius = radius
        }
        val temp = lensBlurTempBuffer ?: return
        premultiplyPixels(pixels)
        for (box in boxes) {
            val r = (box - 1) / 2
            if (r < 1) continue
            boxBlurH(pixels, temp, w, h, r)
            boxBlurV(temp, pixels, w, h, r)
        }
        unpremultiplyPixels(pixels)
    }

    /** 三盒尺寸计算（Ivan Kutskir fast-gaussian：3 盒卷积近似 sigma 高斯）。 */
    private fun boxesForGauss(sigma: Float, n: Int): IntArray {
        val nF = n.toFloat()
        val wIdeal = Math.sqrt(12.0 * sigma * sigma / nF + 1.0)
        var wl = Math.floor(wIdeal).toInt()
        if (wl % 2 == 0) wl--
        val wu = wl + 2
        val mIdeal =
            (12.0 * sigma * sigma - nF * wl * wl - 4 * wl - nF) / (-4.0 * wl - 4.0)
        val m = Math.round(mIdeal).toInt()
        val sizes = IntArray(n)
        for (i in 0 until n) {
            sizes[i] = if (i < m) wl else wu
        }
        return sizes
    }

    /** ARGB → 预乘 alpha（原地；a=0 直接清零，a=255 跳过乘法）。 */
    private fun premultiplyPixels(pixels: IntArray) {
        for (i in pixels.indices) {
            val p = pixels[i]
            val a = p ushr 24 and 0xFF
            if (a == 0xFF) continue
            if (a == 0) {
                pixels[i] = 0
                continue
            }
            val r = ((p shr 16) and 0xFF) * a / 255
            val g = ((p shr 8) and 0xFF) * a / 255
            val b = (p and 0xFF) * a / 255
            pixels[i] = (a shl 24) or (r shl 16) or (g shl 8) or b
        }
    }

    /** 预乘 ARGB → 非预乘（原地；除法向上钳 255 防溢出）。 */
    private fun unpremultiplyPixels(pixels: IntArray) {
        for (i in pixels.indices) {
            val p = pixels[i]
            val a = p ushr 24 and 0xFF
            if (a == 0xFF || a == 0) continue
            var r = ((p shr 16) and 0xFF) * 255 / a
            var g = ((p shr 8) and 0xFF) * 255 / a
            var b = (p and 0xFF) * 255 / a
            if (r > 255) r = 255
            if (g > 255) g = 255
            if (b > 255) b = 255
            pixels[i] = (a shl 24) or (r shl 16) or (g shl 8) or b
        }
    }

    /**
     * 水平 box blur（O(n) 滑窗，边界 clamp 取最近有效像素——不引入透明
     * padding，避免盒卷积在边缘向透明衰减）。src → dst，预乘 ARGB。
     */
    private fun boxBlurH(src: IntArray, dst: IntArray, w: Int, h: Int, r: Int) {
        val win = r + r + 1
        for (y in 0 until h) {
            val row = y * w
            var sr = 0
            var sg = 0
            var sb = 0
            var sa = 0
            for (i in -r..r) {
                val c = src[row + i.coerceIn(0, w - 1)]
                sa += c ushr 24 and 0xFF
                sr += (c shr 16) and 0xFF
                sg += (c shr 8) and 0xFF
                sb += c and 0xFF
            }
            for (x in 0 until w) {
                dst[row + x] =
                    (sa / win shl 24) or (sr / win shl 16) or (sg / win shl 8) or (sb / win)
                // 滑窗推进：右进 (x+r+1)，左出 (x-r)，越界 clamp 到行内首/尾像素
                val addC = src[row + (x + r + 1).coerceIn(0, w - 1)]
                val remC = src[row + (x - r).coerceIn(0, w - 1)]
                sa += (addC ushr 24 and 0xFF) - (remC ushr 24 and 0xFF)
                sr += ((addC shr 16) and 0xFF) - ((remC shr 16) and 0xFF)
                sg += ((addC shr 8) and 0xFF) - ((remC shr 8) and 0xFF)
                sb += (addC and 0xFF) - (remC and 0xFF)
            }
        }
    }

    /**
     * 垂直 box blur（O(n) 滑窗，列步进 w，边界 clamp）。src → dst，预乘 ARGB。
     */
    private fun boxBlurV(src: IntArray, dst: IntArray, w: Int, h: Int, r: Int) {
        val win = r + r + 1
        for (x in 0 until w) {
            var sr = 0
            var sg = 0
            var sb = 0
            var sa = 0
            for (i in -r..r) {
                val c = src[(i.coerceIn(0, h - 1)) * w + x]
                sa += c ushr 24 and 0xFF
                sr += (c shr 16) and 0xFF
                sg += (c shr 8) and 0xFF
                sb += c and 0xFF
            }
            for (y in 0 until h) {
                dst[y * w + x] =
                    (sa / win shl 24) or (sr / win shl 16) or (sg / win shl 8) or (sb / win)
                val addC = src[(y + r + 1).coerceIn(0, h - 1) * w + x]
                val remC = src[(y - r).coerceIn(0, h - 1) * w + x]
                sa += (addC ushr 24 and 0xFF) - (remC ushr 24 and 0xFF)
                sr += ((addC shr 16) and 0xFF) - ((remC shr 16) and 0xFF)
                sg += ((addC shr 8) and 0xFF) - ((remC shr 8) and 0xFF)
                sb += (addC and 0xFF) - (remC and 0xFF)
            }
        }
    }

    /**
     * 降采样小位图缓存：宽高 = 视图 / factor，含采集内容的等比缩小。
     * it.4 起仅纯模糊路径（drawBlurredLayer 固定 BLUR_DOWNSAMPLE 档）使用；
     * 透镜输入已改走 obtainLensInputShader（1/4 + CPU box blur ×3 近似高斯）。
     * it.3 缓存键 (w, h, factor) 三元组逻辑保留（参数化 factor 不变）；
     * factor ≤ 1 时跳过拷贝直接返回全分辨率采集位图。
     */
    private fun obtainSmallBlurBitmap(w: Int, h: Int, capture: Bitmap, factor: Int): Bitmap? {
        if (factor <= 1) return capture
        val sw = Math.max(1, w / factor)
        val sh = Math.max(1, h / factor)
        var small = smallBlurBitmap
        if (small == null || small.width != sw || small.height != sh || smallBlurFactor != factor) {
            if (small != null && !small.isRecycled) small.recycle()
            small = Bitmap.createBitmap(sw, sh, Bitmap.Config.ARGB_8888)
            smallBlurBitmap = small
            smallBlurFactor = factor
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

    /**
     * it.4：RuntimeShader 缓存——源码静态，惰性创建一次；uBlurred 输入（双缓冲
     * BitmapShader，逐帧 setInputShader 切换到本帧槽位）与全部 uniform 每次 draw 重设。
     * 原 it.3「位图实例/尺寸变化即重建 RuntimeShader」逻辑随双缓冲改造移除
     * （shader 本体无位图状态，无需随位图重建）。
     */
    private fun obtainLensShader(
        bitmapShader: BitmapShader?,
        w: Int,
        h: Int,
        cornerRadiusPx: Float,
    ): RuntimeShader? {
        if (bitmapShader == null) return null
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return null
        var shader = lensRuntimeShader
        if (shader == null) {
            shader = GlassLensShader.createRuntimeShader()
            lensRuntimeShader = shader
        }
        shader.setInputShader("uBlurred", bitmapShader)
        shader.setFloatUniform("uSize", w.toFloat(), h.toFloat())
        shader.setFloatUniform("uCornerRadiusPx", cornerRadiusPx)
        return shader
    }
}
