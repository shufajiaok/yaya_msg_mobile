#!/usr/bin/env node
/**
 * Liquid Glass P0 静态守卫（CI 雏形，纯 Node 内置模块，零 npm 依赖）
 *
 * 用法：
 *   node scripts/glass-guard.js                  检查（回归即退出码 1）
 *   node scripts/glass-guard.js --update-baseline  以当前工作副本重建基线
 *
 * 依据：03 §9 P0 第 8 项 / §9 P4 CI 守卫 / §3.5 禁止内联清单 / §13.3 已删除八项旧参数；
 *       04 §6.2 A1–A6（内容层禁玻璃）/ §8.2 五项必改；02 D1 / D7 / D9 / M23 / §4.1。
 *
 * 规则分两类：
 *   - 硬规则（违反即失败，与基线无关）：内容层保护、失效旧参数、引擎硬编码色、theme 内 10sp / 非法字重。
 *   - 基线规则（只允许「不新增」，不要求 P0 批量改 30 个页面）：
 *     R1 内联 rgba(...) 玻璃底色 / R2 BlurView / R3 硬编码 borderRadius /
 *     R4 内容层内的玻璃组件 / R5 玻璃 API 在 .tsx 的接入（S3）/ R6 10sp /
 *     R7 非法字重 / R9 surfaceGlass* 命名。
 *     374 处既有硬编码圆角（方案文档写 378，差异见 CHANGELOG）在基线中登记，P1–P3 分批收敛。
 *     R5 基线为 0：P0 零接入；QA 实验 C 证伪「普通页面仅 import GlassSurface 会被放行」，
 *     故按「总数基线、只拦新增」把四个玻璃 API 符号纳入统计，P1 起任何接线都必须显式走评审。
 *
 * 「禁止内联清单」的具体数值（03 §3.5 末段）P0 只登记、不改页面，见 LEGACY_INLINE_VALUES。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const ROOT_APP = path.join(ROOT, 'App.tsx');
const THEME_DIR = path.join(SRC_DIR, 'theme');
const BASELINE_PATH = path.join(__dirname, 'glass-guard.baseline.json');
const UPDATE_BASELINE = process.argv.indexOf('--update-baseline') !== -1;
const SHOW_HELP = process.argv.indexOf('--help') !== -1;

/** 03 §3.5 禁止内联清单：P0 只登记，P1 起改从 glass.ts 单一来源取值 */
const LEGACY_INLINE_VALUES = [
  'AppTabBar BlurView intensity 62 / 82',
  'FollowedRoomsScreen BlurView intensity 70',
  'MediaScreen rgba(18,18,20,0.92)',
  'navigation/index.tsx bgScrim 0.34',
  'App.tsx 根层遮罩 0.88 / 0.92',
  'tabBarStyle.ts 0.96 / 0.94 / 0.76 / 0.72',
];

const SCAN_EXTENSIONS = ['.ts', '.tsx'];
const EXCLUDED_DIRS = ['__tests__', 'node_modules', 'src_backup_20260513211107'];
const GLASS_USAGE_RE = /\b(?:BlurView|GlassSurface|resolveGlass|expo-blur)\b/;
/** S3：玻璃 API 四符号，统计 src 目录下 .tsx 的「新增接入」（P0 基线 0） */
const GLASS_API_RE = /\b(?:GlassSurface|resolveGlass|useGlassStore|useGlassBudget)\b/;
const CONTENT_LAYER_HINTS = /Danmaku|Bubble|Message|Card|Rank|Row|Chat|List|Feed/i;

/** 递归收集待扫描文件 */
function collectFiles(dir, out) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.indexOf(entry.name) === -1) collectFiles(full, out);
    } else if (SCAN_EXTENSIONS.indexOf(path.extname(entry.name)) !== -1) {
      out.push(full);
    }
  }
  return out;
}

const files = collectFiles(SRC_DIR, []);
if (fs.existsSync(ROOT_APP)) files.push(ROOT_APP);
files.sort();

/** 注释行判定：硬规则跳过注释，避免把「已删除参数登记说明」误判为残留 */
function isCommentLine(line) {
  const t = line.trim();
  return t.indexOf('//') === 0 || t.indexOf('*') === 0 || t.indexOf('/*') === 0;
}

function isThemeFile(file) {
  return file.indexOf(THEME_DIR + path.sep) === 0;
}

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

/** 逐规则收集命中（返回 {count, details}） */
function scanRule(ruleId) {
  let count = 0;
  const details = [];
  for (const file of files) {
    const rel = relative(file);
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (isCommentLine(line)) continue;
      let hit = false;
      switch (ruleId) {
        case 'inline-rgba-glass-bg':
          // theme/ 是语义 token 单一来源（hairline / separator 等），豁免
          hit = !isThemeFile(file) && /backgroundColor[^\n]*rgba\(/i.test(line);
          break;
        case 'blur-view':
          hit = /\bBlurView\b/.test(line);
          break;
        case 'hardcoded-border-radius':
          hit = /borderRadius\s*:\s*\d+(?:\.\d+)?/.test(line);
          break;
        case 'font-size-10':
          hit = /fontSize\s*:\s*10(?:\s|,|\)|}|;)/.test(line);
          break;
        case 'font-weight-invalid':
          hit = /fontWeight\s*:\s*['"](?:100|200|300|800|900)['"]/.test(line);
          break;
        case 'surface-glass-naming':
          hit = !isThemeFile(file) && /\bsurfaceGlass(?:Strong)?\b/.test(line);
          break;
        case 'glass-api-access':
          // S3：只统计 src/**/*.tsx（页面 / 组件层）。theme/*.ts 的定义与 index.ts 转发
          // 是「单一来源」自身，不计入；App.tsx 在仓库根，按任务口径不纳入该规则。
          // 与其余基线规则一致按「命中行数」计数，仅拦新增（基线 0）。
          hit = /\.tsx$/.test(file) && rel.indexOf('src/') === 0 && GLASS_API_RE.test(line);
          break;
        default:
          hit = false;
      }
      if (hit) {
        count += 1;
        if (details.length < 12) details.push(rel + ':' + (i + 1));
      }
    }
  }
  return { count, details };
}

/** R4 内容层内的玻璃组件：静态近似（文件名提示 或 含滚动容器）+ 玻璃组件使用 */
function scanContentLayerGlass() {
  const flagged = [];
  for (const file of files) {
    if (isThemeFile(file)) continue;
    const rel = relative(file);
    const source = fs.readFileSync(file, 'utf8');
    const hinted = CONTENT_LAYER_HINTS.test(path.basename(file)) || /<(?:ScrollView|FlatList|SectionList)\b/.test(source);
    if (!hinted) continue;
    const codeLines = source.split(/\r?\n/).filter((line) => !isCommentLine(line)).join('\n');
    if (GLASS_USAGE_RE.test(codeLines)) flagged.push(rel);
  }
  return flagged.sort();
}

/** 硬规则：立刻失败，不进基线 */
function scanHardRules() {
  const problems = [];
  const bannedParams = /\b(?:refractDp|refractMode|dispersion|edgeWidthDp|edgeGlow|legacyBackdrop|GLASS_DEFAULTS)\b/;
  const engineHardcode = /#7CA6FF|Color\(\s*0x/i;
  /**
   * D7 唯一例外（用户 2026-11-09 裁决：「只放开颜色，字号保 11sp」）：
   * dock tab 的选中/未选中色是原版 glasskit 库写死的**品牌玻璃色**
   * （GlassKitKt.java GlassBottomTabs：active #7CA6FF / inactive #9CA8BC），
   * 不是通用 Accent。仅允许在 theme/glassProfile.ts 内以
   * GLASS_DOCK_ACTIVE / GLASS_DOCK_INACTIVE 两个常量落地；
   * 其他文件、其他色值、其他常量名一律仍按 D7 拦截。
   */
  const brandGlassColorFile = 'src/theme/glassProfile.ts';
  const brandGlassColorLine = /\bGLASS_DOCK_(?:ACTIVE|INACTIVE)\b/;
  const danmakuRel = 'src/components/DanmakuOverlay.tsx';

  for (const file of files) {
    const rel = relative(file);
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (isCommentLine(line)) continue;
      const where = rel + ':' + (i + 1);
      if (bannedParams.test(line)) {
        problems.push('[旧参数残留] ' + where + ' — v2.1 已删除八项旧参数（03 §13.3）');
      }
      const isBrandGlassColor = rel === brandGlassColorFile && brandGlassColorLine.test(line);
      if (engineHardcode.test(line) && !isBrandGlassColor) {
        problems.push('[引擎硬编码色] ' + where + ' — 禁止落地 Accent #7CA6FF / Color(0xFF...)（03 §3.1 / D7）');
      }
      if (rel === danmakuRel && GLASS_USAGE_RE.test(line)) {
        problems.push('[内容层禁玻璃] ' + where + ' — DanmakuOverlay.tsx 必须保持原样、零玻璃（§9.2 / 02 D1）');
      }
      if (/layer\s*:\s*['"]content['"]/.test(line) && GLASS_USAGE_RE.test(line)) {
        problems.push('[layer 白名单] ' + where + ' — layer=content 时禁止玻璃组件（04 §6.2 A3）');
      }
      if (isThemeFile(file)) {
        if (/fontSize\s*:\s*10(?:\s|,|\)|}|;)/.test(line)) {
          problems.push('[最小 11sp] ' + where + ' — theme 内禁止 10sp（02 §4.1 / 03 §3.3）');
        }
        if (/fontWeight\s*:\s*['"](?:100|200|300|800|900)['"]/.test(line)) {
          problems.push('[字重白名单] ' + where + ' — theme 内字重只允许 400/500/600/700');
        }
      }
    }
  }
  return problems;
}

const BASELINE_RULES = [
  'inline-rgba-glass-bg',
  'blur-view',
  'hardcoded-border-radius',
  'font-size-10',
  'font-weight-invalid',
  'surface-glass-naming',
  'glass-api-access',
];

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  } catch (error) {
    return null;
  }
}

function main() {
  if (SHOW_HELP) {
    console.log('用法: node scripts/glass-guard.js [--update-baseline] [--help]');
    return 0;
  }

  const counts = {};
  const details = {};
  for (const rule of BASELINE_RULES) {
    const result = scanRule(rule);
    counts[rule] = result.count;
    details[rule] = result.details;
  }
  const contentLayerFiles = scanContentLayerGlass();
  const hardProblems = scanHardRules();

  if (UPDATE_BASELINE) {
    const payload = {
      version: 1,
      generatedAt: new Date().toISOString(),
      note: 'P0 基线：既有内联值只登记、不批量改页面；守卫只拦截「新增」。方案文档写 378 处硬编码圆角，工作副本实测见 hardcoded-border-radius。glass-api-access（R5/S3）基线 0：P0 零接入，任何 .tsx 层玻璃 API 接线都算新增。',
      counts: counts,
      contentLayerFiles: contentLayerFiles,
    };
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    console.log('== glass-guard 基线已更新 ==');
    console.log(BASELINE_PATH);
    for (const rule of BASELINE_RULES) console.log('  ' + rule + ': ' + counts[rule]);
    console.log('  content-layer-glass 文件数: ' + contentLayerFiles.length);
    return 0;
  }

  const baseline = readBaseline();
  const problems = [];
  if (!baseline) {
    problems.push('缺少基线文件 scripts/glass-guard.baseline.json，请先执行 --update-baseline');
  } else {
    for (const rule of BASELINE_RULES) {
      const previous = typeof baseline.counts[rule] === 'number' ? baseline.counts[rule] : 0;
      if (counts[rule] > previous) {
        // S3 自证要求：违规样本必须报「新增接入」
        const prefix = rule === 'glass-api-access'
          ? '[glass-api-access] 新增接入 '
          : '[' + rule + '] 新增 ';
        problems.push(
          prefix + (counts[rule] - previous) + ' 处（基线 ' + previous + ' → 当前 ' + counts[rule] + '）' +
          (details[rule].length ? '，示例: ' + details[rule].slice(0, 5).join(', ') : ''),
        );
      }
    }
    const known = new Set(baseline.contentLayerFiles || []);
    const added = contentLayerFiles.filter((item) => !known.has(item));
    for (const item of added) {
      problems.push('[content-layer-glass] 新增内容层玻璃文件 ' + item + '（02 D1 / 04 §6.2 A1、A3）');
    }
  }
  for (const item of hardProblems) problems.push(item);

  console.log('== Liquid Glass P0 静态守卫（' + files.length + ' 个源码文件）==');
  for (const rule of BASELINE_RULES) {
    const previous = baseline && typeof baseline.counts[rule] === 'number' ? baseline.counts[rule] : '—';
    console.log('  ' + rule + ': ' + counts[rule] + ' (基线 ' + previous + ')');
  }
  console.log('  content-layer-glass 文件: ' + contentLayerFiles.length);
  console.log('  硬规则命中: ' + hardProblems.length);
  console.log('');
  console.log('== 禁止内联清单（03 §3.5 末段，P0 只登记不改页面）==');
  for (const item of LEGACY_INLINE_VALUES) console.log('  - ' + item);
  console.log('');

  if (problems.length > 0) {
    console.log('❌ FAIL：发现 ' + problems.length + ' 处回归');
    for (const problem of problems) console.log('  ' + problem);
    return 1;
  }
  console.log('✅ PASS：无新增内联玻璃底色 / BlurView / 硬编码圆角 / 内容层玻璃，硬约束全部通过');
  console.log('   说明：typecheck 未执行（依赖未安装 + 网络中断），本守卫为纯 Node 静态检查。');
  return 0;
}

process.exitCode = main();
