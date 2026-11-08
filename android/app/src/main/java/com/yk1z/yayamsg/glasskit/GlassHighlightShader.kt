package com.yk1z.yayamsg.glasskit

import android.graphics.RuntimeShader
import android.os.Build
import androidx.annotation.RequiresApi

/**
 * it.19 P0-1：**轮廓光（Rim Highlight）AGSL**。
 *
 * 逐行移植自原版
 * `com/kyant/backdrop/internal/ShadersKt.java:10 DefaultHighlightShaderString`
 * （与 `AmbientHighlightShaderString` 同构，差别只在 Ambient 把符号信息塞进 RGB）。
 *
 * 原版配套（`HighlightNode.java:87-140` / `HighlightStyle.java:215-240`）：
 * - 几何：**描边圆角矩形**，`strokeWidth = ceil(widthPx) × 2`，再 `clipPath` 到形状本身
 *   ⇒ 只留下内侧一半 ⇒ 视觉宽度 = `Highlight.width`（默认 **0.5dp**）。
 * - 画笔：`BlurMaskFilter(widthPx / 2)`（默认 **0.25dp**）、`Style.STROKE`。
 * - 颜色 / 叠加：`HighlightStyle.Default` = **White @0.5** + `BlendMode.Plus`，
 *   `layer.alpha = Highlight.alpha = 1.0`。
 *   ⚠️ 但下发进本 shader 的 `color` **alpha 被强制成 1.0**
 *   （`HighlightStyle.java:241` `copy(color, alpha = 1.0f)`）⇒ AGSL 路径的实际亮度
 *   100% 由 `intensity` 决定，`White@0.5` 的 0.5 只在无 shader 的降级路径里生效。
 * - 方向：`angle = 45°`（`HighlightStyle` 里存的是角度，下发前 `× 0.017453292` 转弧度）、
 *   `falloff = 1.0`。
 *
 * 强度公式：`intensity = pow(|dot(gradSdf, (cos a, sin a))|, falloff)`。
 * - `gradSdf` 用**放大半径**的 SDF（`gradRadius = min(r × 1.5, min(halfW, halfH))`），
 *   与透镜法线同一口径 ⇒ 角部法线不发抖、光带在四角自然收束。
 * - `|·|` 让 45° 轴向的一对对角（右上 / 左下）与另一对（左上 / 右下）都亮，
 *   但两条带的亮度分布不同（`dot` 的绝对值在圆角处衰减），这正是原版
 *   「棱边有光、平面无光」的观感来源。
 *
 * ⚠️ 与原版的两处刻意差异：
 * 1. 原版用 `layout(color) uniform half4 color` + `setColorUniform`；这里用
 *    `uniform float4 uRimColor` + `setFloatUniform(r,g,b,a)` —— 避开 `layout(color)`
 *    在部分 OEM 驱动上的编译差异，数值等价。
 * 2. 原版每角独立半径（`radiusAt` + `cornerRadii`）；我们的圆角四角同值，
 *    只用 `uCornerRadiusPx` 一个标量（与 `GlassLensShader` 同口径）。
 *
 * RuntimeShader 只在运行时编译（构建期不校验语法）⇒ 调用方必须 try/catch 兜底
 * （见 `GlassKitRimView.obtainShader`），失败降级为纯色描边，绝不崩帧。
 */
object GlassHighlightShader {

    /**
     * AGSL 源码（纯计算，不采样任何输入 shader）。
     * 用 `val` + `.trim()` 而非 `const val`：`trim()` 不是常量表达式，Kotlin 不允许
     * `const val` 初始化里调用它（`.trim()` 只是去掉 KDoc 换行带来的首尾空行）。
     */
    val SHADER_SOURCE: String = """
uniform float2 uSize;
uniform float uCornerRadiusPx;
uniform float4 uRimColor;
uniform float uAngle;
uniform float uFalloff;

// 圆弧 SDF（与原版同名同式）
float sdRoundRect(float2 coord, float2 halfSize, float radius) {
    float2 cornerCoord = abs(coord) - (halfSize - float2(radius));
    float outside = length(max(cornerCoord, 0.0)) - radius;
    float inside = min(max(cornerCoord.x, cornerCoord.y), 0.0);
    return outside + inside;
}

// 圆弧 SDF 梯度（原版 gradSdRoundedRect 逐行移植）
float2 gradSdRoundRect(float2 coord, float2 halfSize, float radius) {
    float2 cornerCoord = abs(coord) - (halfSize - float2(radius));
    if (cornerCoord.x >= 0.0 || cornerCoord.y >= 0.0) {
        return sign(coord) * normalize(max(cornerCoord, 0.0));
    } else {
        float gradX = step(cornerCoord.y, cornerCoord.x);
        return sign(coord) * float2(gradX, 1.0 - gradX);
    }
}

half4 main(float2 coord) {
    float2 halfSize = uSize * 0.5;
    float2 centered = coord - halfSize;
    // 法线用放大半径求梯度（与原版一致）：角部光带更平滑
    float gradRadius = min(uCornerRadiusPx * 1.5, min(halfSize.x, halfSize.y));
    float2 grad = gradSdRoundRect(centered, halfSize, gradRadius);
    float2 normal = float2(cos(uAngle), sin(uAngle));
    float d = dot(grad, normal);
    float intensity = pow(abs(d), max(uFalloff, 0.1));
    return half4(uRimColor.rgb, uRimColor.a) * intensity;
}
""".trim()

    /**
     * 构建轮廓光 RuntimeShader（仅 API 33+ 可调；调用方必须先判 Build.VERSION）。
     * 语法错误会在构造时抛 IllegalArgumentException —— 必须 try/catch。
     */
    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    fun createRuntimeShader(): RuntimeShader = RuntimeShader(SHADER_SOURCE)
}
