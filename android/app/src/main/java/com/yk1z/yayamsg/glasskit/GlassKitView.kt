package com.yk1z.yayamsg.glasskit

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.ColorSpace
import android.graphics.HardwareRenderer
import android.media.ImageReader
import android.hardware.HardwareBuffer
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Path
import android.graphics.RectF
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.media.Image
import android.util.Log
import kotlin.math.floor
import android.graphics.Shader
import android.os.Build
import android.os.SystemClock
import android.view.View
import android.view.ViewTreeObserver

/**
 * GlassKit 渲染核心（引擎重写清单 §二，纯 Kotlin View，零依赖）。
 *
 * onDraw 管线：
 * 1. 捕获：GlassCaptureEngine 按 backdropTag 找背景视图，采玻璃覆盖区（失败画兜底底色）；
 * 2. 模糊：API 31+ 且画布硬件加速 → RenderNode + RenderEffect.createBlurEffect；
 *    API 26–30 / 软件画布 → 固定档降采样 1/6 + 双线性放大近似（H2 单档语义，纯模糊路径不变）；
 * 3. 透镜（it.4 真模糊化输入，QA Round 1 回修版）：API 33+ 且 lensScale>0 且
 *    refraction/dispersion>0 → 透镜输入位图 =「固定适度降采样 1/4 + 小图 CPU
 *    box blur ×3 迭代近似高斯（stack blur，IntArray 逐像素）」（见
 *    obtainLensInputShader）：先把采集结果缩到 1/4 小图，再在小图坐标系内以
 *    radius = blurRadiusPx / 4 做三盒高斯近似，模糊后经 BitmapShader 放大喂
 *    RuntimeShader（uRefractionPx / uDispersionPx 已乘 lensScale）——先模糊后放大，
 *    无硬边、无锯齿。⚠️ 首版 BlurMaskFilter 方案已被 QA 证伪并废弃：
 *    BlurMaskFilter 只作用于绘制图元的 alpha 遮罩（几何边缘），不模糊位图内容
 *    （管线顺序 geometry→mask→maskFilter→×shader color），外扩 pad 后可见区
 *    全在遮罩内部，模糊零视觉贡献。⚠️ it.3 的「降采样系数随模糊半径自适应
 *    （lensDownsampleFactor）」同样已废弃为锯齿源：降采样+双线性放大本质产出
 *    锯齿而非高斯，factor 变化只是锯齿块变大。blurScale≈0（blurRadiusPx<0.5）
 *    时跳过模糊，直接零拷贝绑定全分辨率 capture（清晰折射观感对齐 it.3）；
 *    模糊与透镜不互斥，四面板对 blurScale / lensScale 同时有可见响应；
 *    非透镜面板走纯模糊路径不变；
 * 4. tint：tintColor withAlpha(min(tintAlpha * tintScale, 0.12)) —— H1 硬约束钳制；
 * 5. 压暗：#000 @ dimmingAlpha；
 * 6. 高光（it.7 重做，Apple Liquid Glass 调研口径）：贴轮廓的顶/底窄带
 *    LinearGradient 多 stop 非线性衰减（边缘最亮、向内快速衰减，陡在边缘平在
 *    内部；顶部显著亮于底部），取代 it.6 的均匀描边；轮廓另留 1dp 发丝线
 *    （alpha ≤ 0.18）界定边缘；
 * 7. 裁剪：圆角矩形 Path clip。
 *
 * 重绘触发：背景视图挂 OnPreDrawListener（返回 true 不拦截绘制），33ms 节流
 * （≈30fps），postInvalidateDelayed 排队；onDetachedFromWindow 清理。
 * it.4 重绘触发改造：① PreDraw 检测面板 onScreen 位置变化 → 立即 invalidate 绕过
 * 节流（拖动/滚动时 capture offset 与面板框逐帧对齐，修复「拖动内容抖动」）；
 * ② 自激励环打断——自身 postInvalidate 引发的 traversal 不再续期（修复静止期
 * 无限重绘，15s 静止实测 5872 行日志 ~50fps/面板）；③ 透镜输入双缓冲 ping-pong
 * （UI 每帧变异位图 vs RenderThread BitmapShader 采样的跨帧竞态根除，修复
 * 「静止时遮挡/不遮挡切换」闪烁——竞态本身日志不可见，属静态分析定论）。
 * QA Round 1 修复：attach 幂等重挂（E1）、observer 实例缓存防 dead 滞留（E2）、
 * backdrop 晚挂载有限重试（E3）、NaN 拦截（S4）、alpha floor 取整（S1）、
 * RenderEffect 缓存复用（S2）。
 * QA Round 2 修复：detachPreDraw 补第三降级路径——cached 与 targetView 的
 * observer 均无效时用 glass 自身 viewTreeObserver 移除（E2 场景①残余泄漏，
 * F1）；backdropTag 变更时重置 E3 重试计数（F2）；dimmingAlpha /
 * cornerRadiusDp 补 isFinite 兜底（F3）。
 * it.8：① capturable prop——本视图可作采集源（注册 GlassCaptureEngine，玻璃叠
 * 玻璃链路）；② 嵌套采集重入降级——capturable 视图短路重入时回放最近合成帧
 * 快照（onDraw / recordFrameCache，透镜回录走专用槽 2）；③ 发丝线 alpha 随
 * max(glowTopScale, glowBottomScale) 缩放（顶/底全关 = 完全无高光）。
 * it.9：① 透镜输入 GPU 全分辨率离屏模糊（纱窗感修复）——HardwareRenderer +
 * RenderNode(RenderEffect 高斯) → ImageReader → wrapHardwareBuffer 硬件位图
 * → BitmapShader 喂 AGSL；CPU「1/4 降采样 + box blur ×3」退役为 forceDownsample
 * 回退路径；② 闪烁回归修复（取证结论）：静止期 6 视图 PreDraw 交叉触发风暴
 * （GlassKitFlicker 日志：静止 30fps×6 持续重绘、dock 回录 records≈seq）→ UI
 * 超前 RT ≥2 帧 → 双槽采样碰撞。修复 = 真实刺激代数指纹（propGeneration /
 * 背景源 drawGeneration，重满预算）+ 无关交叉触发预算递减至静止 + 回录只在
 * 屏幕帧做 + CPU 槽位升四槽（0/1/2 轮换 + 槽 3 回录专用）；③ membraneAlpha
 * 膜层 prop（tint 后压暗前白色覆盖层，it.9 默认 0.38，it.13 起默认 0，见 ④）。
 * it.10（指示器「透明边缘锯齿」取证修复）：
 * ① 取证结论：指示器视图宽 < MAX_CAPTURE_WIDTH_PX，obtainCaptureBitmap 的超宽
 *   降采样分支天然不触发（capture scale=1 全分辨率）——「GPU 路径 capture 仍
 *   走降采样」的头号嫌疑被静态分析证伪；真主根因 = AGSL 透镜 shader 的 SDF
 *   硬截断（形内→形外 1px 无过渡翻转，见 GlassLensShader it.10 注释），已在
 *   shader 侧加贴边 1px 内向 alpha 渐变 AA。
 * ② 透镜路径 capture 强制全分辨率：obtainCaptureBitmap 增加 allowDownsample
 *   参数——lensActive（硬件画布）时不允许降采样（头号嫌疑若在特定机型复现也
 *   被结构性排除）；模糊路径保留既有降采样语义不变。
 * ③ capture 分辨率取证日志：位图尺寸变化时打一条「capture res view=WxH
 *   bitmap=WxH scale=… lensFullRes=…」（logcat -s GlassKitBlur），装机可直接核对
 *   capture 实际分辨率 vs 视图分辨率。
 * it.11（指示器「边缘锯齿」第二轮取证修复，见 obtainSmallBlurBitmap / drawGlassFrame
 * 注释）：
 * ① 软画布降级路径（嵌套采集 + 快照回录的唯一渲染链）单步 1/6 降采样 = 双线性
 *   跳采样混叠 → 改逐级 2 倍半采样链（smallBlurChain 缓存复用）；
 * ② 嵌套取证日志：nested soft render（软画布降级链路一次性证据）+ frameCache
 *   snapshot（快照分辨率/格式）——与屏幕帧 lens input=gpu 交替即差异实锤。
 * 注意：不设 LAYER_TYPE_HARDWARE（任务书明确不设，保持默认 NONE，让 RenderNode
 * 路径直接落在父级硬件画布上）；isHardwareAvailable 只判 SDK_INT。
 * it.13（SwiftUI 标准连续曲率圆角 + HealthCheckIn 效果开关对齐）：
 * ① ⑦ 圆角裁剪由 Path.addRoundRect（G1 圆弧）改为 ContinuousRoundRect
 *   .buildContinuousRoundRect（角部超椭圆 + 平直段），本帧统一指数 n 由
 *   cornerExponent(w,h,r) 计算一次，同时喂 clipPath 与 AGSL sdContinuous
 *   （obtainLensShader 下发 uCornerExponent）—— Path/SDF 零点严格重合。
 *   胶囊 / 正方形命中 n=2 硬守卫 → 严格圆弧，it.12 零回归；GPU 模糊链
 *   （HardwareRenderer / ImageReader / wrapHardwareBuffer / BitmapShader）完全不动。
 * ② ⑥ 高光追加顶缘 18dp 竖向渐变（highlightScale>0.01，White@0.22×scale
 *   → Transparent，仅顶缘），原有 glow 顶/底双带 + 发丝线保留但降为扩展调试。
 * ③ 三开关最小实现：chromaticEnabled 关闭时 drawLensLayer 把 dispersion 置 0；
 *   depthEffect 下发 uDepthEffect；vibrancyEnabled 默认走风险最低的
 *   GlassLensShader 末 saturation=1.5 矩阵（uVibrancy=1，见
 *   VIBRANCY_SHADER_FALLBACK 决策注释），不触碰 GPU 模糊链 / RenderEffect /
 *   propGeneration；GPU ColorFilterEffect 路径保留为编译期开关供真机 A/B。
 *   四新 prop 全部走 markPropChanged()，静止期零重绘契约不变。
 * ④ 膜层语义：membraneAlpha 默认 0.38 → 0（「膜层」滑块改绑 tintScale），
 *   白膜层绘制代码保留但默认不画；H1 tint≤0.12 钳制一行未动。
 * ⑤ 软画布快照回录帧不创建 RuntimeShader、不下发任何新 uniform，
 *   保持原模糊降级（it.8-fix1 教训）。
 */
class GlassKitView(context: Context) : View(context) {

    companion object {
        /** JS reduceTransparency 门控的总开关默认值由 Manager 传入，此处为视图默认。 */
        const val DEFAULT_TINT_ALPHA_MAX: Float = 0.12f
        /** 边缘高光描边宽度（dp）——glass.ts EDGE_HIGHLIGHT.widthDp 单层 1dp。 */
        const val EDGE_HIGHLIGHT_DP: Float = 1f
        /** 边缘高光 alpha ——glass.ts EDGE_HIGHLIGHT.alpha 0.14。 */
        const val EDGE_HIGHLIGHT_ALPHA: Float = 0.14f
        /**
         * it.14 Continuous Capsule 超椭圆指数：2（圆弧）< 3 < 4（Apple squircle），
         * 取保守中值，避免 n=4 端帽过方（it14-spec 附录 B 有意偏离 #2）。仅在
         * capsuleContinuous=true 且 cornerRadiusPx 已钳到半短边（真胶囊）时覆盖
         * 本帧 cornerExponentN；同一标量同时喂 clipPath 与 AGSL uCornerExponent，
         * Path 参数方程 |x|^n+|y|^n=r^n 与 SDF 零点严格重合。
         * ⚠️ 不改 ContinuousRoundRect.kt 的 N_MIN/N_MAX、blend 曲线、胶囊硬守卫，
         *    不改 GlassLensShader.kt，不改 GPU 全分辨率模糊链。
         */
        const val CAPSULE_CONTINUOUS_N: Float = 3.0f
        /**
         * 近似模糊降采样档（清单 §二.2 原 1/4；实测上调 1/6）：
         * 1/4 + 双线性放大的 10%-90% 边缘过渡宽度实测仅 ~6px（真机像素脚本），
         * 不满足「面板内 ≥8px」验收线；1/6 实测 ~9px 达标。透镜输入同步受益
         * （obtainSmallBlurBitmap 共用本档，AGSL 侧有 scaleX/scaleY 补偿）。
         */
        const val BLUR_DOWNSAMPLE: Int = 6

        /**
         * it.4 透镜输入固定降采样档（常量，不再随模糊半径变化——it.3 的
         * lensDownsampleFactor 自适应设计已废弃为锯齿源，见类头注释）。
         * ⚠️ it.9 起该档仅剩 forceDownsample（模拟器调试）回退路径使用：
         * 真机默认走 GPU 全分辨率离屏模糊（HardwareRenderer + RenderEffect 高斯），
         * 「固定 1/4 降采样 + CPU box blur ×3 → 双线性放大」的像素网格纱窗感链路退役。
         */
        const val LENS_DOWNSAMPLE: Int = 4

        /**
         * it.4-R2：透镜输入 box blur 半径上限（小图坐标系 px，QA 回修规格钳制值）。
         * radius = round(blurRadiusPx / LENS_DOWNSAMPLE)，三盒迭代的 sigma = radius/2。
         */
        const val MAX_LENS_BLUR_RADIUS: Int = 60
        /** 重绘节流间隔（ms，≈30fps）。 */
        const val FRAME_INTERVAL_MS: Long = 33L
        /** 捕获失败兜底底色：半透明白灰。 */
        const val FALLBACK_COLOR: Int = 0x4DFFFFFF
        /** E3 修复：backdrop 晚挂载时 resolveTarget 空结果的重试间隔（ms）。 */
        const val TARGET_RETRY_DELAY_MS: Long = 100L
        /** E3 修复：重试上限（50 次 ≈ 5s），防无限循环。 */
        const val TARGET_RETRY_MAX: Int = 50

        /**
         * it.9 GPU 全分辨率透镜输入（纱窗感修复）：
         * HardwareRenderer + RenderNode(RenderEffect 高斯) → ImageReader(RGBA_8888,
         * GPU_COLOR_OUTPUT|GPU_SAMPLED) → acquireLatestImage → Bitmap.wrapHardwareBuffer
         * → 硬件位图 BitmapShader 喂 AGSL RuntimeShader。真机默认路径（canLens≥33
         * 已覆盖 API 门槛：HardwareRenderer/带 usage 的 ImageReader.newInstance 需 29+，
         * RenderEffect 需 31+）；forceDownsample=true（模拟器）回退 CPU 槽位路径。
         */
        /** GPU 路径 ImageReader 最大并发 Image 数（采集持有 ≤ RETAIN，余量给队列）。 */
        const val GPU_READER_MAX_IMAGES: Int = 4
        /** GPU 路径已包装硬件位图的保留帧数：RT 回放落后 ≤(RETAIN-1) 帧不碰撞
         * （与 CPU 三槽 ping-pong 同理；被逐出的 Image close 后缓冲回到 reader 队列复用）。 */
        const val GPU_IMAGE_RETAIN: Int = 3

        /**
         * it.9 闪烁修复：静止期外部交叉触发重绘预算。
         * 取证（GlassKitFlicker 真机日志）：6 玻璃视图互相触发 PreDraw（统一挂在窗口
         * 根 observer，任一视图重绘即全员收到）→ 静止期持续 ~30fps 重绘风暴；it.4 的
         * 自激励打断只防「自身 postInvalidate 链」，防不住多视图互triggering。风暴使
         * UI 帧速超 RenderThread 回放 → 采样落后 ≥2 帧 → 双槽 ping-pong 碰撞（采样
         * 半擦除小图）= it.4 同款闪烁回归。修复：外部触发按预算调度（每帧自绘不续
         * 预算），预算耗尽即静止；位移（moved）与 prop 变更（invalidate 直接调用）重满。
         */
        const val FOREIGN_REDRAW_BUDGET: Int = 3

        /**
         * 模糊路径强制降级开关：已从编译期常量改为 JS 可控 prop（forceDownsample，
         * GlassKitManager.setForceDownsample 注入）——真机默认走 RenderEffect 真高斯
         *（真机实装反馈：1/6 降采样双线性放大呈锯齿、模糊观感不足），模拟器由测试页
         * 开关按需强制降采样路径。
         *
         * 历史实测结论（2026-11-07 MuMu emulator-5554 / Android 15 API 35 / x86_64）：
         * logcat 证实走了 rendernode 分支（blurRadiusPx=21.0、RenderEffect created
         * 572x126、hardwareAccelerated=true），但像素级分析蓝球左边缘 B-R 通道
         * 10%-90% 过渡宽度仅 1px（应有 ≥40px 高斯过渡带）→ 该模拟器 GPU 接受了
         * RenderEffect 却不执行模糊（Skia/ANGLE RenderEffect 支持缺陷）。
         */
        /** drawBlurredLayer 诊断日志 tag（logcat: adb logcat -s GlassKitBlur）。 */
        const val BLUR_LOG_TAG: String = "GlassKitBlur"

        /**
         * it.9 闪烁取证日志 tag（logcat: adb logcat -s GlassKitFlicker）：
         * onDraw 帧序/帧间隔/透镜槽位/短路与回录计数——定位「全部组件静止期闪烁」回归。
         * 前每视图 600 帧逐帧打点，之后每 300 帧打一条汇总（防刷屏）。
         */
        const val FLICKER_LOG_TAG: String = "GlassKitFlicker"
        const val FLICKER_LOG_FULL_FRAMES: Long = 600L
        const val FLICKER_LOG_STEP: Long = 300L

        /**
         * it.7 边缘高光窄带的 stop 位置表：t = 距轮廓边缘的距离 / 带深度 ∈ [0,1]，
         * t=0 即轮廓边缘。陡在边缘、平在内部——前 35% 深度内亮度跌去约 72%，
         * 后 40% 只剩 <5% 的余晖，逼近凸形剖面 h(x)=(1-(1-x)^4)^(1/4) 的形状
         * （Apple Liquid Glass 调研结论，主理人核实采信）。
         */
        val GLOW_BAND_POSITIONS: FloatArray =
            floatArrayOf(0f, 0.15f, 0.35f, 0.6f, 0.85f, 1f)

        /** 与 GLOW_BAND_POSITIONS 一一对应的亮度（白光 alpha 系数，边缘 1 → 内缘 0）。 */
        val GLOW_BAND_ALPHAS: FloatArray =
            floatArrayOf(1f, 0.55f, 0.28f, 0.12f, 0.04f, 0f)

        /** it.7 高光带静态色表：白色 × GLOW_BAND_ALPHAS（构造一次，随 Paint 复用）。 */
        val GLOW_BAND_COLORS: IntArray = IntArray(GLOW_BAND_ALPHAS.size).also { colors ->
            for (i in GLOW_BAND_ALPHAS.indices) {
                colors[i] = (Math.round(GLOW_BAND_ALPHAS[i] * 255f) shl 24) or 0x00FFFFFF
            }
        }

        /** it.7 轮廓发丝线 alpha 上限（调研口径：极细 1px 亮线 ≤0.18 界定边缘）。 */
        const val GLOW_HAIRLINE_ALPHA: Float = 0.18f

        /** it.13 顶缘高光渐变深度（dp）：GlassSurfaceKt.java:713 verticalGradient endY=18.dp。 */
        const val TOP_HIGHLIGHT_DP: Float = 18f
        /** it.13 顶缘高光起始 alpha 系数：GlassSurfaceKt.java:713 的 0.22f × highlightScale。 */
        const val TOP_HIGHLIGHT_ALPHA: Float = 0.22f
        /**
         * it.13 鲜活度默认路径决策（主理人新指令：跳过真机取证，遇到「必须
         * 真机 A/B 才能二选一」的分支一律选风险最低的默认路径 + 可关闭开关）。
         *
         * 【所选默认路径】true = GlassLensShader 末的 saturation=1.5 矩阵
         * （uVibrancy=1，仅 API33+ 硬件透镜帧生效）。理由：
         *  ① 不触碰 GPU 模糊链 / RenderEffect / Effect 缓存键 / propGeneration，
         *     GPU ColorFilterEffect 整段代码在默认配置下不执行 —— 零 it.9
         *     纱窗感 / 闪烁回归面（原 GPU 路径的回归风险恰恰需要真机 A/B 才能排除，
         *     本轮不做取证，故不作为默认）；
         *  ② uniform 默认 0：软画布快照回录帧 / API<33 不下发 uVibrancy，
         *     逐位等价 it.12、不抛异常（it.8-fix1 教训）；
         *  ③ 运行时可关闭开关 = vibrancyEnabled prop（默认 true，三开关之一），
         *     置 false 即完全关闭鲜活度（uVibrancy=0、ColorFilter 亦不挂）。
         *
         * 【保留的备选路径】改为 false = 原 GPU 模糊链 RenderEffect
         * .createColorFilterEffect（API31+，ColorFilterKt.java 语义）。本常量即
         * 编译期 A/B 开关，供用户真机肉眼验收 / 后续取证时切换，本轮不启用。
         * 两路互斥，不会双重饱和。
         *
         * 【已知代价（非回归）】默认路径下鲜活度仅在 API33+ 硬件透镜帧生效，
         * 软画布回录降级帧 / API31–32 无鲜活度；需要全帧鲜活度时切 false。
         */
        const val VIBRANCY_SHADER_FALLBACK: Boolean = true
    }

    /* ---------------- props（GlassKitManager @ReactProp 一一对应） ---------------- */

    /** 背景容器 tag（GlassKitBackdrop 的原生 view id）。 */
    var backdropTag: Int = View.NO_ID
        set(value) {
            if (field == value) return
            field = value
            // F2 修复：换新 tag = 全新的 backdrop 解析任务，重置 E3 有限重试
            // 计数器，重新获得完整 50 次重试预算（否则前一个 tag 耗尽的计数
            // 会连累新 tag 的晚挂载重试提前停摆）
            pendingResolveRetries = 0
            resolveTarget()
            markPropChanged()
        }

    /** 基准模糊半径（dp；最终半径 = blurDp * blurScale * density）。 */
    var blurDp: Float = 0f
        set(value) {
            if (field == value) return
            field = value
            markPropChanged()
        }

    /** tint 基准 alpha（最终 alpha = min(tintAlpha * tintScale, 0.12)）。 */
    var tintAlpha: Float = 0f
        set(value) {
            if (field == value) return
            field = value
            markPropChanged()
        }

    /** tint 颜色（ColorInt；alpha 分量被 withAlpha 覆盖，只取 RGB）。 */
    var tintColor: Int = 0
        set(value) {
            // 诊断：核对桥接层实际送达的色值（0 = JS 未送/送 null，排查 tint 丢失）
            if (field != value) {
                Log.i(logTag, "setTintColor: $value (0x%08X)".format(value))
            }
            if (field == value) return
            field = value
            markPropChanged()
        }

    /** 折射位移基准（px；透镜时乘 lensScale）。 */
    var refractionPx: Float = 0f
        set(value) {
            // S4 修复：NaN/Infinity 一律回退 0f，杜绝穿透进 RuntimeShader
            //（onDraw 的 >0f 门挡不住 NaN：NaN > 0f == false 但 NaN 会喂给 uniform）
            val v = if (value.isFinite()) value else 0f
            if (field == v) return
            field = v
            markPropChanged()
        }

    /** 色散位移基准（px；透镜时乘 lensScale）。 */
    var dispersionPx: Float = 0f
        set(value) {
            // S4 修复：同 refractionPx，NaN/Infinity 回退 0f
            val v = if (value.isFinite()) value else 0f
            if (field == v) return
            field = v
            markPropChanged()
        }

    /** 圆角半径（dp）。 */
    var cornerRadiusDp: Float = 0f
        set(value) {
            // F3 修复：NaN/Infinity 回退 0f（同 S4 refractionPx 式），统一 NaN 防护
            val v = if (value.isFinite()) value else 0f
            if (field == v) return
            field = v
            markPropChanged()
        }

    /**
     * it.14 Continuous Capsule 开关（默认 **false** ⇒ 零回归）。
     * 仅 dock bar / dock 指示器 / 顶栏演示件显式传 true；开启且半径已钳到
     * 半短边（真胶囊）时，本帧 cornerExponentN 局部覆盖为 CAPSULE_CONTINUOUS_N，
     * Path 与 AGSL SDF 同走连续曲率端帽；hero / chip / 工具条 / clear 不开启。
     * 走 markPropChanged()（it.9 静止期零重绘契约）。
     */
    var capsuleContinuous: Boolean = false
        set(value) {
            if (field == value) return
            field = value
            markPropChanged()
        }

    /** 压暗层 alpha（#000，独立于 tint）。 */
    var dimmingAlpha: Float = 0f
        set(value) {
            // F3 修复：NaN/Infinity 回退 0f（同 S4 refractionPx 式），统一 NaN 防护
            val v = if (value.isFinite()) value else 0f
            if (field == v) return
            field = v
            markPropChanged()
        }

    /** 模糊倍率（glass.ts blurScale，区间 0–2.5 由 JS store 钳制）。 */
    var blurScale: Float = 1f
        set(value) {
            if (field == value) return
            field = value
            markPropChanged()
        }

    /** tint 倍率（glass.ts tintScale，区间 0–3 由 JS store 钳制）。 */
    var tintScale: Float = 1f
        set(value) {
            if (field == value) return
            field = value
            markPropChanged()
        }

    /** 透镜倍率（glass.ts lensScale，区间 0–2 由 JS store 钳制；0 = 关透镜）。 */
    var lensScale: Float = 1f
        set(value) {
            if (field == value) return
            field = value
            markPropChanged()
        }

    /** 模糊总开关（JS reduceTransparency 门控用）。 */
    var blurEnabled: Boolean = true
        set(value) {
            if (field == value) return
            field = value
            markPropChanged()
        }

    /**
     * 柔光倍率（glass.ts glowScale，区间 0.05–2 由 JS store 钳制）。
     * 迭代接线：此前 glowScale 不进引擎（高光恒 1dp/0.14）——现作用于边缘高光，
     * 宽度 = 1dp × glowScale（clamp 0.5–4dp），alpha = 0.14 × glowScale（clamp 0–1）。
     */
    var glowScale: Float = 1f
        set(value) {
            val v = if (value.isFinite()) value else 1f
            if (field == v) return
            field = v
            markPropChanged()
        }

    /** it.6 柔光细化：描边亮度倍率（基准 alpha = 0.14 × glowScale × glowAlphaScale，clamp 0–1）。 */
    var glowAlphaScale: Float = 1f
        set(value) {
            val v = if (value.isFinite()) value else 1f
            if (field == v) return
            field = v
            markPropChanged()
        }

    /** it.6 柔光细化：描边宽度倍率（宽 = 1dp × glowScale × glowWidthScale，clamp 0.5–8dp）。 */
    var glowWidthScale: Float = 1f
        set(value) {
            val v = if (value.isFinite()) value else 1f
            if (field == v) return
            field = v
            markPropChanged()
        }

    /** it.6 柔光细化：顶缘高光加强倍率（视图上半描边 alpha 再乘本值，clamp 0–1 终值）。 */
    var glowTopScale: Float = 1f
        set(value) {
            val v = if (value.isFinite()) value else 1f
            if (field == v) return
            field = v
            markPropChanged()
        }

    /** it.6 柔光细化：底缘高光加强倍率（视图下半描边 alpha 再乘本值，clamp 0–1 终值）。 */
    var glowBottomScale: Float = 1f
        set(value) {
            val v = if (value.isFinite()) value else 1f
            if (field == v) return
            field = v
            markPropChanged()
        }

    /** 强制降采样模糊路径（模拟器 GPU 对 RenderEffect 支持缺陷时由测试页开关开启）。
     *  it.9 起同时控制透镜输入路径：true = CPU 槽位降采样模糊；false = GPU 全分辨率离屏高斯。 */
    var forceDownsample: Boolean = false
        set(value) {
            if (field == value) return
            field = value
            // 路径切换后重置日志去重，让新分支重新打一条诊断日志
            lastLoggedBlurPath = null
            markPropChanged()
        }

    /**
     * it.13 膜层：白色覆盖层 alpha（0–1，默认 **0**）。绘制顺序在 ③tint 之后、
     * ④压暗之前。⚠️ 语义变更：HealthCheckIn 的「膜层」滑块字段是 tintScale
     * （SettingsScreenKt.java:1946-1961），本白膜层 Kotlin 无对应 → 默认不画，
     * 代码保留供 A/B。H1 tint≤0.12 契约不受影响。
     */
    var membraneAlpha: Float = 0f
        set(value) {
            val v = if (value.isFinite()) value.coerceIn(0f, 1f) else 0f
            if (field == v) return
            field = v
            markPropChanged()
        }

    /**
     * it.14 指示器专属提亮 alpha（默认 **0f**，仅 dock 指示器传 0.05）。
     * 出处 Kotlin GlassKitKt.java:1434-1435,1451（Color.White.copy(alpha=0.05f)
     * 作为 GlassSurface 第 5 参 tint）→ GlassSurfaceKt.java:704-708 的第二笔
     * drawRect($tint)。Kotlin 无对应滑块（SettingsScreenKt.java:1898-2128）
     * ⇒ 硬编码常量，native 也不加滑块 / 开关。
     * 上界复用 H1 的 DEFAULT_TINT_ALPHA_MAX=0.12f，不进 finalTintAlpha 公式、
     * 不乘 tintScale、不进 glass.ts resolveTintAlpha（单层最大 0.05 < 0.12）。
     * NaN/Inf 回退 0（同 :341/:351/:396 口径）；走 markPropChanged()。
     */
    var indicatorBoostAlpha: Float = 0f
        set(value) {
            val v = if (value.isFinite()) value.coerceIn(0f, DEFAULT_TINT_ALPHA_MAX) else 0f
            if (field == v) return
            field = v
            markPropChanged()
        }

    /**
     * it.13 顶缘高光倍率（0–1，默认 0.2f；GlassTuning.java:30）。
     * ⑥.0 阶段按 0.22×本值 画 18dp 竖向渐变（GlassSurfaceKt.java:710-713）。
     */
    var highlightScale: Float = 0.2f
        set(value) {
            val v = if (value.isFinite()) value.coerceIn(0f, 1f) else 0.2f
            if (field == v) return
            field = v
            markPropChanged()
        }

    /** it.13 色散（整层画三遍）开关，默认 true（GlassTuning.java:33）。 */
    var chromaticEnabled: Boolean = true
        set(value) {
            if (field == value) return
            field = value
            markPropChanged()
        }

    /** it.13 景深开关，默认 true（GlassTuning.java:36 / ShadersKt.java depthEffect）。 */
    var depthEffect: Boolean = true
        set(value) {
            if (field == value) return
            field = value
            markPropChanged()
        }

    /** it.13 鲜活度开关，默认 true（GlassTuning.java:39 / ColorFilterKt.java:16）。 */
    var vibrancyEnabled: Boolean = true
        set(value) {
            if (field == value) return
            field = value
            markPropChanged()
        }

    /**
     * it.8 玻璃叠玻璃：true 时本视图可作**采集源**——以自身 id 注册进
     * GlassCaptureEngine 注册表（与 GlassKitBackdrop 同构机制），其他玻璃的
     * backdropTag 指向本视图 handle（findNodeHandle）即可采集本视图子树的合成帧，
     * 实现「外层玻璃渲染模糊+折射画面 → 内层再套一次透镜 = 双重透镜」链路。
     * detach 时对称注销；默认 false，行为与 it.7 完全一致。
     */
    var capturable: Boolean = false
        set(value) {
            if (field == value) return
            field = value
            // props 晚于 attach 到达时就地补注册/注销；attach 前调用则等
            // onAttachedToWindow 统一注册（NO_ID 由 register 拒绝）
            if (isAttachedToWindow) {
                if (value) GlassCaptureEngine.register(id, this)
                else GlassCaptureEngine.unregister(id)
            }
        }

    /* ---------------- 内部状态 ---------------- */

    private val density: Float = resources.displayMetrics.density

    /**
     * it.9 闪烁修复：真实屏幕绘制代数指纹——本视图作为采集源（capturable=true，
     * 其他玻璃的 backdropTag 指向本视图）时，下游玻璃的 PreDraw 用它判定「源内容
     * 真变了」。仅硬件加速画布的自绘自增；采集链路内的软画布 onDraw（被下游
     * capture 时）与快照回录不计入（同 GlassKitBackdropView.drawGeneration 口径）。
     */
    var drawGeneration: Long = 0L
        private set

    /** drawBlurredLayer 诊断日志 tag（companion.BLUR_LOG_TAG 同值，实例侧便捷引用）。 */
    private val logTag: String = BLUR_LOG_TAG

    /** 分支切换防刷屏：记录上一条日志的路径标签，同路径不重复打（RenderEffect 新建除外）。 */
    private var lastLoggedBlurPath: String? = null
    /** it.13 三开关 + 连续曲率指数 A/B 取证日志去重键（logcat -s GlassKitBlur）。 */
    private var loggedEffectFlags: String? = null

    /** 一次性 prop 快照日志：首个 onDraw 打一条，核对桥接层实际到手的 prop 值。 */
    private var loggedPropsSnapshot: Boolean = false

    /**
     * it.11 嵌套取证一次性日志：lensActive 视图落在软画布（被下游玻璃采集 /
     * 快照回录）时透镜降级为模糊层、模糊走半采样链——打一条输入链证据
     * （logcat -s GlassKitBlur，与屏幕帧 lens input=gpu 交替出现即差异实锤）。
     */
    private var loggedNestedSoftRender: Boolean = false

    /* ------- it.9 闪烁取证计数（GlassKitFlicker） ------- */
    /** onDraw 累计帧序（含 isCapturing 短路帧）。 */
    private var flickerSeq: Long = 0L
    /** 上一次 onDraw 的 uptimeMillis（帧间隔计算）。 */
    private var flickerLastUptime: Long = 0L
    /** 帧间隔 <8ms 的帧数（异常高频重绘证据）。 */
    private var flickerFastFrames: Int = 0
    /** isCapturing 短路帧数（capture 重入路径）。 */
    private var flickerCaptureSkips: Int = 0
    /** recordFrameCache 回录次数（capturable 视图）。 */
    private var flickerRecordCount: Int = 0
    /** 透镜输入槽位写入次数（obtainLensInputShader 模糊路径）。 */
    private var flickerSlotWrites: Int = 0
    /** 节流调度打点上限（imm/delay 分支，防刷屏）。 */
    private var flickerSchedLogs: Int = 0

    private val capturePaint: Paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
    private val tintPaint: Paint = Paint(Paint.ANTI_ALIAS_FLAG)
    /** it.9 膜层专用 Paint（WHITE，alpha 每次 draw 重设）。 */
    private val membranePaint: Paint = Paint(Paint.ANTI_ALIAS_FLAG)
    /** it.14 指示器专属提亮专用 Paint（与 membranePaint 同构，实例复用零每帧分配）。 */
    private val indicatorBoostPaint: Paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val dimmingPaint: Paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val strokePaint: Paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        color = Color.WHITE
        // S1 修复：floor 取整（round(0.14*255)=36 → 36/255≈0.1412 微超 0.14；
        // floor=35 → 35/255≈0.1373 ≤ 0.14，alpha 契约恒不超出）
        alpha = floor(EDGE_HIGHLIGHT_ALPHA * 255f).toInt()
    }

    /**
     * it.7：顶/底高光窄带专用 Paint（shader 每帧 setShader 覆盖，TileMode.CLAMP；
     * alpha 由各带亮度控制，Paint 实例复用零每帧分配——每帧仅 2 个 LinearGradient
     * 小对象，QA 已确认按需重绘非逐帧，成本可接受）。
     */
    private val glowPaint: Paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
    }
    /** it.13 顶缘高光渐变专用 Paint（shader 每次 draw 重设，与 glowPaint 隔离）。 */
    private val topHighlightPaint: Paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        alpha = 255
    }
    /**
     * it.13 鲜活度：saturation=1.5 ColorMatrix（ColorFilterKt.java:16 / 75-85
     * colorControls(brightness=0, contrast=1, saturation=1.5) 实算）。
     * invSat=-0.5 ⇒ r=-0.1065 / g=-0.3575 / b=-0.036 / cs=1.5：
     * [1.3935,-0.3575,-0.036; -0.1065,1.1425,-0.036; -0.1065,-0.3575,1.464]。
     * 惰性构造一次，GPU 备选路径（VIBRANCY_SHADER_FALLBACK=false）的模糊链与
     * 清晰折射帧共用（API31+ 门控）；默认 shader 矩阵路径下不触发构造。
     */
    private val vibrancyColorFilter: ColorFilter by lazy {
        ColorMatrixColorFilter(
            ColorMatrix(
                floatArrayOf(
                    1.3935f, -0.3575f, -0.036f, 0f, 0f,
                    -0.1065f, 1.1425f, -0.036f, 0f, 0f,
                    -0.1065f, -0.3575f, 1.464f, 0f, 0f,
                    0f, 0f, 0f, 1f, 0f,
                ),
            ),
        )
    }
    private val clipPath: Path = Path()

    /** 背景目标视图（弱注册表解析结果，附 PreDraw 监听）。 */
    private var targetView: View? = null

    /**
     * it.7 POC 采集重入防护：玻璃视图位于 backdrop 子树内时（AppTabBar 接入，
     * GlassKitView 是 GlassKitBackdrop 的后代），capture() 内 targetView.draw()
     * 会再次触发本视图 onDraw——无防护则「onDraw → capture → draw → onDraw →
     * capture」无限递归栈溢出。置位期间 onDraw 直接返回（玻璃对采集位图零贡献，
     * 采集结果即玻璃下层的真实背景，同时规避自采集反馈环）。测试页路径玻璃与
     * backdrop 平级，防护天然不触发，行为不变。
     */
    private var isCapturing: Boolean = false

    /**
     * it.8：合成帧快照缓存（仅 capturable=true 视图维护）——嵌套采集重入降级用。
     * 时序推演（详见 drawGlassFrame / recordFrameCache 注释）：下游玻璃（backdropTag
     * 指向本视图）采集本视图时，若本视图恰处自身 capture 置位期（本视图在它所采集
     * 的 backdrop 子树内），onDraw 短路会让下游拿到透明空白帧。capturable 视图
     * 每次 onDraw 末尾回录合成帧到 frameCacheBitmap，短路时回放缓存而非空白。
     * 非 capturable 视图不建缓存，短路保持空白语义（backdrop 自采集时排除自身，
     * 即「玻璃对采集位图零贡献」的期望行为）。
     */
    private var frameCacheBitmap: Bitmap? = null
    private var frameCacheCanvas: Canvas? = null
    /** 快照回录进行中标记：回录链路内再触发短路时纯跳过（防缓存位图自绘别名）。 */
    private var recordingFrameCache: Boolean = false

    /** 采集位图缓存（尺寸随视图 / 降采样档变化重建）。 */
    private var captureBitmap: Bitmap? = null
    /** 近似模糊的小位图缓存（宽高 = 视图 / 降采样档；纯模糊路径专用）。 */
    private var smallBlurBitmap: Bitmap? = null
    /** it.3：小位图当前降采样系数（缓存按 (w,h,factor) 三元组判断重建）。 */
    private var smallBlurFactor: Int = 0

    /**
     * it.11：软画布降采样「逐级半采样链」中间位图缓存（obtainSmallBlurBitmap 用）。
     * 每级尺寸 = 上级 / 2，链长由 (w, h, factor) 决定——三者不变时逐层复用零分配；
     * 任一变化时整体重建（releaseBitmaps 一并释放）。
     */
    private val smallBlurChain = ArrayList<Bitmap>(3)

    /**
     * it.4：透镜输入位图双缓冲（ping-pong）——闪烁根因修复。
     * 单缓冲时 UI 线程每帧 eraseColor+重绘位图，而 RenderThread 的 BitmapShader
     * 仍在采样同一位图 → 跨帧竞态采样到全透明/半擦除帧 → 玻璃间歇变透明
     * （用户反馈「遮挡和不遮挡之间切换」）。双缓冲后第 N 帧写入的位图与第 N-1 帧
     * 被 RenderThread 采样的位图恒不同实例，竞态根除。
     */
    private val lensInputBuffers: Array<Bitmap?> = arrayOfNulls(4)
    /** it.4：双缓冲各自的 BitmapShader（绑定各自位图实例，位图重建时一并重建）。
     *  it.8：槽位扩 3——0/1 屏幕 ping-pong；槽 2 快照回录专用。
     *  it.9：扩为 4——CPU 回退路径 ping-pong 升级为三槽轮换（0/1/2，RT 回放落后
     *  ≤2 帧不碰撞），槽 3 快照回录专用（取证结论：静止期重绘风暴下 RT 落后可超
     *  1 帧，双槽会碰撞；回录槽位再隔离一档）。 */
    private val lensShaderInputs: Array<BitmapShader?> = arrayOfNulls(4)
    /** it.4：本帧写入的槽位（屏幕绘制路径 0/1/2 三槽轮换；快照回录固定槽 3）。 */
    private var lensInputSlot: Int = 0

    /* ------- it.4-R2（QA 回修）：小图 CPU box blur 缓冲与复用对象（零每帧分配） ------- */

    /** 各槽位像素缓冲（box blur 原地读写），尺寸随槽位位图复用。 */
    private val lensPixelBuffers: Array<IntArray?> = arrayOfNulls(4)
    /** box blur 水平/垂直 pass 的临时缓冲（UI 单线程使用，尺寸复用）。 */
    private var lensBlurTempBuffer: IntArray? = null
    /** 各槽位复用 Canvas（绑定槽位位图实例，位图重建时一并重建）。 */
    private val lensCanvases: Array<Canvas?> = arrayOfNulls(4)
    /** 三盒半径缓存（boxesForGauss 结果，radius 不变时复用）。 */
    private var lensBoxSizes: IntArray? = null
    private var lensBoxRadius: Int = -1
    /** 复用的输出/源缩放矩阵（避免每帧分配 Matrix）。 */
    private val lensMatrix: Matrix = Matrix()
    /** 复用的透镜输出 Paint（shader 每次 draw 重设）。 */
    private val lensPaint: Paint = Paint(Paint.ANTI_ALIAS_FLAG)
    /** 复用的降采样源矩形（避免每帧分配 RectF）。 */
    private val lensSrcRect: RectF = RectF()
    /**
     * blurScale≈0 清晰路径：零拷贝绑定全分辨率 capture 的 BitmapShader
     * （QA 观察项修复——恢复 it.3 全分辨率清晰折射观感）。capture 位图实例
     * 变化（尺寸重建）时重建；localMatrix 每帧重设（capture 可能超宽降采样）。
     */
    private var lensSharpShader: BitmapShader? = null
    private var lensSharpShaderCapture: Bitmap? = null

    /** API 31+ RenderNode 模糊路径的复用节点。 */
    private var blurRenderNode: RenderNode? = null

    /* ------- it.9 GPU 全分辨率透镜输入（纱窗感修复） ------- */

    /** 离屏渲染器（绑定 ImageReader surface；尺寸变化 / detach 时重建释放）。 */
    private var gpuRenderer: HardwareRenderer? = null
    /** 离屏录制节点：内容 = 全分辨率 capture 位图，effect = 高斯 RenderEffect。 */
    private var gpuNode: RenderNode? = null
    /** 离屏接收器：RGBA_8888 + GPU_COLOR_OUTPUT|GPU_SAMPLED，acquire 硬件缓冲。 */
    private var gpuReader: ImageReader? = null
    /** reader 尺寸（capture 位图尺寸，变化时重建）。 */
    private var gpuReaderWidth: Int = -1
    private var gpuReaderHeight: Int = -1
    /** 已包装硬件位图保留环（Image+Bitmap 配对，逐出即 close 归还缓冲）。 */
    private val gpuImageRing = ArrayList<Image>(GPU_IMAGE_RETAIN + 1)
    /** GPU 高斯 RenderEffect 缓存（sigma/尺寸/vibrancy 不变复用）。 */
    private var gpuBlurEffect: RenderEffect? = null
    private var gpuBlurSigma: Float = -1f
    private var gpuEffectWidth: Int = -1
    private var gpuEffectHeight: Int = -1
    /** it.13：缓存键补 vibrancy 开关（A/B 切换时强制重建 Effect）。 */
    private var gpuBlurVibrancy: Boolean = false
    /** it.13：清晰折射帧（blurRadiusPx<0.5）单独挂的 ColorFilterEffect 缓存。 */
    private var gpuVibrancyOnlyEffect: RenderEffect? = null
    /** 当前帧 GPU 输出的 BitmapShader（硬件位图实例逐帧更换，随换重建）。 */
    private var gpuInputShader: BitmapShader? = null
    private var gpuInputShaderBitmap: Bitmap? = null

    /** S2 修复：RenderEffect 缓存（半径/尺寸变化才重建，避免每帧新建；detach 释放）。 */
    private var blurEffect: RenderEffect? = null
    private var blurEffectRadiusPx: Float = -1f
    private var blurEffectWidth: Int = -1
    private var blurEffectHeight: Int = -1
    /** it.13：缓存键补 vibrancy 开关（A/B 切换时强制重建 Effect）。 */
    private var blurEffectVibrancy: Boolean = false

    /** API 33+ 透镜 RuntimeShader 缓存（源码静态，惰性创建；uBlurred / uniform 每次 draw 重设）。 */
    private var lensRuntimeShader: RuntimeShader? = null

    /** it.4：上次绘制时面板的 onScreen 坐标基线（PreDraw 位置变化检测用）。 */
    private val lastDrawnLocation: IntArray = IntArray(2)
    /** it.4：lastDrawnLocation 是否已初始化（首帧恒视为「位置已变化」）。 */
    private var hasLastDrawnLocation: Boolean = false
    /** it.4：位置检测复用缓冲（PreDraw 高频路径，避免每次分配 IntArray）。 */
    private val preDrawLocation: IntArray = IntArray(2)
    /**
     * it.4：自激励重绘环打断标记。自身 postInvalidate 引发的 traversal 不再续期——
     * 修复静止期无限 30~50fps 重绘（15s 静止日志 5872 行实测），功耗与竞态暴露窗口双降。
     * 外部刺激（backdrop 重绘 / prop 变更 / 面板位移）不设标记，照常调度。
     */
    private var selfInvalidationPending: Boolean = false

    /**
     * it.9 闪烁修复：prop 代数（真实外部刺激指纹，见 markPropChanged 注释）。
     * PreDraw 据此区分「真实 prop 变化」（重满外部预算）与「无关视图交叉触发」
     * （预算递减直至静止）。
     */
    private var propGeneration: Long = 0L
    /** PreDraw 侧已见过的 propGeneration（变化才视为真实刺激）。 */
    private var lastSeenPropGeneration: Long = -1L
    /** 背景源（GlassKitBackdropView / capturable GlassKitView）已见过的 drawGeneration。 */
    private var lastSeenSourceGeneration: Long = -1L

    /**
     * it.9 闪烁修复：静止期外部交叉触发重绘剩余预算。
     * 取证（GlassKitFlicker 真机日志）：6 玻璃视图的 PreDraw 统一挂在窗口根
     * observer，任一视图重绘全员收到 → 静止期持续 ~30fps 重绘风暴；it.4 的自激励
     * 打断只防「自身 postInvalidate 链」，防不住多视图互triggering。风暴使 UI 帧速
     * 超 RenderThread 回放 → 采样落后 ≥2 帧 → 双槽 ping-pong 碰撞（采样半擦除小
     * 图）= it.4 同款闪烁回归。修复：无关交叉触发按预算调度直至静止；真实刺激
     * （位移 / prop 代数变化 / 背景源 drawGeneration 变化）重满预算。
     */
    private var foreignRedrawBudget: Int = FOREIGN_REDRAW_BUDGET

    private val preDrawListener = ViewTreeObserver.OnPreDrawListener {
        // it.4 修复（抖动）：面板 onScreen 位置变化（拖动 / 滚动）→ 立即 invalidate
        // 绕过 33ms 节流——重绘帧内 onDraw 用 getLocationOnScreen 现值采集，内容与
        // 面板框逐帧对齐；旧逻辑下未重跑 onDraw 的帧按旧位图在新位置重放，
        // 内容相对面板框瞬移（120Hz 真机上每两帧一跳即「拖动抖动」）。
        getLocationOnScreen(preDrawLocation)
        val moved = !hasLastDrawnLocation ||
            preDrawLocation[0] != lastDrawnLocation[0] ||
            preDrawLocation[1] != lastDrawnLocation[1]
        // 背景源真实重绘指纹（it.9）：采集目标自身 hw 绘制时自增（见各源类）。
        // 捕获路径的软画布绘制不计入（capture 的 targetView.draw 是采集机制本身，
        // 不是内容变化——若计入，面板互相采集会重演风暴）。
        val sourceGeneration = when (val target = targetView) {
            is GlassKitBackdropView -> target.drawGeneration
            is GlassKitView -> target.drawGeneration
            else -> -1L
        }
        if (moved) {
            // it.9：位移是真实外部刺激，重满外部重绘预算
            foreignRedrawBudget = FOREIGN_REDRAW_BUDGET
            invalidate()
        } else if (selfInvalidationPending) {
            // it.4 修复（闪烁伴生）：本次 traversal 由自身 postInvalidate 触发
            // → 不再续期；it.9：自绘消费不续预算（防风暴复活）
            selfInvalidationPending = false
        } else if (propGeneration != lastSeenPropGeneration) {
            // it.9：prop 真实变化（滑块拖动 / blurEnabled / backdropTag 等）→ 重满
            lastSeenPropGeneration = propGeneration
            foreignRedrawBudget = FOREIGN_REDRAW_BUDGET
            scheduleThrottledInvalidate()
        } else if (sourceGeneration >= 0L && sourceGeneration != lastSeenSourceGeneration) {
            // it.9：背景源真实重绘（滚动 / 背景动画 / 下层玻璃内容变化）→ 重满
            lastSeenSourceGeneration = sourceGeneration
            foreignRedrawBudget = FOREIGN_REDRAW_BUDGET
            scheduleThrottledInvalidate()
        } else if (foreignRedrawBudget > 0) {
            // it.9：无关交叉触发按预算调度——预算递减，耗尽即静止（风暴打断）
            foreignRedrawBudget--
            scheduleThrottledInvalidate()
        }
        // it.9：预算耗尽的无关 PreDraw 直接忽略（等待真实刺激）
        true // 恒返回 true：只监听，不拦截背景树自身的绘制
    }

    /** E2 修复：实际挂 OnPreDrawListener 的 ViewTreeObserver 实例缓存。
     *  backdrop 先卸载时其 observer 会 merge 进根 observer 且 isAlive=false，
     *  仅靠 target.viewTreeObserver 移除会静默失败 → listener 强引用本视图泄漏。 */
    private var attachedObserver: ViewTreeObserver? = null

    /** E3 修复：backdrop 晚挂载时 resolveTarget 空结果的有限重试计数。 */
    private var pendingResolveRetries: Int = 0

    private var lastInvalidateAt: Long = 0L

    /** 硬件模糊能力：只按 SDK_INT 判（清单 §二.2 / 任务书「isHardwareAvailable」）。 */
    val isHardwareAvailable: Boolean
        get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

    /* ---------------- 生命周期与重绘触发 ---------------- */

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        // it.8：capturable 视图「挂载即注册」（同 GlassKitBackdropView 策略——此时
        // id 已由 RN 定稿，消除「props 注册点错过 attach 时序」的竞态；NO_ID 由
        // register 按原语义拒绝）。
        if (capturable) GlassCaptureEngine.register(id, this)
        // E1 修复：无条件重挂 PreDraw 监听。detach→re-attach 后 targetView 不变，
        // resolveTarget 的 oldTarget===newTarget 早退分支会跳过 attach，
        // 而 onDetachedFromWindow 已把 listener 摘掉 → 玻璃永不再跟随。
        // attachPreDraw 自身幂等（挂前先安全移除），重复调用不产生重复 listener。
        resolveTarget()
        attachPreDraw()
    }

    override fun onDetachedFromWindow() {
        // it.8：capturable 视图对称注销，防跨窗口注册表滞留
        if (capturable) GlassCaptureEngine.unregister(id)
        // it.8：合成帧快照随窗口释放（重挂后首次 onDraw 重建）
        frameCacheBitmap?.let { if (!it.isRecycled) it.recycle() }
        frameCacheBitmap = null
        frameCacheCanvas = null
        detachPreDraw()
        // S2 修复：RenderEffect 缓存随 detach 释放，不留跨窗口引用
        releaseBlurEffect()
        // it.9：GPU 离屏链路（Image 环 / reader / renderer）随 detach 释放
        releaseGpu()
        // E2 修复：不跨窗口持有 backdrop 视图引用（重挂载时 resolveTarget 会从
        // 注册表重新解析，早退分支依赖的 targetView 重建后依然正确）
        targetView = null
        // it.4：重置位置基线与自激励标记（重新 attach 后首帧按「位置已变化」处理）
        hasLastDrawnLocation = false
        selfInvalidationPending = false
        super.onDetachedFromWindow()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        releaseBitmaps()
        invalidate()
    }

    /** 解析背景目标并挂 PreDraw 监听（幂等；onDraw 中目标缺失时也会惰性重试）。 */
    private fun resolveTarget() {
        val newTarget = if (backdropTag == View.NO_ID) null else GlassCaptureEngine.find(backdropTag)
        // E3 修复：backdrop 晚于玻璃面板挂载时，目标缺失且无任何 invalidate 来源，
        // 玻璃会永远卡兜底底色。这里给「有限重试」：100ms 延迟 invalidate 排队，
        // 上限 TARGET_RETRY_MAX 次（≈5s），找到目标或超上限即停，不无限循环。
        if (newTarget == null && backdropTag != View.NO_ID) {
            if (pendingResolveRetries < TARGET_RETRY_MAX) {
                pendingResolveRetries++
                postInvalidateDelayed(TARGET_RETRY_DELAY_MS)
            }
        } else {
            pendingResolveRetries = 0
        }
        val oldTarget = targetView
        if (oldTarget === newTarget) return
        detachPreDraw()
        targetView = newTarget
        attachPreDraw()
    }

    /** 挂 PreDraw 监听（幂等：挂前先安全移除再挂，支持 onAttachedToWindow 无条件调用）。 */
    private fun attachPreDraw() {
        val target = targetView ?: return
        detachPreDraw()
        val observer = target.viewTreeObserver
        if (!observer.isAlive) return
        observer.addOnPreDrawListener(preDrawListener)
        // E2 修复：登记实际挂载的 observer 实例，detach 时优先用它移除
        attachedObserver = observer
    }

    private fun detachPreDraw() {
        // E2 修复 + F1 修复：三级降级移除链（任何一级成功移除即止，最后统一
        // 清空 attachedObserver 缓存，确保无残留引用）。
        //
        // F1 泄漏时序（QA Round 2 场景①残余）：glass attach 时 backdrop 尚未
        // attach → listener 挂在 backdrop 的【子 ViewTreeObserver】上 → backdrop
        // attach 后子 observer merge 进窗口根 observer、子 observer 变 dead
        // （attachedObserver.isAlive=false）→ backdrop 先卸载（glass 仍 attached）
        // → glass 后 detach：cached dead 不命中第一步；降级第二步里 targetView
        // 就是已卸载的 backdrop 本身，其 observer 同样 dead/无效 → merge 时拷贝
        // 进根 observer 的 listener 滞留，glass View 被强引用泄漏至窗口销毁。
        // ⇒ 新增第三步：用 glass 自身 viewTreeObserver 移除——glass 在 attach
        // 期间它就是窗口根 observer，merge 拷贝进根 observer 的 listener 可由此
        // 摘除。
        var removed = false

        // 第一步：优先用缓存的实际挂载实例移除
        val cached = attachedObserver
        if (cached != null && cached.isAlive) {
            try {
                cached.removeOnPreDrawListener(preDrawListener)
                removed = true
            } catch (_: Exception) {
                // 移除失败则落到下一级降级路径
            }
        }

        // 第二步：cached dead / 缺失时，用合并后的存活 observer 再试（merge 时
        // listener 会被拷贝进目标 observer，backdrop 未卸载场景通常在此成功）
        if (!removed) {
            targetView?.viewTreeObserver
                ?.takeIf { it.isAlive }
                ?.let { observer ->
                    try {
                        observer.removeOnPreDrawListener(preDrawListener)
                        removed = true
                    } catch (_: Exception) {
                        // 落到第三步
                    }
                }
        }

        // 第三步（F1）：targetView 的 observer 不可达/无效（backdrop 已先卸载）
        // 时，用 glass 自身 viewTreeObserver 移除。onDetachedFromWindow 内访问
        // 自身 viewTreeObserver 合法，但仍做判空 + try 防御，杜绝任何异常打断
        // detach 清理链。
        if (!removed) {
            val selfObserver = try {
                viewTreeObserver?.takeIf { it.isAlive }
            } catch (_: Exception) {
                null
            }
            selfObserver?.let { observer ->
                try {
                    observer.removeOnPreDrawListener(preDrawListener)
                } catch (_: Exception) {
                    // 全路径失败：listener 滞留与旧行为一致，不再抛出打断 detach
                }
            }
        }

        // E2/F1 修复：detach 后清空缓存，确保无残留引用
        attachedObserver = null
    }

    /**
     * it.9 闪烁修复：prop 代数指纹（真实外部刺激标记）。
     * 仅 prop setter 经本方法触发重绘时自增 propGeneration——PreDraw 据此区分
     * 「真实 prop 变化」（重满预算）与「无关视图交叉触发」（预算递减直至静止）。
     * ⚠️ 不能在 invalidate() 覆写里打指纹：节流延迟帧（postInvalidateDelayed）的
     * 标志可能已被无关 traversal 的 PreDraw 提前消费，该帧 invalidate 会被误判为
     * prop 变化 → 重满预算 → 6 视图互相喂帧的重绘风暴永不停歇（真机取证复现）。
     */
    private fun markPropChanged() {
        propGeneration++
        invalidate()
    }

    /** 33ms 节流：到点直接 invalidate，未到点用 postInvalidateDelayed 排队到下一拍。
     *  it.4：自激励环打断——本方法设置的 selfInvalidationPending 会让「由本调用引发的
     *  traversal」的 PreDraw 不再续期（见 preDrawListener）。
     *  it.9：延迟分支同样置位（旧实现漏置——延迟帧被误判为外部刺激，风暴通道之一）。 */
    private fun scheduleThrottledInvalidate() {
        val now = SystemClock.uptimeMillis()
        val elapsed = now - lastInvalidateAt
        if (elapsed >= FRAME_INTERVAL_MS) {
            lastInvalidateAt = now
            selfInvalidationPending = true
            // it.9 取证：imm = 立即排队（自激励环入口）
            if (flickerSchedLogs < 600) {
                flickerSchedLogs++
                Log.i(FLICKER_LOG_TAG, "view=$id sched=imm elapsed=${elapsed}ms budget=$foreignRedrawBudget")
            }
            postInvalidate()
        } else {
            selfInvalidationPending = true
            // it.9 取证：delay = 延迟排队
            if (flickerSchedLogs < 600) {
                flickerSchedLogs++
                Log.i(FLICKER_LOG_TAG, "view=$id sched=delay elapsed=${elapsed}ms budget=$foreignRedrawBudget")
            }
            postInvalidateDelayed(FRAME_INTERVAL_MS - elapsed)
        }
    }

    private fun releaseBitmaps() {
        captureBitmap?.recycle()
        captureBitmap = null
        // it.11：半采样链中间位图一并释放（随降采样档 / 尺寸重建）
        for (chainBitmap in smallBlurChain) {
            if (!chainBitmap.isRecycled) chainBitmap.recycle()
        }
        smallBlurChain.clear()
        // it.9：GPU 离屏链路随位图释放一并重建（reader 尺寸随 capture 变化）
        releaseGpu()
        // it.8：尺寸变化时快照缓存一并释放（下一次 onDraw 末尾按新尺寸重建）
        frameCacheBitmap?.let { if (!it.isRecycled) it.recycle() }
        frameCacheBitmap = null
        frameCacheCanvas = null
        smallBlurBitmap?.recycle()
        smallBlurBitmap = null
        smallBlurFactor = 0
        // it.4：双缓冲与各自 BitmapShader 一并释放（shader 强引用位图，
        // 不清会持有已 recycle 位图，RenderThread 采样有崩溃风险）
        for (i in lensInputBuffers.indices) {
            lensInputBuffers[i]?.let { if (!it.isRecycled) it.recycle() }
            lensInputBuffers[i] = null
            lensShaderInputs[i] = null
            // it.4-R2：像素缓冲 / Canvas 随槽位位图一并失效
            lensPixelBuffers[i] = null
            lensCanvases[i] = null
        }
        lensInputSlot = 0
        // it.4-R2：box blur 临时缓冲与三盒半径缓存一并失效
        lensBlurTempBuffer = null
        lensBoxSizes = null
        lensBoxRadius = -1
        // it.4-R2：清晰路径 shader 持有 capture 位图引用，一并失效
        lensSharpShader = null
        lensSharpShaderCapture = null
        // it.4：RuntimeShader 经 setInputShader 持有 BitmapShader → 位图引用链，
        // 位图已释放，shader 缓存一并失效（重建成本 = 一次 AGSL 解析，可忽略）
        lensRuntimeShader = null
        blurRenderNode = null
        // S2 修复：尺寸变化路径同样释放 RenderEffect 缓存
        releaseBlurEffect()
    }

    /** S2 修复：释放 RenderEffect 缓存（detach / 尺寸变化时调用）。 */
    private fun releaseBlurEffect() {
        blurEffect = null
        blurEffectRadiusPx = -1f
        blurEffectWidth = -1
        blurEffectHeight = -1
        blurEffectVibrancy = false
    }

    /* ---------------- 渲染管线 ---------------- */

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        // it.9：真实屏幕绘制代数自增（仅 hw 画布；软画布 = 被下游采集 / 回录，非内容变化）
        if (canvas.isHardwareAccelerated) drawGeneration++
        // it.9 闪烁取证：帧序 / 帧间隔 / 短路与回录计数（前 600 帧逐帧，之后每 300 帧）
        flickerSeq++
        val now = SystemClock.uptimeMillis()
        val delta = if (flickerLastUptime > 0L) now - flickerLastUptime else -1L
        flickerLastUptime = now
        if (delta in 1..8) flickerFastFrames++
        val fullLog = flickerSeq <= FLICKER_LOG_FULL_FRAMES
        if (fullLog || flickerSeq % FLICKER_LOG_STEP == 0L) {
            Log.i(
                FLICKER_LOG_TAG,
                "view=$id seq=$flickerSeq delta=${delta}ms fast=$flickerFastFrames" +
                    " skips=$flickerCaptureSkips records=$flickerRecordCount" +
                    " slotWrites=$flickerSlotWrites hw=${canvas.isHardwareAccelerated}",
            )
        }
        // it.7 POC 采集重入防护：capture() 经 backdrop.draw 间接触发本 onDraw 时
        // 直接跳过（见 isCapturing 注释），防止无限递归与自采集反馈。
        // it.8 嵌套采集降级：capturable 视图（可能被下游玻璃采集）在重入短路时
        // 回放最近一次合成帧快照而非空白（下游不再拿到透明帧）；快照回录期间
        // （recordingFrameCache）仍纯短路，防缓存位图自绘别名。非 capturable
        // 视图维持空白短路（backdrop 自采集时排除自身的期望语义不变）。
        if (isCapturing) {
            flickerCaptureSkips++
            if (capturable && !recordingFrameCache) {
                frameCacheBitmap?.let { snap ->
                    if (!snap.isRecycled && width > 0 && height > 0) {
                        canvas.drawBitmap(
                            snap,
                            null,
                            RectF(0f, 0f, width.toFloat(), height.toFloat()),
                            capturePaint,
                        )
                    }
                }
            }
            return
        }
        drawGlassFrame(canvas)
        // it.9 取证结论修复：快照回录只在屏幕帧（hw 画布）做——采集链路内的软画布
        // onDraw（下游玻璃 capture 触发）回录是纯浪费：内容与刚画完的屏幕帧相同，
        // 且每次回录都重跑一次 backdrop 采集（取证日志 records≈seq：dock 每帧双管线）。
        if (capturable && canvas.isHardwareAccelerated) recordFrameCache()
    }

    /**
     * it.8：回录当前合成帧到快照缓存（仅 capturable 视图、正常 onDraw 末尾调用）。
     * 完整重跑 drawGlassFrame（含重新采集 backdrop 子树）——capturable 视图数量
     * 少（当前仅测试页 demo dock），且重绘受 33ms 节流约束，双倍成本可接受。
     * 透镜管线在回录期间走专用槽 2（不覆写屏幕帧的 ping-pong 槽位，见
     * lensShaderInputs 注释）；清晰路径（blurRadiusPx<0.5）零拷贝绑定 capture
     * 位图，回录重采样的变异窗口与既有「RenderThread 采样 captureBitmap 跨帧
     * 竞态」暴露等价，不另加防护。
     */
    private fun recordFrameCache() {
        val w = width
        val h = height
        if (w <= 0 || h <= 0) return
        var bitmap = frameCacheBitmap
        if (bitmap == null || bitmap.width != w || bitmap.height != h) {
            if (bitmap != null && !bitmap.isRecycled) bitmap.recycle()
            bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            frameCacheBitmap = bitmap
            frameCacheCanvas = Canvas(bitmap)
            // it.11 取证日志：快照分辨率/格式（仅尺寸变化时打一条）——核对嵌套采集
            // 回放源是否全分辨率（logcat -s GlassKitBlur）
            Log.i(logTag, "frameCache snapshot: view=$id bitmap=${w}x$h config=${bitmap.config}")
        }
        val cacheCanvas = frameCacheCanvas ?: return
        bitmap!!.eraseColor(Color.TRANSPARENT)
        flickerRecordCount++
        recordingFrameCache = true
        try {
            drawGlassFrame(cacheCanvas)
        } finally {
            recordingFrameCache = false
        }
    }

    /**
     * it.8：完整玻璃渲染管线（原 onDraw 主体抽出，屏幕绘制与快照回录共用）。
     * onDraw 管线：
     * 1. 捕获：GlassCaptureEngine 按 backdropTag 找背景视图，采玻璃覆盖区（失败画兜底底色）；
     * 2. 模糊：API 31+ 且画布硬件加速 → RenderNode + RenderEffect.createBlurEffect；
     *    API 26–30 / 软件画布 → 固定档降采样 1/6 + 双线性放大近似（H2 单档语义）；
     * 3. 透镜（API 33+）：1/4 降采样 + 小图 CPU box blur ×3 近似高斯输入 +
     *    AGSL RuntimeShader 折射/色散（it.4-R2 真模糊化输入）；
     * 4. tint：tintColor withAlpha(min(tintAlpha * tintScale, 0.12)) —— H1 硬约束钳制；
     * 5. 压暗：#000 @ dimmingAlpha；
     * 6. 高光：顶/底窄带非线性渐变 + 1dp 发丝线（it.8：发丝线随顶/底加强倍率缩放）；
     * 7. 裁剪：圆角矩形 Path clip。
     */
    private fun drawGlassFrame(canvas: Canvas) {
        if (!loggedPropsSnapshot) {
            loggedPropsSnapshot = true
            Log.i(
                logTag,
                "props snapshot: blurDp=$blurDp blurScale=$blurScale tintAlpha=$tintAlpha" +
                    " tintColor=$tintColor tintScale=$tintScale lensScale=$lensScale" +
                    " refractionPx=$refractionPx dispersionPx=$dispersionPx" +
                    " cornerRadiusDp=$cornerRadiusDp dimmingAlpha=$dimmingAlpha" +
                    " membraneAlpha=$membraneAlpha highlightScale=$highlightScale" +
                    " chromatic=$chromaticEnabled depth=$depthEffect vibrancy=$vibrancyEnabled" +
                    " capsuleContinuous=$capsuleContinuous indicatorBoostAlpha=$indicatorBoostAlpha" +
                    " blurEnabled=$blurEnabled backdropTag=$backdropTag size=${width}x$height",
            )
        }
        val w = width
        val h = height
        if (w <= 0 || h <= 0) return

        // it.4：记录本帧 onScreen 位置基线（PreDraw 位置变化检测用；layout 已完成，
        // 此处取值即本帧最终位置）
        getLocationOnScreen(lastDrawnLocation)
        hasLastDrawnLocation = true

        // ⑦ 圆角裁剪：所有层（含采集 / 模糊 / tint / 压暗 / 描边）统一走 clip
        // it.5 修复：JS 侧惯用 radii.pill=999dp 表达胶囊 → cornerRadiusPx 远超半尺寸时
        // AGSL sdRoundRect 判定整个视图在形外（SDF>0 → shader 全透明）→ 透镜层整块消失
        //（胶囊无模糊/折射/透镜的根因）。钳到 min(w,h)/2 即标准胶囊语义，与 Skia
        // clip 路径自带的钳制行为对齐；普通面板半径小于半尺寸，钳制零影响。
        val cornerRadiusPx = minOf(cornerRadiusDp * density, minOf(w, h) / 2f)
        // it.13：本帧统一超椭圆指数（Path 与 AGSL SDF 共用，一次计算全帧复用）。
        // 胶囊 / 正方形命中 cornerExponent 的 n=2 硬守卫 → 严格圆弧，it.12 零回归；
        // 容器面板 r=24（GlassShape.container）→ n≈4，G2 连续曲率。
        // it.14 Continuous Capsule：dock bar / 指示器 / 顶栏演示件显式开启
        // capsuleContinuous，且半径已钳到半短边（真胶囊，999→h/2）时，把本帧
        // n 局部覆盖为 CAPSULE_CONTINUOUS_N=3.0f，让角部走 G2 连续曲率端帽；
        // r 与视图矩形边界一字不动（仍是真胶囊、端帽 x 极值不变）。
        // ⚠️ 仅删 ContinuousRoundRect.kt:82 守卫无效——:80-81 的 blend 在 t=1
        //    已独立把 n 压回 2（双重保险），故必须在调用侧覆盖，且只覆盖本帧局部变量。
        // 其余情况（hero/chip/工具条/clear 的 r=24、未开启的胶囊、正方形）一律保持
        // 原 cornerExponent() 结果，逐位零回归。
        // 0.5f 与 ContinuousRoundRect.kt:67 的胶囊守卫容差同源（本类不新增常量）。
        // 覆盖后的 n 走完整链路：:1194 clipPath → :1245 drawLensLayer →
        // :1489 obtainLensShader → :2134 setFloatUniform("uCornerExponent", n)，
        // 硬件帧 Path 与 AGSL SDF 同 n=3.0；回录帧不创建 RuntimeShader，
        // clipPath 仍用同一 n，与 it.13 现状一致、不新增差异。
        val halfMin = minOf(w, h) / 2f
        val isCapsule = cornerRadiusPx >= halfMin - 0.5f
        val cornerExponentN = if (capsuleContinuous && isCapsule) {
            CAPSULE_CONTINUOUS_N
        } else {
            ContinuousRoundRect.cornerExponent(w.toFloat(), h.toFloat(), cornerRadiusPx)
        }
        if (cornerRadiusPx > 0f) {
            ContinuousRoundRect.buildContinuousRoundRect(
                clipPath, w.toFloat(), h.toFloat(), cornerRadiusPx, cornerExponentN,
            )
            canvas.clipPath(clipPath)
        }

        // 目标缺失时惰性重试（backdrop 可能晚于玻璃面板挂载）
        if (targetView == null && backdropTag != View.NO_ID) {
            resolveTarget()
        }

        // ① 捕获（isCapturing 置位期间 backdrop.draw 重入本 onDraw 会被顶部短路）
        // it.10：lensActive 的硬件画布帧强制全分辨率 capture（透镜输入不做超宽
        // 降采样；模糊路径保留降采样语义）。lensActive 须在采集前算好（参数依赖）。
        val blurRadiusPx = blurDp * blurScale * density
        val lensActive = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            lensScale > 0f && (refractionPx > 0f || dispersionPx > 0f)
        val capture = obtainCaptureBitmap(
            w,
            h,
            allowDownsample = !(lensActive && canvas.isHardwareAccelerated),
        )
        // it.11 嵌套取证：软画布 + 透镜激活 = 本视图正被下游玻璃采集或回录快照，
        // 透镜输入是「软画布降级渲染」（透镜→blur、blur→半采样链）——与屏幕帧的
        // lens input=gpu 交替出现即为「dock 正常 / 指示器锯齿」差异链路证据
        if (lensActive && !canvas.isHardwareAccelerated && !loggedNestedSoftRender) {
            loggedNestedSoftRender = true
            Log.i(
                logTag,
                "nested soft render: view=$id lensDowngraded=blur" +
                    " inputCapture=${capture?.width}x${capture?.height} config=${capture?.config}" +
                    " blurChain=BLUR_DOWNSAMPLE/$BLUR_DOWNSAMPLE(逐级半采样)",
            )
        }
        val captureOk = try {
            isCapturing = true
            capture != null &&
                targetView != null &&
                GlassCaptureEngine.capture(targetView!!, this, capture!!)
        } finally {
            isCapturing = false
        }

        if (blurEnabled && captureOk && capture != null) {
            // ② 模糊 + ③ 透镜
            // 软件画布不支持 RuntimeShader（快照回录用 Bitmap 软画布，it.8 真机崩溃实证），
            // 回录帧透镜降级为模糊/清晰层；屏幕硬件加速路径不受影响
            if (lensActive && canvas.isHardwareAccelerated) {
                // it.4-R2：透镜输入真模糊化——固定 1/4 降采样 + 小图 CPU box blur ×3
                //（it.3 的自适应降采样近似已废弃为锯齿源，见类头注释）
                drawLensLayer(
                    canvas, capture, w, h, cornerRadiusPx, blurRadiusPx, cornerExponentN,
                )
            } else if (blurRadiusPx >= 0.5f) {
                drawBlurredLayer(canvas, capture, blurRadiusPx)
            } else {
                // 无模糊需求（blurDp=0 或 blurScale=0）：直接画清晰采集结果
                drawCaptureScaled(canvas, capture, w, h)
            }
        } else if (!blurEnabled || !captureOk) {
            // ① 失败兜底：半透明底色（总开关关闭时同样走兜底，不做任何采集）
            canvas.drawColor(FALLBACK_COLOR)
        }

        // ④ tint：H1 硬约束——任何 tint 计算最后一步钳到 0.12
        val finalTintAlpha = (tintAlpha * tintScale).coerceIn(0f, DEFAULT_TINT_ALPHA_MAX)
        if (tintColor != 0 && finalTintAlpha > 0f) {
            tintPaint.color = tintColor
            // S1 修复：floor 取整（round(0.12*255)=31 → 31/255≈0.1216 微超 0.12；
            // floor=30 → 30/255≈0.1176 ≤ 0.12，H1 契约恒不超出）
            tintPaint.alpha = floor(finalTintAlpha * 255f).toInt()
            canvas.drawRect(0f, 0f, w.toFloat(), h.toFloat(), tintPaint)
        }

        // ③′ it.14 指示器专属提亮（③tint 阶段的第二笔 rect，不新增阶段编号）：
        // Kotlin 出处 GlassKitKt.java:1434-1435,1451 —— Color.White.copy(alpha=0.05f)
        // 作为 GlassSurface 第 5 参 tint 传入 → GlassSurfaceKt.java:704-708 的
        // drawRect($tint)；第 1 笔 level tint（:703）因 INDICATOR tintAlpha=0 全透明，
        // 全量核查只有 INDICATOR 传非 Unspecified tint（其余面板传 0L）。
        // Kotlin 无对应滑块（SettingsScreenKt.java:1898-2128）⇒ 硬编码常量，
        // native 也不加滑块 / 不加开关 / 不内联 rgba / fallback 分支不加。
        // 叠加顺序：③tint → ③′boost → ④.5 膜层 → ⑤压暗 → ⑥.0 18dp 顶缘 → ⑥ 高光，
        // 与 Kotlin :703→:708→:710-713 一一对应；不重排任何既有绘制阶段。
        // H1：不进 finalTintAlpha 公式、不乘 tintScale、不进 glass.ts resolveTintAlpha；
        // setter 已 coerceIn(0f, DEFAULT_TINT_ALPHA_MAX=0.12f)，单层 ≤0.05，
        // floor 取整口径同 :1264 / :1291 / :1333。默认 0 ⇒ 其它面板逐位等价 it.13。
        if (indicatorBoostAlpha > 0f) {
            indicatorBoostPaint.color = Color.WHITE
            indicatorBoostPaint.alpha = floor(indicatorBoostAlpha * 255f).toInt()
            canvas.drawRect(0f, 0f, w.toFloat(), h.toFloat(), indicatorBoostPaint)
        }

        // ④.5 膜层（it.9）：WHITE @ membraneAlpha——实例库「膜层」的等效物
        // （通透度越低膜越厚）。绘制顺序在 tint 之后、压暗之前（任务书规格）；
        // 原生侧绘制，不产生 JS 内联 rgba，glass-guard inline-rgba 计数无影响。
        if (membraneAlpha > 0f) {
            membranePaint.color = Color.WHITE
            membranePaint.alpha = Math.round(membraneAlpha * 255f)
            canvas.drawRect(0f, 0f, w.toFloat(), h.toFloat(), membranePaint)
        }

        // ⑤ 压暗：#000 @ dimmingAlpha（独立于 tint）
        if (dimmingAlpha > 0f) {
            dimmingPaint.color = Color.BLACK
            dimmingPaint.alpha = Math.round(dimmingAlpha.coerceIn(0f, 1f) * 255f)
            canvas.drawRect(0f, 0f, w.toFloat(), h.toFloat(), dimmingPaint)
        }

        // ⑥.0 it.14-fix1 底缘高光 18dp 渐变（参数同 it.13，仅位置由顶缘改到底缘）：
        // highlightScale>0.01 时画竖向 [White@(0.22×scale), Transparent]，
        // 从 y=h 向 y=h-18dp×density 衰减，仅底缘（顶缘不画）。默认 0.2 ⇒ 起始 alpha 0.044。
        // 变量名 topAlpha / topColor / topHighlightPaint 沿用 it.13 不做重命名，diff 最小。
        // 原有 glow 顶/底双带 + 发丝线（⑥）保留但降为「扩展调试」语义，引擎代码不删。
        if (highlightScale > 0.01f) {
            val topAlpha = (TOP_HIGHLIGHT_ALPHA * highlightScale).coerceIn(0f, 1f)
            // floor 取整：保证 alpha 严格不超过契约值（同 tint / 描边 S1 口径）
            val topColor = (floor(topAlpha * 255f).toInt() shl 24) or 0x00FFFFFF
            val gradientEndY = TOP_HIGHLIGHT_DP * density
            val hF = h.toFloat()
            val bandTop = hF - minOf(gradientEndY, hF)
            topHighlightPaint.shader = LinearGradient(
                0f, hF, 0f, bandTop,
                intArrayOf(topColor, Color.TRANSPARENT),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP,
            )
            canvas.drawRect(
                0f, bandTop, w.toFloat(), hF, topHighlightPaint,
            )
            topHighlightPaint.shader = null
        }

        // ⑥ 边缘高光（it.7 重做）：调研来源——Apple Liquid Glass 边缘高光是
        //    「贴轮廓的窄带」：轮廓边缘最亮、向内快速非线性衰减（凸形剖面：陡在
        //    边缘、平在内部，参考高度剖面 h(x)=(1-(1-x)^4)^(1/4)，以 LinearGradient
        //    多 stop 逼近）；顶部显著亮于底部（参考 top:bottom:sides ≈ 0.55:0.30:0.20）。
        //    it.6 的「上/下半 clipRect + 两次均匀描边」已删除——高光取代描边，不是
        //    描边+渐变叠加。带深度 = 「宽度」滑块语义：向内渐变的深度；顶/底带矩形
        //    由外层 clipPath（⑦ 圆角裁剪）统一裁剪，圆角处自动贴合。左右侧带本轮
        //    不做（顶/底优先），侧缘以 1dp 发丝线补足轮廓感。
        if (cornerRadiusPx > 0f) {
            val glow = glowScale.coerceIn(0.05f, 2f)
            // 带深度：1dp × glowScale × glowWidthScale，clamp 1–8dp（it.6 四 prop 全沿用）
            val bandDp =
                (EDGE_HIGHLIGHT_DP * glow * glowWidthScale.coerceIn(0.2f, 4f)).coerceIn(1f, 8f)
            val bandPx = minOf(bandDp * density, h / 2f)
            // 亮度：base = 0.14 × glowScale × glowAlphaScale；顶/底带分别乘
            // glowTopScale / glowBottomScale（语义与 it.6 一致，终值 clamp 0–1）
            val baseAlpha =
                (EDGE_HIGHLIGHT_ALPHA * glow * glowAlphaScale.coerceIn(0f, 4f)).coerceIn(0f, 1f)
            val topAlpha = (baseAlpha * glowTopScale.coerceIn(0f, 4f)).coerceIn(0f, 1f)
            val bottomAlpha = (baseAlpha * glowBottomScale.coerceIn(0f, 4f)).coerceIn(0f, 1f)
            if (bandPx > 0f && (topAlpha > 0f || bottomAlpha > 0f)) {
                val wF = w.toFloat()
                val hF = h.toFloat()
                // 顶带：y=0（边缘最亮）→ y=bandPx（透明），垂直 CLAMP，多 stop 非线性衰减
                glowPaint.shader = LinearGradient(
                    0f, 0f, 0f, bandPx,
                    GLOW_BAND_COLORS, GLOW_BAND_POSITIONS, Shader.TileMode.CLAMP,
                )
                glowPaint.alpha = floor(topAlpha * 255f).toInt()
                canvas.drawRect(0f, 0f, wF, bandPx, glowPaint)
                // 底带：y=h（边缘最亮）→ y=h-bandPx（透明）
                glowPaint.shader = LinearGradient(
                    0f, hF, 0f, hF - bandPx,
                    GLOW_BAND_COLORS, GLOW_BAND_POSITIONS, Shader.TileMode.CLAMP,
                )
                glowPaint.alpha = floor(bottomAlpha * 255f).toInt()
                canvas.drawRect(0f, hF - bandPx, wF, hF, glowPaint)
                glowPaint.shader = null
                // 发丝线：沿轮廓 1dp 白线补足侧缘/界定边缘。it.8：alpha 再乘
                // max(glowTopScale, glowBottomScale)（clamp 0–1）——按用户语义
                // 「顶/底滑块全关 = 完全无高光」处理：发丝线是轮廓界定元素，
                // 任一缘仍有高光时按较强缘的强度保留（轮廓感与该缘实际亮度一致）；
                // 两缘全零时 alpha 归零随带层一并消失。选 max 而非 (top+bottom)/2：
                // 均值会让「只开一缘」时轮廓亮度低于该缘实际高光，观感脱节。
                val hairlineEdgeFactor =
                    maxOf(glowTopScale, glowBottomScale).coerceIn(0f, 1f)
                val hairlineAlpha =
                    floor((GLOW_HAIRLINE_ALPHA * baseAlpha * hairlineEdgeFactor) * 255f).toInt()
                if (hairlineAlpha > 0) {
                    strokePaint.strokeWidth = density
                    strokePaint.alpha = hairlineAlpha
                    canvas.drawPath(clipPath, strokePaint)
                }
            }
        }
    }

    /**
     * 采集位图缓存：宽度超 MAX_CAPTURE_WIDTH_PX 时按比例降采样，视图尺寸变化时
     * 重建。返回 null 表示无法预算（视图尺寸异常）。
     * it.10：透镜路径（lensActive 硬件画布帧）传 allowDownsample=false 强制全分辨率
     * ——透镜输入不做超宽降采样（小图放大 = 已登记的锯齿源，结构性排除）；模糊
     * 路径维持降采样防 OOM 语义。
     * it.10 取证日志：位图尺寸变化时打一条「capture res view=WxH bitmap=WxH
     * scale=… lensFullRes=…」（GlassKitBlur tag），装机核对 capture 实际分辨率。
     */
    private fun obtainCaptureBitmap(w: Int, h: Int, allowDownsample: Boolean): Bitmap? {
        if (w <= 0 || h <= 0) return null
        val scale = if (allowDownsample) {
            minOf(1f, GlassCaptureEngine.MAX_CAPTURE_WIDTH_PX.toFloat() / w.toFloat())
        } else {
            1f
        }
        val bw = Math.max(1, Math.round(w * scale))
        val bh = Math.max(1, Math.round(h * scale))
        var bitmap = captureBitmap
        if (bitmap == null || bitmap.width != bw || bitmap.height != bh) {
            if (bitmap != null && !bitmap.isRecycled) bitmap.recycle()
            bitmap = Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888)
            captureBitmap = bitmap
            // 取证日志：仅尺寸变化时打一条（每帧刷屏防抖）
            Log.i(
                logTag,
                "capture res view=${w}x$h bitmap=${bw}x$bh scale=$scale" +
                    " lensFullRes=${!allowDownsample} maxW=${GlassCaptureEngine.MAX_CAPTURE_WIDTH_PX}",
            )
        }
        return bitmap
    }

    /** 采集位图 → 视图尺寸的等比缩放绘制（清晰 / 非模糊路径共用）。 */
    private fun drawCaptureScaled(canvas: Canvas, capture: Bitmap, w: Int, h: Int) {
        canvas.drawBitmap(capture, null, RectF(0f, 0f, w.toFloat(), h.toFloat()), capturePaint)
    }

    /**
     * ② 模糊路径：
     * - forceDownsample=false 且 API 31+ 且硬件画布：
     *   RenderNode + RenderEffect.createBlurEffect（真高斯，真机默认）；
     * - 否则（forceDownsample 强制 / API 26–30 / 软件画布）：
     *   降采样 1/6 + 双线性放大近似（H2 单档语义）。
     *
     * 诊断日志（GlassKitBlur tag）：仅在「分支切换」或「RenderEffect 新建」时各打一条，
     * 输出路径分支 + blurRadiusPx + canvas.isHardwareAccelerated，防每帧刷屏。
     * 装机排查法：adb logcat -s GlassKitBlur —— 真机若走了 rendernode 分支但画面
     * 不模糊（锯齿/1px 过渡带），在测试页打开「强制降采样」开关切近似路径。
     */
    private fun drawBlurredLayer(canvas: Canvas, capture: Bitmap, blurRadiusPx: Float) {
        val w = width
        val h = height
        val useRenderNode = !forceDownsample &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            canvas.isHardwareAccelerated
        if (useRenderNode) {
            logBlurPathOnce("rendernode", blurRadiusPx, canvas.isHardwareAccelerated)
            val node = obtainBlurRenderNode(w, h)
            val radius = blurRadiusPx.coerceAtLeast(0.5f)
            // S2 修复：RenderEffect 走缓存，半径/尺寸不变时复用（原实现每帧新建）
            node.setRenderEffect(obtainBlurEffect(radius, w, h))
            val recording = node.beginRecording()
            try {
                recording.drawBitmap(capture, null, RectF(0f, 0f, w.toFloat(), h.toFloat()), capturePaint)
            } finally {
                node.endRecording()
            }
            canvas.drawRenderNode(node)
        } else {
            logBlurPathOnce(
                if (forceDownsample) "downsample(forced)" else "downsample(fallback)",
                blurRadiusPx,
                canvas.isHardwareAccelerated,
            )
            // API 26–30 降级：1/6 降采样 + 双线性放大（近似模糊，H2 单档语义）
            // 纯模糊路径保持固定档 BLUR_DOWNSAMPLE 行为不变（it.3 仅透镜路径自适应）
            val small = obtainSmallBlurBitmap(w, h, capture, BLUR_DOWNSAMPLE) ?: return
            canvas.drawBitmap(
                small,
                null,
                RectF(0f, 0f, w.toFloat(), h.toFloat()),
                capturePaint,
            )
        }
    }

    /**
     * 模糊路径诊断日志：同一分支只打一条（lastLoggedBlurPath 去重），
     * 分支切换（forceDownsample 翻转 / 硬件加速状态变化）时重新打一条。
     */
    private fun logBlurPathOnce(path: String, blurRadiusPx: Float, hardwareAccelerated: Boolean) {
        if (lastLoggedBlurPath == path) return
        lastLoggedBlurPath = path
        Log.i(
            logTag,
            "blur path=$path blurRadiusPx=$blurRadiusPx" +
                " hardwareAccelerated=$hardwareAccelerated" +
                " forceDownsample=$forceDownsample sdk=${Build.VERSION.SDK_INT}",
        )
    }

    /**
     * it.4 起废弃：透镜输入降采样系数随模糊半径自适应的设计（原
     * factor = clamp(round(blurRadiusPx / (K × density)), 1, MAX)）已从管线移除——
     * 「降采样+双线性放大」本质产出锯齿而非高斯，factor 变化只是锯齿块变大
     * （用户真机反馈：「模糊倍率有效果，但不是模糊效果而是锯齿的数量在变化」）。
     * 透镜输入现走固定 LENS_DOWNSAMPLE 档 + 小图 CPU box blur ×3（obtainLensInputShader）。
     */

    /**
     * ③ 透镜路径（API 33+）：it.9 GPU 全分辨率离屏高斯输入（默认）——
     * HardwareRenderer + RenderNode(RenderEffect) → ImageReader → 硬件位图
     * BitmapShader 喂 RuntimeShader（obtainGpuInputShader）；forceDownsample 或
     * GPU 失败时回退 CPU 路径（四槽轮换 + 小图 box blur ×3）。uRefractionPx /
     * uDispersionPx 乘 lensScale，一次 drawRect 逐像素求值。lensPaint 为复用实例。
     */
    private fun drawLensLayer(
        canvas: Canvas,
        capture: Bitmap,
        w: Int,
        h: Int,
        cornerRadiusPx: Float,
        blurRadiusPx: Float,
        cornerExponentN: Float,
    ) {
        val lensShaderInput = obtainLensInputShader(w, h, capture, blurRadiusPx)
        val shader = obtainLensShader(lensShaderInput, w, h, cornerRadiusPx, cornerExponentN) ?: return
        val refraction = refractionPx * lensScale
        // it.13 色散开关：关闭时置 0 → dispFade 分母 max(0,1)=1，三通道采样点
        // 自动重合（shader 主体不动，零彩边）；lensActive 判定仍用原始 prop，
        // 不影响采集全分辨率语义。
        val dispersion = if (chromaticEnabled) dispersionPx * lensScale else 0f
        shader.setFloatUniform("uRefractionPx", refraction)
        shader.setFloatUniform("uDispersionPx", dispersion)
        // it.13 效果开关 A/B 取证（仅硬件路径，切换/首帧各一条，防刷屏）
        // it.14 取证：追加 capsule / boost 标记，logcat 可直接核对
        // 「n=3.0 capsule=true boost=0.05」（dock / 指示器 / 顶栏演示件帧）。
        val flags = "chromatic=$chromaticEnabled depth=$depthEffect" +
            " vibrancy=$vibrancyEnabled n=$cornerExponentN" +
            " capsule=$capsuleContinuous boost=$indicatorBoostAlpha"
        if (loggedEffectFlags != flags) {
            loggedEffectFlags = flags
            Log.i(logTag, "lens effect flags: view=$id $flags")
        }
        lensPaint.shader = shader
        canvas.drawRect(0f, 0f, w.toFloat(), h.toFloat(), lensPaint)
    }

    /**
     * it.9：透镜输入获取（纱窗感修复核心）。
     *
     * 真机默认 = GPU 全分辨率离屏模糊路径：capture 位图（全分辨率）→
     * HardwareRenderer + RenderNode(RenderEffect.createBlurEffect 高斯) →
     * ImageReader（RGBA_8888，GPU_COLOR_OUTPUT|GPU_SAMPLED_IMAGE）→
     * acquireLatestImage → Bitmap.wrapHardwareBuffer → 硬件位图 → BitmapShader
     * → AGSL RuntimeShader setInputShader。每帧产出全新硬件位图（保留
     * GPU_IMAGE_RETAIN=3 帧环，RenderThread 回放落后 ≤2 帧不碰撞）——
     * ① it.4 的「固定 1/4 降采样 + CPU box blur ×3 → 双线性放大」像素网格
     *   （用户报告的「网格纱窗感」，根因：小图放大插值）根除；
     * ② 跨帧采样竞态结构性消除（硬件缓冲 acquire 后只读，永不 UI 变异）。
     * blurScale≈0（blurRadiusPx<0.5）同样走 GPU 离屏（不挂 RenderEffect），
     * 消除旧零拷贝路径「RT 采样 captureBitmap vs UI 每帧变异」的已知竞态；
     * GPU 不可用时 sharp 才回退零拷贝（维持 it.4-R2 行为，竞态暴露与旧版一致）。
     *
     * forceDownsample=true（模拟器 GPU 缺陷调试）：整条 GPU 路径跳过，直接走
     * CPU 槽位路径（保留 it.4-R2「1/4 降采样 + box blur ×3」观感）。
     *
     * @return 本帧输入的 BitmapShader（已设位图→视图坐标放大矩阵）；
     *         null = 位图/缓冲创建失败。
     */
    private fun obtainLensInputShader(
        w: Int,
        h: Int,
        capture: Bitmap,
        blurRadiusPx: Float,
    ): BitmapShader? {
        // ---- it.9 GPU 全分辨率离屏路径（真机默认） ----
        if (!forceDownsample && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val gpuShader = obtainGpuInputShader(w, h, capture, blurRadiusPx)
            if (gpuShader != null) return gpuShader
            // GPU 链路任一环失败（reader/renderer 创建、renderFrame、wrap）：
            // 一次性日志后落 CPU 回退，不为失败帧中断玻璃渲染
            logBlurPathOnce("lens input=cpu(gpu-fallback)", blurRadiusPx, true)
        }

        // ---- blurScale≈0 回退：全分辨率清晰折射（零拷贝，it.4-R2 语义保留） ----
        if (blurRadiusPx < 0.5f) {
            var sharp = lensSharpShader
            if (sharp == null || lensSharpShaderCapture !== capture) {
                sharp = BitmapShader(capture, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
                lensSharpShader = sharp
                lensSharpShaderCapture = capture
            }
            // capture 位图可能超宽降采样（>1080 宽时 captureScale<1），映射回视图坐标
            lensMatrix.setScale(
                w.toFloat() / capture.width.toFloat(),
                h.toFloat() / capture.height.toFloat(),
            )
            sharp.setLocalMatrix(lensMatrix)
            return sharp
        }

        // ---- CPU 槽位回退：1/4 降采样 → box blur ×3（forceDownsample / GPU 失败） ----
        val sw = Math.max(1, w / LENS_DOWNSAMPLE)
        val sh = Math.max(1, h / LENS_DOWNSAMPLE)
        // it.9：屏幕帧三槽轮换（0/1/2，RT 回放落后 ≤2 帧不碰撞）；快照回录固定走
        // 专用槽 3（回录与屏幕绘制同帧先后各跑一次管线时互不覆写采样槽）
        val slot: Int
        if (recordingFrameCache) {
            slot = 3
        } else {
            lensInputSlot = (lensInputSlot + 1) % 3
            slot = lensInputSlot
        }
        var small = lensInputBuffers[slot]
        if (small == null || small.width != sw || small.height != sh) {
            if (small != null && !small.isRecycled) small.recycle()
            small = Bitmap.createBitmap(sw, sh, Bitmap.Config.ARGB_8888)
            lensInputBuffers[slot] = small
            // 位图实例更换：该槽位的 BitmapShader / Canvas / 像素缓冲一并重建
            lensShaderInputs[slot] = null
            lensCanvases[slot] = null
            lensPixelBuffers[slot] = null
            lensBlurTempBuffer = null
        }
        var smallCanvas = lensCanvases[slot]
        if (smallCanvas == null) {
            smallCanvas = Canvas(small)
            lensCanvases[slot] = smallCanvas
        }
        // 复用位图先清空上一帧内容（采集结果可能含透明区域，避免残影）
        small.eraseColor(Color.TRANSPARENT)
        lensSrcRect.set(0f, 0f, sw.toFloat(), sh.toFloat())
        smallCanvas.drawBitmap(capture, null, lensSrcRect, capturePaint)

        // CPU 三盒高斯近似（原地像素 blur，IntArray 复用零分配）
        val radius = Math.round(blurRadiusPx / LENS_DOWNSAMPLE).coerceIn(1, MAX_LENS_BLUR_RADIUS)
        var pixels = lensPixelBuffers[slot]
        if (pixels == null || pixels.size != sw * sh) {
            pixels = IntArray(sw * sh)
            lensPixelBuffers[slot] = pixels
            lensBlurTempBuffer = IntArray(sw * sh)
        }
        small.getPixels(pixels, 0, sw, 0, 0, sw, sh)
        boxBlurPixels(pixels, sw, sh, radius)
        small.setPixels(pixels, 0, sw, 0, 0, sw, sh)

        // 输出侧 BitmapShader：绑定本帧位图，放大矩阵每帧重设（复用 Matrix）
        var input = lensShaderInputs[slot]
        if (input == null) {
            input = BitmapShader(small, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
            lensShaderInputs[slot] = input
        }
        lensMatrix.setScale(
            w.toFloat() / sw.toFloat(),
            h.toFloat() / sh.toFloat(),
        )
        input.setLocalMatrix(lensMatrix)
        // it.9 取证：槽位写入计数（含槽位号，核对 ping-pong/回录槽隔离）
        flickerSlotWrites++
        val fullLog = flickerSeq <= FLICKER_LOG_FULL_FRAMES
        if (fullLog || flickerSlotWrites % 120 == 0) {
            Log.i(
                FLICKER_LOG_TAG,
                "view=$id slotWrite=$flickerSlotWrites slot=$slot rec=$recordingFrameCache" +
                    " small=${sw}x$sh radius=$radius",
            )
        }
        return input
    }

    /* ---------------- it.9 GPU 全分辨率离屏模糊链路 ---------------- */

    /**
     * GPU 离屏渲染一帧 capture → 硬件位图 BitmapShader。
     *
     * 链路：RenderNode（内容 = capture 全分辨率位图）+ RenderEffect（高斯，
     * sigma 按 captureScale 折算——capture 可能因 MAX_CAPTURE_WIDTH_PX 超宽降采样，
     * 视图 px 的模糊半径需乘 captureScale 才是位图像素语义）→ HardwareRenderer
     * （setOpaque(false) 保 alpha；AOSP ScreenshotHardwareRenderer 同款同步模式：
     * renderFrame 阻塞至 GPU 完成后才 acquire）→ acquireLatestImage →
     * wrapHardwareBuffer。Image 保留环 GPU_IMAGE_RETAIN=3：逐出（close 归还
     * reader 缓冲）的是 3 帧前的缓冲，RT 回放落后 ≤2 帧不采样到将复用缓冲。
     *
     * @return 已设好位图→视图坐标放大矩阵的 BitmapShader；null = 链路失败（调用方落 CPU 回退）。
     */
    private fun obtainGpuInputShader(
        w: Int,
        h: Int,
        capture: Bitmap,
        blurRadiusPx: Float,
    ): BitmapShader? {
        val cw = capture.width
        val ch = capture.height
        val reader = obtainGpuReader(cw, ch) ?: return null
        val renderer = obtainGpuRenderer(reader) ?: return null
        val node = obtainGpuNode(cw, ch)
        // sigma：视图 px 半径 × captureScale → 位图 px；Effect 缓存（半径/尺寸不变复用）
        val captureScaleX = cw.toFloat() / w.toFloat()
        if (blurRadiusPx >= 0.5f) {
            val sigma = (blurRadiusPx * captureScaleX).coerceAtLeast(0.5f)
            node.setRenderEffect(obtainGpuBlurEffect(sigma, cw, ch))
        } else {
            // blurScale≈0（清晰折射）：不挂 BlurEffect，仅借离屏链路产独立硬件缓冲；
            // it.13 默认 shader 矩阵路径下此处返回 null（等价 it.12 的
            // setRenderEffect(null)），鲜活度由 drawLensLayer 的 RuntimeShader
            // uVibrancy=1 承担；切 VIBRANCY_SHADER_FALLBACK=false 时才单独挂
            // ColorFilterEffect（不引入任何模糊）。
            node.setRenderEffect(obtainGpuVibrancyOnlyEffect())
        }
        val recordingCanvas = node.beginRecording()
        try {
            recordingCanvas.drawBitmap(capture, null, RectF(0f, 0f, cw.toFloat(), ch.toFloat()), capturePaint)
        } finally {
            node.endRecording()
        }
        renderer.setContentRoot(node)
        // 同步渲染（AOSP ScreenshotHardwareRenderer 同款模式）：setWaitForPresent(true)
        // 阻塞至帧提交完成，返回后 ImageReader 队列内必有一帧可 acquire。
        val syncStatus = try {
            renderer.createRenderRequest().setWaitForPresent(true).syncAndDraw()
        } catch (t: Throwable) {
            Log.w(logTag, "GPU syncAndDraw failed: $t")
            HardwareRenderer.SYNC_CONTEXT_IS_STOPPED
        }
        if (syncStatus != HardwareRenderer.SYNC_OK &&
            syncStatus != HardwareRenderer.SYNC_REDRAW_REQUESTED
        ) {
            return null
        }
        val image = reader.acquireLatestImage() ?: return null
        val hardwareBuffer = image.hardwareBuffer
        val bitmap = if (hardwareBuffer != null) {
            try {
                Bitmap.wrapHardwareBuffer(hardwareBuffer, ColorSpace.get(ColorSpace.Named.SRGB))
            } catch (t: Throwable) {
                Log.w(logTag, "wrapHardwareBuffer failed: $t")
                null
            }
        } else {
            null
        }
        if (bitmap == null) {
            image.close()
            return null
        }
        // 保留环：超出 RETAIN 的旧 Image close（缓冲归还 reader，可被后续帧复用；
        // RT 回放落后 ≤2 帧时采样的仍是环内未逐出缓冲）
        gpuImageRing.add(image)
        while (gpuImageRing.size > GPU_IMAGE_RETAIN) {
            gpuImageRing.removeAt(0).close()
        }
        // 一次性路径日志（分支去重）：确认真机确实走 GPU（logcat -s GlassKitBlur）
        logBlurPathOnce(
            "lens input=gpu sigma=${if (blurRadiusPx >= 0.5f) blurRadiusPx * captureScaleX else 0f}",
            blurRadiusPx,
            true,
        )
        var shader = gpuInputShader
        if (shader == null || gpuInputShaderBitmap !== bitmap) {
            shader = BitmapShader(bitmap, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
            gpuInputShader = shader
            gpuInputShaderBitmap = bitmap
        }
        // capture 可能超宽降采样：位图坐标 → 视图坐标放大矩阵（视图 px 采样语义）
        lensMatrix.setScale(
            w.toFloat() / cw.toFloat(),
            h.toFloat() / ch.toFloat(),
        )
        shader.setLocalMatrix(lensMatrix)
        return shader
    }

    /** ImageReader 复用（capture 尺寸变化时整体重建；GPU_IMAGE_RETAIN+1 容量）。 */
    private fun obtainGpuReader(width: Int, height: Int): ImageReader? {
        val existing = gpuReader
        if (existing != null && gpuReaderWidth == width && gpuReaderHeight == height) return existing
        releaseGpu()
        return try {
            val usage = HardwareBuffer.USAGE_GPU_COLOR_OUTPUT or HardwareBuffer.USAGE_GPU_SAMPLED_IMAGE
            val reader = ImageReader.newInstance(
                width, height, PixelFormat.RGBA_8888, GPU_READER_MAX_IMAGES, usage,
            )
            gpuReader = reader
            gpuReaderWidth = width
            gpuReaderHeight = height
            reader
        } catch (t: Throwable) {
            Log.w(logTag, "ImageReader create failed: $t")
            null
        }
    }

    /** HardwareRenderer 复用（setOpaque(false) 保 alpha 通道；surface 绑定 reader）。 */
    private fun obtainGpuRenderer(reader: ImageReader): HardwareRenderer? {
        gpuRenderer?.let { return it }
        return try {
            val renderer = HardwareRenderer()
            renderer.setOpaque(false)
            renderer.setSurface(reader.surface)
            gpuRenderer = renderer
            renderer
        } catch (t: Throwable) {
            Log.w(logTag, "HardwareRenderer create failed: $t")
            null
        }
    }

    /** GPU 录制节点复用（尺寸 = capture 位图，变化时重建）。 */
    private fun obtainGpuNode(width: Int, height: Int): RenderNode {
        var node = gpuNode
        if (node == null || node.width != width || node.height != height) {
            node = RenderNode("GlassKitLensInput")
            node.setPosition(0, 0, width, height)
            gpuNode = node
        }
        return node
    }

    /** GPU 高斯 RenderEffect 缓存（sigma/尺寸/vibrancy 不变复用；CLAMP 不引入透明衰减）。 */
    private fun obtainGpuBlurEffect(sigma: Float, width: Int, height: Int): RenderEffect {
        val cached = gpuBlurEffect
        val useVibrancy = vibrancyEnabled && !VIBRANCY_SHADER_FALLBACK
        if (cached != null && gpuBlurSigma == sigma && gpuEffectWidth == width &&
            gpuEffectHeight == height && gpuBlurVibrancy == useVibrancy
        ) {
            return cached
        }
        val blur = RenderEffect.createBlurEffect(sigma, sigma, Shader.TileMode.CLAMP)
        // it.13 鲜活度 GPU 备选路径（VIBRANCY_SHADER_FALLBACK=false 才生效）：
        // 模糊链上叠 saturation=1.5 ColorFilter（API31+，挂 canBlur 门控；
        // 矩阵出处 ColorFilterKt.java:16 / 75-85）。默认 shader 矩阵路径下
        // useVibrancy 恒 false，此处直接返回纯 blur，GPU 模糊链逐位等价 it.12。
        val effect = if (useVibrancy) {
            RenderEffect.createColorFilterEffect(vibrancyColorFilter, blur)
        } else {
            blur
        }
        gpuBlurEffect = effect
        gpuBlurSigma = sigma
        gpuEffectWidth = width
        gpuEffectHeight = height
        gpuBlurVibrancy = useVibrancy
        return effect
    }

    /**
     * it.13 清晰折射帧（blurRadiusPx<0.5）单独施加 saturation=1.5 —— 仅
     * VIBRANCY_SHADER_FALLBACK=false 的 GPU 备选路径使用。不挂 BlurEffect，
     * 避免把「清晰折射」变成模糊；开关关 / 默认 shader 矩阵路径 / API<31 时
     * 返回 null（与 it.12 的 setRenderEffect(null) 逐位等价）。
     */
    private fun obtainGpuVibrancyOnlyEffect(): RenderEffect? {
        if (!vibrancyEnabled || VIBRANCY_SHADER_FALLBACK ||
            Build.VERSION.SDK_INT < Build.VERSION_CODES.S
        ) {
            return null
        }
        var effect = gpuVibrancyOnlyEffect
        if (effect == null) {
            effect = RenderEffect.createColorFilterEffect(vibrancyColorFilter)
            gpuVibrancyOnlyEffect = effect
        }
        return effect
    }

    /** GPU 链路整体释放（尺寸变化 / detach）：Image 环、reader、renderer、Effect 缓存。 */
    private fun releaseGpu() {
        for (image in gpuImageRing) {
            try {
                image.close()
            } catch (_: Exception) {
                // 已 close 的 Image 二次 close 抛异常属正常，忽略
            }
        }
        gpuImageRing.clear()
        gpuInputShader = null
        gpuInputShaderBitmap = null
        gpuBlurEffect = null
        gpuBlurSigma = -1f
        gpuEffectWidth = -1
        gpuEffectHeight = -1
        gpuBlurVibrancy = false
        gpuVibrancyOnlyEffect = null
        gpuNode = null
        gpuRenderer?.let { renderer ->
            try {
                renderer.setSurface(null)
            } catch (_: Exception) {
                // 释放路径防御：任何异常不阻断清理链
            }
        }
        gpuRenderer = null
        gpuReader?.let { reader ->
            try {
                reader.close()
            } catch (_: Exception) {
                // 同上
            }
        }
        gpuReader = null
        gpuReaderWidth = -1
        gpuReaderHeight = -1
    }

    /**
     * it.4-R2：CPU 三盒高斯近似（原地）。sigma = radius / 2（对齐 Skia
     * 「blur radius ≈ 2σ」口径，与 it.2 用户认可的 RenderEffect 真高斯观感衔接；
     * 如观感偏差可调此系数）。预乘 → 逐盒（水平滑窗 + 垂直滑窗）→ 反预乘。
     * 复杂度 O(6·n)（3 盒 × H/V 各一次线性滑窗），hero 小图 ~33k 像素，
     * 单帧 ~20 万次整型累加，UI 线程成本可忽略。
     */
    private fun boxBlurPixels(pixels: IntArray, w: Int, h: Int, radius: Int) {
        val sigma = (radius / 2f).coerceAtLeast(0.5f)
        var boxes = lensBoxSizes
        if (boxes == null || lensBoxRadius != radius) {
            boxes = boxesForGauss(sigma, 3)
            lensBoxSizes = boxes
            lensBoxRadius = radius
        }
        val temp = lensBlurTempBuffer ?: return
        premultiplyPixels(pixels)
        for (box in boxes) {
            val r = (box - 1) / 2
            if (r < 1) continue
            boxBlurH(pixels, temp, w, h, r)
            boxBlurV(temp, pixels, w, h, r)
        }
        unpremultiplyPixels(pixels)
    }

    /** 三盒尺寸计算（Ivan Kutskir fast-gaussian：3 盒卷积近似 sigma 高斯）。 */
    private fun boxesForGauss(sigma: Float, n: Int): IntArray {
        val nF = n.toFloat()
        val wIdeal = Math.sqrt(12.0 * sigma * sigma / nF + 1.0)
        var wl = Math.floor(wIdeal).toInt()
        if (wl % 2 == 0) wl--
        val wu = wl + 2
        val mIdeal =
            (12.0 * sigma * sigma - nF * wl * wl - 4 * wl - nF) / (-4.0 * wl - 4.0)
        val m = Math.round(mIdeal).toInt()
        val sizes = IntArray(n)
        for (i in 0 until n) {
            sizes[i] = if (i < m) wl else wu
        }
        return sizes
    }

    /** ARGB → 预乘 alpha（原地；a=0 直接清零，a=255 跳过乘法）。 */
    private fun premultiplyPixels(pixels: IntArray) {
        for (i in pixels.indices) {
            val p = pixels[i]
            val a = p ushr 24 and 0xFF
            if (a == 0xFF) continue
            if (a == 0) {
                pixels[i] = 0
                continue
            }
            val r = ((p shr 16) and 0xFF) * a / 255
            val g = ((p shr 8) and 0xFF) * a / 255
            val b = (p and 0xFF) * a / 255
            pixels[i] = (a shl 24) or (r shl 16) or (g shl 8) or b
        }
    }

    /** 预乘 ARGB → 非预乘（原地；除法向上钳 255 防溢出）。 */
    private fun unpremultiplyPixels(pixels: IntArray) {
        for (i in pixels.indices) {
            val p = pixels[i]
            val a = p ushr 24 and 0xFF
            if (a == 0xFF || a == 0) continue
            var r = ((p shr 16) and 0xFF) * 255 / a
            var g = ((p shr 8) and 0xFF) * 255 / a
            var b = (p and 0xFF) * 255 / a
            if (r > 255) r = 255
            if (g > 255) g = 255
            if (b > 255) b = 255
            pixels[i] = (a shl 24) or (r shl 16) or (g shl 8) or b
        }
    }

    /**
     * 水平 box blur（O(n) 滑窗，边界 clamp 取最近有效像素——不引入透明
     * padding，避免盒卷积在边缘向透明衰减）。src → dst，预乘 ARGB。
     */
    private fun boxBlurH(src: IntArray, dst: IntArray, w: Int, h: Int, r: Int) {
        val win = r + r + 1
        for (y in 0 until h) {
            val row = y * w
            var sr = 0
            var sg = 0
            var sb = 0
            var sa = 0
            for (i in -r..r) {
                val c = src[row + i.coerceIn(0, w - 1)]
                sa += c ushr 24 and 0xFF
                sr += (c shr 16) and 0xFF
                sg += (c shr 8) and 0xFF
                sb += c and 0xFF
            }
            for (x in 0 until w) {
                dst[row + x] =
                    (sa / win shl 24) or (sr / win shl 16) or (sg / win shl 8) or (sb / win)
                // 滑窗推进：右进 (x+r+1)，左出 (x-r)，越界 clamp 到行内首/尾像素
                val addC = src[row + (x + r + 1).coerceIn(0, w - 1)]
                val remC = src[row + (x - r).coerceIn(0, w - 1)]
                sa += (addC ushr 24 and 0xFF) - (remC ushr 24 and 0xFF)
                sr += ((addC shr 16) and 0xFF) - ((remC shr 16) and 0xFF)
                sg += ((addC shr 8) and 0xFF) - ((remC shr 8) and 0xFF)
                sb += (addC and 0xFF) - (remC and 0xFF)
            }
        }
    }

    /**
     * 垂直 box blur（O(n) 滑窗，列步进 w，边界 clamp）。src → dst，预乘 ARGB。
     */
    private fun boxBlurV(src: IntArray, dst: IntArray, w: Int, h: Int, r: Int) {
        val win = r + r + 1
        for (x in 0 until w) {
            var sr = 0
            var sg = 0
            var sb = 0
            var sa = 0
            for (i in -r..r) {
                val c = src[(i.coerceIn(0, h - 1)) * w + x]
                sa += c ushr 24 and 0xFF
                sr += (c shr 16) and 0xFF
                sg += (c shr 8) and 0xFF
                sb += c and 0xFF
            }
            for (y in 0 until h) {
                dst[y * w + x] =
                    (sa / win shl 24) or (sr / win shl 16) or (sg / win shl 8) or (sb / win)
                val addC = src[(y + r + 1).coerceIn(0, h - 1) * w + x]
                val remC = src[(y - r).coerceIn(0, h - 1) * w + x]
                sa += (addC ushr 24 and 0xFF) - (remC ushr 24 and 0xFF)
                sr += ((addC shr 16) and 0xFF) - ((remC shr 16) and 0xFF)
                sg += ((addC shr 8) and 0xFF) - ((remC shr 8) and 0xFF)
                sb += (addC and 0xFF) - (remC and 0xFF)
            }
        }
    }

    /**
     * 降采样小位图缓存：宽高 = 视图 / factor，含采集内容的等比缩小。
     * it.4 起仅纯模糊路径（drawBlurredLayer 固定 BLUR_DOWNSAMPLE 档）使用；
     * 透镜输入已改走 obtainLensInputShader（1/4 + CPU box blur ×3 近似高斯）。
     * it.3 缓存键 (w, h, factor) 三元组逻辑保留（参数化 factor 不变）；
     * factor ≤ 1 时跳过拷贝直接返回全分辨率采集位图。
     *
     * it.11 嵌套输入质量修复（指示器「边缘锯齿」取证修复①）：旧实现单步 factor
     * 倍降采样——FILTER_BITMAP（双线性）在 6 倍缩放下每 ~6 个源像素只采 1 样，
     * 5/6 内容被跳过 → 高频内容镜像混叠（块状/噪声锯齿）。取证（it11-before.log）：
     * dock（capturable 采集源）屏幕帧走 lens input=gpu 全分辨率，而被指示器采集的
     * 软画布帧走 downsample(fallback)——指示器透镜输入 = 这份混叠渲染，dock 正常、
     * 指示器锯齿的差异实锤。修复 = 逐级 2 倍半采样链：每级双线性权重覆盖相邻
     * 2 像素（≈2 像素 box 均值，无跳采样），循环至残余比率 <2 再一次插值到目标
     * 尺寸。真机默认 GPU 路径不经此函数（仅软画布降级帧 = 嵌套采集 / 快照回录、
     * 与模拟器 forceDownsample 调试路径受益）。
     */
    private fun obtainSmallBlurBitmap(w: Int, h: Int, capture: Bitmap, factor: Int): Bitmap? {
        if (factor <= 1) return capture
        val sw = Math.max(1, w / factor)
        val sh = Math.max(1, h / factor)
        var small = smallBlurBitmap
        if (small == null || small.width != sw || small.height != sh || smallBlurFactor != factor) {
            if (small != null && !small.isRecycled) small.recycle()
            small = Bitmap.createBitmap(sw, sh, Bitmap.Config.ARGB_8888)
            smallBlurBitmap = small
            smallBlurFactor = factor
        }
        small!!.eraseColor(Color.TRANSPARENT)
        // 逐级 2 倍半采样：源 → w/2 → w/4 → … → 残余比率 <2 → 目标尺寸
        var src = capture
        var srcW = w
        var srcH = h
        var level = 0
        while (srcW / 2 >= sw && srcH / 2 >= sh) {
            val lw = Math.max(1, srcW / 2)
            val lh = Math.max(1, srcH / 2)
            var levelBitmap = smallBlurChain.getOrNull(level)
            if (levelBitmap == null || levelBitmap.width != lw || levelBitmap.height != lh) {
                if (levelBitmap != null && !levelBitmap.isRecycled) levelBitmap.recycle()
                levelBitmap = Bitmap.createBitmap(lw, lh, Bitmap.Config.ARGB_8888)
                if (level < smallBlurChain.size) smallBlurChain[level] = levelBitmap
                else smallBlurChain.add(levelBitmap)
            }
            levelBitmap.eraseColor(Color.TRANSPARENT)
            Canvas(levelBitmap).drawBitmap(
                src, null, RectF(0f, 0f, lw.toFloat(), lh.toFloat()), capturePaint,
            )
            src = levelBitmap
            srcW = lw
            srcH = lh
            level++
        }
        Canvas(small).drawBitmap(src, null, RectF(0f, 0f, sw.toFloat(), sh.toFloat()), capturePaint)
        return small
    }

    /** RenderNode 复用：尺寸变化时重建（setPosition 在此处统一设置）。 */
    private fun obtainBlurRenderNode(w: Int, h: Int): RenderNode {
        var node = blurRenderNode
        if (node == null || node.width != w || node.height != h) {
            node = RenderNode("GlassKitBlur")
            node.setPosition(0, 0, w, h)
            blurRenderNode = node
        }
        return node
    }

    /**
     * S2 修复：RenderEffect 缓存。半径或视图尺寸不变时直接复用缓存实例，
     * 仅在变化时新建（原实现每帧 createBlurEffect，高频分配压力）。
     * 仅在 SDK_INT >= S 且硬件画布分支调用。
     */
    private fun obtainBlurEffect(radiusPx: Float, w: Int, h: Int): RenderEffect {
        val cached = blurEffect
        val useVibrancy = vibrancyEnabled && !VIBRANCY_SHADER_FALLBACK
        if (cached != null &&
            blurEffectRadiusPx == radiusPx &&
            blurEffectWidth == w &&
            blurEffectHeight == h &&
            blurEffectVibrancy == useVibrancy
        ) {
            return cached
        }
        val blur = RenderEffect.createBlurEffect(radiusPx, radiusPx, Shader.TileMode.CLAMP)
        // it.13 鲜活度 GPU 备选路径（VIBRANCY_SHADER_FALLBACK=false 才生效）：
        // 纯模糊路径（无透镜面板 / 软画布降级帧）同样叠 saturation=1.5；
        // 默认 shader 矩阵路径下 useVibrancy 恒 false，保持纯 blur 逐位等价 it.12。
        val effect = if (useVibrancy) {
            RenderEffect.createColorFilterEffect(vibrancyColorFilter, blur)
        } else {
            blur
        }
        blurEffect = effect
        blurEffectRadiusPx = radiusPx
        blurEffectWidth = w
        blurEffectHeight = h
        blurEffectVibrancy = useVibrancy
        // 诊断日志：仅 RenderEffect 新建时打一条（缓存命中静默，防每帧刷屏）
        Log.i(logTag, "RenderEffect created radiusPx=$radiusPx size=${w}x$h vibrancy=$useVibrancy")
        return effect
    }

    /**
     * it.4：RuntimeShader 缓存——源码静态，惰性创建一次；uBlurred 输入（双缓冲
     * BitmapShader，逐帧 setInputShader 切换到本帧槽位）与全部 uniform 每次 draw 重设。
     * 原 it.3「位图实例/尺寸变化即重建 RuntimeShader」逻辑随双缓冲改造移除
     * （shader 本体无位图状态，无需随位图重建）。
     */
    private fun obtainLensShader(
        bitmapShader: BitmapShader?,
        w: Int,
        h: Int,
        cornerRadiusPx: Float,
        cornerExponentN: Float,
    ): RuntimeShader? {
        if (bitmapShader == null) return null
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return null
        var shader = lensRuntimeShader
        if (shader == null) {
            shader = GlassLensShader.createRuntimeShader()
            lensRuntimeShader = shader
        }
        shader.setInputShader("uBlurred", bitmapShader)
        shader.setFloatUniform("uSize", w.toFloat(), h.toFloat())
        shader.setFloatUniform("uCornerRadiusPx", cornerRadiusPx)
        // it.13：新增 uniform 只在硬件画布的 drawLensLayer 里下发。软画布快照回录
        // 帧走 drawBlurredLayer 降级，不进本方法 —— uniform 未下发时 AGSL 内部
        // n=max(uCornerExponent,2.0) 兜底为圆弧、uVibrancy=0 跳过矩阵分支，
        // 逐位等价 it.12、不抛异常（it.8-fix1 教训）。
        shader.setFloatUniform("uCornerExponent", cornerExponentN)
        shader.setFloatUniform("uDepthEffect", if (depthEffect) 1f else 0f)
        // 默认路径（VIBRANCY_SHADER_FALLBACK=true）：鲜活度由 shader 末矩阵承担；
        // 运行时开关 vibrancyEnabled=false 时下发 0，完全关闭鲜活度。
        shader.setFloatUniform(
            "uVibrancy",
            if (vibrancyEnabled && VIBRANCY_SHADER_FALLBACK) 1f else 0f,
        )
        return shader
    }
}
