package com.yk1z.yayamsg.glasskit

import android.widget.FrameLayout
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext

/**
 * GlassKitBackdrop 的 ViewManager（引擎重写清单 §一 / §三 #5）。
 *
 * 背景容器本身无任何渲染行为：空 FrameLayout，只作为采集注册表的 key——
 * onAfterUpdateTransaction 时把自身（getId() 为 tag）注册进 GlassCaptureEngine，
 * onDropViewInstance 时注销，防泄漏。
 * JS 侧用 findNodeHandle(backdropRef) 拿 tag 传给 GlassKitView 的 backdropTag。
 */
class GlassKitBackdropManager : SimpleViewManager<FrameLayout>() {

    companion object {
        const val NAME: String = "GlassKitBackdrop"
    }

    override fun getName(): String = NAME

    override fun createViewInstance(reactContext: ThemedReactContext): FrameLayout =
        FrameLayout(reactContext)

    override fun onAfterUpdateTransaction(view: FrameLayout) {
        super.onAfterUpdateTransaction(view)
        // props/布局事务完成后 id 已定稿，此时注册（id 未定时 register 会按 NO_ID 拒绝）
        GlassCaptureEngine.register(view.id, view)
    }

    override fun onDropViewInstance(view: FrameLayout) {
        GlassCaptureEngine.unregister(view.id)
        super.onDropViewInstance(view)
    }
}
