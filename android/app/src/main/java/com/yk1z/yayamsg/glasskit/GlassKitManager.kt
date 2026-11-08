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
 * dimmingAlpha / backdropTag / blurScale / tintScale / lensScale / blurEnabled /
 * glowScale / glow*Scale / forceDownsample / capturable / membraneAlpha /
 * highlightScale / chromaticEnabled / depthEffect / vibrancyEnabled /
 * capsuleContinuous / indicatorBoostAlpha。
 * 所有 setter 对 JS 空值做兜底（default* 注解 + null 合并），倍率默认 1f，
 * blurEnabled 默认 true（H2 语义：能力门控在 JS 侧 canBlur/canLens 收口）。
 *
 * it.13 新增五个对齐项 prop（HealthCheckIn GlassTuning / SettingsScreen 规格）：
 * - highlightScale（顶缘高光 0–1，默认 0.2f）
 * - chromaticEnabled（色散开关，默认 true）
 * - depthEffect（景深开关，默认 true）
 * - vibrancyEnabled（鲜活度开关，默认 true）
 * - membraneAlpha 默认 0.38 → 0f（「膜层」语义改绑 tintScale，白膜层引擎
 *   代码保留但默认不画；测试页不再提供「膜层浓度」滑块）
 * 四个新 prop 的视图侧 setter 一律走 markPropChanged()（it.9 闪烁契约）。
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

    /**
     * tint 颜色。契约（2026-11-07 订正，真机 logcat + 像素取证）：旧架构 Paper 下
     * JS 传**原始色值字符串**（如 '#DCE6FF'），桥接 customType="Color" 自动做唯一
     * 一次 processColor——调用方预 processColor 的数字会被二次转换丢弃
     * （normalizeColor(负 ColorInt) → null → prop 不下发，tintColor 恒 0）。
     */
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

    /**
     * it.14 Continuous Capsule 开关（默认 **false**）。仅 dock bar / dock 指示器 /
     * 顶栏演示件显式开启：真胶囊 r=min(w,h)/2 不变，本帧 n 覆盖为 3.0f。
     * 视图侧 setter 走 markPropChanged()（it.9 闪烁契约）。
     */
    @ReactProp(name = "capsuleContinuous", defaultBoolean = false)
    fun setCapsuleContinuous(view: GlassKitView, value: Boolean) {
        view.capsuleContinuous = value
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

    /** 模糊倍率（JS store 已按 0.2–3.0 钳制，it.13 对齐 GlassTuning.java:21）。 */
    @ReactProp(name = "blurScale", defaultFloat = 0.2f)
    fun setBlurScale(view: GlassKitView, value: Float) {
        view.blurScale = value
    }

    /** tint / 膜层倍率（JS store 已按 0–2 钳制，it.13 对齐 GlassTuning.java:27）。 */
    @ReactProp(name = "tintScale", defaultFloat = 2f)
    fun setTintScale(view: GlassKitView, value: Float) {
        view.tintScale = value
    }

    /** 透镜 / 折射倍率（JS store 已按 0–3 钳制，it.13 对齐 GlassTuning.java:24）。 */
    @ReactProp(name = "lensScale", defaultFloat = 3f)
    fun setLensScale(view: GlassKitView, value: Float) {
        view.lensScale = value
    }

    /** 模糊总开关（JS reduceTransparency 门控）。 */
    @ReactProp(name = "blurEnabled", defaultBoolean = true)
    fun setBlurEnabled(view: GlassKitView, value: Boolean) {
        view.blurEnabled = value
    }

    /** 柔光倍率（JS store 已按 0.05–2 钳制；作用于边缘高光宽/alpha）。 */
    @ReactProp(name = "glowScale", defaultFloat = 1f)
    fun setGlowScale(view: GlassKitView, value: Float) {
        view.glowScale = value
    }

    /** it.6 柔光细化：描边亮度倍率。 */
    @ReactProp(name = "glowAlphaScale", defaultFloat = 1f)
    fun setGlowAlphaScale(view: GlassKitView, value: Float) {
        view.glowAlphaScale = value
    }

    /** it.6 柔光细化：描边宽度倍率。 */
    @ReactProp(name = "glowWidthScale", defaultFloat = 1f)
    fun setGlowWidthScale(view: GlassKitView, value: Float) {
        view.glowWidthScale = value
    }

    /** it.6 柔光细化：顶缘高光加强倍率（glow 双带，it.13 起降为扩展调试项）。 */
    @ReactProp(name = "glowTopScale", defaultFloat = 1f)
    fun setGlowTopScale(view: GlassKitView, value: Float) {
        view.glowTopScale = value
    }

    /** it.6 柔光细化：底缘高光加强倍率（glow 双带，it.13 起降为扩展调试项）。 */
    @ReactProp(name = "glowBottomScale", defaultFloat = 1f)
    fun setGlowBottomScale(view: GlassKitView, value: Float) {
        view.glowBottomScale = value
    }

    /** 强制降采样模糊路径（模拟器 GPU RenderEffect 缺陷时由测试页开关开启）。 */
    @ReactProp(name = "forceDownsample", defaultBoolean = false)
    fun setForceDownsample(view: GlassKitView, value: Boolean) {
        view.forceDownsample = value
    }

    /** it.8 玻璃叠玻璃：true 时本视图注册为采集源（其他玻璃 backdropTag 指向本视图 handle）。 */
    @ReactProp(name = "capturable", defaultBoolean = false)
    fun setCapturable(view: GlassKitView, value: Boolean) {
        view.capturable = value
    }

    /**
     * it.13 膜层：白色覆盖层 alpha（0–1，默认 **0**）。
     * 「膜层」滑块语义已改绑 tintScale（SettingsScreenKt.java:1946-1961），
     * 白膜层引擎代码保留但默认不画；仍允许显式传值做 A/B（绘制顺序：tint 后、压暗前）。
     */
    @ReactProp(name = "membraneAlpha", defaultFloat = 0f)
    fun setMembraneAlpha(view: GlassKitView, value: Float) {
        view.membraneAlpha = value
    }

    /**
     * it.14 指示器专属 White 提亮 alpha（默认 **0f**，仅 dock 指示器传 0.05）。
     * 出处 Kotlin GlassKitKt.java:1434-1435,1451 → GlassSurfaceKt.java:704-708；
     * Kotlin 无对应滑块（SettingsScreenKt.java:1898-2128）⇒ 硬编码常量、不加滑块。
     * 视图侧 setter 已按 H1 上界 0.12f 钳制并走 markPropChanged()。
     */
    @ReactProp(name = "indicatorBoostAlpha", defaultFloat = 0f)
    fun setIndicatorBoostAlpha(view: GlassKitView, value: Float) {
        view.indicatorBoostAlpha = value
    }

    /** it.13 顶缘高光倍率（0–1，默认 0.2f；GlassTuning.java:30 / GlassSurfaceKt.java:710-713）。 */
    @ReactProp(name = "highlightScale", defaultFloat = 0.2f)
    fun setHighlightScale(view: GlassKitView, value: Float) {
        view.highlightScale = value
    }

    /** it.13 色散（整层画三遍）开关，默认 true（GlassTuning.java:33）。 */
    @ReactProp(name = "chromaticEnabled", defaultBoolean = true)
    fun setChromaticEnabled(view: GlassKitView, value: Boolean) {
        view.chromaticEnabled = value
    }

    /** it.13 景深开关，默认 true（GlassTuning.java:36 / ShadersKt.java depthEffect）。 */
    @ReactProp(name = "depthEffect", defaultBoolean = true)
    fun setDepthEffect(view: GlassKitView, value: Boolean) {
        view.depthEffect = value
    }

    /** it.13 鲜活度开关，默认 true（GlassTuning.java:39 / ColorFilterKt.java:16）。 */
    @ReactProp(name = "vibrancyEnabled", defaultBoolean = true)
    fun setVibrancyEnabled(view: GlassKitView, value: Boolean) {
        view.vibrancyEnabled = value
    }

    override fun onDropViewInstance(view: GlassKitView) {
        // View 从窗口摘除时清掉 PreDraw 监听（视图自身 onDetachedFromWindow 也会兜底清理）
        super.onDropViewInstance(view)
    }
}
