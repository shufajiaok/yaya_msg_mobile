package com.yk1z.yayamsg.glasskit

import android.content.Context
import android.graphics.Canvas
import android.view.View
import android.view.ViewGroup
import com.facebook.react.uimanager.PointerEvents
import com.facebook.react.uimanager.ReactPointerEventsView
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.annotations.ReactProp

/**
 * 背景容器原生视图：最小 ViewGroup 子类。
 *
 * ⚠️ 不能用 FrameLayout（裸 widget 容器）：RN 把 blob 等内容子视图 addView 进来时
 * LayoutParams 是 FrameLayout 默认 WRAP_CONTENT，窗口内任何一次 Android 原生
 * measure pass 都会触发 FrameLayout.onMeasure 用 LayoutParams 重新量子视图——
 * 裸 View.getDefaultSize() 在 AT_MOST spec 下直接返回父容器尺寸（Android 经典坑：
 * 裸 View 的 WRAP_CONTENT 等效 MATCH_PARENT），子视图被拉伸成全屏。
 * 实测复现：120dp 黄色圆渲染成 1080×1920 巨椭圆（MuMu emulator-5554）。
 *
 * 这里 onLayout no-op + 不重写 onMeasure（View 默认只量自身、不碰子视图），
 * 子视图 frame 完全由 Yoga 经 NativeViewHierarchyManager.updateLayout 的
 * measure(EXACTLY) + layout() 驱动——与 RN 自家 ReactViewGroup 同一策略。
 *
 * 挂载即注册（capture 竞态修复）：
 * onAttachedToWindow 主动调 GlassCaptureEngine.register(getId(), this)——旧实现唯一
 * 注册点是 Manager.onAfterUpdateTransaction，若注册那一刻 getId() 还是 NO_ID（id 未
 * 定稿）且之后无 props 更新，onAfterUpdateTransaction 永不再触发 → 注册表永远没有
 * 该 backdrop → GlassKitView E3 重试（100ms×50 次≈5s）耗尽 → 永久 FALLBACK_COLOR
 * 乳白兜底（时序竞态，重启后随机复现）。attach 生命周期必然发生且此时点 RN 已把
 * tag 写入 id（createViewInstance → setId(tag) 均在 attach 前完成），「挂载即注册」
 * 彻底消除该竞态。NO_ID 仍由 GlassCaptureEngine.register 拒绝，行为不变。
 * onDetachedFromWindow 对称注销，防卸载后的跨窗口弱引用滞留；Manager.onAfterUpdateTransaction
 * 的注册保留作双保险（SparseArray put 幂等覆盖，晚到也无害）。
 */
class GlassKitBackdropView(context: Context) : ViewGroup(context), ReactPointerEventsView {

    /**
     * it.19 hotfix：采集容器恒为 **box-none**（自身不吃触摸，子节点照常命中）。
     *
     * 根因同 [GlassKitView]：自定义 ViewGroupManager 没有 `pointerEvents` 这个 @ReactProp，
     * JS 传的值被丢弃 ⇒ 按 AUTO 处理。AUTO 的 ViewGroup 在「子节点都没命中」时会
     * **返回自身**当触摸目标，等价于 box-only —— dock 的采集容器是外扩 32dp 的
     * （尺寸 ≈ 本体 1.6 倍），会把玻璃外围一圈空白区域的点击全部吃掉，
     * 挡住下面页面的内容。
     *
     * 钉成 BOX_NONE 后：子节点（图标 / Pressable / 玻璃）照旧可交互，
     * 空白处的事件正常下穿。
     */
    override val pointerEvents: PointerEvents = PointerEvents.BOX_NONE

    /**
     * it.9 闪烁修复：真实屏幕绘制代数指纹（玻璃面板 PreDraw 判定「背景源真变了」）。
     * 仅硬件加速画布的绘制自增——GlassCaptureEngine.capture 的 targetView.draw
     * （软画布）是采集机制本身，不是内容变化，计入会让面板互相采集重演重绘风暴。
     */
    var drawGeneration: Long = 0L
        private set

    /**
     * it.18 采集排除容器（默认 false）。
     *
     * true ⇒ 本容器被当作「不该进入背景纹理的浮层子树」：当**外部**（祖先，通常
     * 是 App 级 backdrop）正在被采集时，本容器 dispatchDraw 直接返回，整棵子树
     * （玻璃 + 图标 + 指示器）都不参与那次采集。
     *
     * 用途 = App 底栏 dock：dock 在 App 级 `GlassKitBackdrop` 子树内，bar 采集
     * App backdrop 时会把**自己的图标 + 自己上一帧玻璃**烘进纹理，透镜再按
     * refractionPx 偏移采样 ⇒ 图标被折射变形 / 自采样回授。排除后采到的是 dock
     * 下方真实内容（与实验页「dock 在 backdrop 之外的兄弟节点」同一语义）。
     *
     * ⚠️ 只排除「采集目标在本容器之外」的采集：指示器采集 bar（目标 = 本容器
     * 后代）时照常绘制，玻璃叠玻璃链路不受影响（见 [containsCaptureTarget]）。
     */
    var excludeFromCapture: Boolean = false

    override fun dispatchDraw(canvas: Canvas) {
        if (excludeFromCapture && GlassCaptureEngine.isCapturing && !containsCaptureTarget()) {
            // 祖先采集期：整棵子树跳过（不递增 drawGeneration——本帧是采集，
            // 不是内容变化，与 GlassKitBackdrop 的代数语义一致）
            return
        }
        if (canvas.isHardwareAccelerated) drawGeneration++
        super.dispatchDraw(canvas)
    }

    /** 当前采集目标是否落在本容器子树内（含自身）。UI 线程专用，路径极短。 */
    private fun containsCaptureTarget(): Boolean {
        var node: View? = GlassCaptureEngine.captureTarget ?: return false
        while (node != null) {
            if (node === this) return true
            node = node.parent as? View
        }
        return false
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        // no-op：布局全权交给 Yoga（见类注释），禁止任何 Android 侧重排
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        // 挂载即注册：此时 id 已由 RN 定稿（NO_ID 由 register 按原语义拒绝）
        GlassCaptureEngine.register(getId(), this)
    }

    override fun onDetachedFromWindow() {
        // 对称注销（unregister 按 tag remove，未注册时为空操作，幂等安全）
        GlassCaptureEngine.unregister(getId())
        super.onDetachedFromWindow()
    }
}

/**
 * GlassKitBackdrop 的 ViewManager（引擎重写清单 §一 / §三 #5）。
 *
 * 背景容器本身无任何渲染行为：空容器，只作为采集注册表的 key——
 * 注册主路径是视图自身生命周期（onAttachedToWindow 挂载即注册，见
 * GlassKitBackdropView 类注释），本 Manager 的 onAfterUpdateTransaction 注册
 * 保留作双保险（幂等：GlassCaptureEngine.register 内部 SparseArray put 覆盖，
 * 同 tag 以后者为准）。onDropViewInstance 注销，防泄漏。
 * JS 侧用 findNodeHandle(backdropRef) 拿 tag 传给 GlassKitView 的 backdropTag。
 *
 * ⚠️ 必须继承 ViewGroupManager（而非 SimpleViewManager）：本容器带子节点
 * （渐变/色块等内容层），RN manageChildren 对有子视图的组件强转 ViewGroupManager，
 * 用 SimpleViewManager 会在首次渲染时 ClassCastException 崩溃（真机已复现）。
 */
class GlassKitBackdropManager : ViewGroupManager<GlassKitBackdropView>() {

    companion object {
        const val NAME: String = "GlassKitBackdrop"
    }

    override fun getName(): String = NAME

    override fun createViewInstance(reactContext: ThemedReactContext): GlassKitBackdropView =
        GlassKitBackdropView(reactContext)

    /** it.18：声明本容器为「采集排除子树」（App 底栏 dock 用，语义见 View 侧注释）。 */
    @ReactProp(name = "excludeFromCapture", defaultBoolean = false)
    fun setExcludeFromCapture(view: GlassKitBackdropView, value: Boolean) {
        view.excludeFromCapture = value
    }

    override fun onAfterUpdateTransaction(view: GlassKitBackdropView) {
        super.onAfterUpdateTransaction(view)
        // props/布局事务完成后 id 已定稿，此时注册（id 未定时 register 会按 NO_ID 拒绝）
        GlassCaptureEngine.register(view.id, view)
    }

    override fun onDropViewInstance(view: GlassKitBackdropView) {
        GlassCaptureEngine.unregister(view.id)
        super.onDropViewInstance(view)
    }
}
