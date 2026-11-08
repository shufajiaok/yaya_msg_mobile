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
 * - uniform float uDispersionPx      ：色散幅度（px，已乘 lensScale；0 = 关闭色散）
 * - uniform float uLensBandPx        ：it.19 折射带高（px，已乘 lensScale）
 * - uniform float uCornerRadiusPx    ：圆角半径（px，已钳 min(w,h)/2）
 * - uniform float uCornerExponent    ：it.13 连续曲率超椭圆指数 n（Path 同源）
 * - uniform float uDepthEffect       ：it.13 景深开关（0/1）
 * （it.19 P0-4 起**没有** uVibrancy：鲜活度回归 RenderEffect 的 ColorFilter 链。）
 *
 * it.19 P0-3（透镜剖面）—— 对齐原版 `ShadersKt.java:11 RoundedRectRefractionShaderString`：
 * - 剖面由「线性 `clamp(1 + sdf/refraction)`」改为**圆透镜 `circleMap`**：
 *     `t = clamp(1 - (-sdf)/uLensBandPx, 0, 1)`；`d = (1 - sqrt(1 - t²)) × uRefractionPx`
 *   线性剖面在带内 50% 处仍有 50% 位移（整条带一起被拽），circleMap 在同处只有 13%，
 *   位移集中在贴边一圈 —— 这是「玻璃被弯折」与「整条带糊了一圈」的分界。
 * - 带外自动直通：`t = 0 ⇒ d = 0 ⇒ 采样点不变`，等价于原版的
 *   `if (-sd >= refractionHeight) return content.eval(coord)` 早退，无需分支。
 * - 法线改用**放大半径**的 SDF（`gradRadius = min(r × 1.5, min(w,h)/2)`）：
 *   角部法线更平滑，避免原实现「角部法线在 r 内剧烈旋转 → 聚光/尖角拖尾」。
 *
 * it.19 P0-4（色散）—— 对齐原版 `ShadersKt.java:12 ...WithDispersionShaderString`：
 * - 3-tap RGB → **7-tap 光谱**（红橙黄绿青蓝紫），权重 `r,g,b` 各 3×(1/3.5)+1×(1/7)=1、
 *   `a` 7×(1/7)=1（原版是归一化过的 7 点重采样）。
 * - 强度改为 **∝ d ∝ 贴边最强**，并乘 `(p.x·p.y)/(halfW·halfH)` **象限符号** ⇒
 *   一对对角偏暖、另一对偏冷（真实棱镜感）。
 *   旧实现的 `dispFade = clamp(-sdf/disp, 0, 1)`（贴边 0、内缘 1）方向相反，
 *   彩边出现在**带内侧**而不是轮廓上，本轮删除。
 * - 色散幅度以「相对折射位移的倍数」解释：`uDispersionPx / max(uRefractionPx,1)`
 *   （原版这里就是 `d * grad`，没有独立幅度参数）。默认两者 1:1 = 原版。
 * - `uDispersionPx = 0`（开关关闭）时走单 tap 分支，零多余采样。
 *
 * it.13 方案 B（Path + AGSL SDF 统一超椭圆）保持：
 * - `sdContinuous` 的 n 与本帧 clipPath 同源 ⇒ clip 边界与 SDF 零点严格重合；
 * - `n = max(uCornerExponent, 2.0)` 兜底（回录帧未下发 uniform 时退化圆弧，零 NaN）；
 * - `n = 2` 时 `sdContinuous` 与 `sdRoundRect` 逐位等价（胶囊 / 面板回圆弧后都走这里）。
 *
 * ⚠️ 软画布快照回录路径不支持 RuntimeShader（it.8-fix1）：本 shader 只在
 * 硬件加速画布的 drawLensLayer 里创建/下发，回录帧走纯模糊降级。
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
uniform float uLensBandPx;
uniform float uCornerRadiusPx;
uniform float uCornerExponent;
uniform float uDepthEffect;

// it.19 圆透镜剖面（原版 ShadersKt.java:11 circleMap）。
// x=0 → 0（带内缘无位移）；x=1 → 1（贴边满位移），且起步平缓、贴边陡。
float circleMap(float x) {
    return 1.0 - sqrt(max(1.0 - x * x, 0.0));
}

// it.13 连续曲率超椭圆 SDF：p 相对中心，b 半尺寸，r 圆角，n 指数。
// n=2 时逐位等价于 sdRoundRect（L2 范数=欧氏距离，梯度模长=1）。
// ⚠️ 形内 S=0 的梯度为 0：若按 1e-4 兜底做 f/gn，会得到巨大负距离 →
//    剖面归零；正解 = 形内取 gn=1 ⇒ f/gn = -r，返回 -r + min(max(q.x,q.y),0)，
//    与圆弧 SDF 逐位一致；同时规避 pow(0, 1/n-1)=inf × 0 → NaN。
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

    // ① it.19 P0-3：圆透镜剖面。band 未下发时兜底 1px 防除零（NaN 会直接出黑块）。
    // sdf 形内为负 ⇒ -sdf = 距轮廓深度；深度 ≥ band 时 t=0 ⇒ 位移 0（带外直通）。
    float band = max(uLensBandPx, 1.0);
    float t = clamp(1.0 - (-sdf) / band, 0.0, 1.0);
    float dScalar = circleMap(t) * max(uRefractionPx, 0.0);

    // ② 法线：放大半径的 SDF（原版 gradRadius = min(radius*1.5, min(halfSize))），
    //    距离判定仍用真半径，只有求梯度时替换 —— 角部法线更平滑。
    float gradRadius = min(uCornerRadiusPx * 1.5, min(center.x, center.y));
    float2 nrm = sdfNormal(p, center, gradRadius, n);

    // ③ it.13 景深：法线叠加径向分量并归一化
    //    （原版 normalize(grad + depthEffect * normalize(centeredCoord))）。
    if (uDepthEffect > 0.5) {
        float2 radial = length(p) > 0.0001 ? normalize(p) : float2(0.0);
        float2 mixed = nrm + radial;
        float ml = length(mixed);
        nrm = ml > 0.0001 ? mixed / ml : nrm;
    }

    // ④ 位移指向形内（原版把 refractionAmount 取负后传 uniform，等价）。
    float2 inner = -nrm * dScalar;
    float2 refractedCoord = fragCoord + inner;

    half4 composite = half4(0.0);
    if (uDispersionPx > 0.5) {
        // ⑤ it.19 P0-4：7-tap 光谱 + 象限符号 + ∝ 贴边最强
        //    dispK：色散幅度相对折射位移的倍数（原版此处即 d*grad，无独立幅度）；
        //    intensity 含 (p.x·p.y)/(halfW·halfH) 象限符号 ∈ [-1, 1]。
        float dispK = uDispersionPx / max(uRefractionPx, 1.0);
        float intensity = dispK * ((p.x * p.y) / max(center.x * center.y, 1.0));
        float2 sc = inner * intensity;

        half4 cRed    = uBlurred.eval(refractedCoord + sc);
        half4 cOrange = uBlurred.eval(refractedCoord + sc * (2.0 / 3.0));
        half4 cYellow = uBlurred.eval(refractedCoord + sc * (1.0 / 3.0));
        half4 cGreen  = uBlurred.eval(refractedCoord);
        half4 cCyan   = uBlurred.eval(refractedCoord - sc * (1.0 / 3.0));
        half4 cBlue   = uBlurred.eval(refractedCoord - sc * (2.0 / 3.0));
        half4 cPurple = uBlurred.eval(refractedCoord - sc);

        // 权重与原版逐项一致：r = 3×(1/3.5) + 1×(1/7) = 1，g/b = 3×(1/3.5) = 0.857，
        // a = 7×(1/7) = 1（7 点光谱重采样，已归一化）。
        float cr = cRed.r / 3.5 + cOrange.r / 3.5 + cYellow.r / 3.5 + cPurple.r / 7.0;
        float cg = cOrange.g / 7.0 + cYellow.g / 3.5 + cGreen.g / 3.5 + cCyan.g / 3.5;
        float cb = cCyan.b / 3.0 + cBlue.b / 3.0 + cPurple.b / 3.0;
        float ca = (cRed.a + cOrange.a + cYellow.a + cGreen.a + cCyan.a + cBlue.a + cPurple.a) / 7.0;
        composite = half4(cr, cg, cb, ca);
    } else {
        // 色散关闭：单 tap（旧路径逐位等价，零多余采样）
        composite = uBlurred.eval(refractedCoord);
    }

    // it.10 边缘 AA：贴边 1px 内向 alpha 渐变（表达式保留不动）
    float edgeAA = clamp(-sdf, 0.0, 1.0);
    // it.19 P0-4：鲜活度（saturation=1.5）**移出 shader**，回归原版 ColorFilter 链
    // （ColorFilterKt.java:16,57-60 挂的是 RenderEffect 里的 ColorMatrixColorFilter，
    //  原版 lens shader 从不做 saturation）。原来塞在这里有三个缺口：
    //  ① 只有 API33+ 硬件透镜帧有饱和，纯模糊面板 / API31–32 完全没有；
    //  ② 7-tap 之后像素是单一合成色，矩阵输入要从 cR.r/cG.g/cB.b 改写成 composite.rgb；
    //  ③ 每像素多一次 3×3 矩阵运算。
    return half4(composite.r, composite.g, composite.b, composite.a * edgeAA);
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
