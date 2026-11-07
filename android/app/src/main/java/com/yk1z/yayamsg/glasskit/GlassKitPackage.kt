package com.yk1z.yayamsg.glasskit

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * GlassKit ReactPackage（引擎重写清单 §三 #6）。
 *
 * 本批只交付原生能力，无 NativeModule（createNativeModules 空列表）；
 * ViewManager 两个：GlassKitView（渲染核心）+ GlassKitBackdrop（背景容器）。
 * 注册点：MainApplication.getPackages() 手动 add（项目 R-07 惯例）。
 */
class GlassKitPackage : ReactPackage {

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        emptyList()

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        listOf(GlassKitManager(), GlassKitBackdropManager())
}
