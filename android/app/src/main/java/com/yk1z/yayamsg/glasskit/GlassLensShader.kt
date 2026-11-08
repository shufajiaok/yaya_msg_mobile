package com.yk1z.yayamsg.glasskit

import android.graphics.RuntimeShader
import android.os.Build
import androidx.annotation.RequiresApi

/**
 * GlassKit AGSL 透镜着色器（引擎重写清单 §一 / §二.3，仅 API 33+）。
 *
 * Shader 契约（与 GlassKitView 喂参一一对应）：
 * - uniform shader uBlurred          ：模糊后的背景位图（BitmapShader, CLAMP；
 *                                      it.4 起由视图侧双缓冲逐帧 setInputShader 切换）
 * - uniform float2 uSize             ：玻璃面板尺寸（px，本地坐标系）
 * - uniform float uRefractionPx      ：折射位移幅度（px，已乘 lensScale）
 * - uniform float uDispersionPx      ：色散位移幅度（px，已乘 lensScale）
 * - uniform float uCornerRadiusPx    ：圆角半径（px，已钳 min(w,h)/2）
 * - uniform float uCornerExponent    ：it.13 连续曲率超椭圆指数 n（Path 同源）
 * - uniform float uDepthEffect       ：it.13 景深开关（0/1）
 * - uniform float uVibrancy          ：it.13 鲜活度 shader 矩阵开关（0/1，默认路径）
 *
 * it.13 改造（方案 B：Path + AGSL SDF 统一超椭圆）：
 * - sdRoundRect → sdContinuous(p, b, r, n)，n 由 ContinuousRoundRect
 *   .cornerExponent 计算，与本帧 clipPath 用同一个值 —— clip 边界与
 *   SDF 零点严格重合（否则角部会出现「裁剪到位但透镜法线错位」的彩边/锯齿）。
 * - n=2 时 sdContinuous 与 sdRoundRect 逐位等价（L2 范数 + 单位梯度），
 *   胶囊 / 正方形命中 n=2 硬守卫 → it.12 观感零回归。
 * - edgeAA=clamp(-sdf,0,1)（it.10）与 dispFade=clamp(-sdf/max(uDispersionPx,1),0,1)
 *   （it.11）表达式原样保留，只替换 SDF 函数体与调用处。
 *
 * 实现要点：
 * - 法线：SDF 中心差分梯度（eps=0.5px），归一化为外向法线；
 * - 边缘系数 edgeFactor = clamp(1 + sdf/uRefractionPx, 0, 1)：贴边为 1、
 *   向内按 uRefractionPx 线性衰减到 0（SDF 内部为负，符号订正见 it.2 注释）；
 * - 折射位移：uv' = uv - normal * edgeFactor * uRefractionPx；
 * - 色散：R/G/B 以 uDispersionPx 的 1.0/0.5/0.0 倍错开位移采样，取
 *   cR.r / cG.g / cB.b 合成；dispFade 令边界像素三通道严格重合（it.11 无彩边）；
 * - 形外像素（sdf > 0）返回透明，配合视图侧连续曲率 clip 双保险。
 *
 * ⚠️ 软画布快照回录路径不支持 RuntimeShader（it.8-fix1）：本 shader 只在
 * 硬件加速画布的 drawLensLayer 里创建/下发，回录帧走纯模糊降级，不调用
 * setFloatUniform。为防 uniform 未下发（默认 0）导致 pow(0,负数)/NaN，
 * main 内统一 n = max(uCornerExponent, 2.0) 兜底退化为圆弧；sdContinuous
 * 内 S=0 时 gn 取 1（形内梯度兜底）避免 NaN。uVibrancy 默认 0 ⇒ 鲜活度
 * 矩阵分支跳过，回录帧与 it.12 逐位等价、不抛异常。
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
uniform float uCornerExponent;
uniform float uDepthEffect;
uniform float uVibrancy;

// it.13 连续曲率超椭圆 SDF：p 相对中心，b 半尺寸，r 圆角，n 指数。
// n=2 时逐位等价于 sdRoundRect（L2 范数=欧氏距离，梯度模长=1）。
// ⚠️ 形内 S=0 的梯度为 0：若按 1e-4 兜底做 f/gn，会得到 -r/1e-4 的
//    巨大负距离 → edgeFactor=clamp(1+sdf/refraction,0,1) 在形内直接归零
//    （折射只剩贴边 1px），且与 sdRoundRect 不等价。正解 = 形内取 gn=1
//    ⇒ f/gn = -r，返回 -r + min(max(q.x,q.y),0)，与圆弧 SDF 逐位一致；
//    同时规避 pow(0, 1/n-1)=inf × 0 → NaN（it.8-fix1 崩溃同类教训）。
float sdContinuous(float2 p, float2 b, float r, float n) {
    float2 q  = abs(p) - b + r;
    float2 qc = max(q, float2(0.0));
    float  S  = pow(qc.x, n) + pow(qc.y, n);
    float  f  = pow(S, 1.0/n) - r;
    float2 g  = S > 0.0
        ? pow(qc, float2(n-1.0)) * pow(S, 1.0/n - 1.0)
        : float2(0.0);
    float  gn = S > 0.0 ? max(length(g), 0.0001) : 1.0;
    return f / gn + min(max(q.x, q.y), 0.0);
}

// SDF 梯度（中心差分近似）⇒ 外向法线；n 与 sdContinuous 同源，Path/SDF 零点严格重合
float2 sdfNormal(float2 p, float2 b, float r, float n) {
    float e = 0.5;
    float2 g = float2(
        sdContinuous(p + float2(e, 0.0), b, r, n) - sdContinuous(p - float2(e, 0.0), b, r, n),
        sdContinuous(p + float2(0.0, e), b, r, n) - sdContinuous(p - float2(0.0, e), b, r, n)
    );
    float len = length(g);
    return len > 0.0 ? g / len : float2(0.0);
}

half4 main(float2 fragCoord) {
    float2 center = uSize * 0.5;
    float2 p = fragCoord - center;
    // 回录/降级帧未下发 uCornerExponent(=0) 或非法值 → 一律退化为圆弧，零 NaN
    float n = max(uCornerExponent, 2.0);
    float sdf = sdContinuous(p, center, uCornerRadiusPx, n);
    if (sdf > 0.0) {
        return half4(0.0);
    }
    float refraction = max(uRefractionPx, 1.0);
    float edgeFactor = clamp(1.0 + sdf / refraction, 0.0, 1.0);
    float2 n0 = sdfNormal(p, center, uCornerRadiusPx, n);
    float2 d = n0 * edgeFactor;
    // it.13 景深：法线叠加径向分量并归一化（ShadersKt.java 的
    // normalize(grad + depthEffect * normalize(centeredCoord))）。
    // 关闭时（uDepthEffect=0）完全走原 n0 路径，与 it.12 逐位等价、零 NaN。
    if (uDepthEffect > 0.5) {
        float2 radial = length(p) > 0.0001 ? normalize(p) : float2(0.0);
        float2 mixed = n0 + radial;
        float ml = length(mixed);
        d = (ml > 0.0001 ? mixed / ml : n0) * edgeFactor;
    }
    // it.11 色散贴边收敛（dispFade：边界 0 → 向内满幅），表达式保留不动
    float dispFade = clamp(-sdf / max(uDispersionPx, 1.0), 0.0, 1.0);
    half4 cR = uBlurred.eval(fragCoord - d * refraction - d * (uDispersionPx * dispFade));
    half4 cG = uBlurred.eval(fragCoord - d * refraction - d * (uDispersionPx * 0.5 * dispFade));
    half4 cB = uBlurred.eval(fragCoord - d * refraction);
    // it.10 边缘 AA：贴边 1px 内向 alpha 渐变（表达式保留不动）
    float edgeAA = clamp(-sdf, 0.0, 1.0);
    // it.13 鲜活度默认路径（主理人新指令：跳过真机取证，选风险最低者）：
    // VIBRANCY_SHADER_FALLBACK=true ⇒ uVibrancy=1，由 shader 末矩阵承担
    // saturation=1.5；不触碰 GPU 模糊链 / RenderEffect / propGeneration。
    // 矩阵 = ColorFilterKt.java:16 / 75-85 colorControls(saturation=1.5) 实算：
    // [1.3935,-0.3575,-0.036; -0.1065,1.1425,-0.036; -0.1065,-0.3575,1.464]。
    // uVibrancy=0（vibrancyEnabled=false / GPU 备选路径 / 回录帧未下发）⇒
    // 该分支零开销，逐位等价 it.12。
    if (uVibrancy > 0.5) {
        // 逐分量标量写法（不依赖 half3 / clamp(genType,...) 重载，降低 AGSL
        // 编译差异风险）；三行即 ColorFilterKt.java:85 的 4x5 矩阵前三行。
        float vr = clamp(1.3935 * cR.r - 0.3575 * cG.g - 0.036 * cB.b, 0.0, 1.0);
        float vg = clamp(-0.1065 * cR.r + 1.1425 * cG.g - 0.036 * cB.b, 0.0, 1.0);
        float vb = clamp(-0.1065 * cR.r - 0.3575 * cG.g + 1.464 * cB.b, 0.0, 1.0);
        return half4(vr, vg, vb, cG.a * edgeAA);
    }
    return half4(cR.r, cG.g, cB.b, cG.a * edgeAA);
}
""".trim()

    /**
     * 构建透镜 RuntimeShader 实例（仅 API 33+ 可调，调用方必须先判 Build.VERSION）。
     * it.4：仅负责解析 AGSL 源码；uBlurred 输入由调用方逐帧 setInputShader 注入
     *（双缓冲槽位切换），全部 float uniform 由调用方每次 draw 重设。
     */
    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    fun createRuntimeShader(): RuntimeShader = RuntimeShader(SHADER_SOURCE)
}
