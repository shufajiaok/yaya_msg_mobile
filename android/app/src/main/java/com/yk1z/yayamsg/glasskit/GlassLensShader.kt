package com.yk1z.yayamsg.glasskit

import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Matrix
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import androidx.annotation.RequiresApi

/**
 * GlassKit AGSL 透镜着色器（引擎重写清单 §一 / §二.3，仅 API 33+）。
 *
 * Shader 契约（与 GlassKitView 喂参一一对应）：
 * - uniform shader uBlurred        ：模糊后的背景位图（BitmapShader, CLAMP）
 * - uniform float2 uSize           ：玻璃面板尺寸（px，本地坐标系）
 * - uniform float uRefractionPx    ：折射位移幅度（px，已乘 lensScale）
 * - uniform float uDispersionPx    ：色散位移幅度（px，已乘 lensScale）
 * - uniform float uCornerRadiusPx  ：圆角半径（px）
 *
 * 实现：
 * - SDF 圆角矩形：sdRoundRect(p, b, r)，内部为负、边界为 0、外部为正；
 * - 法线：SDF 中心差分梯度（eps=0.5px），归一化为外向法线；
 * - 边缘系数 edgeFactor = clamp(1 + sdf/uRefractionPx, 0, 1)：
 *   贴边为 1（满位移）、向内按 uRefractionPx 线性衰减到 0（深内部不位移）。
 *   ⚠️ 对清单原文「clamp(1 - sdf/uRefractionPx)」做了一次符号订正：SDF 内部为负，
 *   原式在形内恒 ≥1、经 clamp 后恒为 1 ⇒ 整幅内容被均匀平移而非边缘折射，
 *   与清单 §二.3「edgeFactor 由到圆角矩形边界距离决定」的意图相悖。此处改为
 *   贴边满位移、向内衰减，已登记 CHANGELOG 待主理人复核。
 * - 折射位移：uv' = uv - normal * edgeFactor * uRefractionPx（外向法线取负 ⇒ 采样点
 *   落向玻璃内部，产生边缘放大/内收的液态玻璃观感）；
 * - 色散：R/G/B 分别以 uDispersionPx 的 1.0 / 0.5 / 0.0 倍叠加位移后采样 uBlurred，
 *   取 cR.r / cG.g / cB.b 合成；
 * - 形外像素（sdf > 0）返回透明，配合视图侧圆角 clip 双保险。
 *
 * AGSL 语法均为 RuntimeShader 合法子集：half4 main(float2 fragCoord)、
 * uniform shader/float/float2、用户自定义标量函数、.eval() 采样。
 */
object GlassLensShader {

    val SHADER_SOURCE: String = """
uniform shader uBlurred;
uniform float2 uSize;
uniform float uRefractionPx;
uniform float uDispersionPx;
uniform float uCornerRadiusPx;

// 圆角矩形 SDF：p 相对中心的坐标，b 为半尺寸，r 为圆角半径；形内为负
float sdRoundRect(float2 p, float2 b, float r) {
    float2 q = abs(p) - b + r;
    return length(max(q, float2(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

// SDF 梯度（中心差分近似）⇒ 外向法线
float2 sdfNormal(float2 p, float2 b, float r) {
    float e = 0.5;
    float2 g = float2(
        sdRoundRect(p + float2(e, 0.0), b, r) - sdRoundRect(p - float2(e, 0.0), b, r),
        sdRoundRect(p + float2(0.0, e), b, r) - sdRoundRect(p - float2(0.0, e), b, r)
    );
    float len = length(g);
    return len > 0.0 ? g / len : float2(0.0);
}

half4 main(float2 fragCoord) {
    float2 center = uSize * 0.5;
    float2 p = fragCoord - center;
    float sdf = sdRoundRect(p, center, uCornerRadiusPx);
    // 形外：透明（视图侧另有圆角 clip，双保险）
    if (sdf > 0.0) {
        return half4(0.0);
    }
    // 防 0 除：uRefractionPx <= 0 时透镜不应被启用，这里兜底为 1px
    float refraction = max(uRefractionPx, 1.0);
    // 边缘系数：贴边 1 → 向内按 refraction 线性衰减到 0
    float edgeFactor = clamp(1.0 + sdf / refraction, 0.0, 1.0);
    float2 n = sdfNormal(p, center, uCornerRadiusPx);
    float2 d = n * edgeFactor;
    // 色散：R / G / B 以 uDispersionPx 的 1.0 / 0.5 / 0.0 倍错开位移采样
    half4 cR = uBlurred.eval(fragCoord - d * (refraction + uDispersionPx));
    half4 cG = uBlurred.eval(fragCoord - d * (refraction + uDispersionPx * 0.5));
    half4 cB = uBlurred.eval(fragCoord - d * refraction);
    return half4(cR.r, cG.g, cB.b, cG.a);
}
""".trim()

    /**
     * 构建透镜 RuntimeShader（仅 API 33+ 可调，调用方必须先判 Build.VERSION）。
     *
     * @param blurSource   模糊后的背景位图（尺寸可以小于视图，用矩阵放大对齐）
     * @param viewWidthPx  玻璃面板宽（px）
     * @param viewHeightPx 玻璃面板高（px）
     * @param refractionPx 折射位移（px，调用方已乘 lensScale）
     * @param dispersionPx 色散位移（px，调用方已乘 lensScale）
     * @param cornerRadiusPx 圆角半径（px）
     * @param scaleX blurSource → 视图宽的放大系数（= viewWidthPx / bitmapWidthPx）
     * @param scaleY blurSource → 视图高的放大系数（= viewHeightPx / bitmapHeightPx）
     */
    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    fun create(
        blurSource: Bitmap,
        viewWidthPx: Float,
        viewHeightPx: Float,
        refractionPx: Float,
        dispersionPx: Float,
        cornerRadiusPx: Float,
        scaleX: Float,
        scaleY: Float,
    ): RuntimeShader {
        val bitmapShader = BitmapShader(blurSource, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        if (scaleX != 1f || scaleY != 1f) {
            val matrix = Matrix()
            matrix.setScale(scaleX, scaleY)
            bitmapShader.setLocalMatrix(matrix)
        }
        val shader = RuntimeShader(SHADER_SOURCE)
        shader.setInputShader("uBlurred", bitmapShader)
        shader.setFloatUniform("uSize", viewWidthPx, viewHeightPx)
        shader.setFloatUniform("uRefractionPx", refractionPx)
        shader.setFloatUniform("uDispersionPx", dispersionPx)
        shader.setFloatUniform("uCornerRadiusPx", cornerRadiusPx)
        return shader
    }
}
