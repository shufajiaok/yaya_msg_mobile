package com.yk1z.yayamsg.glasskit

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
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
 *    仅采集 glassView 覆盖的区域（canvas 预平移对齐玻璃偏移，省内存）。
 *
 * 线程约束：register / unregister / capture 均在 UI 线程调用（ViewManager 生命周期
 * 与 onDraw 都在主线程），内部 synchronized 仅作兜底防御。
 * 已知限制（清单 §五）：采集走 View.draw，SurfaceView 视频帧采不到。
 */
object GlassCaptureEngine {

    /** 捕获位图宽度上限（px）：超过按比例降采样，防 OOM（任务书约束 ≤1080 宽）。 */
    const val MAX_CAPTURE_WIDTH_PX: Int = 1080

    private val registry = SparseArray<WeakReference<View>>()

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
     * (offsetX, offsetY)，canvas 预平移对齐后绘制整棵背景子树，outBitmap 的
     * (0,0) 即玻璃左上角对应的背景内容。裁剪在变换之后进行（见方法内修复注释）。
     *
     * 降采样：outBitmap 尺寸由调用方按 MAX_CAPTURE_WIDTH_PX 预算好；本方法按
     * 「位图坐标 = scale × (背景坐标 − offset)」的关系先平移缩放再裁剪。
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

        // 复用位图先清空上一帧内容（背景可能含透明区域，避免残影）
        outBitmap.eraseColor(Color.TRANSPARENT)
        val canvas = Canvas(outBitmap)
        canvas.save()
        try {
            // ⚠️ 修复（capture 空内容根因，真机 logcat probe 实证 2026-11-07）：
            // Canvas 的初始 clip 恒为位图边界 (0,0,bw,bh)（设备空间）。旧实现
            // 「先在背景坐标系 clipRect(offset…) 再平移缩放」——该矩形与位图边界
            // 几乎必然无交集（offset 是玻璃在背景中的屏幕位置，y 通常数百像素起，
            // 而位图高度只有玻璃自身高度）→ clip 求交后画布为空 → targetView.draw
            // 全部被裁掉 → capture 位图恒全透明（capture() 仍返回 true）→ 模糊 /
            // 透镜全部输入空内容，面板呈「透明无效果」假象。
            // 修正顺序：先平移缩放（把玻璃覆盖区左上角对齐到画布原点并缩放到位图
            // 尺寸），再在带变换的坐标系里 clip 玻璃覆盖区矩形（此时该矩形经矩阵
            // 变换后恰好就是位图边界，交集正确）。映射关系：
            //   背景坐标 q → 位图坐标 scale × (q − offset)，与原设计一致。
            canvas.translate(-offsetX, -offsetY)
            canvas.scale(captureScaleX, captureScaleY)
            canvas.clipRect(offsetX, offsetY, offsetX + glassWidth, offsetY + glassHeight)
            targetView.draw(canvas)
        } finally {
            canvas.restore()
        }
        return true
    }
}
