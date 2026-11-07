package com.yk1z.yayamsg.glasskit

import android.view.View
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

/**
 * GlassKitView 的 ViewManager（引擎重写清单 §三 #4；SimpleViewManager 写法对齐
 * LiveExoViewManager 先例）。
 *
 * props 与 src/native/GlassKitView.tsx 一一对应：
 * blurDp / tintAlpha / tintColor / refractionPx / dispersionPx / cornerRadiusDp /
 * dimmingAlpha / backdropTag / blurScale / tintScale / lensScale / blurEnabled。
 * 所有 setter 对 JS 空值做兜底（default* 注解 + null 合并），倍率默认 1f，
 * blurEnabled 默认 true（H2 语义：能力门控在 JS 侧 canBlur/canLens 收口）。
 */
class GlassKitManager : SimpleViewManager<GlassKitView>() {

    companion object {
        const val NAME: String = "GlassKitView"
    }

    override fun getName(): String = NAME

    override fun createViewInstance(reactContext: ThemedReactContext): GlassKitView =
        GlassKitView(reactContext)

    /** 基准模糊半径（dp）。 */
    @ReactProp(name = "blurDp", defaultFloat = 0f)
    fun setBlurDp(view: GlassKitView, value: Float) {
        view.blurDp = value
    }

    /** tint 基准 alpha（最终 alpha 由原生按 H1 钳到 0.12）。 */
    @ReactProp(name = "tintAlpha", defaultFloat = 0f)
    fun setTintAlpha(view: GlassKitView, value: Float) {
        view.tintAlpha = value
    }

    /** tint 颜色（RN Color 转换；JS 传 processColor 后的 Int 或色值字符串均可）。 */
    @ReactProp(name = "tintColor", customType = "Color", defaultInt = 0)
    fun setTintColor(view: GlassKitView, value: Int) {
        view.tintColor = value
    }

    /** 折射位移基准（px）。 */
    @ReactProp(name = "refractionPx", defaultFloat = 0f)
    fun setRefractionPx(view: GlassKitView, value: Float) {
        view.refractionPx = value
    }

    /** 色散位移基准（px）。 */
    @ReactProp(name = "dispersionPx", defaultFloat = 0f)
    fun setDispersionPx(view: GlassKitView, value: Float) {
        view.dispersionPx = value
    }

    /** 圆角半径（dp）。 */
    @ReactProp(name = "cornerRadiusDp", defaultFloat = 0f)
    fun setCornerRadiusDp(view: GlassKitView, value: Float) {
        view.cornerRadiusDp = value
    }

    /** 压暗层 alpha（#000）。 */
    @ReactProp(name = "dimmingAlpha", defaultFloat = 0f)
    fun setDimmingAlpha(view: GlassKitView, value: Float) {
        view.dimmingAlpha = value
    }

    /** 背景容器 tag（GlassKitBackdrop 原生 view id，JS 用 findNodeHandle 取）。 */
    @ReactProp(name = "backdropTag", defaultInt = View.NO_ID)
    fun setBackdropTag(view: GlassKitView, value: Int) {
        view.backdropTag = value
    }

    /** 模糊倍率（JS store 已按 0–2.5 钳制）。 */
    @ReactProp(name = "blurScale", defaultFloat = 1f)
    fun setBlurScale(view: GlassKitView, value: Float) {
        view.blurScale = value
    }

    /** tint 倍率（JS store 已按 0–3 钳制）。 */
    @ReactProp(name = "tintScale", defaultFloat = 1f)
    fun setTintScale(view: GlassKitView, value: Float) {
        view.tintScale = value
    }

    /** 透镜倍率（JS store 已按 0–2 钳制；0 = 关透镜）。 */
    @ReactProp(name = "lensScale", defaultFloat = 1f)
    fun setLensScale(view: GlassKitView, value: Float) {
        view.lensScale = value
    }

    /** 模糊总开关（JS reduceTransparency 门控）。 */
    @ReactProp(name = "blurEnabled", defaultBoolean = true)
    fun setBlurEnabled(view: GlassKitView, value: Boolean) {
        view.blurEnabled = value
    }

    override fun onDropViewInstance(view: GlassKitView) {
        // View 从窗口摘除时清掉 PreDraw 监听（视图自身 onDetachedFromWindow 也会兜底清理）
        super.onDropViewInstance(view)
    }
}
