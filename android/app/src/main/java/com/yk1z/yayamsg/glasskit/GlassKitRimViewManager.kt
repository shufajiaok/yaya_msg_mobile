package com.yk1z.yayamsg.glasskit

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

/**
 * it.19 P0-1：`GlassKitRimView` 的 ViewManager（轮廓光独立组件）。
 *
 * props 与 `src/native/GlassKitRimView.tsx` 一一对应：
 * cornerRadiusDp / rimWidthDp / rimBlurDp / rimAlpha / rimAngleDeg /
 * rimFalloff / rimColor / capsuleContinuous / rimEnabled。
 *
 * 全部默认值 = 原版 `Highlight.Default` + `HighlightStyle.Default`
 * （0.5dp / 0.25dp / White@0.5 / Plus / 45° / falloff 1.0），
 * 所以 JS 侧最省的用法就是**只传 cornerRadiusDp**。
 *
 * 与 `GlassKitView` 的分工（结构裁决，见 GlassKitRimView 类注释）：
 * 玻璃本体仍由 GlassKitView 画；轮廓光必须盖在内容之上 ⇒ 独立透明 View，
 * RN 侧绝对定位 + `pointerEvents="none"`。
 */
class GlassKitRimViewManager : SimpleViewManager<GlassKitRimView>() {

    companion object {
        const val NAME: String = "GlassKitRimView"
    }

    override fun getName(): String = NAME

    override fun createViewInstance(reactContext: ThemedReactContext): GlassKitRimView =
        GlassKitRimView(reactContext).apply {
            // 轮廓层绝不参与触摸（RN 侧同时设 pointerEvents="none"，双保险）
            isClickable = false
            isFocusable = false
        }

    /** 圆角半径（dp）：必须与同位置的 GlassKitView.cornerRadiusDp 完全一致。 */
    @ReactProp(name = "cornerRadiusDp", defaultFloat = 0f)
    fun setCornerRadiusDp(view: GlassKitRimView, value: Float) {
        view.cornerRadiusDp = value
    }

    /** 视觉描边宽度（dp，默认 0.5 = 原版 Highlight.width）。 */
    @ReactProp(name = "rimWidthDp", defaultFloat = 0.5f)
    fun setRimWidthDp(view: GlassKitRimView, value: Float) {
        view.rimWidthDp = value
    }

    /** 描边模糊半径（dp，默认 -1 = 取宽度的一半 = 原版 0.25dp）。 */
    @ReactProp(name = "rimBlurDp", defaultFloat = -1f)
    fun setRimBlurDp(view: GlassKitRimView, value: Float) {
        view.rimBlurDp = value
    }

    /** 颜色 alpha（默认 0.5 = 原版 White@0.5）。 */
    @ReactProp(name = "rimAlpha", defaultFloat = 0.5f)
    fun setRimAlpha(view: GlassKitRimView, value: Float) {
        view.rimAlpha = value
    }

    /** 方向角（度，默认 45 = 原版）。 */
    @ReactProp(name = "rimAngleDeg", defaultFloat = 45f)
    fun setRimAngleDeg(view: GlassKitRimView, value: Float) {
        view.rimAngleDeg = value
    }

    /** 方向性衰减指数（默认 1.0 = 原版）。 */
    @ReactProp(name = "rimFalloff", defaultFloat = 1f)
    fun setRimFalloff(view: GlassKitRimView, value: Float) {
        view.rimFalloff = value
    }

    /** 颜色（customType="Color"：JS 传原始色值字符串，桥接做唯一一次 processColor）。 */
    @ReactProp(name = "rimColor", customType = "Color", defaultInt = 0xFFFFFFFF.toInt())
    fun setRimColor(view: GlassKitRimView, value: Int) {
        view.rimColor = value
    }

    /** true ⇒ clipPath 走 it.14 精确 Kyant0 胶囊（dock bar / 指示器 / 顶栏）。 */
    @ReactProp(name = "capsuleContinuous", defaultBoolean = false)
    fun setCapsuleContinuous(view: GlassKitRimView, value: Boolean) {
        view.capsuleContinuous = value
    }

    /** 总开关（默认 true）。 */
    @ReactProp(name = "rimEnabled", defaultBoolean = true)
    fun setRimEnabled(view: GlassKitRimView, value: Boolean) {
        view.rimEnabled = value
    }
}
