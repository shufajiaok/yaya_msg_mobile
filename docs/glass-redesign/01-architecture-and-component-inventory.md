# 口袋48 第三方 App · 架构与 LiquidGlass 组件复用盘点报告

> **产出角色**：高见远（架构师） · 软件团队
> **任务**：#1 分析项目结构与 LiquidGlass 组件复用盘点
> **性质**：**只读分析**。本轮未修改、未新增任何 App / LiquidGlass 源码文件；唯一写入是本 Markdown 报告。
> **用户约束**：本轮只出文字方案，不动手改代码。
>
> **修订记录 v1.1**：按主理人裁决修正「transparent 分类」。原稿把 `sceneStyle: transparent` / 根容器 transparent / `usePageBackground() → transparent` / ImageBackground 压暗遮罩与「控件/卡片底板半透明」并列为「内容层违规、必须移除」，该判定不成立。HIG Layout **M9** 要求全屏背景延伸到 tab bar / toolbar 下方，RN 中实现 background bleed 正需要承载背景的容器透明，删除反而违反 M9 并破坏 scroll edge effect 前提；整体压暗遮罩性质等同 [LV] content footer darkening / [M] clear 背后的 dimming，属内容层可读性处理。修订后按「**透明对象的角色**」分类：**承载全屏背景的容器透明 = 合规且必须保留**；**控件/卡片自身底板的半透明 = 违规需替换**。详见 §5.4 C1a/C1b、§8.3 第 2 步。其余结论不变。

## 0. 报告说明

### 0.1 路径缩写

| 缩写 | 绝对路径 |
| --- | --- |
| `APP/` | `C:/Users/PSJl/WorkBuddy/2026-11-06-21-46-22/repo/yaya_glass_ui_rework/`（App，锁定 commit `e324df459c2d33f87c907b971f3f26857926ab5d`，v2.7.5，2026-09-11） |
| `LG/` | `C:/Users/PSJl/WorkBuddy/2026-11-06-21-46-22/repo/LiquidGlass/`（液态玻璃引擎 main） |
| `SPEC` | `deliverables/software-company/02-apple-liquid-glass-spec.md`（产品经理产出的 Apple Liquid Glass 硬约束清单，条款编号 M/D/S 引用自此） |

下文所有文件路径均为相对缩写根目录的路径；行号以本次读到的快照为准。

### 0.2 结论摘要（TL;DR）

1. **技术栈鸿沟是本项目第一事实**：App = React Native 0.81.5 + Expo ~54 + TypeScript 5.9 + React 19 + React Navigation 7 + zustand + expo-blur（`APP/package.json`），渲染走 **Paper 老架构**（`newArchEnabled: false`）；LiquidGlass = **纯 Jetpack Compose Kotlin 库**（`LG/liquidglass/src/main/java/com/jiale/liquidglass/*.kt`），靠 `RenderEffect` / `BlurEffect` / `CompositionLocal` 工作。两者视图树、布局、渲染循环、构建链完全不互通 → **引擎的 Composable / API 在当前 RN App 中「直接可用」项为 0**。
2. **App 的 android/ 目录没有任何 Compose 代码或依赖**（`APP/android/app/build.gradle` 无 `androidx.compose.*`、无 `buildFeatures { compose = true }`；全目录 Grep `setContent` / `ComposeView` / `@Composable` 0 命中）。但**已有 RN 原生 UI 组件先例**：`LiveExoViewManager.java extends SimpleViewManager<LiveExoView>`（Paper ViewManager），可作为 Phase 2 桥接的模板。
3. **expo-blur 全 App 仅 2 处**：`src/components/AppTabBar.tsx:119`（底部悬浮胶囊）与 `src/screens/FollowedRoomsScreen.tsx:2361`（聊天工具条）。二者都已属「功能层/浮层」，符合 `SPEC` M1。**不存在逐 item 建 blur**，弹幕层 `DanmakuOverlay.tsx` 是纯白字 + textShadow，无玻璃。
4. **内容层真正违规的是「控件/卡片自身底板的半透明」，而非承载全屏背景的容器透明**（按主理人裁决修订）：**违规需替换** = `src/theme/ui.ts:8-9` 的 `card rgba(255,255,255,0.88)` / `cardOnImage 0.72`、`GlassCard` 被当内容层普通卡片用（`HomeScreen.tsx:614,790`、`RechargeScreen.tsx:64`）→ 违反 `SPEC` D1 / M2 / D2，改不透明实色或 standard material。**合规且必须保留** = `src/navigation/index.tsx:185,266-267,303` 的 sceneStyle / navTheme / cardStyle transparent、`App.tsx:641` 根容器 transparent、`src/theme/colors.ts:98-102` `usePageBackground() → transparent`（服务于 HIG Layout **M9** 全屏背景 bleed 到 bar 下方，也是 scroll edge effect 前提），以及 `App.tsx:701-709` ImageBackground 之上的 0.88/0.92 整体压暗遮罩（等同 [LV] content footer darkening / [M] clear 背后 dimming）；后者建议把两套随意值归一到单一语义 token，而非删除。判定口径：**透明的是「承载内容的全屏背景」＝合规；透明的是「控件/卡片自身的底板」＝违规**。
5. **现有设计系统是「实心卡片 + 小圆角 + 小字号」体系**，且**文档与代码存在数值漂移**（DESIGN_SYSTEM.md 写卡片圆角 16 / 标题 15px / surface #FFFFFF，代码实际 `radii.lg=20`、`ScreenHeader` 24/800、`surface=#F4F5F9`）。全 src Grep `largeTitle|title1|title2` **0 命中** → 英雄文字完全缺失。
6. **玻璃参数没有单一来源**：至少 5 套硬编码（intensity 62/82/70、rgba 0.86/0.88/0.92/0.34/0.20/0.85/0.72…），`src/navigation/tabBarStyle.ts` 的 `mainTabBarStyle()` 是**死代码**（全 src 仅定义处 1 命中），另有三套 TabBar 配置并存。**注意**：其中 `0.88/0.92/0.34` 属 C1a 合规的背景遮罩 → **保留、只归一到单一语义 token**；死代码整套值 → 删除；其余属控件/浮层参数 → 归一到 `glass.ts`。「归一」不等于「删除」。
7. **引擎自身有两条对本 App 致命的限制**（`LG/README.md:262,271`）：背板必须静态（滚动列表用不了）、对话框/底部弹层是独立 window 里玻璃自动退化成膜层。而本 App 恰好大量使用 RN `Modal`（独立 window）+ 全屏滚动列表 → 恰是引擎最不适用的场景。
8. **推荐路径**：本轮走 **A：RN 侧 expo-blur + 自定义渲染做等效实现**，并把玻璃严格限定在「功能层浮层白名单」；**不引入 Compose 原生引擎**。理由见 §7.4。若未来必须引入，走 **B：Paper ViewManager + ComposeView 桥接**（Phase 2，需用户明确解禁「改 android/ 原生 + 新增依赖」）。
9. **历史规约与本轮目标直接冲突**：`DESIGN_SYSTEM.md:71-72` 明令「禁止新增 npm 依赖、改 android/ 原生、改 store/api、动播放器覆盖层」。任何原生落地路径都需用户/PM 明确解禁，列入 §9 待确认。
10. **风险最高项**：性能（三星真机）、Android 版本碎片化（minSdk 26 但真模糊需 API 31+）、直播 SurfaceView 与玻璃叠加、安全区为纯 JS 经验值、可访问性降级 0 覆盖。

---

## 1. App 技术栈与构建方式

### 1.1 依赖与版本（`APP/package.json`）

| 类别 | 包 | 版本 | 证据 |
| --- | --- | --- | --- |
| 运行时 | `react` | `19.1.0` | L52 |
| 运行时 | `react-native` | `0.81.5` | L53 |
| 运行时 | `expo` | `~54.0.33` | L41 |
| 语言 | `typescript` | `~5.9.2`（dev） | L66 |
| 导航 | `@react-navigation/native` | `^7.2.2` | L39 |
| 导航 | `@react-navigation/bottom-tabs` | `^7.15.10` | L38 |
| 导航 | `@react-navigation/stack` | `^7.8.11` | L40 |
| 导航配套 | `react-native-screens` | `^4.24.0` | L55 |
| 导航配套 | `react-native-gesture-handler` | `^2.28.1` | L54 |
| 状态管理 | `zustand` | `^5.0.12` | L59（store 见 `src/store/*.ts`） |
| **模糊** | `expo-blur` | `~15.0.8` | L43 |
| 渐变 | `expo-linear-gradient` | `~15.0.8` | L46（用于 `src/player/chrome/PlayerChrome.tsx:3`） |
| 视频 | `react-native-video` | `^6.19.2` | L57 |
| 原生视频 | 自定义 `LiveExoView` / ExoPlayer | `2.19.1` + media3 `1.8.0` | `APP/android/app/build.gradle:209-216` |
| 其它 Expo | `expo-asset` `expo-file-system` `expo-image-picker` `expo-media-library` `expo-screen-orientation` `expo-status-bar` | — | L42-49 |
| 其它 RN | `react-native-webview` `react-native-vector-icons` `@react-native-async-storage/async-storage` `@react-native-clipboard/clipboard` | — | L36-37, L56, L58 |
| 工具 | `pako` `qrcode` | — | L50-51 |

**包名/版本**：`name = yaya_msg-mobile`，`version = 2.7.5`，`main = index.ts`，`private: true`，授权 GPL-3.0（L2-16）。

**关键配置（`APP/package.json:17-23`）**：`expo.autolinking.exclude = ["react-native-safe-area-context"]` —— 刻意排除该包的原生部分；`App.tsx:35-39` 注释说明「只提供纯 JS 经验值安全区上下文」，见 §9 风险。

### 1.2 Expo / 应用配置（`APP/app.json`）

| 项 | 值 | 证据 |
| --- | --- | --- |
| 应用名 / slug | 牙牙消息 / `yaya-msg-mobile` | L3-4 |
| version / orientation | `2.7.5` / `portrait` | L5-6 |
| `newArchEnabled` | **false** | L9（与 `APP/android/gradle.properties:38` 一致） |
| `userInterfaceStyle` | `automatic` | L8 |
| splash 背景 | `#fff7fb` | L13 |
| `android.edgeToEdgeEnabled` | **true** | L20（与 `android/gradle.properties:47,70` 一致） |
| android package / versionCode | `com.yk1z.yayamsg` / `2075008` | L21-22 |
| `usesCleartextTraffic` | true | L23 |
| 权限（app.json 层） | INTERNET / ACCESS_NETWORK_STATE | L24-27 |
| `plugins` | `["expo-asset"]` | L29-31 |

> **未找到**：`app.json` 中没有 `ios` 配置段；仓库根目录**没有 `ios/` 目录**（`ls -d ios` → 不存在），`package.json` scripts 只有 `android` / `web`，无 `ios` 脚本。README badge 标注 platform Android（`APP/README.md:11`）。→ 本项目当前是 **Android 单端产物**，「动态岛」属 iOS 概念，见 §9.4。

### 1.3 构建链路与是否 Expo prebuild

| 项 | 值 | 证据 |
| --- | --- | --- |
| 入口 | `index.ts` → `App.tsx`（默认导出 `App`） | `package.json:16`、`App.tsx:524` |
| 导航装配 | `App.tsx:649` `<AppNavigator />` → `src/navigation/index.tsx:259` `export default function AppNavigator()` | — |
| 启动 | `expo start` | `package.json:25` |
| 运行 | `expo run:android` | L26 |
| **出包** | `cd android && gradlew assembleRelease -Dorg.gradle.daemon=true -Dorg.gradle.parallel=false` | L28 |
| 出包辅助 | `node scripts/build-apk.js` | L29 |
| 类型检查 | `tsc --noEmit && node scripts/verify-version.js` | L33 |
| 其它 | `gen:wasm`（`scripts/gen-wasm-base64.mjs`）、`test:core`、`build:android:copy` | L30-32 |
| 文档构建说明 | `npm install --legacy-peer-deps` → `node scripts/build-apk.js` | `APP/README.md:39-44` |
| 兼容声明 | 鸿蒙 2/3/4 与 Android 8.0+（minSdk 26） | `APP/README.md:48` |

**是否 prebuild（结论）**：`android/` 是 **Expo prebuild / CNG 生成后已提交进仓库、并被深度手工定制**的原生工程，构建时**不再重新 prebuild**，直接 `gradlew assembleRelease`。证据：

- `android/settings.gradle:1-39`：`expo-autolinking-settings` 插件、`expoAutolinking.useExpoModules()`、`includeBuild(expo-gradle-plugin)`、`expoAutolinking.useExpoVersionCatalog()` —— 标准 Expo prebuild 产物。
- `android/build.gradle:36-37`：`apply plugin: "expo-root-project"` / `"com.facebook.react.rootproject"`。
- `android/app/build.gradle:1-5`：`com.android.application` + `org.jetbrains.kotlin.android` + `com.facebook.react` + `react-native-vector-icons/fonts.gradle`；`react { ... }` 块里 `cliFile = @expo/cli`、`bundleCommand = "export:embed"`、`entryFile` 由 `expo/scripts/resolveAppEntry` 解析（L13-24）。
- **手工定制痕迹**：`android/app/build.gradle:107-120` 自定义 minSdk / ABI `abiFilters` / `buildConfigField`；L121-141 自定义 v1/v2 签名；L172-181 ABI 分包 `splits`；L204-240 手工 ExoPlayer / media3 / okhttp 依赖与 `resolutionStrategy` 钉版（L26-33）；`android/app/src/main/java/com/yk1z/yayamsg/` 下 20 个手写 Java/Kotlin 类。

**RN 架构**：**Paper 老架构**。`app.json:9` 与 `android/gradle.properties:38` 均 `newArchEnabled=false`；`MainActivity.kt:134-143` 用 `DefaultReactActivityDelegate(..., fabricEnabled)` 外包 `ReactActivityDelegateWrapper`；`BuildConfig.IS_NEW_ARCHITECTURE_ENABLED`。`android/gradle.properties:33-37` 注释明确「开启新架构才能写 TurboModules / Fabric 组件」→ **当前不具备 Fabric 组件条件**。

**SDK 版本**：`android/app/build.gradle:94-110` → `compileSdk`/`buildToolsVersion`/`targetSdkVersion`/`minSdkVersion` 全部取自 `rootProject.ext.*`，其中 `minSdkVersion = Math.max(rootProject.ext.minSdkVersion as int, 26)`（L108）。
> **未找到**：`rootProject.ext` 的具体数值、Kotlin 插件版本（`android/build.gradle:11` classpath 未带版本号）、AGP 版本 —— 均由 Expo / RN Gradle 插件注入，仓库内无显式声明。这一项对 §7.5 的版本冲突评估是待核实项。

**ABI 分包**：`android/app/build.gradle:172-181`（`armeabi-v7a` / `arm64-v8a` / `x86_64` + `universalApk`）；`defaultConfig` L115-117 另含 `x86`（为模拟器保留）。

### 1.4 `android/` 原生目录盘点（含 Compose 核查）

| 文件 | 类型 | 职责 | 证据 |
| --- | --- | --- | --- |
| `MainActivity.kt` | `class MainActivity : ReactActivity()` | App 主 Activity；含 PiP、Exo 媒体会话重声明、ColorOS 兼容逻辑 | L13, L29-122, L134-143 |
| `MainApplication.kt` | `class MainApplication : Application(), ReactApplication` | RN 应用入口 / Package 注册 | L27 |
| `LiveExoView.java` | `extends FrameLayout` | 原生 ExoPlayer 播放视图（RTMP/FLV） | L30 |
| **`LiveExoViewManager.java`** | **`extends SimpleViewManager<LiveExoView>`** | **RN 原生 UI 组件（Paper ViewManager 先例）** | L13 |
| `LivePlayerModule.java` / `BiliLoginModule.java` / `PipModule.java` / `RadioExoModule.java` / `RadioServiceModule.java` | `extends ReactContextBaseJavaModule` | 直播、B站登录、画中画、电台 Exo、电台服务原生模块 | 各类 L25/L29/L38/L20/L23 |
| `LivePlayerPackage.java` / `PipPackage.java` | `implements ReactPackage` | 原生模块注册 | L14 / L13 |
| `LivePlayerActivity.java` | **`extends Activity`** | 独立原生全屏播放 Activity，`setContentView(root)`（纯 View，非 Compose） | L38, L162；`AndroidManifest.xml:25` 注册 |
| `LiveExoErrorEvent.java` / `LiveSizeEvent.java` | `extends Event<>` | 原生 → JS 事件 | L14 / L11 |
| `YayaExoService.java` / `RadioForegroundService.java` | `extends Service` | 音乐 / 电台前台保活、媒体会话 | L53 / L39 |
| `MediaButtonProxyReceiver.java` / `RadioMediaReceiver.java` | `extends BroadcastReceiver` | 媒体键、电台控制 | L12 / L11 |

**Compose 核查结论（关键）**：

- `android/app/build.gradle:204-241` 的 `dependencies` 只有 `react-android`、`okhttp 4.9.2`、`expoplayer-core/ui/rtmp 2.19.1`、`androidx.media3:* 1.8.0`、fresco 条件依赖、`hermes-android` —— **没有任何 `androidx.compose.*` / Compose BOM / `activity-compose`**。
- **没有** `buildFeatures { compose = true }`，**没有** `org.jetbrains.kotlin.plugin.compose` 插件。
- 对 `android/app/src/main/java/com/yk1z/yayamsg/` 全目录 Grep `setContent|ComposeView|AbstractComposeView|@Composable|Compose` → **0 命中**（唯一含 "Compos" 字样的是 `CompositionLocal`？未出现；命中的均是 `setContentView` 之外的普通代码）。`MainActivity.kt` 仅 `setTheme(R.style.AppTheme)` + `super.onCreate(null)`，无 `setContent {}`。
- `android/app/src/main/AndroidManifest.xml:21-43` 只注册 `MainActivity`（Theme.App.SplashScreen）、`LivePlayerActivity`、2 个 Service、2 个 Receiver —— **无 ComponentActivity / Compose Activity**。
- `APP/tsconfig.json:18-19` 把 `android` 排除在 TS 编译外。

> **但有一个有利条件**：`android/build.gradle:21` 已经配置了 `maven { url 'https://www.jitpack.io' }`（`allprojects.repositories`），即引入 JitPack 坐标无需改仓库源。

### 1.5 现有模糊方案 expo-blur 用在哪

| # | 位置 | 用法 | 层归属判断 | 证据 |
| --- | --- | --- | --- | --- |
| 1 | `src/components/AppTabBar.tsx:119-123` | `<BlurView style={StyleSheet.absoluteFill} tint={isDark?'dark':'light'} intensity={isDark?62:82} />`，叠在 `backgroundColor: rgba(30,31,36,0.86)/rgba(245,246,250,0.88)` 的胶囊内（L113），再加 tint 色相层（L125-134）、顶部高光（L136-146）、底部暗边（L148-158） | **功能层 / 浮层**（`outer` position absolute bottom 0，L176-184） | L21 导入、L101 注释「苹果式磨砂玻璃：真模糊(Android 12+ RenderEffect, expo-blur)」 |
| 2 | `src/screens/FollowedRoomsScreen.tsx:2361-2419` | `<BlurView intensity={70} tint={...} experimentalBlurMethod="dimezisBlurView">` 包住「大房间/小房间」分段、搜索、粉丝过滤、上麦入口的**聊天工具条** | **功能层 / 工具条**（贴页头下方，非消息气泡） | L23 导入、L2359 注释「聊天工具条：高斯模糊玻璃」 |

**全 src Grep `BlurView` 仅上述 2 处**（另 `DownloadScreen.tsx:218` 的 `blurOnSubmit={false}` 是 TextInput 属性，非模糊渲染；`theme/shadows.ts` 的 `blur` 是阴影半径参数）。

**伪玻璃（不用 expo-blur）**：`src/components/GlassCard.tsx:7-8` 注释明确「原生 blur 需要 expo-blur 之类的原生包。本工程刻意不装新依赖，Android 上用纯色 + innerStroke 渲染出『近似』玻璃感，效果优于毛玻璃模糊，且 0 性能开销」→ `GlassCard` 是**半透明实色 + 1px 内描边 + sm 阴影**（L40-60），不是 backdrop blur。

**结论**：当前 App 的「真模糊」只存在于 2 个静止的栏/工具条；**内容层没有任何 backdrop blur**（满足 `SPEC` 5.2 第 2 条性能红线）。需区分两类半透明/透明：**① 承载全屏背景的容器透明 + 背景整体压暗遮罩**（`App.tsx:641,701-709`、`navigation/index.tsx:185,266-267,303`、`colors.ts:98-102`）——**合规且按 M9 必须保留**；**② 控件/卡片自身底板的半透明**（`ui.ts:8-9` card/cardOnImage、内容层 `GlassCard` 用法）——**违反 `SPEC` D1/M2/D2，须替换为不透明实色或 standard material**。详见 §5.4 C1a/C1b。

---

## 2. 目录结构

### 2.1 `src/` 子目录与职责（共 15 个一级子目录）

| 目录 | 文件数 | 职责 | 代表文件 |
| --- | --- | --- | --- |
| `src/api/` | 5 | 后端接口封装：口袋48 / B站 / 官方媒体 / 官方站点音乐 / R2 音乐 | `pocket48.ts`, `bilibili.ts`, `officialMedia.ts`, `r2Music.ts` |
| `src/auth/` | 6 | WASM 签名、WebView 签名器、哈希 | `wasm.js`, `wasmBase64.ts`, `webviewSigner.tsx` |
| `src/components/` | 25 `.tsx` + `media/player.ts` | **共享 UI 组件**（详见 §4） | `AppTabBar.tsx`, `GlassCard.tsx`, `DanmakuOverlay.tsx` |
| `src/constants/` | 1 | API 基址、版本、礼物表、通告 URL | `index.ts`（`APP_VERSION='2.7.5'`） |
| `src/hooks/` | 4 | `useAppTheme`（双主题解析）、`usePaginator`（共享分页）、**`useSafeAreaInsets`（纯 JS 经验值）**、`useVinylSpin` | `useSafeAreaInsets.ts` |
| `src/i18n/` | 5 | 中/英/日/韩/繁中 | `index.ts`, `en.ts`, `ja.ts`, `ko.ts`, `zh-Hant.ts` |
| `src/native/` | 2 | RN ↔ 原生桥：`LivePlayer.ts`（LiveExoView / 电台前台服务）、`RadioExo.ts`（Exo 会话事件） | — |
| `src/navigation/` | 3 | 导航容器、Tab/Stack 注册、`RootStackParamList`/`TabParamList` 类型、TabBar 样式（死代码） | `index.tsx`, `types.ts`, `tabBarStyle.ts` |
| `src/player/` | 1 + 4 子目录共 12 | **统一播放器子系统**：`PlayerScreen` 外壳、`chrome/`（PlayerChrome / FullscreenManager）、`core/`（PlayerCore / ExoKernel / NativeKernel / WebKernel）、`resolve/`、`store/` | `PlayerScreen.tsx`, `chrome/PlayerChrome.tsx` |
| `src/screens/` | **30 `.tsx`** | 全部页面（4 Tab + 26 Stack，详见 §3） | `MediaScreen.tsx`(1956行), `FollowedRoomsScreen.tsx`(2095行) |
| `src/services/` | 8 | 自动签到、B站弹幕、下载、成员数据、音乐引擎、房间背景/映射缓存、设置 | `musicPlayer.ts`, `downloads.ts` |
| `src/store/` | 6 | zustand：全局设置/UI/更新/公告、弹幕设置、迷你播放器、音乐播放器、上麦扫描 | `index.ts`, `onMicStore.ts` |
| `src/theme/` | 9 | **设计 token**：colors / typography / spacing / radii / shadows / motion / ui + 出口 | `colors.ts`, `ui.ts`, `index.ts` |
| `src/types/` | 2 | 全局类型 + shims | `index.ts` |
| `src/utils/` | 22 | 数据处理、歌词、时长、弹幕、网络、翻牌解析、PiP、日志等 | `meleeParse.ts`, `pip.ts` |

根目录其它：`App.tsx`（36KB，根组件/初始化/全局背景/公告 Modal/媒体桥）、`index.ts`、`metro.config.js`、`tsconfig.json`、`package.json` / `package-lock.json` / `app.json`、`android/`（原生工程）、`assets/`、`scripts/`（构建与校验）、`__tests__/`、`scratch/`（审计草稿）、`2.wasm`、`_r2.png`。

### 2.2 根目录 UI / 项目文档分别讲什么

| 文档 | 主题与要点 | 与本轮关系 |
| --- | --- | --- |
| `DESIGN_SYSTEM.md` | **「统一设计规范 v1」**：宣称「全站 27 个页面布局统一、风格 = 官方口袋48（白底+粉点缀+**实心卡片**）」。给出设计 Token 表、5 类页面布局范式（列表/网格/统计/表单/聊天）、**8 条硬性规则**（含 L71-72「禁止新增 npm 依赖、改 android/ 原生、改 store/api、动播放器覆盖层」、L64「禁止半透明白 rgba 做卡片底」）、参考实现 | **当前名义上的唯一依据**，但与代码数值漂移，且其禁止项与原生玻璃落地直接冲突 |
| `DESIGN_UI_2026-08-15.md` | 「UI 全套重构方案」：从静态入口目录 → 内容驱动的仪表盘；现状诊断、4 条设计原则（内容优先/信息分层/统一语言/**克制视觉**）、首页新信息架构线框、4 类布局范式、5 项组件升级清单（ScreenHeader 重写为「玻璃圆形返回键」）、实施顺序与风险 | 引入「大标题 + 玻璃描边」，与 DESIGN_SYSTEM 的「实心卡片」存在语义张力 |
| `UI_LAYOUT_PLAN_v2.md` | 「布局分析与改版规划 v2」：首页/直播/录播/房间四核心页的现状诊断 → 新线框 → 布局依据；总则 5 条（内容优先、控件收敛、层级清晰、密度匹配、统一范式「封面全幅+渐变遮罩+白字上浮」「卡片圆角 16」）；L139-148 实施顺序均已打勾完成 | 解释当前直播 banner + 2 列网格、房间 2 列头像卡等布局来源 |
| `UI_OVERHAUL_2026-08-16.md` | 「2.6.5 UI 全量统一与动效完善」：全站 **30 个功能页 + 22 个共享组件**统一 Palette 双主题；主题/共享组件升级表、重度组件重构表（FullScreenPlayer、ZoomImageModal、MemberPicker、DanmakuSettingsSheet…）、30 页通用改动清单、专项修复表、验证（tsc 0 错误）、统计（改 57 文件，+1703/-2044） | 说明为何当前全站 `useAppTheme/isDark` 双分支为 0；也**提到当前 src/components 里已不存在的文件** |
| `UI_AUDIT_2.7.1.md` | 「2.7.1 全量 UI 审计与修复记录」：覆盖 `src/screens` **26 个页面** + 导航/页头/按钮/Pill/状态态/动画/播放器外壳/TabBar/弹层；本轮已处理表（文字收缩、动画清理、横竖屏、FAB 安全区…）、页面级检查结论表、5 项仍需设备回归 | 窄屏/多语言/深色对比度的历史风险清单 |
| `AUDIT_SCREENS.md` | 「屏幕可用性审计报告」：**26 个 `.tsx`** 逐页审计（功能、API 方法与行号、易用性短板 🔴/🟡/✅）+ 三个系统性结论（错误态缺重试、分页不统一、空/加载态缺失） | **页面功能与代码规模的最全索引**（如 MediaScreen 1956 行、FollowedRoomsScreen 2095 行），但为历史快照 |
| `README.md` | 项目介绍、功能、下载/构建、兼容（Android 8+ / 鸿蒙 2/3/4）、致谢、免责声明 | 构建与兼容基线 |
| `API_MAP.md` / `API_RESEARCH.md` / `RELEASE_NOTES_2.7.1.md` | 接口映射、接口调研、2.7.1 发版说明 | 与 UI 重构无关，本轮未深入 |

> **文档漂移告警**：`AUDIT_SCREENS.md:3,9` 与 `UI_AUDIT_2.7.1.md:5` 均为 **26 页历史快照**，而当前 `src/screens/` 实为 **30 个 `.tsx`**；新增的 4 个是 `AudioProgramsScreen.tsx`、`CommunityScreen.tsx`（头注「2.6.5 新增」）、`CommunityPostDetailScreen.tsx`（「2.6.5 新增」）、`OnMicScreen.tsx`（L33「v2.7.4」）。此外 `UI_OVERHAUL_2026-08-16.md` 提到的 `AppScaffold.tsx` / `ListItem.tsx` / `SectionHeader.tsx` / `EmptyState.tsx` 在**当前 `src/components/` 中未找到**（空/错态已并入 `StateViews.tsx`）。→ **文档不能作为当前事实来源，须以代码为准**。

---

## 3. 屏幕 / 页面清单

### 3.1 导航结构（`src/navigation/index.tsx` + `types.ts`）

```
App.tsx (根: StatusBar / SafeAreaBridge / 自定义背景 / 公告 Modal / WebViewSigner / MusicForegroundBridge)
└─ AppNavigator (NavigationContainer + ErrorBoundary)
   ├─ Stack.Navigator (headerShown:false, animation:'none', detachPreviousScreen:true)
   │  ├─ "Main" → MainTabs (Tab.Navigator, tabBar = <AppTabBar/>, sceneStyle transparent)
   │  │    ├─ Home      → HomeScreen
   │  │    ├─ Media     → MediaScreen          (Tab 标签「直播」)
   │  │    ├─ Rooms     → FollowedRoomsScreen  (Tab 标签「房间」)
   │  │    └─ Settings  → SettingsScreen
   │  └─ 26 个 Stack.Screen（见下表）
   └─ 全局浮层：AppToast / MiniPlayer / PipToggleBridge
```
（证据：`src/navigation/index.tsx:177-196` Tab 注册、L297-333 Stack 注册、L334-338 全局浮层；`types.ts:3-38` 路由名与参数；L56-61 TAB_LABELS；`App.tsx:640-721` 根结构。）

`withPageMotion()`（`navigation/index.tsx:63-99`）给每个页面包一层 `opacity + translateY` 入场动画；`AppTabBar` 由 `MainTabBar`（L133-175）驱动。

### 3.2 全量页面清单（30 个 `.tsx`，4 Tab + 26 Stack）

> 「布局骨架」列依据：`ScreenHeader` 全 30 页命中（Grep count 每页 2-3 次，多为 import + 使用）；`FlatList/PerfFlatList/ScrollView` 命中数；`Modal / position:'absolute' / BlurView / GlassCard` 命中数（Grep 统计）；`AUDIT_SCREENS.md` 功能与行数。行列出的数字是**关键词命中次数**，非组件实例精确数。

| # | 路由名 | 入口文件 | 层级 | 功能 | 当前布局骨架（顶栏 / 主体 / 浮层） |
| --- | --- | --- | --- | --- | --- |
| 1 | `Home` | `src/screens/HomeScreen.tsx` | Tab | 首页仪表盘：问候、直播 banner 轮播、直播 2 列网格、快捷入口、工具手风琴、续播卡、未登录引导 | ScreenHeader(贴边) / ScrollView+FlatList 6 命中 / 8 命中浮层或绝对定位；`GlassCard` 2 处（L614, L790）；无英雄文字 |
| 2 | `Media` | `src/screens/MediaScreen.tsx` | Tab | **直播/录播列表 + 全屏播放器**；弹幕、送礼、贡献榜、公告、续播、筛选/搜索/日历 | ScreenHeader / FlatList 16 命中 / **20 命中浮层**：公告面板(L1505-1522, rgba(18,18,20,0.92))、送礼 Modal(L1587)、贡献榜 Modal(L1649)、日历(L1802)、`DanmakuSettingsSheet`(L1674)、`PlayerScreen`+`DanmakuOverlay`(L1553-1584) |
| 3 | `Rooms` | `src/screens/FollowedRoomsScreen.tsx` | Tab | **关注房间 + 房间聊天室**（大/小房间分段、粉丝/成员过滤、房间搜索、内嵌直播、关注/取关、榜单面板、上麦入口） | `ScreenHeader overlay`(L2341) / FlatList 11 命中 / **18 命中浮层**：`BlurView` 聊天工具条(L2361-2419)、`ZoomImageModal`(L2340)、房间背景图、RoomRankPanel、25 处 rgba |
| 4 | `Settings` | `src/screens/SettingsScreen.tsx` | Tab | 版本/致谢/仓库、账号管理、主题/背景图、语言、自动签到、下载/日志、成员统计 | ScreenHeader / ScrollView 3 命中 / 1 命中；分组列表 |
| 5 | `MessagesScreen` | `src/screens/MessagesScreen.tsx` | Stack | 消息检索（选成员 → 房间消息 → 本地搜索） | ScreenHeader / PerfFlatList 8 命中 / 1 命中（成员选择 Modal） |
| 6 | `LoginScreen` | `src/screens/LoginScreen.tsx` | Stack | 验证码/Token 登录、大小号、B站扫码、昵称头像 | ScreenHeader / ScrollView 3 / 1（模态/扫码）；历史把 6 段手写玻璃改为 `GlassCard` |
| 7 | `RechargeScreen` | `src/screens/RechargeScreen.tsx` | Stack | 鸡腿余额 + 官方充值 WebView | ScreenHeader / 8 命中浮层（WebView 容器等）；`GlassCard strong` 余额卡(L64) |
| 8 | `FetchScreen` | `src/screens/FetchScreen.tsx` | Stack | 抓取消息（全部/成员/大/小房间） | ScreenHeader / FlatList 2 / 1 |
| 9 | `FlipScreen` | `src/screens/FlipScreen.tsx` | Stack | 翻牌（发送表单 + 历史） | ScreenHeader / FlatList 5 / 2 |
| 10 | `ProfileScreen` | `src/screens/ProfileScreen.tsx` | Stack | 成员档案（基础/生涯/技术参数、公式照、粉丝排行） | ScreenHeader / 5 / 1 |
| 11 | `PhotosScreen` | `src/screens/PhotosScreen.tsx` | Stack | 个人相册（选成员、双列网格、放大、下载） | ScreenHeader / 2 / 1 |
| 12 | `RoomAlbumScreen` | `src/screens/RoomAlbumScreen.tsx` | Stack | 房间相册（大/小房间、图片/视频） | ScreenHeader / 2 / **8**（ZoomImageModal、内嵌 `PlayerScreen`(L255)、7 处 rgba） |
| 13 | `RoomRadioScreen` | `src/screens/RoomRadioScreen.tsx` | Stack | **上麦/电台音频**（选成员 → 取流 → `LiveExoView`/`Video` 播放，大/小房间切换） | ScreenHeader / 2 / 3；`LiveExoView`(L425)、前台服务(L23) |
| 14 | `OpenLiveScreen` | `src/screens/OpenLiveScreen.tsx` | Stack | 公演记录（列表、筛选、播放 flv/rtmp、下载、横竖屏） | ScreenHeader / 2 / 1 |
| 15 | **`OnMicScreen`** | `src/screens/OnMicScreen.tsx` | Stack | **全成员上麦扫描列表**（v2.7.4；`useOnMicStore` 扫描 serverId/channelId） | ScreenHeader / FlatList 2 / 1；无玻璃 |
| 16 | `PrivateMessagesScreen` | `src/screens/PrivateMessagesScreen.tsx` | Stack | **私信会话/详情**（语音/视频/图片/翻牌卡解析、发送私信与翻牌） | ScreenHeader / FlatList 5 / 3；内嵌 `PlayerScreen`(L648)；气泡 16 处硬编码圆角 |
| 17 | `BilibiliLiveScreen` | `src/screens/BilibiliLiveScreen.tsx` | Stack | B站直播（列表、多线路、原生/WebView 切换、弹幕、自动横屏） | ScreenHeader / 2 / 2；`PlayerScreen` + `DanmakuOverlay`(L31) |
| 18 | `VideoLibraryScreen` | `src/screens/VideoLibraryScreen.tsx` | Stack | 官方视频库（banner + 2 列网格、内嵌 `PlayerScreen`(L144)） | ScreenHeader / 2 / 6（7 处 rgba、视频骨架） |
| 19 | `MusicLibraryScreen` | `src/screens/MusicLibraryScreen.tsx` | Stack | 官方音乐库（搜索/分团/收藏、常驻播放器、队列、歌词） | ScreenHeader / **12** / 3；`FullScreenPlayer`(L865)、`<Video>`(L779) |
| 20 | `AudioProgramsScreen` | `src/screens/AudioProgramsScreen.tsx` | Stack | 官方音频节目/电台（列表 + 内嵌 `PlayerScreen`(L182)） | ScreenHeader / 2 / 1；`Skeleton`、`NetworkImage` |
| 21 | `AnalysisScreen` | `src/screens/AnalysisScreen.tsx` | Stack | 数据统计（5 Tab：房间概览/日期/发言排行/媒体/翻牌） | ScreenHeader / 7 / 5；20 处硬编码圆角 |
| 22 | `DownloadScreen` | `src/screens/DownloadScreen.tsx` | Stack | 下载管理（URL 添加、下载中/完成/失败分组） | ScreenHeader / 2 / 1 |
| 23 | `DatabaseScreen` | `src/screens/DatabaseScreen.tsx` | Stack | 成员库同步 + 内嵌 WebView | ScreenHeader / — / 1（WebView） |
| 24 | `TripScreen` | `src/screens/TripScreen.tsx` | Stack | 行程时间轴（今天/过去/未来、票务链接） | ScreenHeader / 2 / 1 |
| 25 | **`MeleeRankScreen`** | `src/screens/MeleeRankScreen.tsx` | Stack | **鸡腿/乱斗排行榜**（周/总/年榜 + 成员贡献榜） | ScreenHeader / 4 / 2；分段 chips、概览数字条 |
| 26 | `MemberDynamicScreen` | `src/screens/MemberDynamicScreen.tsx` | Stack | 成员动态流（图文/九宫格，共享 `usePaginator`） | ScreenHeader / 2 / 1 |
| 27 | `MemberWeiboScreen` | `src/screens/MemberWeiboScreen.tsx` | Stack | 成员微博流（图文/九宫格/跳原文） | ScreenHeader / 2 / 1 |
| 28 | `InvoiceScreen` | `src/screens/InvoiceScreen.tsx` | Stack | 电子发票（订单多选 → 填开票信息 → 提交） | ScreenHeader / ScrollView 3 / 1 |
| 29 | `CommunityScreen` | `src/screens/CommunityScreen.tsx` | Stack | **Area48 社区**（推荐/最新双 Tab 帖子流、发帖底部 sheet、右下 FAB） | ScreenHeader / 5 / 3；头注 L13-16 明确「fill2 底分段 + FAB 56 + radii.sheet 发帖 sheet」 |
| 30 | `CommunityPostDetailScreen` | `src/screens/CommunityPostDetailScreen.tsx` | Stack | 社区帖子详情（全文 + 评论分页 + 发评论） | ScreenHeader / 2 / 1；`CommunityPostCard`、`ZoomImageModal` |

**路由参数**（`src/navigation/types.ts`）：`Media` 带播放参数；`RoomRadioScreen` 带 `member/initialMode/streamUrl`；`PrivateMessagesScreen` 带 `targetUserId/targetName`；`BilibiliLiveScreen` 带 `roomId/roomName`；`FlipScreen` 带 `mode`；`CommunityPostDetailScreen` 带必填 `postId` + 可选 `title`；其余 `undefined`。

### 3.3 用户关注功能的落点

| 用户功能 | 落点 | 说明 |
| --- | --- | --- |
| **聊天室** | **不是独立路由**，内嵌在 `FollowedRoomsScreen.tsx`（Rooms Tab） | `AUDIT_SCREENS.md:59-69`：聊天室含大/小房间 segmented、粉丝/成员过滤、房间搜索、历史消息分页；审计指出「完全不支持发送消息、无实时刷新」 |
| **直播列表** | `MediaScreen.tsx`（Media Tab） | 直播/录播双 tab 双列网格 + 首条 banner（UI_LAYOUT_PLAN_v2 §2 已实施） |
| **直播间 / 播放器** | `src/player/PlayerScreen.tsx`（统一外壳），由 `MediaScreen` / `BilibiliLiveScreen` / `VideoLibraryScreen` / `RoomAlbumScreen` / `PrivateMessagesScreen` / `AudioProgramsScreen` 复用 | 外壳 = `PlayerCore`（按流类型切 ExoKernel/NativeKernel/WebKernel）+ `PlayerChrome`（渐变遮罩顶栏 + 悬浮底坞）+ `FullscreenManager` + `children` 弹幕插槽 |
| **房间** | `FollowedRoomsScreen.tsx`（Rooms Tab）+ `RoomAlbumScreen` / `RoomRadioScreen` | 房间列表 2 列头像卡、相册、电台 |
| **弹幕** | `src/components/DanmakuOverlay.tsx`（MediaScreen L1578、BilibiliLiveScreen L31 挂到 `PlayerScreen` 的 children）+ `DanmakuSettingsSheet.tsx` + `src/store/danmakuSettings.ts` + `src/services/bilibiliDanmaku.ts` | 弹幕是**组件/浮层**，不是页面 |
| **上麦** | `OnMicScreen.tsx`（全成员上麦扫描列表）+ `RoomRadioScreen.tsx`（上麦音频播放）+ `src/store/onMicStore.ts` + `FollowedRoomsScreen.tsx:2409-2418`（房间内上麦入口按钮） | 两个页面分工：扫描 vs 播放 |
| **榜单** | `MeleeRankScreen.tsx`（鸡腿/乱斗榜）+ `MediaScreen.tsx:1649` 贡献榜 Modal + `FollowedRoomsScreen.tsx` RoomRankPanel（`UI_OVERHAUL:61` 提到已主题化）+ `AnalysisScreen.tsx` 发言排行 | 榜单容器按 `SPEC` 6.8 属**内容层** |
| **个人 / 设置** | `ProfileScreen`（成员档案）、`SettingsScreen`（Tab）、`LoginScreen`、`RechargeScreen`、`DatabaseScreen`、`PhotosScreen`、`DownloadScreen`、`InvoiceScreen` | 无独立「我的」Tab；`SPEC` 6.1 建议的 5 tab（首页/房间/直播/榜单/我的）与当前 4 tab 不同 |

### 3.4 当前布局骨架（统一特征）

| 部位 | 现状 | 证据 |
| --- | --- | --- |
| **顶栏** | 全 30 页统一 `ScreenHeader`，**贴边、非悬浮**：`position:'relative'`、`paddingHorizontal:12`、`paddingBottom:12`、无圆角、无悬浮阴影；标题 `fontSize:24 / fontWeight:'800'`（硬编码，未用 typography token）；返回键 36×36 圆形（`borderRadius:18`） | `src/components/ScreenHeader.tsx:70-100`；Grep `ScreenHeader` 全 30 页命中 |
| **底栏** | `AppTabBar` 悬浮胶囊：`outer` `position:'absolute' bottom:0` + `paddingBottom:16` + `paddingHorizontal:16`；`bar` `borderRadius:28` / `minHeight:64` / `elevation:8`；`cell` 定宽 76、`borderRadius:28`；内含 BlurView + tint + 高光 + 暗边 4 层 | `src/components/AppTabBar.tsx:98-234` |
| **全局浮层** | `AppToast`（顶部胶囊）、`MiniPlayer`（应用内悬浮小窗，带拖动/控制层）、公告 `Modal`（App.tsx）、`PipToggleBridge` | `navigation/index.tsx:334-338`、`App.tsx:652-691` |
| **列表主体** | `PerfFlatList` / `FlatList` / `ScrollView`，卡片多为 `palette.surface` 实色 + hairline 边框 + 圆角 14~20 | `src/components/PerfFlatList.tsx`、`DESIGN_SYSTEM.md:62-69` |
| **浮层 / 弹层** | RN `Modal`（transparent, fade/slide）、绝对定位面板、底部 sheet（`radii.sheet=22`）、`ZoomImageModal` | `MediaScreen.tsx:197,1587,1649,1802`、`CommunityScreen.tsx:13-16` |
| **转场** | `withPageMotion` opacity+translateY；Tab 切换 `animation:'none'` | `navigation/index.tsx:63-99,187` |

---

## 4. 现有可复用组件清单

### 4.1 `src/components/`（25 个 `.tsx` + `media/player.ts`）

> 「玻璃/浮层」列：★ = 直接相关（本轮重点改造对象）；○ = 间接（浮层容器 / 会被玻璃化）；— = 无关。

| 组件文件 | 导出 | 职责 | 玻璃/浮层 |
| --- | --- | --- | --- |
| `AppTabBar.tsx` | `AppTabBar` / `MCI` / `TabBarItem` | 底部悬浮胶囊 Tab 栏（5 tab 位、active spring 弹跳、安全留白）；**唯一 expo-blur 真模糊之一** | ★ |
| `GlassCard.tsx` | `GlassCard` / `GlassCardProps` | 「伪玻璃」卡片：半透明实色 + 1px 内描边 + sm 阴影，`strong/padding/radius/tint` props；**刻意不用原生 blur** | ★（内容层误用） |
| `MiniPlayerBar.tsx` | default | 「iOS 26 Liquid Glass 浮层」迷你播放条：圆角 28、封面旋转、进度拖动、上下滑手势、弹簧按压；**未用 BlurView**（纯半透明 + 阴影） | ★ |
| `AppToast.tsx` | default | 「iOS 26 banner 风格」顶部悬浮玻璃圆角胶囊，spring 入场/退场、2.2s 自动消失 | ★ |
| `Pill.tsx` | `Pill` | 胶囊 chip / 切换控件；注释「玻璃底 + 描边」，实际 `fill3` 实底或 `tint` 实底，`borderRadius:999` | ★（语义） |
| `Skeleton.tsx` | `Skeleton` / `SkeletonRow` | 「iOS 26 玻璃色块骨架屏」：rgba(0,0,0,0.06~0.12) 脉冲色块，无 blur | ★（语义） |
| `ScreenHeader.tsx` | default | 全站大标题页头；`overlay` 时返回键用 `palette.surfaceGlassStrong`「玻璃胶囊」 | ★（overlay 分支） |
| `DanmakuOverlay.tsx` | `DanmakuOverlay` | 弹幕浮层：泳道调度、memo 单条 Bullet、白字 + textShadow 保证可读；**无玻璃/无底板/无 blur** | ○（内容层，禁止加玻璃） |
| `DanmakuSettingsSheet.tsx` | default | 弹幕设置 Modal（总开关/区域/速度/字号/不透明度/重置），`Pill`+`Button` | ○（浮层） |
| `MiniPlayer.tsx` | `MiniPlayer` | 全局应用内悬浮小窗播放器（Video / 原生 LiveExoView + 透明拖动层 + 按钮层，3s 自动隐藏） | ○（浮层） |
| `FullScreenPlayer.tsx` | default | 音乐全屏播放器 Modal（封面黑胶旋转、歌词、进度、播放列表 sheet、下拉关闭手势） | ○（浮层） |
| `ZoomImageModal.tsx` | default | 全屏图片查看器（Animated + useNativeDriver 双指缩放 1~5x / 平移 / spring 回弹） | ○（浮层） |
| `MemberPicker.tsx` | default | 成员选择 Modal（搜索 + chip） | ○（浮层） |
| `RuntimeLogViewer.tsx` | default | 运行日志查看 Modal（过滤 chip + 工具栏） | ○（浮层） |
| `CommunityPostCard.tsx` | default | 社区帖子卡（feed/详情共用：作者行 → 标题 → 正文 → 九宫格 → 数据行） | —（内容层卡） |
| `LoginPrompt.tsx` | `LoginPrompt` | 未登录统一引导卡 | — |
| `StateViews.tsx` | `StateView` / `EmptyState` / `ErrorState` | 统一空态 / 错误态（含重试按钮） | — |
| `Loaders.tsx` | `CenterSpinner` | 居中加载 | — |
| `Button.tsx` | `Button` / `ButtonVariant('filled'\|'tinted'\|'plain')` | 主/次按钮，`palette.onTint` 前景 | — |
| `HeaderAction.tsx` | `HeaderAction` | 页头右侧文字操作（label/onPress/disabled/loading） | — |
| `CoverArt.tsx` | default | 封面（黑胶圆形 / 列表 fill / 渐变兜底 / active 高亮点） | — |
| `NetworkImage.tsx` | `NetworkImage` | 网络图封装（失败回退占位） | — |
| `PerfFlatList.tsx` | `PerfFlatList` | 高性能 FlatList 封装（forwardRef） | — |
| `Motion.tsx` | `FadeInView` / `ScalePressable` | 入场淡入 / 按压缩放 | — |
| `ErrorBoundary.tsx` | default (class) | 错误边界，统一 `ErrorState` | — |
| `media/player.ts` | — | 媒体播放辅助 | — |

### 4.2 `src/player/` 子系统（12 文件）

| 文件 | 职责 |
| --- | --- |
| `PlayerScreen.tsx` | 统一播放器外壳；`children` 插槽挂弹幕；`source/meta/danmaku/features/persistent/inline/onVideoSize/resumeAt/onRetry` |
| `chrome/PlayerChrome.tsx` | **唯一控制层**：`expo-linear-gradient` 渐变遮罩顶栏 + 悬浮底坞（进度/倍速/弹幕/全屏）+ 更多面板；`CONTROLS_HIDE_MS=3500`；`inline` 模式不渲染顶栏 |
| `chrome/FullscreenManager.tsx` | 全屏 / 横竖屏管理、`formatPlayTime` |
| `core/PlayerCore.tsx` | 内核选择（rtmp/flv → exo；HLS/mp4 → native/web 兜底，L192） |
| `core/ExoKernel.tsx` | 原生 `LiveExoView` 内核（RTMP/http-flv） |
| `core/NativeKernel.tsx` | `react-native-video` `<Video>` 内核 |
| `core/WebKernel.tsx` | WebView 播放兜底 |
| `resolve/streamResolver.ts` | 流地址解析 |
| `store/playerStore.ts` | 播放状态 |
| `player/types.ts` / `index.ts` | 类型与出口 |

### 4.3 玻璃 / 浮层组件分组结论

- **直接用了 expo-blur（真模糊）**：仅 `AppTabBar.tsx`、`FollowedRoomsScreen.tsx`（页面内工具条）2 处。
- **自称玻璃但实为半透明色块**：`GlassCard.tsx`、`MiniPlayerBar.tsx`、`AppToast.tsx`、`Pill.tsx`、`Skeleton.tsx`、`ScreenHeader.tsx(overlay)`、`MediaScreen.tsx` 公告面板等。
- **浮层容器（未来允许玻璃化的白名单候选）**：`AppTabBar` / `AppToast` / `MiniPlayer` / `MiniPlayerBar` / `PlayerChrome` / `DanmakuSettingsSheet` / `FullScreenPlayer` 的播放列表 sheet / `ZoomImageModal` 工具条 / `ScreenHeader` 返回键 / 各 `Modal` sheet。
- **内容层（按 `SPEC` D1 严禁玻璃）**：`DanmakuOverlay`、聊天气泡（`FollowedRoomsScreen` / `PrivateMessagesScreen`）、榜单行（`MeleeRankScreen` / `MediaScreen` 贡献榜）、房间卡 / 直播封面卡、`CommunityPostCard`、`Skeleton`、`StateViews`。
- **可完全复用、无需改造**：`DanmakuOverlay`（现状已满足弹幕红线）、`PerfFlatList`、`NetworkImage`、`CoverArt`、`Motion`、`StateViews`、`ErrorBoundary`、`Loaders`、i18n / store / api / utils 层。

---

## 5. 现有设计系统 & 与 Apple Liquid Glass 规范冲突点

### 5.1 现行 token（**代码实测值**）

| 类别 | 值 | 证据 |
| --- | --- | --- |
| 色板 · 亮 | `background #ECEDF1`、`surface/surfaceElevated/surfaceGlass #F4F5F9`、`surfaceGlassStrong #F4F5F9`、`label #111114` / secondary `#55555C` / tertiary `#9A9AA1`、`tint #ff6f91`、`hairline rgba(0,0,0,0.06)`、`fill2 rgba(0,0,0,0.05)` | `src/theme/colors.ts:16-32`（L12-15 注释说明 2026-09-06 由 #F5F5F7 / #FFFFFF 改版） |
| 色板 · 暗 | `background #0B0B0F`、`surface #1C1C1F`、`surfaceGlassStrong #232327`、`tint #ff8fa8`、`hairline rgba(255,255,255,0.10)` | `colors.ts:34-50` |
| 语义色 | `success #34C759` / `warning #FF9F0A` / `danger #FF3B30` / `info #5AC8FA` | `colors.ts:52-57` |
| **另一套半透明色（控件/卡片底板，属 C1b 违规）** | `ui.colors.card rgba(255,255,255,0.88)`、`cardOnImage rgba(255,255,255,0.72)`、`borderOnImage rgba(255,255,255,0.62)` —— 是控件/卡片**自身底板**，须替换为不透明实色；**不是** C1a 的承载全屏背景容器/压暗遮罩 | `src/theme/ui.ts:2-12` |
| 圆角 | `none0 / xs6 / sm10 / md14 / lg20 / xl28 / 2xl36 / pill999 / sheet22`；`radiiAlias.card=20`、button=18、input=14、chip/avatar=pill | `src/theme/radii.ts:2-26` |
| 间距 | `4/8/12/16/20/24/32/40/56`；`insets.screenHorizontal=20`、listInset=20、cardPadding=16 | `src/theme/spacing.ts:2-23` |
| 字号 | `largeTitle 34/41/700`、`title1 28`、`title2 22`、`title3 20`、`headline 17/600`、`body 17`、`callout 16`、`subhead 15`、`footnote 13`、`caption1 12`、`caption2 11` | `src/theme/typography.ts:23-35` |
| **实际页头字号** | `fontSize:24 / lineHeight:30 / fontWeight:'800' / letterSpacing:-0.3`（**硬编码，未用 token**） | `src/components/ScreenHeader.tsx:89-99` |
| 阴影 | `makeShadows(isDark)` 四档 xs/sm/md/lg（Android 走 `elevation`，iOS 走 shadow*） | `src/theme/shadows.ts:4-31` |
| 动效 | `motion.spring.bouncy(damping14,stiffness180)` / default / precise；duration fast160/base240/slow360 | `src/theme/motion.ts:2-17` |
| 另套动效/TabBar | `ui.motion.tabDuration=180 / stackDuration=220`；`ui.tabBar{horizontalInset:42,bottom:14,height:74,radius:32,itemHeight:56}` | `src/theme/ui.ts:13-29` |
| 主题解析 | `useResolvedTheme` 支持 `light/dark/system` 跟随系统 `useColorScheme` | `src/hooks/useAppTheme.ts:6-26` |
| **玻璃参数** | **未找到**。全 `src/**/*.ts` Grep `glass|blurRadius|transparency|intensity` 仅命中 `colors.ts` 的 `surfaceGlass`/`surfaceGlassStrong` 两个**不透明色值** | Grep 结果 |

### 5.2 六份设计文档要点速览

| 文档 | 色板/圆角/间距/字号/组件规范摘要 |
| --- | --- |
| `DESIGN_SYSTEM.md` | 色板表（background #F5F5F7 / surface #FFFFFF / surfaceGlass #FFFFFF，标注「**实心**」）；圆角「卡片 16 · 小组件 14 · 按钮 18 · 胶囊 999」；间距「页面水平 16、卡内 12-14、卡片间距 4-5、分组 20」；字号「标题 15/700、副标题 12、辅助 11」；组件规范：一律 `usePalette()`、MaterialCommunityIcons、**实心** `palette.surface` + hairline + 圆角 16、主按钮 tint 底白字 18 圆角；L71-72 禁止改原生/加依赖/动播放器覆盖层 |
| `DESIGN_UI_2026-08-15.md` | 保留 iOS 26 token 并扩展；「卡片用 GlassCard」「玻璃描边 + 语义色」「去霓虹发光」；ScreenHeader 重写为左对齐大标题 + **玻璃圆形返回键**；Home 大标题 + 内容轮播 + chips + 折叠区 |
| `UI_LAYOUT_PLAN_v2.md` | 总则「卡片圆角 16」「封面一律全幅 + 渐变遮罩 + 白字上浮」「筛选一律横向滚动 chips」；首页/直播/录播/房间四页线框 |
| `UI_OVERHAUL_2026-08-16.md` | 全站 30 页 + 22 组件统一 Palette；新增 `onTint`、`radii.sheet=22`；`GlassCard` 删 Platform.select；`AppTabBar` 加 active 图标 spring；`Skeleton` 删空样式；`AppToast` 圆角改 radii.sheet；删 `EmptyState.tsx`（并入 `StateViews`） |
| `UI_AUDIT_2.7.1.md` | 26 页 + 组件的文字收缩/截断/最小宽度、动画停止清理、Dock 避让、横竖屏、FAB 安全区；深色主题下图片背景/Dock/播放器控制层对比度仍需回归 |
| `AUDIT_SCREENS.md` | 26 页功能/API/短板清单；三系统结论（错误态缺重试、分页不统一、空/加载态缺失） |

### 5.3 文档与代码漂移（须先解决的事实来源问题）

| 项 | 文档声明 | 代码实测 | 结论 |
| --- | --- | --- | --- |
| surface 色 | `#FFFFFF`（DESIGN_SYSTEM L13） | `#F4F5F9`（colors.ts L18） | 漂移（2026-09-06 改版后文档未更新） |
| background 色 | `#F5F5F7`（L12） | `#ECEDF1`（colors.ts L17） | 漂移 |
| 卡片圆角 | 16（L20, L66） | `radiiAlias.card=20`（radii.ts L19） | 漂移 |
| 标题字号 | 15/700（L67） | `ScreenHeader` 24/800（L93-96） | 漂移；且 `typography.largeTitle` 定义了 34 但全 src **0 使用** |
| 半透明卡片 | 「禁止半透明白 rgba 做卡片底」（L64） | `ui.ts:8-9` 就是 rgba 半透明 card | 自相矛盾 |
| 玻璃语义 | DESIGN_SYSTEM「实心卡片」 | DESIGN_UI「卡片用 GlassCard / 玻璃描边」 | 两份文档语义冲突 |
| 页面数 | 27（DESIGN_SYSTEM L3）/ 26（AUDIT）/ 30（UI_OVERHAUL L3） | **30** | 历史快照递进，当前 30 |
| TabBar 配置 | `ui.tabBar{radius:32,inset:42,bottom:14}` | `AppTabBar` 自写 `borderRadius:28` / `paddingHorizontal:16` / `paddingBottom:16`；`tabBarStyle.ts` **死代码** | 三套并存，`mainTabBarStyle()` 全 src 仅定义处 1 命中 |
| 组件存在性 | UI_OVERHAUL 提到 `AppScaffold/ListItem/SectionHeader/EmptyState` | 当前 `src/components/` **未找到** | 已删/未落地 |

### 5.4 与 Apple Liquid Glass 规范对照与冲突点（逐条，引用 `SPEC` 条款编号）

> **判定口径（经主理人裁决修订，v1.1）**：D1/M2 禁的是「内容层用玻璃/半透明材质」、D2 禁的是「**控件下方**垫实色/半透明底板」，两者针对的是**控件或卡片自身的底板**；[L]/**M9** 反而要求「全屏背景延伸到 sidebars / toolbars / tab bars 下方」。因此分类依据不是「是否出现 transparent / rgba 字面」，而是**透明对象的角色**：
> - **合规且必须保留**：透明的是「承载内容的全屏背景」（screen / 根容器 / 场景容器）+ 其上的整体压暗遮罩（[LV] content footer darkening、[M] clear 背后 dimming 的内容层可读性处理）。删掉会违反 M9 并破坏 scroll edge effect 前提。
> - **违规需替换**：透明/半透明的是「控件/卡片自身的底板」。改为不透明实色或 standard material 近似。

| # | 对照 / 冲突点 | 现状证据 | 违反 / 符合条款 | 建议动作 |
| --- | --- | --- | --- | --- |
| **C1a** | ✅ **承载全屏背景的容器透明 + 整体压暗遮罩（合规、必须保留）** | `App.tsx:641` 根容器 `backgroundColor: transparent`（有自定义背景时）；`:701-709` `ImageBackground` 铺满 + 0.88/0.92 整体压暗遮罩；`navigation/index.tsx:185` `sceneStyle:{backgroundColor:'transparent'}`、`:266-267` navTheme `background/card='transparent'`、`:303` `cardStyle` transparent、`:270` `bgScrim 0.34`；`colors.ts:98-102` `usePageBackground()` 返回 transparent | **符合 M9**（全屏背景延伸到 bar 下方）/ **M8** 的 scroll edge effect 前提；遮罩符合 **[LV]**「content footer subtle darkening」与 **[M]** clear 背后 dimming 的内容层可读性语义；**不违反 D1/D2**（不是控件/卡片底板） | **保留**，不得删除。仅把 0.88/0.92/0.34 等散落值**归一到 `glass.ts` 的单一语义 token**（内容层可读性遮罩 `contentScrim` 与 clear+亮底 `dimming=0.35` 两个不同语义分开管理），避免到处硬编码 |
| **C1b** | 🚫 **内容层控件 / 卡片自身底板的半透明（违规需替换）** | `src/theme/ui.ts:8-9` `card: rgba(255,255,255,0.88)` / `cardOnImage: rgba(255,255,255,0.72)` / `borderOnImage: rgba(255,255,255,0.62)`；`src/components/GlassCard.tsx:40-60` 半透明实色 + 内描边，被当**内容层普通卡片**用于 `HomeScreen.tsx:614,790`、`RechargeScreen.tsx:64`（另 `UI_OVERHAUL_2026-08-16.md:63` 记录 LoginScreen 6 段手写玻璃曾改为 GlassCard）；`DESIGN_SYSTEM.md:64` 自己就写着「禁止半透明白 rgba 做卡片底」 | **D1**（Don't use Liquid Glass in the content layer）、**M2**（内容层用 standard materials）、**D2**（控件下方不垫半透明底板）、**M4**（sparingly） | 改为**不透明实色** `palette.surface` + 圆角 + 分层阴影，或 standard material（ultraThin/thin/regular/thick）近似；`GlassCard` 拆为「内容层实色卡」与「浮层 GlassSurface」。**注意：此条不含 C1a 的背景容器透明** |
| C2 | **「玻璃」语义被滥用 / 伪玻璃当内容层卡片** | `GlassCard.tsx` 自称「iOS 26 Liquid Glass 卡片」但实为半透明实色+内描边，被 `HomeScreen.tsx:614,790`、`RechargeScreen.tsx:64` 当普通内容卡使用；`Skeleton.tsx:2` 自称「玻璃色块骨架屏」；`Pill.tsx:3` 自称「玻璃底」；`MiniPlayerBar.tsx:2` 自称「Liquid Glass 浮层」；screens 内 rgba 半透明散落（MediaScreen 26、FollowedRoomsScreen 25、VideoLibrary 7、RoomAlbum 7、BilibiliLive 5、Home 5…）**〔该统计是 rgba 字面总数，须按 C1a/C1b 口径逐处判定透明对象的角色：属背景遮罩/浮层者保留并归一，属控件/卡片底板者替换，不得一刀切删除〕** | **D4**（禁止滥用自定义玻璃控件）、**D1**、**M4**（sparingly） | 建立「浮层白名单」，白名单外（内容层控件/卡片底板）一律实色；`GlassCard` 更名/拆分（内容卡 vs 浮层玻璃） |
| C3 | **文字对比度不达标风险** | `colors.ts:27` `labelTertiary #9A9AA1` on `#F4F5F9`（估计 < 4.5:1）；`AppTabBar.tsx:113` 0.86/0.88 底 + BlurView 62/82 + 白色高光 0.20/0.85；`MediaScreen.tsx:2052-2057` 公告面板 `rgba(18,18,20,0.92)` 上用 11/13px 小字（`#fb7299` on 深底）；`navigation/index.tsx:270` bgScrim 0.34；`UI_AUDIT_2.7.1.md:60` 自承「深色主题下图片背景、底部 Dock、播放器控制层的对比度」待回归 | **M19**（WCAG AA 4.5:1/3:1）、**M5**（vibrant 色）、**D7**（禁止硬编码系统色）、**M18**（4 套色变体，当前仅 2 套） | 建 4 套色 token；玻璃上文字实测对比度；建立 dimming 单一参数（见 C9）；`bgScrim 0.34` / `App.tsx` 0.88/0.92 归一到 `contentScrim` 单一 token 后复测对比度（**保留背景压暗，仅归一数值**） |
| C4 | **栏贴边、不悬浮；缺大悬浮 UI** | `ScreenHeader.tsx:71-79` `position:'relative'`、`paddingHorizontal:12`、无圆角；返回键 36×36（L81-88）；全 30 页复用。`AppTabBar` 是唯一悬浮栏，但 `outer` `bottom:0` + `paddingBottom:16`（L176-184），离屏底边过近 | **M1/M8**（控件浮在内容之上、不得垫底板）、`SPEC` 0.1「大悬浮 UI 集中到 3 个功能层组件」 | 页头改悬浮胶囊/大圆角容器；TabBar 增大离边留白；主行动（上麦）做 XLarge 悬浮按钮 |
| C5 | **大圆角不足、圆角硬编码孤立值、无同心几何** | `radii` 最大 `2xl=36`、`card=20`、`sheet=22`；`borderRadius: 数字` 在 screens 约 240+ 处硬编码（FollowedRoomsScreen 43、AnalysisScreen 20、MediaScreen 17、HomeScreen 16、PrivateMessagesScreen 16）；`AppTabBar.tsx:188` bar 28 / `:231` cell 28（同值而非父−padding）；`ScreenHeader.tsx:84` 返回键 18；`ui.ts:17` 另给 radius 32 | **M25/S17/S18**（Capsule 默认、同心圆角、大组件 28–32dp）、`SPEC` 4.2 | 集中到 `glass.ts` 的几何函数（`childRadius = parentRadius - padding`），禁止内联数字 |
| C6 | **英雄文字缺失** | 全 src Grep `largeTitle\|title1\|title2` **0 命中**；`ScreenHeader` 硬编码 24/800；DESIGN_SYSTEM 规范 15/700；无 Dynamic Type / fontScale 适配（Grep `DynamicType` 0 命中） | **M20/M21**、D14/D15、`SPEC` 4.1（Large Title 31sp Bold，英雄 34–41sp，每屏 1 处） | 新增 hero token + 每屏 1 处（房间名/直播标题/空态），支持 fontScale |
| C7 | **玻璃参数无单一来源 / 多套硬编码并存** | intensity 62/82（`AppTabBar.tsx:122`）、70（`FollowedRoomsScreen.tsx:2362`）；rgba 0.86/0.88/0.06/0.12/0.20/0.85/0.32（AppTabBar）、0.92（MediaScreen 公告）、0.34（navigation bgScrim）、0.88/0.92（App.tsx 背景遮罩）、0.96/0.94/0.76/0.72（死代码 `tabBarStyle.ts`）；`src/**/*.ts` 无任何 `GlassParams` 类 | **M23**（多个玻璃组件放进同一容器）、D9（数量失控）、`SPEC` 4.4 | 新建 `src/theme/glass.ts` 单一来源（见 §8.4）；其中 `0.88/0.92/0.34` 属 C1a 背景遮罩 → **保留、只归一**，`tabBarStyle.ts` 死代码整套值 → 删除，其余归一 |
| C8 | **相邻玻璃控件未成组 / 多层独立平铺** | `AppTabBar.tsx:119-158` BlurView + tint 层 + 高光 + 暗边是 4 个独立 `StyleSheet.absoluteFill` View；`FollowedRoomsScreen.tsx` 工具条外加 `chatToolsClip` 独立容器；无 `GlassEffectContainer` 语义 | **M23**、D9、`SPEC` 5.2 第 3 条（成组渲染） | 抽统一 `GlassSurface` 组件，一个容器承载模糊/膜层/高光/边缘光，禁止逐层平铺 |
| C9 | **clear 变体 / dimming 缺失** | 播放器控制层 `PlayerChrome.tsx:2-3,37-41` 用 `expo-linear-gradient` 渐变遮罩 + 悬浮底坞，无 `#000@0.35` dimming，无亮度判定阈值；`clear` 与 `regular` 无语义区分 | **M6/M7**（clear 仅媒体背景 + 亮底 35% dimming）、`SPEC` 6.3 | 在 `glass.ts` 定义 `variant:'regular'|'clear'` 与 `dimming=0.35`、bright 阈值 |
| C10 | **可访问性降级 0 覆盖** | 全 src Grep `reduceMotion` / `AccessibilityInfo` / `isReduceMotionEnabled` / `accessibilityIgnoresInvertColors` **0 命中**；色 token 仅 light/dark 2 套；`useSafeAreaInsets.ts:27-36` 纯 JS 经验值 | **M19/M20/M22/M35**、D20、`SPEC` 5.1（四条降级矩阵） | 新建降级开关与 4 套色 token（见 §9.5） |
| C11 | **历史规约禁止原生改动，与任何引擎落地冲突** | `DESIGN_SYSTEM.md:71-72`「禁止新增 npm 依赖、改 android/ 原生、改 store/api、动播放器覆盖层」；`README.md:48` 兼容 Android 8+/鸿蒙；`android/gradle.properties:38` newArchEnabled=false | 项目治理约束（非 Apple 条款） | **需用户/PM 明确解禁**才能走 §7 路径 B/C（见 §9.6） |
| C12 | **Tab 结构 / 导航语义** | 当前 4 Tab（主页/直播/房间/设置），`MainTabBar` 里 `hidden` 时 `return null`（`navigation/index.tsx:141` 由 `useUiStore.tabBarHidden` 驱动，全站可隐藏 TabBar）；`TAB_LABELS` 图标为 `MCI('home'/'video'/'account-group'/'cog')`，label 为中文双字 | **M14/M15**（tab bar 常驻、不得隐藏/禁用）、M13（只做导航）、M16（单词标签+filled 图标）、D8 | 移除 `tabBarHidden` 隐藏逻辑或改为模态覆盖时才隐藏 |
| C13 | **直播场景控件遮挡 / 沉浸** | `PlayerChrome.tsx:31` `CONTROLS_HIDE_MS=3500` 自动隐藏（合规方向），但 `MediaScreen.tsx:1505-1522` 公告面板 `position:'absolute' top:0 left:10 right:10 zIndex:29` 会长时间占顶部；送礼/贡献榜 Modal 同时可开 | **M32/D21**（直播内容优先、导航层不得长时间遮挡）、`SPEC` 6.3 | 控制条让位全屏沉浸；公告改为可收起 chip；一次只 1 个 sheet（M31/D18） |
| C14 | **文档非单一事实来源** | 见 §5.3 漂移表；6 份文档互相矛盾、页面数 26/27/30 不一致 | 项目治理 | 合并/废弃历史文档，只保留一份 Liquid Glass 版 DESIGN_SYSTEM |

---

## 6. LiquidGlass 引擎全量盘点

### 6.1 文件与模块

| 文件 | 内容 |
| --- | --- |
| `LG/liquidglass/src/main/java/com/jiale/liquidglass/LiquidGlass.kt` | 核心：`LiquidGlassSurface`、`GlassParams`、`LocalGlassParams`、`Backdrop`、`LocalBackdrop`、`GLASS_BLUR`、全部绘制算法（50.8KB） |
| `LG/liquidglass/src/main/java/com/jiale/liquidglass/GlassDefaults.kt` | 默认值 + 推荐区间 + `COMPACT_BLUR` / `COMPACT_EDGE_WIDTH` |
| `LG/liquidglass/src/main/java/com/jiale/liquidglass/GlassBackdrop.kt` | `GlassBackdrop` 背板 + `rememberBackdropImage(File)` |
| `LG/liquidglass/src/main/java/com/jiale/liquidglass/RefractMode.kt` | `enum class RefractMode { SCALE, FIELD }` |
| `LG/sample/src/main/java/com/jiale/liquidglass/sample/MainActivity.kt` | 示例：`SampleScreen` / `DraggableProbe` / 玻璃按钮 / 折射 Slider / legacy Switch / `createBackdrop()` |
| `LG/liquidglass/build.gradle.kts` | 库模块：`minSdk 26` / `compileSdk 35` / compose=true / maven-publish / `libraryVersion="0.1.3"` / groupId `com.jiale` |
| `LG/sample/build.gradle.kts` | 示例 App：`applicationId com.jiale.liquidglass.sample` / minSdk26 / targetSdk35 / compose=true / activity-compose |
| `LG/gradle/libs.versions.toml` | 版本目录 |
| `LG/settings.gradle.kts` / `build.gradle.kts` / `gradle.properties` / `.jitpack.yml` / `consumer-rules.pro` | 工程配置 |
| `LG/README.md` | 15KB 全量文档（快速开始、参数、原理、性能预算、硬约束、局限、版本基线、上游同步表） |

### 6.2 全部公开 Composable / API / 参数

| API | 类型 | 签名 / 关键参数 | 文件 |
| --- | --- | --- | --- |
| `LiquidGlassSurface` | `@Composable` | `(modifier: Modifier, shape: Shape, blurRadius: Dp = GLASS_BLUR, edgeWidth: Dp, onClick: (() -> Unit)? = null, enabled: Boolean = true, content: @Composable BoxScope.() -> Unit)` | `LiquidGlass.kt` |
| `GlassParams` | `data class` + `@Stable` | `transparency: Float, refractDp: Float, refractMode: RefractMode, edgeWidthDp: Float, edgeGlow: Float, dispersion: Float, legacyBackdrop: Boolean` | `LiquidGlass.kt` |
| `LocalGlassParams` | `staticCompositionLocalOf<GlassParams>` | 全局参数下发（`CompositionLocalProvider`） | `LiquidGlass.kt` |
| `GlassBackdrop` | `@Composable` | `(image: ImageBitmap?, modifier: Modifier, scrimAlpha: Float = GlassDefaults.SCRIM, content: @Composable () -> Unit)`；通过 `LocalBackdrop` 把背板喂给所有玻璃 | `GlassBackdrop.kt:44-90` |
| `rememberBackdropImage` | `@Composable` | `(file: File?): ImageBitmap?`；`BitmapFactory.decodeFile`，主线程解码（只适合 2048px 长边小图） | `GlassBackdrop.kt:98-104` |
| `Backdrop` | `class` | `image: ImageBitmap?`, `size: IntSize`, `origin: Offset`, `scrim: Float` + `val usable: Boolean` | `LiquidGlass.kt` |
| `LocalBackdrop` | `compositionLocalOf<Backdrop>` | 背板契约（可自行实现） | `LiquidGlass.kt` |
| `RefractMode` | `enum class` | `SCALE("整体放大")`、`FIELD("边缘折射")`，含 `label`/`description` | `RefractMode.kt:18-21` |
| `GlassDefaults` | `object` | 见 §6.3 | `GlassDefaults.kt` |
| `GLASS_BLUR` | `val Dp = 12.dp` | 顶层公开常量（大控件默认模糊半径） | `LiquidGlass.kt` |

**渲染管线（能力清单）**：① 背板重画 + `BlurEffect`（`RenderEffect`，真 GPU 模糊，按 `ContentScale.Crop` 同套坐标换算，只截控件周围一小块 + 1.8×半径出血）；② 透镜位移（`SCALE` 线性放大 1 次绘制 / `FIELD` 逐层内缩 3–6 次带裁剪）；③ 边缘（顶部 12dp 白雾 + 上 3dp/下 2dp 内缘亮带 + 三层渐变边缘光带）；④ 色散（三通道 R 内收 / B 外偏 + `BlendMode.Plus` 加性叠加）；⑤ 膜层（`MaterialTheme.colorScheme.surface` + `ColorMatrix` 饱和 1.45/对比 1.12/亮度 +0.03）；⑥ API<31 降级（只画膜层 + 边缘光，不重画背板）；⑦ 弹层 window 退化（`Backdrop.usable=false` 时降级）。

### 6.3 参数：默认值与推荐区间（`GlassDefaults.kt` + `README.md:123-151`）

| 参数 | 默认 | 最小 | 最大 | 说明 | 作用域 |
| --- | --- | --- | --- | --- | --- |
| `transparency` | `0.38` | `0.05` | `0.70` | 通透度；膜层浓度 = 1 − 它；**玻璃上压正文别超 0.5** | 全局 `GlassParams` |
| `refractDp` | `5.0` | `0.0` | `12.0` | 折射强度（轮廓处位移量 dp） | 全局 |
| `refractMode` | `SCALE` | — | — | `SCALE`（1 次绘制，最省）/ `FIELD`（3–6 次，更好看） | 全局 |
| `edgeWidthDp` | `2.0` | `0.6` | `10.0` | 边缘光带宽度；越宽整体越淡，宽度大时用 `edgeGlow` 补亮度 | 全局 |
| `edgeGlow` | `1.0` | `0.4` | `2.5` | 边缘光亮度倍率 | 全局 |
| `dispersion` | `0.35` | `0` | `1` | 色散（色差）强度 | 全局 |
| `legacyBackdrop` | `false` | — | — | 复刻 0.5.1「错位」写法（错误对齐，默认关） | 全局 |
| `scrim`（`SCRIM`） | `0.55` | `0` | `0.95` | 背板遮罩浓度，保证叠字可读 | `GlassBackdrop.scrimAlpha` |
| `GLASS_BLUR` | `12.dp` | — | — | 大控件默认模糊半径 | `LiquidGlassSurface.blurRadius` 入参 |
| `COMPACT_BLUR` | `6.dp` | — | — | **小控件**（按钮≈40dp、指示器≈32dp）用 | 组件入参 |
| `COMPACT_EDGE_WIDTH` | `1.2.dp` | — | — | 小控件边缘光宽度 | `edgeWidth` 入参 |

> README 明确：**模糊半径与边缘光宽度是 `LiquidGlassSurface` 的入参，不是全局参数**，因为必须跟控件尺寸走（L137-147）；半径接近控件高度时玻璃里只剩一团均匀色块（L149-150）。

**内部配方常量**（`LiquidGlass.kt` private，供调参参考）：`GLASS_SATURATION 1.45f`、`GLASS_CONTRAST 1.12f`、`GLASS_BRIGHTNESS 0.03f`、`GLASS_BLEED_FACTOR 1.8`、`GLASS_RIM_TOP 3.dp`、`GLASS_RIM_BOTTOM 2.dp`、`GLASS_TOP_SHEEN 12.dp`、`FIELD_BAND_MAX 12.5.dp`、`DispersionRgb` 权重与归一化偏移。

### 6.4 示例组件（`LG/sample/.../MainActivity.kt`）

| 示例 | 位置 | 用途 / 关键参数 |
| --- | --- | --- |
| `SampleScreen` | L74-156 | 组合根；`CompositionLocalProvider(LocalGlassParams provides params)`（L89）演示「一次下发全树生效」 |
| **大玻璃卡片** | L103-117 | `fillMaxWidth().height(120.dp)`、`MaterialTheme.shapes.large`、默认 12dp 模糊；内含两行正文 |
| **`DraggableProbe`（可拖动玻璃）** | L158-197 | 170×110dp；`BoxWithConstraints` + `pointerInput(maxX,maxY){ detectDragGestures }` + `LaunchedEffect` 夹回边界；演示「真玻璃在动」 |
| **玻璃按钮** | L122-133 | 180×40dp、`RoundedCornerShape(percent=50)`、`COMPACT_BLUR`/`COMPACT_EDGE_WIDTH`、`onClick` |
| **折射强度 Slider** | L135-145 | `valueRange = REFRACT_DP_MIN..REFRACT_DP_MAX`，实时改 `GlassParams.refractDp` |
| **legacy 错位 Switch** | L147-152 | 切 `legacyBackdrop`，演示 0.5.1 错误对齐观感 |
| `createBackdrop()` | L199-226 | 纯代码画 1080×2000 背板（4 段 LinearGradient + 6 个半透明圆块），**无需图片资源**；注释说明色块是为了让折射/色散可见 |
| `MainActivity` | L63-72 | `ComponentActivity` + `setContent { MaterialTheme { SampleScreen() } }` |

### 6.5 版本基线、依赖引入方式

| 项 | 值 | 证据 |
| --- | --- | --- |
| Kotlin | `2.0.20` | `gradle/libs.versions.toml:4`、`README.md:280` |
| Compose BOM | `2024.09.00` | `libs.versions.toml:5`、`README.md:281` |
| AGP | `8.7.3` | `libs.versions.toml:3`、`README.md:282` |
| Gradle | `8.9`（镜像 `mirrors.cloud.tencent.com`） | `gradle/wrapper/gradle-wrapper.properties:3`、`README.md:283` |
| compileSdk / minSdk | `35` / `26` | `liquidglass/build.gradle.kts:14,19`、`README.md:284` |
| 运行时 | **API 31+ 才有真模糊**（`Build.VERSION.SDK_INT >= S`），低版本退化膜层 | `LiquidGlass.kt`、`README.md:13,285` |
| Java / JDK | `VERSION_17` / jvmTarget 17 / `.jitpack.yml: openjdk17` | `build.gradle.kts:29-36`、`.jitpack.yml` |
| 库坐标 | `groupId=com.jiale`, `artifactId=liquidglass`, `version=0.1.3` | `liquidglass/build.gradle.kts:10,52-57` |
| namespace | `com.jiale.liquidglass` | `build.gradle.kts:13` |
| **方式 A 源码引入** | `settings.gradle.kts: include(":liquidglass")` + `implementation(project(":liquidglass"))` | `README.md:24-34` |
| **方式 B JitPack** | `maven("https://jitpack.io")` + `implementation("com.github.shufajiaok.LiquidGlass:liquidglass:0.1.3")` | `README.md:36-53` |
| JitPack 注意 | 按需云端现编：首次须到 jitpack.io 点 Look up，等 `0.1.3` 变绿再依赖 | `README.md:38-40` |
| 库依赖 | `api(composeBom)` + `api(androidx.ui / ui-graphics / foundation / material3)`（用 `api` 因公开签名含 Compose 类型） | `build.gradle.kts:62-71` |
| 三方依赖 | **无**：不用 haze、不用 RuntimeShader、无 AGSL/shader 文件、零 KSP/kapt、`consumer-rules.pro` 为空 | `README.md:6,11-12`；`consumer-rules.pro` |
| sample 依赖 | `activity-compose 1.9.2` + `ui-tooling` | `sample/build.gradle.kts:39-45`、`libs.versions.toml:6` |
| License | MIT | `README.md:322` |

### 6.6 已知限制、性能说明、调参建议（全部来自 `README.md`）

**硬约束 / 局限（L244-274）**：

| 限制 | 说明 | 对本 App 的影响 |
| --- | --- | --- |
| 静态背板 | 「背板必须是静态的。要模糊滚动内容得换图层捕获方案（本项目没做）」；自定义 `Backdrop` 前提是静态（L118-120） | 本 App 全是滚动列表 → 玻璃不能模糊滚动内容 |
| **弹层 window 退化** | 「对话框 / 底部弹层里的玻璃没有模糊 —— 弹层是独立 window，`positionInRoot()` 和主窗口背板对不上。组件会自动退化成『磨砂膜层 + 边缘光』（设计如此）」 | **本 App 大量 RN `Modal`（独立 window）→ 弹层里放真玻璃会退化** |
| API < 31 无真模糊 | 只画「半透明膜层 + 边缘光」，**不做重画**（画清晰背景反而像挖洞） | minSdk 26 的旧机/鸿蒙用户只能得到膜层 |
| `MaterialTheme` 依赖 | 膜层色取 `MaterialTheme.colorScheme.surface`，主题外拿不到色 | RN 侧无 MaterialTheme；原生桥接需自建 MaterialTheme 包装 |
| 出血节点约束 | 必须 `requiredSize` + `Box(matchParentSize())` 包一层，否则 `size()` 被父约束夹住、边缘闪 | 原生实现细节 |
| 位置/尺寸读取时机 | 只在 draw / layer 阶段读；组合阶段读会让每次滚动触发重组、玻璃里内容慢半帧 | — |
| 不要改「预模糊」 | 会把架构锁死在静态背板 | — |
| 环精确相邻 | 三通道覆盖集合必须严格一致：缝→偏青绿，重叠→偏品红 | — |
| `Path.op` 只有三参成员 | 需 `Path().apply { op(a,b,Op) }` | — |

**性能预算（L224-240）**：

| 场景 | 每帧绘制次数（`drawImage`+`clipPath`） |
| --- | --- |
| 整体放大，无色散 | 1 |
| 整体放大 + 色散 | ≈10 |
| 边缘折射 + 色散 | ≈16 |

真正成本在「同屏几块玻璃」：**同屏 1–3 块小面 ≈ 无感；一页 5 张卡片全玻璃 → 明显掉帧**。每块每帧一次离屏图层 + 一次 `RenderEffect`。快速估算 = 玻璃面数 × 绘制次数；想省先减面数，再把 `refractMode` 降到 `SCALE`。

**README 给出的调参建议（L84-92, L123-151, L154-181, L268-274）**：

1. 全局可调：`CompositionLocalProvider(LocalGlassParams provides GlassParams(...))` 一次下发全树生效（可接设置页滑块）。
2. `transparency` 玻璃上压正文别超 `0.5`；`edgeWidthDp` 越宽越淡，宽时补 `edgeGlow`。
3. 小控件必须显式传 `COMPACT_BLUR(6dp)` + `COMPACT_EDGE_WIDTH(1.2dp)`，不能用默认 12dp；「半径一旦接近控件高度，里面只剩一团均匀色块」。
4. `SCALE` 最省（1 次绘制）/ `FIELD` 更好看（3–6 次带裁剪），两者共用 `refractDp` 但 `FIELD` 观感更弱（位移从 0 起算）。
5. `legacyBackdrop` 默认关，是复刻「效果好但不正确」的写法；打开后滚动/拖动时玻璃内容会脱节、右下角露膜层；与 SCALE/FIELD 正交。
6. 用 `GlassBackdrop` 时，**Scaffold / TopAppBar / NavigationBar 的容器色必须显式设成透明**，否则盖住背板（L63-65）；背板铺图用 `ContentScale.Crop`，改铺图方式须同步改 `LiquidGlassSurface.BackdropSlice` 的坐标换算。
7. 遮罩浓度按背景深浅调（浅图调深、深图调浅）保证文字可读；背板本身始终清晰，「真玻璃只该糊自己那一片」（`GlassBackdrop.kt:32-38`）。
8. 现象排查表：玻璃里均匀色块 → 换 COMPACT_BLUR；低版本没效果 → 无 RenderEffect；边缘杂色 → 检查 dispersion 与环几何。
9. 上游同步：库从 HealthCheckIn 0.7.4 剥离，两份代码需手动同步，`README.md:296-318` 给出文件映射表与 diff 方法；改完两边都要各编一次。

---

## 7. 【最重要】复用性判定表

### 7.1 技术栈鸿沟（先定事实）

| 维度 | 当前 App | LiquidGlass 引擎 | 是否互通 |
| --- | --- | --- | --- |
| UI 框架 | React Native 0.81.5（TSX / React Component / Yoga 布局） | Jetpack Compose（Kotlin `@Composable` / Compose runtime） | ❌ |
| 渲染架构 | **Paper 老架构**（`newArchEnabled=false`），RN View → Android View | Compose `Canvas` / `GraphicsLayer` / `RenderEffect` / `CompositingStrategy.Offscreen` | ❌ 不共享视图树 |
| 模糊实现 | `expo-blur ~15.0.8`（`BlurView`；Android 侧 FollowedRoomsScreen 用 `experimentalBlurMethod="dimezisBlurView"`） | 自绘：`BlurEffect` + 背板重画 + 三通道色散 + 边缘光 | ❌ 算法不可直接调用 |
| 组件模型 | `ViewManager`（`SimpleViewManager<LiveExoView>`）/ `requireNativeComponent` | `Composable` + `CompositionLocalProvider` | ❌ 需桥接层 |
| 语言 | TypeScript 5.9 | Kotlin 2.0.20 | ❌ |
| 构建 | Expo prebuild / Gradle **Groovy** / RN Gradle Plugin / autolinking / node_modules | Gradle **Kotlin DSL** / AGP 8.7.3 / `kotlin-compose` 插件 / Compose BOM / AAR | ❌ 需合并两套构建 |
| 依赖形态 | npm + RN native modules | Maven / JitPack AAR | ❌ |
| 主题 | `usePalette()`（zustand + RN `useColorScheme`） | `MaterialTheme.colorScheme.surface` | ❌ 需自建 MaterialTheme |

**结论**：Compose 的 `@Composable` 无法作为 RN 组件直接渲染；Kotlin 源码无法进 Metro JS bundle；两者没有共享的布局/绘制/手势/生命周期。因此 **「直接可用」的引擎 Composable / 能力 = 0**。可以「直接复用」的只有**设计思想、参数数值、性能经验与限制说明**（这些是纯知识，非代码）。

### 7.2 可选落地路径（4 条）

| 路径 | 做法 | 前置条件 | 优点 | 代价/风险 |
| --- | --- | --- | --- | --- |
| **A. RN 侧等效实现** | 用已装的 `expo-blur` + `expo-linear-gradient` + 多层 View 近似（膜层 / 高光 / 边缘光 / 触摸反馈），玻璃只给浮层白名单；新建 `src/theme/glass.ts` 单一来源 | 0 原生改动、0 新依赖 | 复用现有资产、符合老架构、不触碰历史禁止项、可加可访问性降级 | 无真折射/色散/lensing，视觉需靠设计补偿；`expo-blur` 在 Android 的行为需真机验证 |
| **B. RN 原生 UI 组件桥接** | 把 `LiquidGlassSurface` 包进 `AbstractComposeView`/`ComposeView`，写 `SimpleViewManager<...>`（照 `LiveExoViewManager.java` 模式），RN 侧 `requireNativeComponent` + `@ReactProp` 下发参数 | 引入 Compose BOM + `buildFeatures compose=true` + `kotlin-compose` 插件 + JitPack/源码依赖；改 `android/` | 能在 RN 树里用真折射/色散；有 Paper ViewManager 先例 | 与 `DESIGN_SYSTEM.md:71-72` 冲突；Kotlin/AGP 版本需与 Expo 54 对齐（当前**未找到显式版本**）；RN↔Compose 生命周期、测量、触摸、背板图传递复杂；引擎静态背板与弹层退化限制仍在 |
| **C. 混合 Activity / 全局 Compose 覆盖层** | 在 `MainActivity` 上叠 `ComposeView` 做全局玻璃浮层，或新建独立 Compose Activity（App 已有 `LivePlayerActivity extends Activity` 先例，`AndroidManifest.xml:25`） | 同 B + Activity/Window 层级改造 | 可做全局统一玻璃层 | 与 RN 导航 / `Modal`（独立 window）/ 触摸 z-order 打架；`MainActivity.kt:29-122` 还有 PiP 与媒体会话复杂生命周期；`edgeToEdgeEnabled=true` 加剧层级问题 |
| **D. 整体 UI 迁 Compose** | 30 个页面 + 播放器 + 全部业务逻辑用 Kotlin 重写 | 放弃 RN | 与引擎天然一致 | 工作量等同重写整个 App，且丢失 RN 生态与既有业务（WASM 签名、Exo、PiP、i18n…）；**不现实** |

### 7.3 逐能力复用性判定表（每行 = 一个引擎示例组件 / 能力）

| # | 引擎示例 / 能力 | 能否直接在当前 RN App 使用 | 原因（带证据） | 可行落地路径 |
| --- | --- | --- | --- | --- |
| 1 | `LiquidGlassSurface`（玻璃本体） | **不可用 · 需原生桥接** | `@Composable` + Compose runtime，`LiquidGlass.kt`；App 无 Compose 依赖/构建特性（`android/app/build.gradle:204-241`） | B（ComposeView + ViewManager）；A 只能近似 |
| 2 | `GlassBackdrop` + `LocalBackdrop` | **不可用 · 需迁移** | 背板是 Compose `ImageBitmap` + `positionInRoot()` 坐标（`GlassBackdrop.kt:44-90`）；App 背板是 RN `ImageBackground`（`App.tsx:701-709`）与 transparent 场景（`navigation/index.tsx:185`），坐标体系不同 | A：RN 侧维护单一背板源；C：Compose 层自管背板 |
| 3 | `rememberBackdropImage(File)` | **不可用 · 需迁移** | Kotlin `File` + `BitmapFactory.decodeFile`（`GlassBackdrop.kt:98-104`） | A：`expo-file-system` / `expo-image` + RN 侧缓存；B：通过 `@ReactProp` 把文件路径传给原生 |
| 4 | **`GlassParams` + `LocalGlassParams`（六参数一次下发全树）** | **需迁移 · 概念可直接复用（★推荐）** | Kotlin `data class` + `staticCompositionLocalOf`（`LiquidGlass.kt`、`README.md:84-92`） | **A：新建 `src/theme/glass.ts`，用 TS 类型 + React Context 复刻「单一来源」，数值照抄 §6.3** |
| 5 | **`GlassDefaults`（默认值 + 推荐区间 + COMPACT 档）** | **需迁移 · 数值可直接复用（★推荐）** | 纯常量（`GlassDefaults.kt`） | **A：照抄为 TS 常量，作为滑块范围、默认与小控件档** |
| 6 | `RefractMode.SCALE / FIELD` | **不可用 · 需原生桥接/迁移** | `FIELD` 是 `Shape.createOutline` 逐层内缩 + 3–6 次带裁剪绘制（`RefractMode.kt`、`LiquidGlass.kt`） | A 只能近似；真效果需 B/C |
| 7 | `Backdrop` / `LocalBackdrop` 契约 | **需迁移 · 契约思想可复用** | 「自己实现背板就实现它」（`README.md:106-120`） | A：RN 侧的 `BackdropSource` 接口（图片 / 纯色 / 亮度采样） |
| 8 | 示例：大玻璃卡片（120dp） | **不可用 · 需原生桥接** | 同 #1；且 `README.md:238-239` 明确「一页 5 张卡片全玻璃 → 明显掉帧」 | 本项目**不应**用于内容卡（`SPEC` D1）；仅 B/C 且限浮层 |
| 9 | 示例：`DraggableProbe`（可拖动玻璃） | **不可用 · 需原生桥接** | `pointerInput` + `detectDragGestures`（`MainActivity.kt:183-191`）是 Compose 手势 | A：`PanResponder` / `Animated` 重写拖动（App 已有 `MiniPlayer.tsx:346` 拖动层先例），材质仍需 #1 |
| 10 | 示例：玻璃按钮（`COMPACT_BLUR`） | **不可用 · 需原生桥接** | 同 #1，但演示了「小控件收窄参数」的正确做法 | **A：把规则直接用于 `Pill`/主行动按钮**；真玻璃需 B |
| 11 | 示例：折射 Slider / legacy Switch（实验台） | **直接可用（概念）· 可复刻为设置页 UI** | 只是 Material3 `Slider`/`Switch`（`MainActivity.kt:137-152`），RN 有等价控件 | **A：用 RN `Slider`/`Switch` + `GlassParams` Context 复刻「玻璃实验台」调试页** |
| 12 | 示例：`createBackdrop()`（代码画渐变背板） | **需迁移** | Android `Canvas` / `LinearGradient`（`MainActivity.kt:199-226`） | **A：App 已装 `expo-linear-gradient`（`PlayerChrome.tsx:3`），可直接用渐变 + 绝对定位圆块复刻** |
| 13 | blur / tint / refraction / dispersion / highlight / edge light（具体算法） | **不可用 · 需原生桥接或重写** | `BlurEffect`、`ColorMatrix`、`ColorFilter.tint`、`Path.op`、`BlendMode.Plus`、`drawOutline`（`LiquidGlass.kt`）全是 Compose/Android graphics API | B/C 复用 Kotlin 算法；A 用多层 View + 渐变近似（效果不等价） |
| 14 | 边缘光三层渐变 / 内缘亮带 / 顶部 12dp 白雾 | **需迁移 · 视觉规范可复用** | 绘制配方在 `LiquidGlass.kt`（`GLASS_TOP_SHEEN` / `GLASS_RIM_TOP/BOTTOM`） | **A：用多层 `View` + `LinearGradient` 近似，几何参数从 `glass.ts` 取** |
| 15 | 色散（chromatic aberration） | **不可用 · 需原生桥接** | 三通道 `ColorFilter` + 加性叠加 + 精确相邻环 | B/C；RN 侧无等价（`expo-blur` 只做模糊） |
| 16 | `legacyBackdrop`（0.5.1 错位开关） | **不可用 · 且不建议** | `README.md:154-181` 明确是错误对齐、滚动会脱节 | 不落地；仅作为「不要复刻错误写法」的反面经验 |
| 17 | **API 31+ 真模糊 / <31 降级策略** | **直接可用（策略）· ★推荐** | `LiquidGlass.kt` 按 `Build.VERSION.SDK_INT >= S` 分支；`README.md:13,264,272` | **A：用 `Platform.Version >= 31` 在 `glass.ts` 里做 `canBlur` 分支，低版本切高不透明实色**（与 `SPEC` Reduce Transparency 降级共用一条路径） |
| 18 | **性能预算（同屏 1–3 块、面数×绘制次数）** | **直接可用（规范）· ★推荐** | `README.md:224-240` | **写入设计约束**：单屏 ≤3 个玻璃容器（`SPEC` 4.4 建议 ≤3 容器 / ≤6 元素，直播页 ≤3） |
| 19 | **弹层 window 退化说明** | **直接可用（约束）· ★关键** | `README.md:262` | **规定 RN `Modal` / sheet 内不使用真模糊，只用不透明或高不透明度膜层 + 边缘光**；避免不同 ROM 退化不一致 |
| 20 | **静态背板限制** | **直接可用（约束）· ★关键** | `README.md:118-120,271` | **决定「玻璃只用于浮层、不模糊滚动列表」**，与 `SPEC` D1 / 5.2 第 4 条同向 |
| 21 | 背板遮罩 / 文字可读性经验 | **直接可用（规范）** | `GlassBackdrop.kt:32-38`、`GlassDefaults.SCRIM=0.55` | 在 `glass.ts` 定义 `scrim`，与 `SPEC` M7 dimming 0.35 分别管理（一个是背板遮罩、一个是玻璃后 dimming） |
| 22 | JitPack 坐标 / 源码引入方式 | **不可用 · 需原生桥接前置** | `README.md:24-53`；App `android/build.gradle:21` **已配 jitpack 仓库**（有利），但 `app/build.gradle` 无 Compose 构建特性 | B/C 前置步骤；A 不需要 |
| 23 | 上游 HealthCheckIn 同步表 | **直接可用（维护约束）** | `README.md:296-318` | 若走 B/C，需明确「fork 后双份代码同步」的维护责任 |

### 7.4 推荐路径与理由

> **推荐：路径 A（RN 侧 expo-blur + 自定义渲染等效实现）为主；本轮不引入 Compose 原生引擎。把玻璃严格限定在「功能层浮层白名单」。**

理由（逐条可回溯）：

1. **用户与本轮约束**：本轮「只出文字方案、不改代码」；`DESIGN_SYSTEM.md:71-72` 明令「禁止新增 npm 依赖、改 android/ 原生、改 store/api、动播放器覆盖层」。路径 A **0 原生改动、0 新依赖**，是唯一不破坏既有规约的方案。
2. **引擎与 App 场景天然错配**：引擎两大硬限制是「背板必须静态」（`README.md:271`）与「弹层独立 window 退化」（L262）；而本 App 的核心界面恰好是**全屏滚动列表**（30 页几乎都有 FlatList/ScrollView，见 §3.2）与**大量 RN `Modal`**（MediaScreen 送礼/贡献榜/日历、CommunityScreen 发帖 sheet、ZoomImageModal、DanmakuSettingsSheet、FullScreenPlayer、App.tsx 公告）。→ 即使付出桥接成本，引擎在**最需要玻璃的弹层**上也只会退化成膜层，收益远小于成本。
3. **现有资产可直接复用**：`expo-blur ~15.0.8` 已装且已有 2 处生产使用（`AppTabBar`、`FollowedRoomsScreen` 工具条），`expo-linear-gradient` 已装（`PlayerChrome.tsx:3`），`MiniPlayer.tsx` 已有悬浮窗 + 拖动 + elevation 盖过 SurfaceView 的经验。路径 A 是「收敛与统一」，不是「从零造轮子」。
4. **性能与降级可控**：引擎每块每帧一次离屏 `RenderEffect`（`README.md:234`），本 App 还有直播视频解码 + 4Hz 弹幕 spawn（`DanmakuOverlay.tsx:9-10`）+ 全局 `MiniPlayer` SurfaceView + 页面入场动画（`navigation/index.tsx:63-99`）。路径 A 可用 `Platform.Version >= 31` + 用户开关 + 低端机白名单做降级，符合 `SPEC` 5.1/5.2。
5. **架构现状**：`newArchEnabled=false`（Paper）。路径 B 若走 Fabric 需先开新架构（`android/gradle.properties:33-38`），会牵动全部老架构 ViewManager；走 Paper ViewManager 虽可行（有 `LiveExoViewManager.java` 先例），但仍需合并两套 Kotlin/Compose 构建，且 App 的 Kotlin/AGP 版本**未显式声明**（由 Expo 注入），Compose compiler 与 Kotlin 版本强绑定 → 编译期冲突风险高。
6. **不推荐 C**：`MainActivity.kt:29-122` 承载 PiP / 媒体会话 / ColorOS 兼容逻辑，`AndroidManifest.xml:37` 启用 edge-to-edge 与 PiP；在其上叠全局 Compose 层会与 RN 导航、`Modal` window、触摸 z-order 冲突。`LivePlayerActivity` 是纯 View Activity（`setContentView(root)`），改成 Compose 需重写。
7. **不推荐 D**：等同重写 App，丢弃 WASM 签名（`src/auth/`）、Exo/media3 播放、PiP、i18n、30 页业务。

**Phase 2 触发条件**（若未来 insist 要真折射/色散）：用户明确解禁「改 `android/` + 新增依赖」→ 再走 B，并按 §7.5 执行。

### 7.5 若必须引入引擎的最小可行步骤（Phase 2 · 路径 B，仅供备案）

| 步 | 动作 | 风险 / 待核实 |
| --- | --- | --- |
| 1 | `android/app/build.gradle`：`buildFeatures { compose = true }`、加 `org.jetbrains.kotlin.plugin.compose`（与 Kotlin 版本严格对齐）、`implementation(platform("androidx.compose:compose-bom:2024.09.00"))` + ui/foundation/material3；或 `implementation("com.github.shufajiaok.LiquidGlass:liquidglass:0.1.3")`（仓库源 `android/build.gradle:21` 已有） | App 的 Kotlin / AGP / compileSdk 由 Expo 54 注入，**未找到显式值**；Compose compiler 2.0.20 需 Kotlin 2.0.20 精确匹配 |
| 2 | 新建 `LiquidGlassView : AbstractComposeView`（或 `FrameLayout` + `ComposeView`），`setContent { MaterialTheme { CompositionLocalProvider(LocalGlassParams provides ...) { GlassBackdrop(...) { LiquidGlassSurface(...) } } } }` | 膜层色依赖 `MaterialTheme.colorScheme.surface`（`README.md:274`），必须自建 MaterialTheme |
| 3 | 新建 `LiquidGlassViewManager extends SimpleViewManager<LiquidGlassView>`，`@ReactProp` 下发 transparency/refractDp/dispersion/blurRadius/edgeWidth/shape 等；注册进 `LivePlayerPackage.java` 或新 `ReactPackage` | 照 `LiveExoViewManager.java:13` 模式；Paper 架构下 props 更新走 `updateExtraData` / `receiveCommand` |
| 4 | 背板：`@ReactProp` 传背景图文件路径 → `rememberBackdropImage(File)`；或 Compose 层自绘静态背板 | RN 的 `ImageBackground` 在 JS 层，Compose 侧拿不到；静态背板限制（`README.md:271`） |
| 5 | RN 侧 `requireNativeComponent('LiquidGlassView')` + TS 封装，参数由 `glass.ts` 的 `GlassParams` 映射 | 与 §8.4 单一来源共用同一份数值 |
| 6 | 明确禁用场景：所有 RN `Modal`/sheet 内不用（window 退化）；滚动列表下不用（静态背板）；同屏 ≤3 块 | `README.md:238-240,262,271` |
| 7 | 真机回归：API 31+ / API 26-30 降级 / 三星中端机帧率 / 与 `MiniPlayer` SurfaceView 的 z-order | §9 风险 |

---

## 8. 重构影响面

> 以下为**估算**，依据 §1–§5 的文件清单与 Grep 统计（30 screens / 25 components / 9 theme / 12 player / 3 navigation），非精确改动集；实际以逐文件走查为准。

### 8.1 分类清单

#### 【必须改】设计系统单一来源 + 玻璃只用于浮层 + 控件/卡片底板不透明（约 55–60 个源码文件 + 6 份文档）

> 注意：「内容层不透明」指**控件/卡片自身的底板**不透明（C1b）；**承载全屏背景的容器透明按 M9 保留**（C1a），不在本清单的删除/替换范围内。

| 分组 | 文件路径 | 数量 | 改动要点 |
| --- | --- | --- | --- |
| **新增 token 单一来源** | **`src/theme/glass.ts`（新建）** | 1 | `GLASS_DEFAULTS` / `GlassParams` / `GlassProvider` / `useGlassParams()` / `resolveGlass(kind)` / `canBlur` / `degrade()` / `GlassSurface` 白名单判定 |
| 主题出口 | `src/theme/index.ts` | 1 | 导出 glass |
| 色板 | `src/theme/colors.ts` | 1 | 清理 `surfaceGlass*` 误导命名；**保留 `usePageBackground()` 的 transparent 分支**（L98-102，服务于 M9 背景 bleed，不属违规）；补 4 套色 token（light/dark/inc-contrast ×2） |
| 另一套色/配置 | `src/theme/ui.ts` | 1 | 删除 `card`/`cardOnImage` 半透明值（L8-9）；`tabBar` 配置并入 glass.ts |
| 死代码 | `src/navigation/tabBarStyle.ts` | 1 | 删除或改为从 glass.ts 取值（`mainTabBarStyle()` 全 src 仅定义处 1 命中） |
| 圆角/字号/间距 token | `src/theme/radii.ts` / `typography.ts` / `spacing.ts` | 3 | 新增 hero 字号档、同心几何函数、功能层容器 spacing |
| **玻璃/浮层组件** | `src/components/GlassCard.tsx` | 1 | 拆为「内容层实色卡」与「浮层 GlassSurface」；去掉伪玻璃命名与半透明底 |
| 玻璃/浮层组件 | `src/components/AppTabBar.tsx` | 1 | 大悬浮化（更大圆角、离边留白）、参数取 glass.ts、4 层平铺合并为单一 GlassSurface、对比度达标 |
| 玻璃/浮层组件 | `src/components/ScreenHeader.tsx` | 1 | 悬浮化 + 英雄文字 + 返回键胶囊同心圆角；`overlay` 分支统一走 glass.ts |
| 玻璃/浮层组件 | `src/components/AppToast.tsx` / `MiniPlayerBar.tsx` / `Pill.tsx` / `Skeleton.tsx` / `Button.tsx` / `HeaderAction.tsx` / `LoginPrompt.tsx` / `CommunityPostCard.tsx` / `StateViews.tsx` | 9 | 统一 token、去内联 rgba、去伪玻璃语义 |
| 浮层容器 | `src/components/DanmakuSettingsSheet.tsx` / `FullScreenPlayer.tsx` / `ZoomImageModal.tsx` / `MiniPlayer.tsx` / `MemberPicker.tsx` / `RuntimeLogViewer.tsx` | 6 | sheet/Modal 统一 `regular` + 高不透明膜层（因弹层 window 退化，不用真模糊）；一次只 1 个 sheet |
| 内容层（**禁止玻璃**） | `src/components/DanmakuOverlay.tsx` | 1 | **保持不变**（现状已合规），仅补注释/规则防后续误加 blur |
| 根组件 | `App.tsx` | 1 | **保留**根容器 transparent（L641）与 `ImageBackground` 之上的 0.88/0.92 整体压暗遮罩（L709）——二者服务于 M9 背景 bleed 与内容层可读性，属 C1a 合规项；仅把 0.88/0.92 两套随意值**归一到 `glass.ts` 的单一语义 token**；公告 Modal 卡片（L652-691, `anStyles` L725-735）改实色或浮层玻璃 |
| 导航 | `src/navigation/index.tsx` | 1 | **保留** `sceneStyle transparent`(L185)、`themed` 的 transparent colors(L266-267)、`cardStyle transparent`(L303) —— 均为 M9 背景 bleed 必需（C1a）；`bgScrim`(L270) 与 `App.tsx` 0.88/0.92 **归一到 `glass.ts` 单一内容层可读性遮罩 token**；**移除 `tabBarHidden` 隐藏逻辑**（L141,178）或改为仅模态覆盖时隐藏（M14/M15/D8、[SH] 模态覆盖例外） |
| 玩家控制层 | `src/player/PlayerScreen.tsx` / `chrome/PlayerChrome.tsx` / `chrome/FullscreenManager.tsx` | 3 | 控制条按 `clear` + `#000@0.35` dimming 单一参数；`expo-linear-gradient` 遮罩收敛；`CONTROLS_HIDE_MS` 与沉浸策略对齐 `SPEC` M32/D21 |
| **页面（30）** | `src/screens/*.tsx` 全部 30 个 | 30 | **按 C1a/C1b 口径逐处判定**内联 rgba（MediaScreen 26 / FollowedRoomsScreen 25 / VideoLibrary 7 / RoomAlbum 7 / BilibiliLive 5 / Home 5 等）：属控件/卡片底板者替换为不透明实色，属背景遮罩/浮层者**保留并归一到 `glass.ts`**，不得按字面一刀切删除；硬编码 `borderRadius:数字`（约 240+ 处，FollowedRoomsScreen 43 最多）改同心几何、英雄文字每屏 1 处、实色内容卡、浮层白名单化 |
| 文档 | `DESIGN_SYSTEM.md` / `DESIGN_UI_2026-08-15.md` / `UI_LAYOUT_PLAN_v2.md` / `UI_OVERHAUL_2026-08-16.md` / `UI_AUDIT_2.7.1.md` / `AUDIT_SCREENS.md` | 6 | 合并/标记 deprecated，只保留一份 Liquid Glass 版规范作为**单一事实来源**；修正 26/27/30 页与数值漂移 |

**优先级建议**：先 `glass.ts` + theme + `App.tsx`/`navigation`（全局容器），再 `AppTabBar`/`ScreenHeader`/`GlassCard`（复用面最广），再浮层组件，最后按 rgba/圆角命中数排序分批改 30 个 screens（MediaScreen、FollowedRoomsScreen、HomeScreen、PrivateMessagesScreen、AnalysisScreen 优先）。

#### 【建议改】（约 8 个）

> **分级差异待主理人裁决**：PM 复核意见认为下表中的 `src/hooks/useSafeAreaInsets.ts`（换真实 insets，违反 `SPEC` M22）与可访问性降级四项（Reduce Transparency / Increase Contrast / Reduce Motion / Dim Flashing Lights，当前 0 命中）应列为 **P0 新建**，而非「建议改」。本报告按「是否改变既有视觉结构」归入建议改，但结论（必须新建、非改造）与 PM 一致；请以主理人最终分级为准。

| 文件 | 原因 |
| --- | --- |
| `src/hooks/useSafeAreaInsets.ts` | 纯 JS 经验值（L27-36）→ 真实 insets；涉及挖孔/系统栏/大悬浮 UI 避让 |
| `src/hooks/useAppTheme.ts` | 增 `useReduceTransparency` / `useReduceMotion` 等系统设置订阅（当前 0 覆盖） |
| `src/theme/motion.ts` | 弹簧曲线对齐 `SPEC` 4.5（80–150ms 按压、200–300ms 出现、Reduce Motion 降级） |
| `src/components/Motion.tsx` / `Loaders.tsx` | 入场动画与降级路径 |
| `src/screens/FollowedRoomsScreen.tsx` | `experimentalBlurMethod="dimezisBlurView"`（L2364）收敛到统一 GlassSurface，避免多套模糊实现 |
| `src/player/core/*.tsx` | 仅当控制层玻璃化影响视频 z-order 时联动（详见 §9.3） |
| `src/store/index.ts`（或新增 `src/store/a11y.ts`） | 「减少透明效果」用户开关持久化（zustand 已有） |
| `index.ts` / `app.json` / `android/gradle.properties` | **仅当** Phase 2 开新架构才动；本轮推荐路径 A 不动 |

#### 【不动】

- **全部业务逻辑层**：`src/api/*`、`src/auth/*`（WASM 签名）、`src/services/*`、`src/utils/*`、`src/types/*`、`src/i18n/*`、`src/constants/*`、`src/store/*`（除新增 a11y 开关）、`src/native/*`。
- **播放器内核**：`src/player/core/PlayerCore.tsx` / `ExoKernel.tsx` / `NativeKernel.tsx` / `WebKernel.tsx`、`src/player/resolve/*`、`src/player/store/*`（流解析与内核选择不动）。
- **`android/` 全部**（推荐路径 A 下）：`MainActivity.kt`、`LiveExoView*`、`LivePlayerActivity.java`、各 Module/Package/Service、`AndroidManifest.xml`、gradle 配置、`res/*`。
- `package.json` / `app.json`（不新增依赖、不改 newArchEnabled）、`package-lock.json`、`metro.config.js`、`tsconfig.json`。
- **导航路由结构**：30 页路由名与 params（`src/navigation/types.ts`）保持向后兼容，只改视觉与容器。
- `__tests__/`、`scripts/`、`assets/`、`2.wasm`、`_r2.png`。

### 8.2 数量估算汇总

| 类别 | 文件数 |
| --- | --- |
| 新增 | 1（`src/theme/glass.ts`）+ 可能 1（`src/store/a11y.ts`） |
| 必须改 · 主题/导航/根 | 约 9 |
| 必须改 · 组件 | 约 19 |
| 必须改 · 播放器外壳/控制层 | 3 |
| 必须改 · 页面 | 30 |
| 必须改 · 文档 | 6 |
| 建议改 | 约 8 |
| 不动 | 约 90+（`src` 共约 140 文件，含 api/utils/store/player core 等） |
| **合计需触碰** | **约 60 个源码文件 + 6 份文档**（其中 30 个是 screens） |

### 8.3 如何做到「玻璃只用于浮层、控件/卡片自身底板完全不透明」

> 口径修订（经主理人裁决）：「内容层完全不透明」= **控件/卡片自身的底板**不透明；**承载内容的全屏背景容器透明按 M9 必须保留**。不按 transparent / rgba 字面判定，而按透明对象的角色判定。

1. **定义层语义**：在 `glass.ts` 里定 `type GlassLayer = 'floating' | 'content'`；`GlassSurface` 组件在 `layer==='content'` 时**直接抛错/降级为实色**（开发期断言），从机制上禁止内容层玻璃。注意该断言只约束「控件/卡片底板」，**不约束承载背景的容器**。
2. **按透明对象的角色分类处理（修订，取代原「收回所有 transparent」）**：
   - ✅ **保留**：`App.tsx:641` 根容器 transparent、`navigation/index.tsx:185` `sceneStyle` / `:266-267` navTheme / `:303` `cardStyle` transparent、`colors.ts:98-102` `usePageBackground() → transparent` —— 这些是**承载全屏背景的容器**，是 HIG Layout **M9**「背景延伸到 sidebar / toolbar / tab bar 下方」在 RN 里的必需手段，也是 scroll edge effect（**M8/M10**）的前提；删除反而违规并破坏背景 bleed。
   - ✅ **保留并归一**：`App.tsx:701-709` `ImageBackground` 之上的 0.88/0.92 整体压暗遮罩、`navigation/index.tsx:270` `bgScrim 0.34` —— 属内容层可读性处理（[LV] content footer darkening / [M] clear 背后 dimming），把三套随意值收敛为 `glass.ts` 的**单一语义 token**（`contentScrim`；clear+亮底的 `dimming=0.35` 另立一个 token，两者语义不同）。
   - 🚫 **替换**：`ui.ts:8-9` `card`/`cardOnImage`/`borderOnImage` 半透明、内容层 `GlassCard` 用法 —— 属**控件/卡片自身底板**，改为不透明 `palette.surface` + 圆角 + 分层阴影（或 standard material 近似）。
3. **玻璃浮层白名单**（对应 `SPEC` 6.1/6.3/6.6/6.10）：`AppTabBar`、`AppToast`、`MiniPlayer` / `MiniPlayerBar`、`PlayerChrome` 悬浮控制条、`DanmakuSettingsSheet`、各 `Modal` sheet（`regular` 变体）、`ScreenHeader` 返回键胶囊、主行动「上麦」悬浮按钮、`ZoomImageModal` 工具条。**白名单外一律实色 + 圆角 + 分层阴影**。
4. **内容层黑名单**（对应 `SPEC` D1 一号红线）：弹幕（`DanmakuOverlay`）、聊天气泡（`FollowedRoomsScreen` / `PrivateMessagesScreen`）、榜单行（`MeleeRankScreen` / MediaScreen 贡献榜）、房间卡 / 直播封面卡、礼物卡、麦位头像列表、`CommunityPostCard`、`Skeleton`、`StateViews` —— **禁止任何 backdrop blur 与半透明玻璃**。
5. **弹层特例**：RN `Modal` 是独立 window（引擎 `README.md:262` 已证会退化），统一规定「Modal / sheet 内不用真模糊，用 `regular` = 高不透明度膜层（建议 `opacity ≥ 0.9`）+ 边缘光 + 同心圆角」；同时满足 `SPEC` 5.1 Reduce Transparency 降级。
6. **视频层**：`SurfaceView`（`LiveExoView` / `<Video>`）内容取不到 backdrop 采样，玻璃控制条**不做 backdrop blur**，用渐变遮罩 + 0.35 dimming + 边缘高光近似（`clear` 语义）；弹幕保持透明无底板（`DanmakuOverlay.tsx:150-176` 现状即如此）。
7. **同屏计数（口径经 PM 复核：浮层数 ≠ 玻璃容器数）**：`glass.ts` 提供 `useGlassBudget()`，运行时统计挂载的 `GlassSurface` 数，超 `≤3 容器 / ≤6 元素`（直播页 ≤3）时自动降级为实色，满足 `SPEC` 4.4 / 5.2。**只计「真玻璃容器」**：弹幕（`DanmakuOverlay` 纯白字 + textShadow，无 blur 无底板）、`AppToast`（不带玻璃）**不计入**；Sheet/Modal 属模态，按 [SH]「一次只 1 个」+ [TB]「模态覆盖 tab bar 例外」处理。**直播页玻璃容器白名单固定为 3 个**：`AppTabBar` / `PlayerChrome` 悬浮底坞 / 全局 `MiniPlayer`；Sheet 打开时把 TabBar 收起或降级为实色，避免瞬间叠到 4 个。
8. **CI 守卫**：在 `scripts/` 加静态检查（Grep 规则）禁止在 `src/screens/` 新增「**控件/卡片自身底板**的 `rgba(...)`」/ `BlurView` / `borderRadius: 数字`；**规则须带角色白名单**（`contentScrim` / 背景遮罩 / 浮层玻璃参数允许），避免把 M9 背景 bleed 相关的透明容器误判为违规。本轮已用同类 Grep 得到基线（screens 约 240+ 处硬编码圆角、20 个页面含 rgba）。

### 8.4 如何做到「全局玻璃参数单一来源」

新建 `src/theme/glass.ts`，把**引擎的六参数设计原样搬成 TS 单一来源**（数值照抄 §6.3，作为未来接原生引擎的契约）：

```
GLASS_DEFAULTS = {
  transparency: 0.38,  range: [0.05, 0.70],   // 压正文不超过 0.5
  refractDp: 5.0,      range: [0, 12],
  refractMode: 'SCALE' | 'FIELD',            // A 路径下仅作语义占位，默认 SCALE 等效
  edgeWidthDp: 2.0,    range: [0.6, 10],
  edgeGlow: 1.0,       range: [0.4, 2.5],
  dispersion: 0.35,    range: [0, 1],
  scrim: 0.55,         range: [0, 0.95],     // 背板遮罩（引擎 GlassDefaults.SCRIM）
  dimming: 0.35,                             // clear + 亮底（SPEC M7）—— 玻璃背后的 dimming
  contentScrim: /* 归一值 */,                // 内容层可读性遮罩：收敛 App.tsx 0.88/0.92 与 navigation bgScrim 0.34
                                            // —— 与 dimming 语义不同，勿混用；背景 bleed 容器本身保持 transparent（M9）
  blurRadius: 12, compactBlur: 6, compactEdgeWidth: 1.2,
}
```

配套导出：

- `GlassParams` TS 类型 + `GlassProvider`（React Context，对应 `CompositionLocalProvider`）+ `useGlassParams()`（对应 `LocalGlassParams`）——**全树一次下发**。
- `resolveGlass(kind: 'compact'|'regular'|'large')`：按控件尺寸返回 `blurRadius` / `edgeWidth`（落实「模糊半径必须跟控件尺寸走」，README L137-150）。
- `canBlur = Platform.Version >= 31`（对应 `Build.VERSION.SDK_INT >= S`）；`degrade(reason: 'api'|'reduceTransparency'|'lowEnd'|'budget')` 返回高不透明实色配方（`opacity ≥ 0.9`），**一条降级路径同时服务 API<31、Reduce Transparency、低端机、超预算**。
- `GlassSurface` 统一组件：内部按 `canBlur` 选择 `expo-blur` 或纯膜层，**一个容器**承载模糊 / 膜层 / tint / 顶部高光 / 内缘亮带 / 边缘光（替代 `AppTabBar.tsx:119-158` 的 4 层平铺），并暴露 `layer` 白名单断言。
- **禁止内联（归一而非删除）**：`AppTabBar` 的 `intensity 62/82`、`FollowedRoomsScreen` 的 `70`、`MediaScreen` 的 `rgba(18,18,20,0.92)`、`navigation` 的 `bgScrim 0.34`、`App.tsx` 的 `0.88/0.92`、`tabBarStyle.ts` 的 `0.96/0.94/0.76/0.72` 全部改为从 `useGlassParams()` 取值。**其中 `App.tsx` 0.88/0.92 与 `bgScrim` 属 C1a 合规的背景遮罩 → 保留、只归一到 `contentScrim`；`tabBarStyle.ts` 的整套值是死代码 → 删除**。
- **同心几何**：`glass.ts` 提供 `childRadius(parentRadius, padding)`，配合 `src/theme/radii.ts` 消除 240+ 处硬编码圆角。
- **文档**：把 6 份 UI 文档收敛为一份，写明「所有玻璃数值只能来自 `src/theme/glass.ts`」，并把 `src/navigation/tabBarStyle.ts` 死代码删除。

> 对照引擎：`GlassParams` / `LocalGlassParams` / `GlassDefaults` / `COMPACT_*`（`LG/README.md:84-92,123-151`）就是「单一来源」的现成范式，本方案只是把 CompositionLocal 换成 React Context、把 `Dp` 换成 `number`，概念与数值 1:1 对齐 → 未来 Phase 2 桥接时参数不需要二次设计。

---

## 9. 风险与待确认事项

### 9.1 风险表

| # | 风险 | 证据 | 影响 | 缓解 / 待确认 |
| --- | --- | --- | --- | --- |
| R1 | **三星真机卡顿 / 性能** | 引擎每块每帧 1 次离屏图层 + `RenderEffect`，绘制次数 1 / ≈10 / ≈16（`LG/README.md:224-240`），同屏 1–3 块无感、5 张卡全玻璃明显掉帧；App 侧还有直播解码、弹幕 4Hz spawn（`DanmakuOverlay.tsx:9-10`）、全局 `MiniPlayer` SurfaceView（`MiniPlayer.tsx:225-360`）、`withPageMotion` 入场动画（`navigation/index.tsx:63-99`）、`FadeInView` 列表错峰 | 直播页玻璃 + 视频 + 弹幕三者叠加，中端机可能明显掉帧 | 同屏**真玻璃容器** ≤3（**只计玻璃，不计浮层**：弹幕 `DanmakuOverlay` 无 blur 无底板、`AppToast` 不带玻璃，均不计入；Sheet 属模态按 [SH] 一次只 1 个 + [TB] 模态覆盖例外处理）——直播页白名单固定 `AppTabBar` / `PlayerChrome` 悬浮底坞 / 全局 `MiniPlayer` 共 3 个；禁用 FIELD（用 SCALE 或纯膜层）、低端机/省电模式一键降级、`useGlassBudget()` 运行时限额；`SPEC` 5.2 建议中端机直播页 ≥50fps 实测。**待确认**：目标机型、最低配置、现有帧率基线 |
| R2 | **Android 版本碎片化** | App `minSdk 26`（`android/app/build.gradle:108`、`README.md:48` 兼容 Android 8+/鸿蒙 2/3/4）；引擎真模糊需 **API 31+**（`LG/README.md:13,285`；`LiquidGlass.kt` 判断 `>= S`）；`AppTabBar.tsx:101` 注释「Android 12+ RenderEffect」；`FollowedRoomsScreen.tsx:2364` 用 `experimentalBlurMethod="dimezisBlurView"` | 大量用户只能得到「膜层 + 边缘光」，深浅/不同 ROM 表现不一致 | 降级路径前置（§8.4 `degrade()`）；**待确认**：用户机型分布、是否接受 Android 12 以下无真模糊 |
| R3 | **直播视频层与玻璃叠加** | 视频是 `react-native-video <Video>`（`NativeKernel.tsx:43`）或原生 `LiveExoView extends FrameLayout`（`LiveExoView.java:30`，内含 SurfaceView）；`PlayerChrome.tsx:37-41` 渐变遮罩顶栏 + 悬浮底坞盖在视频上；`MiniPlayer.tsx:346` 需 `elevation` 让 JS 层盖过 SurfaceView 接收触摸；弹幕 `DanmakuOverlay` `zIndex:30`（L150） | SurfaceView 内容无法被 backdrop blur 采样 → 玻璃里可能是黑的/无内容；z-order、触摸穿透、闪烁 | 控制条不做 backdrop blur（渐变 + 0.35 dimming + 边缘高光近似）；弹幕保持透明；**待确认**：控制条是否要玻璃化、SurfaceView vs TextureView 是否可切换 |
| R4 | **动态岛 / 安全区** | `src/hooks/useSafeAreaInsets.ts:27-36` 是**纯 JS 经验值**（Android top 24 / bottom 48，iOS 44/34），L5-8 注释自承「为降低重构风险，采用 StatusBar + Platform 经验值」；`package.json:17-23` 排除 `react-native-safe-area-context` 原生包；`App.tsx:42-49` `SafeAreaBridge` 只提供 JS 上下文；**`edgeToEdgeEnabled=true`**（`app.json:20`、`gradle.properties:47,70`）内容绘制到系统栏后 | 「大悬浮 UI」按经验值定位，在挖孔屏 / 折叠屏 / 横屏 / 不同 ROM 会偏移或被遮挡；`SPEC` M22 要求尊重 safe area | **待确认**：是否允许重新接入 `react-native-safe-area-context` 原生 Provider（会触碰 autolinking 与 native，与 `DESIGN_SYSTEM.md:71-72` 冲突）；本轮至少把经验值集中到单一来源并加 `max(insets.top, X)` 兜底（AppToast.tsx:54 已有此模式） |
| R4b | **iOS / 动态岛适用性** | 仓库**无 `ios/` 目录**、`package.json` 无 ios 脚本、`app.json` 无 ios 段、`README.md:11` platform Android | 严格来说「动态岛」是 iOS 概念，当前项目是 Android 单端 | **待确认**：是否计划扩展 iOS；若无，风险应表述为「Android 挖孔/状态栏/系统栏避让」 |
| R5 | **可访问性降级 0 覆盖** | 全 src Grep `reduceMotion` / `AccessibilityInfo` / `isReduceMotionEnabled` / `DynamicType` / `accessibilityIgnoresInvertColors` **0 命中**；`colors.ts` 仅 light/dark 2 套（`SPEC` M18 要求 4 套）；`labelTertiary #9A9AA1` 对比度存疑；`UI_AUDIT_2.7.1.md:60` 自承深色主题对比度待回归 | 违反 `SPEC` M19/M20/M22/M35、D20；Reduce Transparency / Increase Contrast / Reduce Motion / Dim Flashing Lights 四条降级全缺 | 新建 `useA11y` + 4 套色 token + App 内「减少透明效果」开关；**待确认**：`opacity ≥ 0.9`（SPEC 5.1 建议值）是否拍板 |
| R6 | **历史规约 / 治理冲突** | `DESIGN_SYSTEM.md:71-72`「禁止新增 npm 依赖、改 android/ 原生、改 store/api、动播放器覆盖层」；`README.md:48` 兼容鸿蒙；`newArchEnabled=false`（`app.json:9`、`gradle.properties:38`） | 路径 B/C（原生桥接）与本轮任何原生改动都必须先解禁；开新架构会牵动全部老架构 ViewManager | **待确认（阻塞级）**：用户是否允许改 `android/` / 加依赖 / 加 Expo config plugin；本轮推荐 A 不需解禁 |
| R7 | **设计文档漂移 / 无单一事实来源** | §5.3 表：色值、圆角、字号、页面数（26/27/30）、TabBar 三套配置、死代码 `tabBarStyle.ts`、已删组件 `AppScaffold/ListItem/SectionHeader/EmptyState` 仍被文档引用 | 工程师按文档实现会与代码冲突 | **待确认**：以哪份为基准；建议合并为一份并标记其余 deprecated |
| R8 | **引擎维护与构建冲突（仅 Phase 2）** | 引擎 Kotlin 2.0.20 / Compose BOM 2024.09.00 / AGP 8.7.3 / Gradle 8.9 / compileSdk 35（`LG/README.md:276-285`）；App 的 Kotlin/AGP/compileSdk **未找到显式值**（由 Expo 注入）；Compose compiler 与 Kotlin 强绑定；JitPack 首次需云端现编（`README.md:38-40`）；库与上游 HealthCheckIn 是两份代码需手动同步（L296-318） | 编译期版本冲突、CI 不稳定、长期维护成本 | 走 B 前必须实测 `assembleDebug`；**待确认**：是否接受维护 fork / 是否用源码 include 代替 JitPack |
| R9 | **引擎与本项目场景错配（仅 Phase 2）** | 静态背板（`README.md:271`）、弹层 window 退化（L262）、`MaterialTheme` 依赖（L274）vs 本 App 全屏滚动列表 + 大量 RN `Modal` + RN `usePalette` | 即使桥接成功，弹层也没真玻璃，收益低 | 已在 §7.4 作为不推荐 B 的核心理由；**待确认**：用户是否接受「弹层只有膜层」 |
| R10 | **多语言 / 窄屏 / 大字溢出** | `UI_AUDIT_2.7.1.md:11` 已做文字收缩/截断/最小宽度；i18n 有 en/ja/ko/zh-Hant（`src/i18n/`）；英雄文字 31–41sp（`SPEC` 4.1）+ 大圆角悬浮 UI 在小屏会挤 | 新增英雄文字后窄屏/长文案可能溢出 | `numberOfLines`/`flexShrink`/`minWidth` 约束回归；**待确认**：目标语言清单与最小支持屏宽 |
| R11 | **TabBar 隐藏逻辑违反规范** | `navigation/index.tsx:141` `if (hidden) return null`，`MainTabs` L178 由 `useUiStore.tabBarHidden` 驱动（`SPEC` M14/M15/D8 要求常驻、唯一例外模态覆盖） | 用户迷失位置 | **待确认**：现有 `tabBarHidden` 的使用场景（播放器全屏？），改为模态覆盖时才隐藏 |
| R12 | **弹层叠放 / 沉浸遮挡** | `MediaScreen.tsx:1587,1649` 送礼与贡献榜 Modal、L1505 公告面板 zIndex 29、L1674 弹幕设置 Sheet 可并存；`PlayerChrome.tsx:31` 3.5s 自动隐藏 | 违反 `SPEC` M31/D18（一次只 1 个 sheet）、M32/D21（直播不得长时遮挡） | 统一 sheet 管理器（一次 1 个）；公告改可收起 chip；**待确认**：是否接受收敛交互 |

### 9.2 待确认清单（建议主理人向用户确认，按阻塞程度排序）

1. **【阻塞】是否允许修改 `android/` 原生工程与新增依赖？**（决定是否可能走路径 B/C；本轮推荐 A 不需要）。`DESIGN_SYSTEM.md:71-72` 明令禁止。
2. **【阻塞】本轮是否确认「只做 RN 侧等效实现、不引入 Compose 原生引擎」？** 若用户坚持「必须用自研引擎」，需重新评估 Phase 2 工期与版本冲突（R8/R9）。
3. 目标机型与最低配置、是否有三星真机性能基线（R1）；是否接受「Android 12 以下只有膜层」（R2）。
4. 是否计划扩展 iOS / 是否要接真实安全区（R4/R4b）。
5. 可访问性降级的 `opacity ≥ 0.9` 与 4 套色 token 是否拍板（R5）。
6. 六份设计文档以哪份为准、是否同意合并为单一规范（R7）。
7. 直播播放器控制条是否要玻璃化、是否接受「只做渐变 + dimming 近似」（R3）。
8. `tabBarHidden` 的现有业务场景，是否可改为「仅模态覆盖时隐藏」（R11）。
9. 英雄文字 31 vs 34–41sp 的品牌取舍（`SPEC` 7.5）、目标语言与最小屏宽（R10）。
10. 玻璃浮层白名单与「上麦」作为唯一 tinted prominent 主行动是否确认（`SPEC` 6.7）；直播页「TabBar / PlayerChrome 悬浮底坞 / MiniPlayer 共 ≤3 个真玻璃容器」计数口径是否确认（PM 口径，弹幕与 AppToast 不计入）。
11. **背景遮罩归一值待设计拍板**：`App.tsx:709` 的 0.88/0.92 与 `navigation/index.tsx:270` 的 `bgScrim 0.34` 三套随意值要收敛为单一 `contentScrim` token；须与 `clear`+亮底的 `dimming=0.35`（`SPEC` M7）**分开管理**，二者语义不同（一个是承载全屏背景的内容层可读性压暗、一个是玻璃背后的 dimming）。此项是「归一」而非「删除」，背景 bleed 容器按 M9 保留 transparent。

---

## 附录 A：核心证据文件索引

| 主题 | 文件 |
| --- | --- |
| 依赖/脚本/版本 | `APP/package.json`、`APP/app.json`、`APP/tsconfig.json`、`APP/index.ts` |
| 构建 | `APP/android/build.gradle`、`android/app/build.gradle`、`android/settings.gradle`、`android/gradle.properties`、`android/gradle/wrapper/gradle-wrapper.properties`、`APP/scripts/build-apk.js`（仅见引用）、`APP/README.md:39-48` |
| 原生模块 | `APP/android/app/src/main/java/com/yk1z/yayamsg/*.java|kt`、`android/app/src/main/AndroidManifest.xml` |
| 导航/页面注册 | `APP/src/navigation/index.tsx`、`types.ts`、`tabBarStyle.ts`、`APP/App.tsx` |
| 设计 token | `APP/src/theme/{colors,typography,spacing,radii,shadows,motion,ui,index}.ts` |
| 玻璃组件 | `APP/src/components/{GlassCard,AppTabBar,MiniPlayerBar,AppToast,Pill,Skeleton,ScreenHeader,DanmakuOverlay,DanmakuSettingsSheet,MiniPlayer,FullScreenPlayer,ZoomImageModal}.tsx` |
| 播放器 | `APP/src/player/PlayerScreen.tsx`、`chrome/PlayerChrome.tsx`、`core/*.tsx` |
| 安全区 | `APP/src/hooks/useSafeAreaInsets.ts` |
| 设计/审计文档 | `APP/{DESIGN_SYSTEM,DESIGN_UI_2026-08-15,UI_LAYOUT_PLAN_v2,UI_OVERHAUL_2026-08-16,UI_AUDIT_2.7.1,AUDIT_SCREENS,README}.md` |
| 引擎源码 | `LG/liquidglass/src/main/java/com/jiale/liquidglass/{LiquidGlass,GlassDefaults,GlassBackdrop,RefractMode}.kt` |
| 引擎示例 | `LG/sample/src/main/java/com/jiale/liquidglass/sample/MainActivity.kt` |
| 引擎构建 | `LG/{build.gradle.kts,settings.gradle.kts,gradle.properties,.jitpack.yml}`、`LG/gradle/libs.versions.toml`、`LG/gradle/wrapper/gradle-wrapper.properties`、`LG/liquidglass/build.gradle.kts`、`LG/sample/build.gradle.kts`、`LG/liquidglass/consumer-rules.pro` |
| 引擎文档 | `LG/README.md`（全 322 行） |
| 上游规范 | `deliverables/software-company/02-apple-liquid-glass-spec.md`（PM 产出，M/D/S 编号） |

## 附录 B：明确「未找到 / 无法核实」项

| 项 | 状态 |
| --- | --- |
| App 的 `compileSdk` / `targetSdk` / `buildToolsVersion` 具体数值 | **未找到**显式值；由 `rootProject.ext.*`（Expo/RN Gradle 插件注入）提供，`android/app/build.gradle:94-110` 仅引用 |
| App 的 Kotlin 插件版本 / AGP 版本 | **未找到**显式声明（`android/build.gradle:9-11` classpath 未带版本号） |
| `ios/` 目录 / iOS 构建脚本 / `app.json` ios 段 | **不存在**（`ls -d ios` → 无；`package.json` scripts 仅 android/web） |
| `AppScaffold.tsx` / `ListItem.tsx` / `SectionHeader.tsx` / `EmptyState.tsx` | **当前 `src/components/` 中未找到**（文档 `UI_OVERHAUL_2026-08-16.md` 曾提及，现已删或从未落地） |
| `src/theme` 中的玻璃参数（blur/transparency/refraction/dispersion 单一来源） | **未找到**；全 `src/**/*.ts` Grep 仅命中 `surfaceGlass` / `surfaceGlassStrong` 两个不透明色值 |
| `reduceMotion` / `AccessibilityInfo` / `isReduceMotionEnabled` / `DynamicType` 实现 | **未找到**（全 src Grep 0 命中） |
| `largeTitle` / `title1` / `title2` 在页面中的使用 | **未找到**（全 src Grep 0 命中） |
| `android/` 目录中的 Compose 代码 / 依赖 / 构建特性 | **未找到**（Grep `setContent\|ComposeView\|@Composable\|Compose` 0 命中；`app/build.gradle` 无 `androidx.compose.*`、无 `buildFeatures.compose`） |
| 引擎 `LiquidGlass.kt` 全文逐行 | 文件 50.8KB 已整体读取（工具输出持久化），公开 API / 参数 / 算法结论据其 import、常量与 README 交叉印证；私有绘制细节以 `README.md:183-221` 的原理说明为补充（README 声明算法注释原样保留） |
| `LG/liquidglass/src/main/AndroidManifest.xml` / `sample/.../themes.xml` / `LICENSE` | 存在于文件清单，本轮未逐行读取（与复用判定无关） |
| `API_MAP.md` / `API_RESEARCH.md` / `RELEASE_NOTES_2.7.1.md` 正文 | 本轮未深入（与 UI 重构无关） |
| 三星真机实测帧率、`expo-blur` 在目标 ROM 上的实际行为 | **无实测数据**，本轮为只读源码分析 |

---

*本报告为只读调研产物，未修改任何 App / LiquidGlass 源码文件。所有结论均可回溯到上述文件路径与行号；凡文件中未出现或无法核实者已在附录 B 明确标注「未找到」。*
