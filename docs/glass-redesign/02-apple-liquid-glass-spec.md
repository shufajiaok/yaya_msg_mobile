# Apple Liquid Glass 设计规范硬约束清单

> **项目**：口袋48 第三方社区 App（React Native / Android）UI 高级审美重构
> **用户风格关键词**：大悬浮 UI、大圆角、英雄文字、简洁、高度适配液态玻璃
> **文档定位**：只读调研产物，可直接指导设计与实现的设计规范硬约束清单（不是技术方案，技术选型交由架构师）
> **核验方式**：WebFetch 抓取 Apple Developer 官方页面原文，核验时间 2026-11-06
> **适用说明**：本项目运行于 Android / React Native，**没有原生 Liquid Glass API**。下文所有「Android/RN 落地」均为「以官方规范为验收标准的近似实现」，不是官方 API 移植。

## 标注体系（全文通用）

| 标记 | 含义 |
| --- | --- |
| 【官方硬值】 | Apple 原文明确给出的数值或明确措辞（must / don't / only / prefer 等） |
| 【官方示例值】 | Apple 官方示例代码/文档里出现的值，非强制规范 |
| 【官方未规定·建议值】 | 官方只给定性原则、未给数字，由本清单给出可落地建议，需实测校准 |
| 【未二次核验】 | 本轮 WebFetch 未能抓取到原文，采用主理人提供的官方摘录，**不臆造条款** |

---

## 0. 来源索引与核验状态

正文用 `[M]`、`[SW]` 等形式逐条引用，完整 URL 见下表（均为 Apple 官方域名）。

| 编号 | 页面 | URL | 状态 | 页面 Change log 最新日期 |
| --- | --- | --- | --- | --- |
| [M] | HIG · Materials | https://developer.apple.com/design/human-interface-guidelines/materials | ✅ 已二次核验 | 2025-06-09 加入 Liquid Glass |
| [L] | HIG · Layout | https://developer.apple.com/design/human-interface-guidelines/layout | ✅ 已二次核验 | 2026-09-09 |
| [T] | HIG · Typography | https://developer.apple.com/design/human-interface-guidelines/typography | ✅ 已二次核验（首次抓取失败，带锚点重试成功） | — |
| [C] | HIG · Color `#Liquid-Glass-color` | https://developer.apple.com/design/human-interface-guidelines/color | ✅ 已二次核验 | 2025-12-16 Updated guidance for Liquid Glass |
| [TB] | HIG · Tab bars | https://developer.apple.com/design/human-interface-guidelines/tab-bars | ✅ 已二次核验 | 2026-06-08 |
| [TO] | HIG · Toolbars | https://developer.apple.com/design/human-interface-guidelines/toolbars | ✅ 已二次核验（首次抓取失败，带锚点重试成功） | 2025-12-16 Updated guidance for Liquid Glass |
| [B] | HIG · Buttons | https://developer.apple.com/design/human-interface-guidelines/buttons | ✅ 已二次核验 | 2025-12-16 Updated guidance for Liquid Glass |
| [SH] | HIG · Sheets | https://developer.apple.com/design/human-interface-guidelines/sheets | ✅ 已二次核验 | 2026-03-24 |
| [SV] | HIG · Scroll views `#Scroll-edge-effects` | https://developer.apple.com/design/human-interface-guidelines/scroll-views | ✅ 已二次核验 | 2026-06-08 Updated guidance for scroll edge effects |
| [A] | HIG · Accessibility | https://developer.apple.com/design/human-interface-guidelines/accessibility | ✅ 已二次核验 | — |
| [MO] | HIG · Motion | https://developer.apple.com/design/human-interface-guidelines/motion | ✅ 已二次核验 | 2025-09-09 Added guidance for Liquid Glass |
| [LV] | HIG · Live-viewing apps | https://developer.apple.com/design/human-interface-guidelines/live-viewing-apps | ✅ 已二次核验 | — |
| [SW] | SwiftUI · Applying Liquid Glass to custom views | https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views | ✅ 已二次核验 | — |
| [W356] | WWDC25 · 356 Get to know the new design system | https://developer.apple.com/videos/play/wwdc2025/356/ | ⚠️ 部分核验：抓到 0:00–4:44 文字稿（系统色重校准、排版更粗左对齐、concentricity 引子与 fixed 形状）；capsule / concentric 公式、边缘按钮边距为【未二次核验】，采用主理人摘录 | — |
| [W219] | WWDC25 · 219 Meet Liquid Glass | https://developer.apple.com/videos/play/wwdc2025/219/ | ⚠️【未二次核验】采用主理人官方摘录 | — |
| [W201] | WWDC · Meet With Apple 201 | — | ⚠️【未二次核验】采用主理人官方摘录；其中「相关符号共享同一块玻璃」「文字/符号控件分开」「次要动作收进 More」已由 [TO] 原文独立佐证 | — |
| [PV] | HIG · Playing video | https://developer.apple.com/design/human-interface-guidelines/playing-video | ❌ 抓取失败（仅返回外观选择器），本清单**未据该页写入任何条款** | — |

> **补充核对结论**：主理人要求的 4 组补充核对中，`Color#Liquid-Glass-color`、`Accessibility`、`Sheets`、`Scroll views`、`Buttons`、`Toolbars`、`Live-viewing apps` 全部取得官方原文。其中需要特别说明的两点：
> 1. **Reduce Transparency**：官方只在 [M] 说明「两个变体的外观会响应 reduce transparency / increase contrast 等辅助功能设置」，**HIG 未给出玻璃在该设置下的具体降级数值或实现方式**。本清单给出的降级方案均标注为【官方未规定·建议值】。
> 2. **Sheets**：官方原文**没有**直接针对 Liquid Glass 的条款，相关可落地内容为 grabber / detents / dimming / 一次只显示一个 sheet，已如实收录，不强行附会为玻璃条款。

---

## 0.1 关键冲突预警：用户诉求 vs 官方硬约束（设计前必读）

用户要的「大悬浮、大圆角、英雄文字」与 Liquid Glass 规范**总体不冲突，但「高度适配液态玻璃 ≠ 到处套玻璃」**。最大的翻车风险是把玻璃铺到内容层。

| 用户关键词 | 官方对应约束 | 调和结论（本项目采纳） |
| --- | --- | --- |
| **大悬浮 UI** | [M]：玻璃天生是「控件与导航的功能层，浮在内容层之上」；[L]：用 scroll edge effect 让控件浮起来，不要在控件下垫实色/半透明底板 | ✅ 完全合规。把「大悬浮」集中到 **3 个功能层组件**：底部 tab bar、顶部/播放器悬浮控件条、主行动按钮（上麦）。靠**尺寸、留白、悬浮阴影**营造大气感，而不是靠增加玻璃数量 |
| **大圆角** | [SW]：默认 `Capsule`；大组件用 `.rect(cornerRadius:)`；[W356]：同心几何；[TO]：自定义控件圆角须与 bar 圆角同心 | ✅ 合规路径是 **capsule（圆角 = 高度/2）+ 大圆角矩形 + 同心嵌套**。密集信息区（消息气泡、榜单行、弹幕）仍用较小圆角矩形，不得为了「大圆角」牺牲信息密度 |
| **英雄文字** | [T]：Large Title 31 pt、强调变体 Bold、最小 11 pt、必须 Dynamic Type；[W356]：新系统排版「bolder and left-aligned」用于 alerts / onboarding 等关键场景 | ✅ 合规。仅用于**房间名 / 直播标题 / 空态主文案**，每屏 1 处，31–41 sp Bold 左对齐；**不得**用在 tab 标签、工具栏、弹幕、按钮文字上 |
| **简洁** | [M] Use Liquid Glass effects sparingly；[TO] 分组 ≤3、次要动作进 More；[TB] ≤5 tab；[C] 内容花时导航用单色 | ✅ 天然一致。「简洁」正是规范要求，可作为拒绝「给每个元素加玻璃」的依据 |
| **高度适配液态玻璃** | [L] 全屏背景延伸到 bar 下方；[SV] scroll edge effect；[M] regular/clear 按语义选；[C] vibrant 色 | ✅ 落地为「背景 bleed + 滚动边缘效果 + 按语义选变体 + 玻璃上用 vibrant 色」，而非「更多玻璃」 |

> 🚨 **一号红线**：给**弹幕、聊天气泡、榜单卡片、礼物卡片、房间封面卡片**套玻璃，同时违反 [M]「Don't use Liquid Glass in the content layer」与 [SW] 性能红线，且在 Android/RN 上是逐帧 GPU 灾难。这几类必须用内容层的 **standard materials（ultraThin / thin / regular / thick）或实色卡片 + 圆角 + 分层阴影**。[M]

---

## 1. 硬性必须（Must）

| # | 条款 | 官方要点 | 来源 |
| --- | --- | --- | --- |
| M1 | **玻璃只用于功能层** | Liquid Glass 形成「控件与导航的功能层」，浮在内容层之上；内容从下方滚动透出，同时保持控件可读性 | https://developer.apple.com/design/human-interface-guidelines/materials [M] |
| M2 | **内容层用 standard materials** | 内容层（app 背景等）用 standard materials；iOS/iPadOS 提供 ultraThin / thin / regular / thick 四档 | [M] |
| M3 | **唯一例外：瞬时交互控件** | 内容层里带瞬时交互的控件（slider / toggle）**在激活时**才呈现玻璃外观，用于强调其可交互性 | [M] |
| M4 | **克制使用，只给最重要功能元素** | 系统标准组件自动获得玻璃外观；自定义控件要 sparingly，把效果限制在最重要的功能元素 | [M] |
| M5 | **按语义挑材质，不按观感挑颜色** | 「Avoid selecting a material or effect based on the apparent color it imparts」；材质上方必须用 vibrant 色保证对比 | [M] |
| M6 | **regular / clear 按语义二选一** | `regular` 模糊 + 调整亮度保证文字可读，用于大量文字的 alerts / sidebars / popovers（含 scroll edge effects）；`clear` 高透，**只**用于浮在照片/视频等视觉丰富背景之上的组件 | [M] |
| M7 | **clear + 亮底必须加 35% 黑色 dimming** | 「If the underlying content is bright, consider adding a dark dimming layer of 35% opacity」；底层够暗或用 AVKit 自带 dimming 的播放控件则不用 | [M] |
| M8 | **控件与内容必须视觉分离，且不得垫底板** | 「Instead of applying a solid or semi-opaque background color beneath controls, use a scroll edge effect」 | https://developer.apple.com/design/human-interface-guidelines/layout [L] |
| M9 | **全屏背景延伸到 bar 下方** | 全屏背景内容要延伸铺满 sidebar / toolbar / tab bar 下方 | [L] |
| M10 | **scroll edge effect 只在有浮动控件时使用** | 「Only use a scroll edge effect when a scroll view is behind floating interface elements」，它不是装饰，不阻挡/压暗内容 | https://developer.apple.com/design/human-interface-guidelines/scroll-views [SV] |
| M11 | **每个 view 只能有一个 scroll edge effect** | 「Apply one scroll edge effect per view」 | [SV] |
| M12 | **优先 automatic 样式** | 默认 automatic 为控件多、玻璃外有文字、固定表头的顶部工具栏提供更不透的分离；选 soft 必须充分测试可读性 | [SV] |
| M13 | **tab bar 只做导航、不做动作** | 对当前视图元素执行操作请用 toolbar | https://developer.apple.com/design/human-interface-guidelines/tab-bars [TB] |
| M14 | **tab bar 常驻可见** | 隐藏会让人忘记所处位置；唯一例外是模态覆盖 | [TB] |
| M15 | **tab 不得禁用或隐藏** | 即使内容不可用也保持可用，空态要解释原因 | [TB] |
| M16 | **tab 用单词标签 + filled SF Symbols** | 「Use single words whenever possible」；「Prefer filled symbols or icons」 | [TB] |
| M17 | **避免标签色与内容层背景色相近** | 内容层明亮花哨时，tab bar / toolbar / 按钮标签优先用默认单色（monochromatic）外观 | https://developer.apple.com/design/human-interface-guidelines/color [C]、[TB]、https://developer.apple.com/design/human-interface-guidelines/toolbars [TO]、https://developer.apple.com/design/human-interface-guidelines/buttons [B] |
| M18 | **自定义色必须提供 4 套变体** | light / dark / increased contrast(light) / increased contrast(dark)；**「Even if your app ships in a single appearance mode, provide both light and dark colors to support Liquid Glass adaptivity」** | [C] |
| M19 | **玻璃上文字必须满足 WCAG AA 对比度** | ≤17 pt 4.5:1；18 pt 3:1；Bold 3:1；默认不达标时至少在 Increase Contrast 开启时提供高对比配色；深浅色两种外观都要验 | https://developer.apple.com/design/human-interface-guidelines/accessibility [A] |
| M20 | **必须支持 Dynamic Type** | 布局适配所有字号；大字号时横排改堆叠、减少列数、图标同步放大、尽量少截断、保持层级 | https://developer.apple.com/design/human-interface-guidelines/typography [T]、[L] |
| M21 | **避免 Ultralight / Thin / Light 字重** | 优先 Regular / Medium / Semibold / Bold；字重、字号、颜色共同建立层级；字体家族数量最少化 | [T] |
| M22 | **遵守安全区与 size classes** | 尊重 safe area，避免被系统 UI / 硬件挖孔遮挡；多设备、多字号、多语言预览 | [L] |
| M23 | **多个玻璃组件必须放进同一个容器** | 「Use `GlassEffectContainer` when applying Liquid Glass effects on multiple views to achieve the best rendering performance」，容器同时负责形状融合与形变 | https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views [SW] |
| M24 | **限制同屏玻璃数量** | 「Limit the use of Liquid Glass effects onscreen at the same time」；容器太多或散落在容器外的效果太多会掉帧 | [SW] |
| M25 | **玻璃默认形状与变体** | `glassEffect(_:in:)` 默认 `regular` + `Capsule`；大组件改用 `.rect(cornerRadius:)`；`tint` 表强调；`interactive()` 让控件实时响应触摸 | [SW] |
| M26 | **玻璃对触摸实时响应** | 材质「reacts to touch and pointer interactions in real time」；[MO] 补充：直接触摸时动效更强，触控板输入时更克制 | [SW]、https://developer.apple.com/design/human-interface-guidelines/motion [MO] |
| M27 | **toolbar 用符号而非文字** | 「Prefer simple, recognizable symbols for items instead of text」；优先无边框系统符号（自带 vibrancy）；标准控件圆角须与 bar 圆角同心 | [TO] |
| M28 | **带文字的控件与带符号的控件分开** | 相邻会被误认为同一个「文字+符号」动作；多个文字按钮之间要插入 fixed space | [TO] |
| M29 | **减少 toolbar 自定义背景与着色控件** | 「Reduce the use of toolbar backgrounds and tinted controls」；自定义背景会干扰系统提供的背景效果，改用内容层 informing + `ScrollEdgeEffectStyle` | [TO] |
| M30 | **toolbar 仅一个 primary action，放尾端，用 `.prominent`** | 「Only specify one primary action, and put it on the trailing side」 | [TO] |
| M31 | **一次只显示一个 sheet；Done 必须配 Cancel 或 Back** | 不要同时出现 Cancel / Done / Back 三者 | https://developer.apple.com/design/human-interface-guidelines/sheets [SH] |
| M32 | **直播内容优先** | 「Live-viewing apps need to elevate and prioritize live content」；每个屏幕都要让人一眼区分直播与点播；一键（甚至零点击）起播，点击后 UI 让位给全屏沉浸播放 | https://developer.apple.com/design/human-interface-guidelines/live-viewing-apps [LV] |
| M33 | **直播浏览层（content footer）要做压暗处理** | 「Give it a subtle treatment, such as a darkening, to keep text legible」；唤起/收起方式要简单可预期（如上滑唤起、下滑收起） | [LV] |
| M34 | **动效必须可选、简短精确** | 「Make motion optional」不得以动效作为传达重要信息的唯一方式；「Aim for brevity and precision」；高频交互一般不加动效；可取消 | [MO] |
| M35 | **Reduce Motion 开启时降级** | 减少自动/重复动画（含缩放与周边运动）；收紧弹簧减回弹；动画跟随手势；避免 z 轴层级深度变化；x/y/z 位移改 fade；**避免进出模糊的动画** | [A]、[MO] |

---

## 2. 明确禁止（Don't）

| # | 禁止项 | 官方原文要点 | 来源 |
| --- | --- | --- | --- |
| D1 | 🚫 **禁止在内容层使用 Liquid Glass** | 「Don't use Liquid Glass in the content layer.」——会造成不必要的复杂度和混乱的视觉层级 | [M] |
| D2 | 🚫 **禁止给控件下方垫实色 / 半透明底板** | 用 scroll edge effect 让控件浮起来，不要加底板 | [L] |
| D3 | 🚫 **禁止把 clear 变体用在非媒体背景上** | 「Only use clear Liquid Glass for components that appear over visually rich backgrounds」 | [M] |
| D4 | 🚫 **禁止滥用自定义玻璃控件** | 多个自定义控件都套玻璃会分散对内容的注意力，体验变差 | [M] |
| D5 | 🚫 **禁止给多个控件背景加色 / 给玻璃滥用颜色** | 「Refrain from adding color to the background of multiple controls」；`Apply color sparingly`；强调主行动时**把颜色加在背景而不是符号或文字上** | [C] |
| D6 | 🚫 **禁止控件标签色与内容层背景相近** | 彩色内容会间歇滚到控件下方，至少要保证**静止/默认态**（如滚动内容顶部）的可读性 | [C]、[TB]、[TO]、[B] |
| D7 | 🚫 **禁止硬编码系统色值 / 重定义语义色** | 系统色值可能随版本波动；不要把 separator 当文字色、把次级文字色当背景色 | [C] |
| D8 | 🚫 **禁止 tab bar 执行动作、隐藏、禁用、用 More 溢出** | 详见 M13–M16；[TB]「Avoid overflow tabs」 | [TB] |
| D9 | 🚫 **禁止玻璃数量失控** | 「Creating too many Liquid Glass effect containers and applying too many effects to views outside of containers can degrade performance」 | [SW] |
| D10 | 🚫 **禁止把 scroll edge effect 当装饰** | 它不是 overlay，不阻挡/压暗内容；没有滚动视图在浮动控件后方时不要用；一个 view 只挂一个 | [SV] |
| D11 | 🚫 **禁止手动添加溢出菜单** | 系统会自动加 overflow menu；避免默认就溢出的布局 | [TO] |
| D12 | 🚫 **禁止文字控件与符号控件紧邻混排** | 会被误读成同一动作；文字按钮之间要用 fixed space 分隔 | [TO] |
| D13 | 🚫 **禁止自定义带边框符号 / 用文字写 Back、Close** | 用标准符号；边框不必要，因为分组已有可见容器 | [TO] |
| D14 | 🚫 **禁止用 Ultralight / Thin / Light 字重** | 尤其小字难以辨认 | [T] |
| D15 | 🚫 **禁止大字号时截断文字 / 丢失层级** | 主元素在超大字号下仍应保持在视图顶部；不要截断 | [T] |
| D16 | 🚫 **禁止同屏出现多个 prominent 按钮** | 每 view 保持 1–2 个；toolbar 只 1 个；「Presenting too many prominent buttons increases cognitive load」 | [B]、[TO] |
| D17 | 🚫 **禁止嵌套同方向 scroll view** | 会造成不可预测、难控制的界面 | [SV] |
| D18 | 🚫 **禁止一次叠多个 sheet / 只用 Done 无退出路径** | 关闭一个 sheet 又回到另一个 sheet 会让人迷失 | [SH] |
| D19 | 🚫 **禁止把动效作为唯一信息通道 / 让人等动画完成** | 「Make motion optional」「Let people cancel motion」 | [MO] |
| D20 | 🚫 **禁止在 Reduce Motion 下继续做缩放、z 轴深度、进出模糊动画** | 明确列为 best practices | [A] |
| D21 | 🚫 **禁止在直播中让导航层长时间遮挡内容** | 控件应让位给全屏沉浸播放（[LV]）；content footer 需可预期地收起 | [LV] |
| D22 | 🚫 **禁止玻璃出现/消失只用 opacity 淡入淡出** | 【未二次核验】[W219] 摘录：出现/消失靠逐渐调制折光，而非淡入淡出；[MO] 亦要求动效有目的性。落地时至少保证不把 opacity 作为唯一表现 | [W219]、[MO] |

---

## 3. 强烈建议（Should）

| # | 建议 | 官方要点 | 来源 |
| --- | --- | --- | --- |
| S1 | **内容层厚度按可读性选** | 较厚材质对比更好、适合精细文字；较薄材质更透、帮助保持上下文；`thin`/`ultraThin` 上避免 quaternary vibrancy（对比过低） | [M] |
| S2 | **玻璃默认无色，从背后内容取色** | 「By default, Liquid Glass has no inherent color」；小组件（toolbar / tab bar）的符号文字默认单色，底内容亮则变深、暗则变浅；大组件（sidebar）更不透以保可读 | [C] |
| S3 | **彩色内容层 → 导航用单色外观** | 「prefer a monochromatic appearance for toolbars and tab bars」；单色内容层才适合用品牌色作 accent | [C]、[TB]、[TO]、[B] |
| S4 | **按重要性从上到下、从起始边排序；对齐+缩进表达层级；留白/容器/分隔线分组；渐进披露** | 媒体类 App 尤其适合用 scrollable sections 渐进展示 | [L] |
| S5 | **背景图被 bar 遮挡时用 background extension effect** | 翻转+模糊镜像铺到相邻组件下方，视觉上保持背景延伸 | [L] |
| S6 | **tab bar 可挂 accessory 并支持最小化** | 如 Music MiniPlayer；滚动时 tab bar 最小化、accessory 内联；点 tab 或滚到顶恢复 | [TB] |
| S7 | **tab 数量 ≤5；尾端可放独立搜索 tab** | [TB] iPadOS 明确「aim for a default list of five or fewer」；iOS 尾端可 dedicated search tab | [TB] |
| S8 | **toolbar 分组 ≤3 组，逻辑按功能与使用频率** | 「In general, aim for a maximum of three」；导航与 Done/Close/Save 等关键动作要放在视觉上独立的分区；跨端保持一致 | [TO] |
| S9 | **次要动作收进 More（ellipsis）** | 优先把动作都放进 toolbar，确实放不下才加 More；iOS 空间有限，只保留最重要项 | [TO] |
| S10 | **用样式而非尺寸区分首选动作** | 同尺寸按钮形成一组选项，靠 prominent 样式突出，不要把两个按钮做成不同大小 | [B] |
| S11 | **sheet 用 medium detent 做渐进披露 + grabber + 下滑关闭** | iPhone 上 medium ≈ 全展开高度的一半；grabber 同时支持 VoiceOver 调整大小 | [SH] |
| S12 | **直播页用 badge/symbol/sash 标「直播」、显示进度、一键起播** | 让直播内容一眼可辨；切频道要即时视觉反馈；离开直播 tab 要停音频 | [LV] |
| S13 | **直播 EPG / 频道浏览不打断播放** | 用 PiP 或后台播放；content footer 分类与 EPG 一致 | [LV] |
| S14 | **相关符号控件共享同一块玻璃；文字/符号分组隔离** | 【未二次核验】[W201] 摘录；[TO] 已独立佐证「Keep actions with text labels separate」「Group toolbar items logically by function」；[SW] 的 `glassEffectUnion` 提供「静止态多个视图合并成一块玻璃」能力 | [W201]、[TO]、[SW] |
| S15 | **用 `glassEffectID` + namespace 做 morph，远距离用 `materialize`** | 默认 `matchedGeometry` 只在间距内生效；系统应用的不只是 opacity 变化 | [SW] |
| S16 | **玻璃 `glassEffect` 修饰符放在其他外观修饰符之后** | 「Apply the `glassEffect(_:in:)` modifier after other modifiers that affect the appearance of the view」 | [SW] |
| S17 | **同心几何：嵌套容器圆角必须同心** | [W356] 已核验原文：「By aligning radii and margins around a shared center, shapes can comfortably nest within each other」「We use three shape types to build concentric layouts: fixed shapes have a constant corner radius」；capsule / concentric 公式与手机边缘按钮额外边距为【未二次核验】主理人摘录 | [W356] |
| S18 | **宽敞区域用 XLarge 控件 + 玻璃作强调；密集区域仍用圆角矩形** | 【未二次核验】[W356] 摘录；与 [SW]「大组件用 .rect」一致 | [W356]、[SW] |
| S19 | **关键场景排版更粗、左对齐** | [W356] 已核验原文：「Typography has been refined … now bolder and left-aligned to improve readability in key moments like alerts and onboarding」；系统色在 Light / Dark / Increased Contrast 下已重新校准以配合玻璃 | [W356]、[C] |
| S20 | **符号优先、触控板输入下动效更克制** | 玻璃运动对直接触摸反馈更强，触控板更 subdued | [MO]、[TO] |
| S21 | **动画跟随手势、收紧弹簧、可取消** | 高频 UI 交互尽量不加自定义动效 | [A]、[MO] |
| S22 | **Lensing 不是简单高斯模糊** | 【未二次核验】[W219] 摘录：动态折弯光线、多层材质随背后内容自适应明暗、阴影随之增强；[SW] 已独立核验「blurs content behind it, reflects color and light of surrounding content, and reacts to touch and pointer interactions in real time」 | [W219]、[SW] |
| S23 | **维持「单一悬浮平面」隐喻** | 【未二次核验】[W219] 摘录：菜单从按钮原地 pop open、切换时控件 morph、元素可临时 lift into glass | [W219] |

---

## 4. 可量化参数表（规范条款 → Android / RN 落地）

> 换算约定：iOS `pt` 与 Android `dp` 视觉尺寸近似按 **1:1** 处理；字号用 **sp** 并跟随 `fontScale`。所有【官方未规定·建议值】需在中端 Android 机上实测校准。

### 4.1 排版 / 字号 / 字重

| 规范条款 | 官方值 | 性质 | Android / RN 落地 | 来源 |
| --- | --- | --- | --- | --- |
| 默认正文字号 | iOS/iPadOS **17 pt** | 【官方硬值】 | `17 sp`，随 `fontScale` | [T] |
| 最小字号 | iOS/iPadOS **11 pt** | 【官方硬值】 | 任何文字（含弹幕角标、时间、榜单序号）**≥ 11 sp** | [T] |
| Large Title | **31 pt** Regular / 强调 **Bold**，行距 38 pt | 【官方硬值】 | 英雄文字 `31 sp` / `700` / lineHeight 38 | [T] |
| Title 1 / 2 / 3 | **25 / 19 / 17 pt**（强调 Bold / Bold / Semibold） | 【官方硬值】 | `25 / 19 / 17 sp` | [T] |
| Headline | **14 pt Semibold** | 【官方硬值】 | `14 sp` / `fontWeight 600` | [T] |
| Body | **14 pt**（xSmall 档表值）/ **17 pt**（默认档） | 【官方硬值】 | 次要正文 `14 sp`，主正文 `17 sp` | [T] |
| Caption 1/2、Footnote、Subhead、Callout | 11 / 11 / 12 / 12 / 13 pt（xSmall 档） | 【官方硬值】 | 对应 `11 / 11 / 12 / 12 / 13 sp` | [T] |
| AX1 最大辅助字号 | Large Title **44 pt**、行距 52；Body 28 pt | 【官方硬值】 | Dynamic Type 最大档需适配到 `44 sp`，横向布局改堆叠 | [T] |
| 字重白名单 | 避免 Ultralight / Thin / Light；用 Regular / Medium / Semibold / Bold | 【官方硬值】 | `fontWeight` 仅允许 `400/500/600/700`，禁用 `100–300` | [T] |
| 「英雄文字」 | 官方无此术语，仅 Large Title + [W356]「bolder and left-aligned」 | 【官方未规定·建议值】 | **34–41 sp / 700 / 左对齐 / 每屏 1 处**，仅限房间名、直播标题、空态主文案；必须支持 Dynamic Type | [T]、[W356] |
| 字体家族数量 | 「Minimize the number of typefaces」（无数字） | 【官方未规定·建议值】 | **≤ 2 套**（1 主字体 + 1 等宽数字字体用于榜单/计数） | [T] |
| 层级手段 | 字重 / 字号 / 颜色三者建立层级，字号变化时层级不丢失 | 【官方硬值】 | 定义 4 级文本 token，禁止靠透明度单独区分层级 | [T] |
| 大字号布局 | 横排改堆叠、减列、图标同步放大、少截断 | 【官方硬值】 | `fontScale ≥ 1.3` 时房间头 / 麦位行 / 榜单行改纵向堆叠 | [T]、[L] |

### 4.2 圆角 / 几何 / 间距

| 规范条款 | 官方值 | 性质 | Android / RN 落地 | 来源 |
| --- | --- | --- | --- | --- |
| 默认玻璃形状 | `glassEffect()` 默认 `regular` + **`Capsule`** | 【官方硬值】 | 胶囊：`borderRadius = height / 2`（RN 用大数值如 999） | [SW] |
| 大组件形状 | `.rect(cornerRadius: 16.0)`（官方示例） | 【官方示例值】 | 大悬浮卡片建议 **24–32 dp**（【建议值】）；`16 dp` 可作小控件基线 | [SW] |
| 「大圆角」上限策略 | 官方未给统一圆角数值 | 【官方未规定·建议值】 | 功能层大容器 **28–32 dp**；中等控件 **16–20 dp**；胶囊用于高度 ≤ 56 dp 的按钮；内容层卡片 **12–16 dp** | [SW]、[W356] |
| 同心几何公式 | fixed（固定圆角）/ capsule（= 高度一半）/ **concentric（父圆角 − 内边距）** | 【官方概念，公式部分未二次核验】 | 子圆角 = 父圆角 − padding；例：父 32 dp、padding 8 dp → 子 **24 dp**。嵌套不同心会产生 pinched/flared 视觉张力 | [W356]、[TO] |
| 标准控件圆角 | 与 bar 圆角同心 | 【官方硬值】 | 自定义控件圆角必须 = bar 圆角 − 内边距，不得独立指定 | [TO] |
| 手机边缘按钮 | capsule + 额外边距 | 【未二次核验】采用主理人摘录 | 【建议值】屏幕左右安全边距 **≥ 16 dp**，capsule 与屏幕边缘另留 **≥ 8 dp** | [W356] |
| 容器 spacing | `GlassEffectContainer(spacing: 40.0)` / `20.0`（官方示例） | 【官方示例值】 | 全局统一常量 **20–40 dp**；同组玻璃控件必须包进同一个逻辑容器 | [SW] |
| spacing 与融合关系 | container spacing **大于**内部 HStack/VStack spacing → 静止态即融合；间距内最近边 ≤ spacing → morph | 【官方硬值】 | 想让按钮静止态合并成一块玻璃：容器 spacing 略大于实际间距；想保持分离：两者相等 | [SW] |
| 远距离元素 | 超出 spacing 用 `materialize` 过渡 | 【官方硬值】 | 跨屏/远距离元素不做 morph，改 materialize 或 fade | [SW] |
| 分组留白 | 用留白 / 容器形状 / 分隔线分组，无具体数值 | 【官方未规定·建议值】 | 组间 **≥ 24 dp**，组内 **8–12 dp**；toolbar 文字按钮间插 fixed space | [L]、[TO] |

### 4.3 玻璃变体 / dimming / 颜色

| 规范条款 | 官方值 | 性质 | Android / RN 落地 | 来源 |
| --- | --- | --- | --- | --- |
| `regular` 使用场景 | 模糊 + 调整亮度；大量文字的 alerts / sidebars / popovers；含 scroll edge effects | 【官方硬值】 | 榜单 Sheet、资料卡、上麦申请、设置面板、聊天侧栏一律 regular | [M] |
| `clear` 使用场景 | 高透，**仅**浮在照片/视频等视觉丰富背景之上 | 【官方硬值】 | 仅直播播放器上的悬浮控制条、全屏观看时的临时控件 | [M] |
| **dimming 层** | 底层亮 → 加 **35% 不透明度的深色层** | 【官方硬值】 | `#000000` @ `opacity 0.35`，仅作用于 `clear` + 亮底；注意它是**玻璃背后的 dimming**，不是控件底板（不违反 D2） | [M] |
| 不加 dimming 的条件 | 底层足够暗，或使用 AVKit 自带 dimming 的标准播放控件 | 【官方硬值】 | RN 自绘播放控件时需自行判断亮度；【建议值】以背景平均亮度 > 0.55 作为「bright」阈值（官方未给数值） | [M] |
| 玻璃底色 | 默认无色，从背后内容取色 | 【官方硬值】 | 不给所有玻璃统一刷品牌底色 | [C] |
| 玻璃上用色 | 强调色 sparingly；强调主行动时**加在背景而非符号/文字**；不要给多个控件背景加色 | 【官方硬值】 | 每屏仅 **1 个** tinted prominent 按钮（本项目＝「上麦」） | [C]、[B]、[TO] |
| vibrant 色 | 材质上方必须使用 vibrant 色保证对比 | 【官方硬值】 | 玻璃上的文字/图标用语义 vibrant token，禁止固定灰值硬编码 | [M]、[C] |
| 单色外观触发条件 | 内容层色彩丰富 → tab bar / toolbar 用 monochromatic | 【官方硬值】 | 直播间、房间页、榜单页的导航强制单色；弹幕/封面主色不得进入导航文字色 | [C]、[TB]、[TO] |
| 深浅色 / 高对比变体 | 每个自定义色 4 套（light / dark / inc.contrast light / inc.contrast dark） | 【官方硬值】 | 建立 4 套色 token；即使产品只做深色也要输出浅色变体以支撑玻璃自适应 | [C] |
| 系统色 | 不硬编码、不重定义语义 | 【官方硬值】 | 用语义色名而非色值 | [C] |
| 对比度 | ≤17 pt **4.5:1**；18 pt **3:1**；Bold **3:1** | 【官方硬值】 | 玻璃上文字、选中态 tab、弹幕文字全部实测；加 35% dimming 后需复测 | [A] |

### 4.4 数量上限 / 分组 / 导航

| 规范条款 | 官方值 | 性质 | Android / RN 落地 | 来源 |
| --- | --- | --- | --- | --- |
| tab 数量 | iPadOS 默认 **≤ 5**；iOS 避免 More 溢出 | 【官方硬值】 | 底部导航 **≤ 5** 个（建议：首页 / 房间 / 直播 / 榜单 / 我的） | [TB] |
| toolbar 分组数 | **最多 3 组** | 【官方硬值】 | 顶部工具条 ≤ 3 组（如：返回+标题 / 主功能区 / More+主行动） | [TO] |
| prominent 按钮数 | 每 view **1–2 个**；toolbar **仅 1 个**，置尾端 | 【官方硬值】 | 直播页仅「上麦」1 个 prominent | [B]、[TO] |
| **同屏玻璃数量上限** | 「Limit the use of Liquid Glass effects onscreen at the same time」（**无数字**） | 【官方未规定·建议值】 | **单屏 ≤ 3 个玻璃容器 / ≤ 6 个玻璃元素**；直播播放页 **≤ 3 个**（底部 tab bar、播放器悬浮控制条、主行动按钮） | [SW] |
| scroll edge effect 数量 | **每 view 1 个**；分栏布局每 pane 可各 1 个且高度一致 | 【官方硬值】 | 每个滚动区只挂 1 个边缘渐变 | [SV] |
| scroll edge 样式 | 优先 `automatic`；有 `hard` / `soft` | 【官方硬值】 | 默认 automatic；控件多或玻璃外有文字时用 hard；用 soft 必须多场景实测 | [SV] |
| sheet detents | `large`（全展开）/ `medium`（约一半）/ 自定义 | 【官方硬值】 | 上麦申请、资料卡用 medium；榜单详情用 large；必须有 grabber + 下滑关闭 | [SH] |
| sheet 叠放 | 一次只 1 个 | 【官方硬值】 | 不叠 sheet；需要二级信息时收起第一个再开 | [SH] |
| touch target | 本次核验的 iOS 页面未给；[B] visionOS 给 mini 28 / small 32 / **regular 44** / large 52 / XLarge 64 pt、中心距 ≥ 60 pt | 【官方未规定·建议值】 | Android **≥ 48×48 dp**；麦位/播放按钮 **≥ 44 dp**；按钮间距 **≥ 8 dp** | [B]、Material 建议 |

### 4.5 动效 / 交互 / 滚动

| 规范条款 | 官方值 | 性质 | Android / RN 落地 | 来源 |
| --- | --- | --- | --- | --- |
| 出现 / 消失时长 | 官方未给数字，只要求「brief and precise」、逐渐调制折光而非淡入淡出 | 【官方未规定·建议值】 | **200–300 ms**；动画参数是折光/高光/模糊强度，**不得只用 opacity** | [MO]、[W219] |
| 按压反馈 | `interactive()` 实时响应；按下瞬间 flex / energize | 【官方硬值】+【建议值】 | **80–150 ms**，`scale 1.0 → 0.97` + 边缘高光增强；触摸结束回弹 | [SW]、[MO]、[W219] |
| morph 过渡 | `matchedGeometry`（默认，间距内）/ `materialize`（远距离） | 【官方硬值】 | **300–400 ms**；系统应用的不只是 opacity 变化 | [SW] |
| 玻璃出现方式 | 逐渐调制折光，不是 fade in/out | 【未二次核验】[W219] 摘录 | 用「折射高光 + 模糊半径 + 亮度」联合动画；Reduce Motion 下改静态/fade | [W219] |
| 菜单弹出 | 从按钮原地 pop open，维持单一悬浮平面 | 【未二次核验】[W219] 摘录 | More 菜单锚定到触发按钮，不做全屏淡入 | [W219] |
| 滚动行为 | 内容从玻璃控件下方滚动透出；全屏背景 bleed 到 bar 下方 | 【官方硬值】 | 直播封面 / 房间背景全屏铺，不裁切、不垫底板 | [M]、[L]、[SV] |
| tab bar accessory | 滚动时最小化 + accessory 内联；点 tab 或滚到顶恢复 | 【官方硬值】 | 「正在上麦 / 迷你播放」条作为 accessory，滚动时收缩 | [TB] |
| 高频交互动效 | 「generally avoid adding motion to UI interactions that occur frequently」 | 【官方硬值】 | 发消息、点赞、弹幕刷新不加自定义动效 | [MO] |
| 帧率 | [MO] 游戏 30–60 fps 参考（非玻璃条款） | 【官方参考值】 | 直播 + 玻璃叠加中端机目标 **≥ 50 fps**（【建议值】） | [MO] |

---

## 5. 可访问性与性能红线

### 5.1 可访问性降级矩阵

| 系统设置 | 官方条款 | 状态 | Android / RN 必须落地 |
| --- | --- | --- | --- |
| **Reduce Transparency** | [M]：「The appearance of these variants can differ in response to … accessibility settings that reduce transparency or increase contrast in the interface.」——**仅说明变体会响应设置，HIG 未给出任何具体降级数值或实现方式**；[A] 页面本轮抓取亦无该设置的专门条款 | 【官方有条款，实现未规定】 | 【建议值】关闭 blur / lensing / 折射高光 → 玻璃降级为**高不透明度实色（≥ 0.9）或接近 opaque 的 standard material**；**保留**圆角、间距、层级、单色外观与 vibrant 文字色；严禁只留半透明导致文字不可读。Android 侧可监听 `AccessibilityManager` / RN `AccessibilityInfo` 的降低透明度相关能力，能力不可用时提供 App 内「减少透明效果」开关 |
| **Increase Contrast** | [A]：默认不满足最小对比度时，至少在开启时提供高对比配色；深色模式也要验；优先系统色（自带 accessible variants）。[C]：自定义色必须提供 increased contrast 变体 | 【官方硬值】 | 4 套色 token 齐备；玻璃切 `regular` / 提高不透明度；文字与图标实测 ≥ 4.5:1（大字 ≥ 3:1）；加大分隔线与边框对比 |
| **Reduce Motion** | [A]：减少自动与重复动画（缩放、周边运动）；收紧弹簧减回弹；动画跟随手势；**避免 z 轴深度变化**；**位移改 fade**；**避免进出模糊动画**。[MO]：Make motion optional、brief & precise、可取消、不以动效为唯一信息通道 | 【官方硬值】 | 关闭 lensing 形变 / morph / lift / 高光流动；控件切换改静态或短 fade；按压反馈改静态或极短；Provide 触觉/音频/文案等替代反馈；不得让人等动画结束才能操作 |
| **Dim Flashing Lights** | [A]：「If your app supports video playback, ensure that it responds appropriately to the Dim Flashing Lights setting」 | 【官方硬值】 | 直播礼物特效、闪光、弹幕高亮、连击动画必须可降级/关闭 |
| **Bold Text / Dynamic Type** | [T]：布局适配所有字号、横排改堆叠、减列、图标同步放大、少截断、层级不变；自定义字体也要实现 Dynamic Type。[L]：safe area / size classes | 【官方硬值】 | 全 `fontScale` 档位验收；英雄文字 31→44 sp；房间头 / 麦位 / 榜单行改堆叠；图标随字号放大；玻璃容器高度自适应 |
| **对比度** | ≤17 pt 4.5:1；18 pt 3:1；Bold 3:1（WCAG AA，Accessibility Inspector 基准） | 【官方硬值】 | 玻璃上文字、选中 tab、弹幕、榜单数字全部实测；加 35% dimming 后复测 |
| **Assistive Access** | [A]：为认知障碍提供精简布局与控件呈现 | 【官方硬值】 | 【建议值】提供「精简模式」：隐藏弹幕与礼物特效，只保留播放 + 聊天 + 返回 |

### 5.2 性能红线（官方条款 + Android/RN 特有风险）

1. 🚫 **绝对红线**：[SW]「Creating too many Liquid Glass effect containers and applying too many effects to views outside of containers can degrade performance. Limit the use of Liquid Glass effects onscreen at the same time.」——容器数量与散落效果数量都必须受限。
2. 🚫 **禁止逐条内容套玻璃**：[M] D1 是规范红线，也是性能红线。**弹幕层、聊天消息列表、礼物粒子、榜单行、房间卡片列表一律不得有 backdrop blur**。Android 上 `RenderEffect` / `BlurView` 逐帧开销极高，滚动列表中会出现明显掉帧。
3. ✅ **成组渲染**：相邻玻璃控件必须共享同一渲染容器（对应 `GlassEffectContainer` 语义），而不是每个按钮一个独立 blur view；静止态可用 `glassEffectUnion` 语义合并成一块玻璃。
4. ✅ **功能层静止、内容层滚动**：玻璃只给静止的导航/控件容器；滚动内容只做「从下方透过」，不参与玻璃采样。
5. ✅ **直播场景最严**：视频解码 + 弹幕 + blur 三者叠加，玻璃数量压到 ≤3，且必须做中端机帧率实测（【建议值】≥ 50 fps）。
6. ✅ **降级路径前置**：Reduce Transparency / 低电量 / 低端机应有「关闭 blur 与 lensing」的一键路径，直接切到实色玻璃近似（保留圆角与层级）。
7. ✅ **不阻塞交互**：[MO]「Let people cancel motion」——动画不得锁住输入，尤其上麦、发送、切房间等高频操作。
8. ✅ **Lensing 近似不是高斯模糊**：[W219]（未二次核验）＋[SW]（已核验）都说明材质会反射周围内容的光与色并实时响应触摸；RN 近似应包含**边缘折射高光 + 亮度自适应 + 触摸响应**，只做一层 `BlurView` 不达标。

### 5.3 验收清单（可勾选）

- [ ] 内容层（弹幕 / 消息气泡 / 榜单卡 / 房间卡）无任何 Liquid Glass，仅 standard materials 或实色
- [ ] 单屏玻璃容器 ≤3 个，玻璃元素 ≤6 个（直播页 ≤3）
- [ ] 同组玻璃控件共享同一容器，圆角同心（子 = 父 − padding）
- [ ] `clear` 仅出现在视频/图片上方；亮底已加 `#000` @ 35% dimming
- [ ] 控件下方无实色/半透明底板，靠 scroll edge effect 分离；每个滚动区仅 1 个边缘效果
- [ ] 全屏背景延伸到 tab bar / toolbar 下方
- [ ] tab bar ≤5 个、常驻、只做导航、单词标签、filled 图标、未被禁用/隐藏
- [ ] toolbar ≤3 组、符号优先、文字/符号控件分开、仅 1 个 prominent 主行动
- [ ] 每屏仅 1 个 tinted 主行动按钮，颜色加在背景而非文字
- [ ] 内容层花哨时导航为单色外观，标签色不与内容撞色
- [ ] 所有文字 ≥11 sp；字重仅 400/500/600/700；英雄文字 31–41 sp Bold 左对齐、每屏 1 处
- [ ] 玻璃上文字对比度满足 4.5:1 / 3:1；深浅色两套都验
- [ ] 4 套色 token（light / dark / inc.contrast ×2）齐备
- [ ] 支持 Dynamic Type 全档，大字号横排改堆叠、层级不丢失、无截断
- [ ] Reduce Transparency / Increase Contrast / Reduce Motion / Dim Flashing Lights 四条降级路径均已实现并实测
- [ ] 尊重安全区，多设备、多字号、多语言、横竖屏预览通过
- [ ] 中端 Android 机直播页帧率达标，Reduce Transparency 下无半透明不可读

---

## 6. 规范 → 本项目场景的具体约束对照表

> 「层级」列：**功能层**＝可用 Liquid Glass；**内容层**＝只能用 standard materials / 实色。

| # | 场景 | 层级 | 必须（Must） | 明确禁止（Don't） | 建议（Should） | 关键量化 | 来源 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **底部导航 tab bar**（首页/房间/直播/榜单/我的） | 功能层 | 浮于内容底部、内容可透出；常驻可见；只做导航；单词标签 + filled 图标；不禁用/隐藏；`regular` | 不做「上麦/发消息」等动作；不用 More 溢出；标签色不与直播封面/弹幕主色相近；不垫底板 | 可挂 accessory（迷你播放 / 正在上麦条），滚动最小化、点 tab 或滚到顶恢复；内容花哨时单色外观；尾端可放独立搜索 tab | **≤5 tab**；玻璃容器 1 个；对比度 ≥4.5:1 | [M]、[TB]、[C]、[L] |
| 2 | **顶部房间 / 直播间工具条** | 功能层 | 符号优先、无边框系统符号；标准控件圆角与 bar 同心；`regular`；背后有滚动内容才加 scroll edge effect（automatic，每 view 1 个）；仅 1 个 prominent 置尾端 | 不自定义背景/着色控件（会干扰系统背景效果）；不手写「返回/关闭」文字；文字按钮与符号按钮不紧邻；分组 >3 | 次要动作（分享、举报、设置）收进 More（ellipsis）；导航与关键动作放在视觉独立分区；必要时 contextually 隐藏以进入沉浸观看，但要可靠恢复 | **≤3 组**；圆角 = 父 − padding；scroll edge effect 1 个 | [TO]、[SV]、[L] |
| 3 | **直播播放器 + 悬浮控制条**（播放/静音/清晰度/全屏） | 功能层（浮于媒体） | **`clear`** 变体（唯一合法的高透场景）；底层亮时加 **35% 黑 dimming**；相关符号控件共享同一块玻璃；`interactive()` 实时按压反馈；起播后 UI 让位全屏沉浸 | 不用 `regular` 遮住画面；不加控件底板；不做淡入淡出作为唯一出现方式；不长时间遮挡画面；不在 Reduce Motion 下做 z 轴/morph 动画 | 控件可自动收起；用系统播放语义；一键起播；切频道即时视觉反馈；离开直播 tab 停音频 | dimming **0.35**；玻璃容器 1 个；按压 80–150 ms | [M]、[LV]、[SW]、[TO]、[MO] |
| 4 | **弹幕层 / 礼物飘屏** | **内容层** | 用实色或 standard materials；文字 ≥11 sp、对比 ≥4.5:1；Dim Flashing Lights 可降级；不遮挡直播主体 | 🚫 **绝对禁止套玻璃 / backdrop blur**；禁止高亮闪光特效不可关闭；禁止高频自动动画 | 用渐变遮罩保证文字可读（同 [LV] content footer 的 darkening 思路）；弹幕密度可调节；精简模式下可整体隐藏 | 最小 11 sp；4.5:1；无 blur | [M]、[A]、[LV]、[T] |
| 5 | **聊天室消息流**（气泡、头像、时间、系统消息） | **内容层** | 气泡/卡片用实色或 standard materials；背景全屏延伸到 tab bar / 输入框下方；消息从玻璃控件下滚过；支持 Dynamic Type（大字号气泡改堆叠） | 🚫 **禁止给每条气泡套玻璃**；禁止同方向嵌套 scroll view；禁止大字号截断；禁止 Thin/Light 字重 | 用留白、容器形状、分隔线分组；时间/系统消息用渐进披露；高频发送不加自定义动效 | 正文 17 sp；最小 11 sp；组间 ≥24 dp | [M]、[L]、[SV]、[T]、[MO] |
| 6 | **输入区**（输入框、表情、发送、@） | 功能层（底栏） | 作为 1 个玻璃容器，与 tab bar/播放器控件成组；带文字的「发送」与符号按钮**分开**并插 fixed space；仅 1 个 prominent 主行动 | 不给输入框下垫实色底板；文字按钮与符号按钮紧邻；输入区与 tab bar 用两个互不相关的独立 blur | 次要动作（表情、图片、@）收进 More 或同组符号共享一块玻璃；大字号时输入区高度自适应 | 1 个玻璃容器；文字/符号间距 ≥ fixed space；按钮 ≥44 dp | [TO]、[SW]、[L]、[T] |
| 7 | **上麦按钮 + 麦位列表** | 按钮＝功能层；麦位列表＝**内容层** | 上麦是**全页唯一 tinted prominent 主行动**，强调色加在**背景**；麦位列表用内容层卡片；状态切换（空闲/在麦/静音）用 `interactive()`；控件瞬时状态可用 M3 的「激活时呈现玻璃」例外（slider/toggle 类） | 不给每个麦位头像套玻璃；不做多个 prominent 按钮；不用尺寸差异区分主次 | 宽敞区域可用 XLarge 控件 + 玻璃强调；麦位用胶囊头像 + 同心圆角；大字号改堆叠；组合间距 20–40 dp 时可 morph | 每屏 **1 个** prominent；胶囊 = height/2；spacing 20–40 dp | [C]、[B]、[TO]、[M]、[SW]、[W356] |
| 8 | **榜单**（贡献榜 / 日榜 / 周榜） | 榜单容器＝**内容层**；筛选工具条＝功能层 | 榜单 Sheet 用 `regular`（大量文字）；筛选/切换工具条用玻璃 + 符号；数字用等宽字体；满足对比度 | 榜单行不套玻璃；不硬编码系统色；不用 Ultralight 数字 | Sheet 用 medium/large detent + grabber + 下滑关闭；一次只 1 个 sheet；Done 配 Cancel；分类与直播 EPG/footer 保持一致 | 最小 11 sp；Sheet 一次 1 个；≤2 套字体 | [M]、[SH]、[T]、[LV] |
| 9 | **房间卡片 / 列表 / 封面** | **内容层** | 卡片用实色或 standard materials；封面图全屏 bleed 到 bar 下方；「直播」用 badge/symbol/sash 标识，一眼区分 VOD；显示进度 | 🚫 卡片不套玻璃；封面主色不得用作导航标签色 | 背景被 bar 遮挡时用 background extension effect（翻转+模糊镜像）；用 scrollable sections 渐进披露；一键起播 | 卡片圆角 12–16 dp（建议）；标签 ≥11 sp | [M]、[L]、[LV]、[C] |
| 10 | **Sheet**（上麦申请、资料卡、榜单详情、举报） | 功能层 | `regular`（文字多）；一次只 1 个；Done 必配 Cancel 或 Back（不三者同现）；可缩放 sheet 带 grabber；支持下滑关闭 | 不用 `clear`；不叠 sheet；不只用 Done 作为唯一退出 | 用 medium detent 做渐进披露；按钮圆角与 sheet 同心；关键文案更粗、左对齐 | 子圆角 = 父 − padding；medium ≈ 半高 | [M]、[SH]、[W356] |
| 11 | **搜索** | 功能层 | 可作 tab bar 尾端独立搜索 tab；或顶部 toolbar 搜索字段；标准控件圆角与 bar 同心 | 不做成会隐藏/禁用的 tab；不与符号按钮紧邻混排 | 搜索结果列表用内容层材质；scroll edge effect automatic | 1 个 scroll edge effect | [TB]、[TO]、[SV] |
| 12 | **英雄文字区**（房间名 / 直播标题 / 空态主文案） | 内容层（文字，非玻璃） | Large Title **31 pt**、强调 **Bold**、**左对齐**；必须 Dynamic Type（AX1 到 44 pt）；每屏 1 处；层级靠字重/字号/颜色 | 不用 Ultralight/Thin/Light；不用在 tab 标签、工具栏、弹幕、按钮文字；不在大字号时截断 | 仅用于 alerts / onboarding / 房间头等关键时刻；[W356] 明确 bolder + left-aligned | **31–41 sp / 700 / 左对齐 / 每屏 1 处** | [T]、[W356] |
| 13 | **礼物与闪光特效** | 内容层 | 响应 Dim Flashing Lights；Reduce Motion 下减少自动/重复动画；不以动效作为唯一反馈（补 haptics / 音频 / 文案） | 禁止快速闪烁、周边运动不可关闭；禁止让人等动画完成才能操作 | 精简模式下可关闭；动画跟随手势、弹簧收紧 | — | [A]、[MO] |
| 14 | **全屏背景 / 安全区 / 适配** | 内容层 | 背景延伸到 sidebar / toolbar / tab bar 下方；尊重 safe area；多 size class / 多语言 / 多字号预览；大字号横排改堆叠 | 不裁切背景；不被挖孔/系统 UI 遮挡；不嵌套同向 scroll view | 背景被遮挡时用 background extension effect | 顶部/底部 safe area 由系统 guide | [L]、[SV] |
| 15 | **深浅色 / 高对比 / 降级模式** | 全局 | 4 套色 token；玻璃上 vibrant 色；对比度 4.5:1 / 3:1；Reduce Transparency 下降级为高不透明实色（保留圆角/层级） | 不硬编码系统色；不重定义语义色；不只剩半透明导致不可读 | 提供 App 内「减少透明效果」开关兜底 | `opacity ≥ 0.9`（建议值） | [C]、[A]、[M] |

---

## 7. 未决 / 需主理人或架构师确认

1. **Android 无原生 Liquid Glass**：lensing（动态折光）、`regular`/`clear`、`GlassEffectContainer` 融合与 morph 都需近似实现（Skia / `RenderEffect` / 静态渐变高光 / Reanimated 等）。技术选型与性能预算由架构师定；本清单只提供验收标准。
2. **Reduce Transparency 降级**：官方**未规定**具体数值，本清单的 `opacity ≥ 0.9` 为建议值，需设计确认。
3. **同屏玻璃数量**：官方只说「limit」，无数字；`≤3 容器 / ≤6 元素` 为建议值，需中端机实测后定稿。
4. **「bright」判定阈值**：官方只说「if the underlying content is bright」，未给亮度数值；建议 0.55 平均亮度阈值为建议值。
5. **英雄文字品牌调性**：31 pt 是 Large Title 官方值，用户要的「英雄文字」若需更大（34–41 sp）属建议值，需设计拍板。
6. **用户「大悬浮 + 大圆角」与 [M] sparingly 的取舍**：本清单的调和方案（3 个功能层组件 + 内容层克制）需主理人确认后再进入视觉方案。
7. **未二次核验来源**：[W219]、[W201] 视频正文，以及 [W356] 中 capsule / concentric 公式与边缘按钮边距；均来自主理人官方摘录，已在正文标注，不视为新增条款。
8. **抓取失败来源**：[PV] HIG · Playing video 本轮未取到内容，本清单未据其写入任何条款；如需播放控件条款可下轮补核。
9. **iOS 触控目标**：本次核验的 iOS 页面未给出 44 pt 最小触控目标（仅 visionOS 尺寸表），Android 侧 48 dp 为跨平台建议值。

---

*本清单为只读调研产物，未修改任何 App 源码文件。所有条款均可回溯至 0 节来源索引中的 Apple 官方 URL；凡官方未给数字处已显式标注为建议值。*
