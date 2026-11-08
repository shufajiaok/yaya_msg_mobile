package com.yk1z.yayamsg.glasskit

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.util.Log
import android.util.SparseArray
import android.view.View
import java.lang.ref.WeakReference

/**
 * GlassKit 背景子树捕获引擎（引擎重写清单 §一 / §二.1）。
 *
 * 职责：
 * 1. 静态注册表：SparseArray<tag → WeakReference<View>>，key 为 GlassKitBackdrop
 *    原生视图的 getId()（由 GlassKitBackdropManager 在 onAfterUpdateTransaction 注册）。
 * 2. capture(targetView, glassView, outBitmap)：把 targetView 子树绘制到 outBitmap，
 *    仅采集 glassView 覆盖的区域（canvas 预变换对齐玻璃偏移，省内存）。
 *
 * 线程约束：register / unregister / capture 均在 UI 线程调用（ViewManager 生命周期
 * 与 onDraw 都在主线程），内部 synchronized 仅作兜底防御。
 * 已知限制（清单 §五）：采集走 View.draw，SurfaceView 视频帧采不到。
 */
object GlassCaptureEngine {

    /** 捕获位图宽度上限（px）：超过按比例降采样，防 OOM（任务书约束 ≤1080 宽）。 */
    const val MAX_CAPTURE_WIDTH_PX: Int = 1080

    /** 降采样分支一次性诊断日志 tag（logcat: adb logcat -s GlassKitCapture）。 */
    private const val CAPTURE_LOG_TAG: String = "GlassKitCapture"

    private val registry = SparseArray<WeakReference<View>>()

    /** 降采样分支一次性日志去重（仅首次命中打一条，防随帧刷屏）。 */
    private var loggedDownscaleOnce: Boolean = false

    /**
     * it.18 采集重入深度（仅在 UI 线程读写，无需同步）。
     *
     * capture() 内部 `targetView.draw(canvas)` 期间 > 0。用途：「采集排除容器」
     * （[GlassKitBackdropView.excludeFromCapture]，当前只有 App 底栏 dock 使用）
     * 在自身 dispatchDraw 里据此跳过整棵子树，让玻璃采到 dock **下方**的真实
     * 内容，而不是自己的图标 + 自己上一帧玻璃（自采样 → 图标被折射的根因）。
     *
     * ⚠️ 必须是深度计数而非 boolean：指示器采集 bar（capture ①）期间，bar 在
     * 绘制中又会去采集 App 级 backdrop（capture ②），boolean 会被内层 finally
     * 提前清掉，导致外层排除判定失效。
     */
    private var captureDepth: Int = 0

    /** 当前正在被采集的视图（嵌套采集时随栈恢复；排除容器用它判断「是不是在采我」）。 */
    private var captureTargetView: View? = null

    /** 是否处于采集绘制期（排除容器在 dispatchDraw 里查询）。 */
    val isCapturing: Boolean
        get() = captureDepth > 0

    /** 当前采集目标视图（capture 结束后恢复为外层目标，最外层为 null）。 */
    val captureTarget: View?
        get() = captureTargetView

    /** 注册背景容器（同一 tag 重复注册以后者为准，弱引用不阻止 GC）。 */
    @Synchronized
    fun register(tag: Int, view: View) {
        if (tag == View.NO_ID) return
        registry.put(tag, WeakReference(view))
    }

    /** 注销背景容器（onDropViewInstance 必须调用，防泄漏）。 */
    @Synchronized
    fun unregister(tag: Int) {
        registry.remove(tag)
    }

    /** 按 tag 查找仍存活的背景视图；弱引用已被回收时顺带清理条目。 */
    @Synchronized
    fun find(tag: Int): View? {
        val ref = registry.get(tag) ?: return null
        val view = ref.get()
        if (view == null) {
            registry.remove(tag)
            return null
        }
        return view
    }

    /**
     * 采集 targetView 子树中 glassView 覆盖的区域到 outBitmap。
     *
     * 坐标对齐：用双方 getLocationOnScreen 差值算出玻璃在背景坐标系内的偏移
     * (offsetX, offsetY)，canvas 先缩放再平移对齐玻璃偏移，outBitmap 的
     * (0,0) 即玻璃左上角对应的背景内容。裁剪在变换之后进行（见方法内修复注释）。
     *
     * 降采样：outBitmap 尺寸由调用方按 MAX_CAPTURE_WIDTH_PX 预算好；本方法按
     * 「位图坐标 = scale × (背景坐标 − offset)」的关系先缩放再平移（it.3 修正矩阵顺序）。
     *
     * @return false 表示无法采集（视图未布局 / 尺寸为 0 / 参数不一致），调用方应画兜底底色。
     */
    fun capture(targetView: View, glassView: View, outBitmap: Bitmap): Boolean {
        val glassWidth = glassView.width
        val glassHeight = glassView.height
        if (glassWidth <= 0 || glassHeight <= 0) return false
        if (targetView.width <= 0 || targetView.height <= 0) return false
        if (outBitmap.width <= 0 || outBitmap.height <= 0) return false

        // captureScale：outBitmap 尺寸 / 玻璃物理尺寸（≤1，超 1080 宽时 <1）
        val captureScaleX = outBitmap.width.toFloat() / glassWidth.toFloat()
        val captureScaleY = outBitmap.height.toFloat() / glassHeight.toFloat()
        if (captureScaleX <= 0f || captureScaleY <= 0f) return false

        val glassLocation = IntArray(2)
        val targetLocation = IntArray(2)
        glassView.getLocationOnScreen(glassLocation)
        targetView.getLocationOnScreen(targetLocation)
        // 玻璃左上角在 targetView 坐标系内的偏移
        val offsetX = (glassLocation[0] - targetLocation[0]).toFloat()
        val offsetY = (glassLocation[1] - targetLocation[1]).toFloat()
        // 完全不在背景范围内时放弃采集（避免画出纯空内容）
        if (offsetX + glassWidth <= 0f || offsetY + glassHeight <= 0f) return false
        if (offsetX >= targetView.width || offsetY >= targetView.height) return false

        // it.3 降级后的诊断日志：仅在首次命中「captureScale < 1 降采样分支」时打一条
        //（该分支曾因旧矩阵顺序产生 offset×(1−scale) 的整体错位，保留分支可见性），
        // 不随帧刷屏。
        if (!loggedDownscaleOnce && captureScaleX < 1f) {
            loggedDownscaleOnce = true
            Log.i(
                CAPTURE_LOG_TAG,
                "capture downscale active scale=($captureScaleX,$captureScaleY)" +
                    " glassWH=${glassWidth}x$glassHeight offset=($offsetX,$offsetY)",
            )
        }

        // 复用位图先清空上一帧内容（背景可能含透明区域，避免残影）
        outBitmap.eraseColor(Color.TRANSPARENT)
        val canvas = Canvas(outBitmap)
        canvas.save()
        // it.18：标记采集绘制期 + 当前目标（嵌套采集按栈保存/恢复，见 captureDepth 注释）
        val prevTarget = captureTargetView
        val prevDepth = captureDepth
        captureDepth = prevDepth + 1
        captureTargetView = targetView
        try {
            // ⚠️ it.3 矩阵顺序修正：位图坐标 = scale × (背景坐标 − offset)。
            // Canvas 变换为后调用先作用（pre-concat）：先 scale 再 translate ⇒
            // M = S · T，背景坐标 q → scale × (q − offset)——玻璃左上角（背景坐标
            // = offset）精确映射到位图 (0,0)。旧实现「先 translate 后 scale」得
            // scale × q − offset，与正确映射差 offset × (scale − 1)：captureScale < 1
            // （玻璃宽超 MAX_CAPTURE_WIDTH_PX）时内容整体错位，scale=1 时两者等价。
            // clip 仍在背景坐标系进行：该矩形经矩阵映射后恰为位图边界，交集正确。
            canvas.scale(captureScaleX, captureScaleY)
            canvas.translate(-offsetX, -offsetY)
            canvas.clipRect(offsetX, offsetY, offsetX + glassWidth, offsetY + glassHeight)
            targetView.draw(canvas)
        } finally {
            captureDepth = prevDepth
            captureTargetView = prevTarget
            canvas.restore()
        }
        return true
    }
}
