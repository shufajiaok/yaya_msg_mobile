package com.yk1z.yayamsg.glasskit

import android.graphics.RuntimeShader
import android.os.Build
import androidx.annotation.RequiresApi

/**
 * GlassKit AGSL 透镜着色器（引擎重写清单 §一 / §二.3，仅 API 33+）。
 *
 * Shader 契约（与 GlassKitView 喂参一一对应）：
 * - uniform shader uBlurred        ：模糊后的背景位图（BitmapShader, CLAMP；
 *                                    it.4 起由视图侧双缓冲逐帧 setInputShader 切换，
 *                                    放大矩阵在 BitmapShader 的 localMatrix 上）
 * - uniform float2 uSize           ：玻璃面板尺寸（px，本地坐标系）
 * - uniform float uRefractionPx    ：折射位移幅度（px，已乘 lensScale）
 * - uniform float uDispersionPx    ：色散位移幅度（px，已乘 lensScale）
 * - uniform float uCornerRadiusPx  ：圆角半径（px）
 * it.4：shader 本体无位图状态（输入与 uniform 逐帧重设），RuntimeShader 实例可
 * 惰性缓存复用，不再随位图/尺寸重建。
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
 *   it.11 边缘收敛（指示器「边缘彩边/锯齿」取证修复②）：it.10 只做了 alpha AA，
 *   真机复验仍有锯齿——取证结论（it11-before.log）：指示器 dispersionPx=20 /
 *   refractionPx=16（dock dispersionPx=0 无此现象），三通道在最贴边处采样点错位
 *   最大 refraction+dispersion≈36px，胶囊曲面边缘每像素 R/G/B 取自不同方向/距离
 *   的内容 → 彩色镶边，观感即「锯齿」。修复 = 色散分量随贴边距离衰减：
 *   dispFade = clamp(-sdf / max(uDispersionPx, 1), 0, 1)——sdf=0 边界像素三通道
 *   采样点严格重合（无错位→无彩边），向内 1×uDispersionPx 后恢复满幅色散
 *   （色散观感保留在带内中段）；uDispersionPx=0（dock）时三通道恒重合，零影响。
 * - 形外像素（sdf > 0）返回透明，配合视图侧圆角 clip 双保险。
 * - it.10 边缘 AA（指示器「透明边缘锯齿」取证修复）：旧实现形内到形外 1px 硬
 *   翻转（sdf≤0 满 alpha、sdf>0 直接透明，无过渡带）——胶囊曲面边界上每个像素
 *   阶梯翻转即锯齿。修复 = alpha 贴边 1px 内向渐变：edgeAA = clamp(-sdf, 0, 1)
 *   （sdf=0 边界像素 alpha=0、sdf=-1 处 alpha=1），过渡带完全落在形内——视图侧
 *   clipPath（无 AA，硬裁剪在 sdf=0）不会切掉过渡带，曲线边缘平滑无阶梯。
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
    // 色散：R / G / B 以 uDispersionPx 的 1.0 / 0.5 / 0.0 倍错开位移采样；
    // it.11 色散分量贴边收敛（dispFade：边界 0 → 向内满幅），边缘三通道重合无彩边
    float dispFade = clamp(-sdf / max(uDispersionPx, 1.0), 0.0, 1.0);
    half4 cR = uBlurred.eval(fragCoord - d * refraction - d * (uDispersionPx * dispFade));
    half4 cG = uBlurred.eval(fragCoord - d * refraction - d * (uDispersionPx * 0.5 * dispFade));
    half4 cB = uBlurred.eval(fragCoord - d * refraction);
    // it.10 边缘 AA：贴边 1px 内向 alpha 渐变（过渡带全在形内，不被视图侧无 AA
    // clipPath 切掉）；sdf=0 边界像素 alpha=0 → 曲线边缘无硬翻转阶梯
    float edgeAA = clamp(-sdf, 0.0, 1.0);
    return half4(cR.r, cG.g, cB.b, cG.a * edgeAA);
}
""".trim()

    /**
     * 构建透镜 RuntimeShader 实例（仅 API 33+ 可调，调用方必须先判 Build.VERSION）。
     * it.4：仅负责解析 AGSL 源码；uBlurred 输入由调用方逐帧 setInputShader 注入
     * （双缓冲槽位切换），全部 float uniform 由调用方每次 draw 重设。
     */
    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    fun createRuntimeShader(): RuntimeShader = RuntimeShader(SHADER_SOURCE)
}
