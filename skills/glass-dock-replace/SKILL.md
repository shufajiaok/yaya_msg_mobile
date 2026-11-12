---
name: glass-dock-replace
description: 把 yaya_msg_mobile（任意版本，原版组件不变）的底部 dock 底栏替换为 GlassKit 玻璃版。保留触摸链、图标清晰、指示器模糊叠加在 bar 之上、与原版 Kotlin GlassKit 语义一致。给定「用户仓库 + 本 skill」即可由 agent 直接完成替换。触发词：玻璃化底栏 / dock 玻璃 / 替换 bar 组件 / glass dock / liquid glass tab bar。
---

# glass-dock-replace · yaya_msg_mobile 底栏玻璃化替换

## 用途
在 **任意版本** 的 `yaya_msg_mobile`（上游 `Xenia0922/yaya_msg_mobile`，原版组件不变）上，
把底部 `dock`（tab bar）的 bar 替换为 GlassKit 玻璃版。目标：
- 透视实时背景（不是卡纸底衬）；
- 指示器透镜放大/折射，但 **图标永不清糊**；
- 指示器模糊 **叠加在 bar 之上**（不是单独糊、不是糊 bar 图标）；
- 触摸命中链逐位不动（panResponder 仍在 dock body）；
- 与原版 Kotlin GlassKit 语义一致（原版 `INDICATOR.blurDp=0`，靠「指示器采集已模糊的 bar」实现叠加）。

## 前置（必须）
- **Companion 仓库**：本 skill 配合「用户的 yaya_msg_mobile 仓库」使用——引擎与参考组件都来自它。
  克隆 `shufajiaok/yaya_msg_mobile`（或朋友拿到的那份），切到含 GlassKit 引擎的分支（历史为 `glass-ui-rework`）。
- React Native 版本与仓库内 Kotlin 引擎兼容（仓库内已验证）。JDK 17。
- Android `minSdk` 31 才有模糊、33 才有透镜；低于则走降级实底（见下），不会崩。

## 核心约束（务必保留，禁止回退）
1. **不要改 AGSL**（`GlassLensShader.kt`）：只有一个 `uBlurred` uniform，blur 与 lens 共用一张纹理，
   必须先在 JS/原生侧把「模糊背景 + 清晰图标」合成一张再喂 lens，不能给 lens 单独传纹理。
2. **图标永不清糊**：bar 玻璃叶子（`GlassKitView` capturable）**不能包含任何图标/文字**；
   图标走独立的透明底 `iconBackdropTag` 层，native 以 `SRC_OVER` 把清晰图标盖到已模糊背景之上。
3. **触摸链不动**：`panResponder.panHandlers` 必须留在 dock body 的容器 `View` 上，
   不得移到玻璃层或指示器层。
4. **指示器模糊 = 叠加在 bar 之上**：`blurDp = √(barBlurDp² + indicatorBlurDp²)`。
   禁止回到两条旧路径：① 让指示器只糊 bar 的图标文字；② 让指示器糊 bar 的屏幕帧快照
   （软件画布回放，只有 1/6 降采样近似，无真高斯）。
5. **指示器必须显式 `blurScale={1}`**：否则全局 `blurScale` 被隐式乘进指示器，默认 0 时拖滑块无反应
   （这是 it.23 实测「指示器不受调节」的真坑）。

## 已知三处「拍板结论，不要反复推翻」
- **Q3**：指示器保留随 `lensScale` 调节（**不**锁死 Kotlin 的 `lockedRefraction=0.8`）。
- **配色/字号**：深色主题选中 `#7CA6FF`(Bold) / 未选中 `#9CA8BC`(Normal)，标签 11sp（真值 10sp，
  违反最小 11sp 硬规则，已获守卫白名单）。浅色主题仍走 `palette`。
- **几何**：dock 外投影 / 轮廓光（`GlassKitRimView` / `glassInsetDp`）已撤销，只保留连续曲率胶囊圆角
  （`capsuleContinuous` + `cornerRadiusDp=999`）。

## 步骤

### Step 1 — 复制原生引擎（保持路径）
从 companion 仓库复制整个目录：
- `android/app/src/main/java/com/yk1z/yayamsg/glasskit/`（10 个 Kotlin：
  `GlassKitView` / `GlassKitManager` / `GlassKitBackdropManager` / `GlassKitRimView`(+`Manager`) /
  `GlassKitPackage` / `GlassCaptureEngine` / `GlassLensShader` / `GlassHighlightShader` / `ContinuousRoundRect`）。
- 引擎自带 `GlassKitPackage`，但**目标干净上游未注册** → 见 Step 2。

### Step 2 — 注册 ReactPackage（锚点搜索，不硬编码行号）
- 搜 `class MainApplication` 定位 `MainApplication.kt`（通常在 `android/app/src/main/java/com/<pkg>/`）。
- 搜 `override fun getPackages()` 定位 `List<ReactPackage>` 返回块。
- 加：`import com.yk1z.yayamsg.glasskit.GlassKitPackage` 与列表里的 `add(GlassKitPackage())`。
- 范例见 companion 的 `MainApplication.kt`（注册处约在 `getPackages()` 块内，与 `PipPackage()` /
  `LivePlayerPackage()` 并列）。

### Step 3 — 复制 RN 桥接 + 玻璃主题（保持路径）
从 companion 复制：
- `src/native/GlassKitView.tsx`、`GlassKitBackdrop.tsx`、`GlassKitRimView.tsx`、`backdropTagStore.ts`
  （及同目录 `.ts` 依赖）。
- `src/theme/glass.ts`（四倍率 store + `canBlur` / `canLens` / `resolveTintAlpha` / `TINT_ALPHA_BASE`）、
  `glassProfile.ts`（全部默认值常量）、`glassDockStore.ts`（25 项运行时状态 + `useDockSettings` / `useGlassScales`）。
- App 现有 `usePalette` / `typography` 复用，**不动**。

### Step 4 — 替换底栏组件
- **锚点（搜任一）**：`createBottomTabNavigator` 的 `tabBar` 自定义渲染；组件名含 `TabBar` / `BottomBar` / `Dock`；
  文件名 `AppTabBar.tsx` / `BottomTabBar.tsx`。
- **操作**：用本 skill `references/AppTabBar.tsx`（与 companion 的 `src/components/AppTabBar.tsx` 同款）整体替换/新建。
- **保留对外签名** `AppTabBarProps { items; activeKey; onSelect }`，使 `src/navigation/index.tsx` 零改动。
- **按目标版本调整**：图标集（companion 用 `react-native-vector-icons/MaterialCommunityIcons`）、标签字号（`typography.caption2`）、
  调色板引用（`usePalette`）。
- **结构顺序不能改**（见文件内注释 §双纹理分流）：
  ① 外层 `GlassKitBackdrop excludeFromCapture` 容器（不进 App 级采集纹理）；
  ② bar 玻璃叶子 `GlassKitView`（`capturable + liveBackdrop`，**不含图标**）；
  ③ 透明底图标层 `GlassKitBackdrop`（包 `dockBody` + `tabsRow`，`backgroundColor: 'transparent'`，承载 `panResponder`）；
  ④ 指示器 `GlassKitView`（在②③之后、`blurBackdropTag={backdropTag ?? -1}`、`iconBackdropTag={iconLayerTag}`、
     `blurDp={√(barBlur²+indBlur²)}`、`blurScale={1}`、`liveBackdrop={true}`）。

### Step 5 — 守卫白名单
复制 companion 的 `scripts/glass-guard.js` + `scripts/glass-guard.baseline.json`（项目守卫，见 `references/`）。
若只手工加，至少补两项：
- `glassProfile.ts` 内的 `GLASS_DOCK_ACTIVE` / `GLASS_DOCK_INACTIVE` 常量被放行（guard 的 `brandGlassColorFile` /
  `brandGlassColorLine`，D7 例外）。
- `GLASS_BUDGET.maxContainers = 3`。

### Step 6 — 版本固化
- `android/app/build.gradle`：`versionCode` +1、`versionName` 同步；
- `app.json`：`versionCode` 同步（注意 `package.json` 的 `version` 也对齐，避免 verify-version 漂移）；
- 实验页 `GlassTestScreen.tsx`（若有）状态行追加 `-it.N` 标记。

### Step 7 — 验证
1. `npx tsc --noEmit` 通过（无类型错误）。
2. `node scripts/glass-guard.js` → PASS，硬规则 0 命中。
3. `./gradlew assembleRelease -Dorg.gradle.jvmargs="-Xmx2048m -XX:MaxMetaspaceSize=768m"` → BUILD SUCCESSFUL。
4. `aapt2 dump badging <apk>` 确认 `versionCode` 与 `build.gradle` 一致。
5. 真机取证（**禁止读截图**，允许 logcat/dumpsys/uiautomator 文本）：
   - logcat 抓 `dual-texture` 行 → 确认双源合成 `ok=true`；
   - 抓 `lens effect flags` → 确认三开关（chromatic/depth/vibrancy）按预期；
   - 确认 dock 可点击（`panResponder` 仍在 `dockBody`）；
   - 指示器拖到最低时与 bar **同糊**（叠加半径=bar 半径），拉满时严格**更糊**（叠加半径>bar 半径）。

## 回滚顺序（若引入回归）
1. 先撤指示器双源：`blurBackdropTag` / `iconBackdropTag` → 不传（native 回退 `-1`/单纹理路径），零回归；
2. 再撤 bar 玻璃叶子：dock 退半透明实底（`GLASS_BAR_FALLBACK`）；
3. 最后整组件回退到原版（git 保留原版为 `.bak` 或 `git checkout` 对应版本文件）。

## 参考文件
- `references/AppTabBar.tsx` —— 规范化玻璃 dock 模板（直接复制后按目标版本微调）。
- `references/glass-guard.js` / `glass-guard.baseline.json` —— 项目守卫（含品牌色白名单）。
- companion 仓库的 `src/theme/glassProfile.ts`（`GLASS_LENS_PROFILE` / `GLASS_DOCK_*` / `GLASS_BAR_FALLBACK` /
  `GLASS_INDICATOR_FALLBACK` 等全部默认值常量）、`glassDockStore.ts`（运行时状态）。
