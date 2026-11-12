# native-registration · 原生注册锚点

## 1. ReactPackage 注册（MainApplication.kt）
锚点搜索：`class MainApplication` → `override fun getPackages()` → `List<ReactPackage>` 返回块。
在现有 `add(...)` 列表里加入：

```kotlin
import com.yk1z.yayamsg.glasskit.GlassKitPackage
...
override fun getPackages(): List<ReactPackage> =
    PackageList(this).packages.apply {
        // ... 既有 add(...) ...
        add(GlassKitPackage())   // GlassKit 玻璃引擎（GlassKitView / GlassKitBackdrop / GlassKitRimView）
    }
```

> companion 范例：`MainApplication.kt` 中 `GlassKitPackage()` 与 `PipPackage()` / `LivePlayerPackage()` 并列。

## 2. GlassKitManager.kt 双纹理 prop 注册（已存在于引擎，列出供核对）
两个 `@ReactProp` 是 it.25 双纹理分流的关键；若从旧引擎升级，必须确认它们存在且 setter 走 `markPropChanged()`：

```kotlin
@ReactProp(name = "blurBackdropTag", defaultInt = View.NO_ID)
fun setBlurBackdropTag(view: GlassKitView, value: Int) {
    view.blurBackdropTag = value   // 纯背景采集源 tag（bar 玻璃叶子，capturable + liveBackdrop）
}

@ReactProp(name = "iconBackdropTag", defaultInt = View.NO_ID)
fun setIconBackdropTag(view: GlassKitView, value: Int) {
    view.iconBackdropTag = value   // 透明底图标采集源 tag（只含图标/文字）
}
```

## 3. RN 桥接 props（src/native/GlassKitView.tsx 已透传）
`GlassKitViewProps` 必须含以下字段（companion 已全量透传，列出供核对；未传时下发 `-1` 走单纹理回退）：
- `backdropTag`：主背景容器 tag（`findNodeHandle(GlassKitBackdrop ref)`）。
- `blurBackdropTag` / `iconBackdropTag`：纯背景源 / 透明底图标源（双源都有效才走合成路径）。
- `capturable`：注册为采集源（供下游采集）。
- `liveBackdrop`：每帧节流重绘，始终采当前背景（dock 这种「背景在下方滚动」的玻璃必须开）。
- `capsuleContinuous`：连续曲率胶囊开关（dock bar / 指示器 / 顶栏演示件开启）。
- `indicatorBoostAlpha`：指示器专属 White@0.05 提亮（默认 0，仅指示器传 0.05）。
- 其余：`blurDp` `blurScale` `tintAlpha` `tintScale` `tintColor` `refractionPx` `lensBandPx`
  `dispersionPx` `cornerRadiusDp` `highlightScale` `glowScale` `chromaticEnabled` `depthEffect`
  `vibrancyEnabled` `blurEnabled` `forceDownsample` 等。
