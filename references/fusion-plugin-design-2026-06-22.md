# 融合插件设计文档 (v0.1)

> 状态: 已通过头脑风暴, 待实现计划
> 日期: 2026-06-22
> 交付物: 单一 Codex 插件 (`.codex-plugin`)

## 一句话定位

一个 Codex 插件, 把论文方法段变成"可在 Codex 画布里实时编辑的矢量科研结构图", 满意后一键用 Codex `imagegen` 渲成期刊质感位图——支持人工拖拽与 agent 自动评审双模式。

## 背景与动机

科研投稿"最后一公里"常卡在结构示意图: 绘图软件门槛高, 审稿人要改一个模块往往要整张图重画。本项目融合四个已有项目的能力, 在 Codex app 内形成"论文 → 可编辑结构 → 期刊位图"的闭环, 让结构可精确编辑、质感由 AI 渲染。

## 三条硬约束 (用户锁定)

1. 最终交付物必须是 Codex 插件 (plugin)。
2. v0.1 测试产物 = 技术架构图 / 技术路线图一种, 其余进 roadmap。
3. 确定使用 Codex 自带的 `imagegen` 功能出位图。

## 四个来源项目与分工

| 项目 | 角色 | 在 v0.1 贡献 | 处置方式 |
| :--- | :--- | :--- | :--- |
| **happy-figure** (datawhalechina) | 🧠 语义大脑 | 「技术路线图」母版: 论文→结构语义 (模块/连接/科学边界); Stage2→imagegen 提示词 | vendored 纯文本 reference |
| **AutoFigure** (ResearAI, ICLR 2026, MIT) | ⚙️ 引擎 (借鉴) | ① mxGraph XML 作结构载体 ② VLM-Judge 科研 rubric ③ Review-Refine 循环逻辑 | 借鉴 prompt/rubric/循环, Node 重写 |
| **cowart** (zhongerxin) | 🎨 交互身体 | Codex 内 tldraw 画布、MCP、插图、批注改图 | fork/吸收为插件基座 |
| **Codex `imagegen`** | 🖼️ 皮肤 | 结构→期刊质感位图 | 沿用 cowart 已写好的输出解析 |

设计原则: 四个来源各取所长, 无一被架空。happy-figure 找到"语义层"定位 (它本就只产文本), AutoFigure 的引擎能力被借入, cowart 提供 AutoFigure 唯一缺的"活画布", imagegen 负责质感。

## 核心架构: 双层模型

化解"位图不可编辑 vs 矢量无质感"的核心矛盾——两者不是二选一, 而是分层, 且 happy-figure 的两阶段母版天生对应这两层。

```
结构层 (可编辑·矢量)  ── mxGraph XML ── 用户在画布实时拖拽/改标签/删模块 (秒回, 不调 imagegen)
       │
       ▼ 满意后
渲染层 (成品·位图)    ── Codex imagegen ── 期刊质感图, 放骨架旁边 (慢, 但结构已锚定不漂移)
```

- 用户编辑的永远是矢量骨架 (结构守恒、精确); 质感永远来自 imagegen 位图。
- 改一个模块 = 改骨架 → 重跑 Stage2 + imagegen, 结构不会在重生成里漂移 (锚定在骨架, 不是每次重新抽卡)。
- happy-figure `Stage 1 Visual Schema` → 喂结构层; `Stage 2 Rendering Prompt` → 喂 imagegen。

## 端到端闭环数据流

```
1. 贴论文/方法段
      │ skill: paper-to-structure (happy-figure Stage1 母版, 只做技术路线图)
      ▼
2. mxGraph XML 结构 (模块/连接/可见文字/科学边界)
      │ MCP★ render_structure: XML → tldraw 可拖拽图形
      ▼
3. 画布上的可编辑矢量骨架 ──┬── 【人工模式】用户拖拽/改/删 (实时)
      │                      └── 【自动模式】VLM-Judge 打分→反馈→重生成 (借 AutoFigure 循环)
      │ MCP★ get_structure: 读回改动 → 重建 XML (精确, 因图形带已知 meta)
      ▼
4. 确认结构 → skill: structure-to-figure (happy-figure Stage2 + 骨架截图当视觉脚手架)
      │ → Codex imagegen 出位图
      ▼
5. MCP insert_cowart_image: 期刊质感成品放骨架右边
      └── 不满意 → 回 3 改骨架, 或 cowart 批注改图 ──┐
                                                      闭环
```

回路闭合方式: **JSON/XML 为主 (精确)**。`get_structure` 读回的图形是我们用已知 `meta` 标签建的, 重建 XML 是确定性的, 不需 VLM 猜测; 截图仅作为喂给 imagegen 的视觉脚手架, 不承担"理解改动"职责。

体验分离: 结构编辑 (矢量, 秒回) 与出位图 (imagegen, 慢) 显式分离, 避免"无限画布=实时"的预期落差。

## 插件内部结构 (单一 Node 运行时)

```
一个 .codex-plugin:
  skills/
    paper-to-structure    ← happy-figure Stage1「技术路线图」母版 (vendored 纯文本)
    structure-to-figure   ← happy-figure Stage2 + 调 imagegen
    review-figure         ← AutoFigure VLM-Judge rubric (vendored)
    open-canvas           ← 复用 cowart
  mcp/server.mjs (在 cowart 基础上扩):
    insert_cowart_image / get_cowart_selection  ← 复用
    render_structure ★新  ← mxGraph XML → tldraw 图形
    get_structure    ★新  ← tldraw 图形 → mxGraph XML
  ❌ Python / Mermaid / Puppeteer / Playwright 全部不进 v0.1 → roadmap
```

关键: 运行时只有一个 Node (继承 cowart 的 tldraw 画布 + MCP `server.mjs`)。三个异构运行时塞进一个插件是最大的失败风险, v0.1 直接规避。

## 组件清单与边界

每个单元的职责、接口、依赖:

### skill: `paper-to-structure`
- **做什么**: 读论文方法段 → 输出 mxGraph XML 结构 (模块清单、连接关系、可见文字、科学边界)。
- **怎么用**: 用户贴论文文本或路径, skill 套用 happy-figure「技术路线图」Stage1 母版。
- **依赖**: vendored happy-figure 母版文本; 无运行时依赖。

### skill: `structure-to-figure`
- **做什么**: 把确认后的结构 (XML + 骨架截图) → happy-figure Stage2 渲染提示词 → 调 Codex `imagegen` 出位图 → 经 MCP 放回画布。
- **怎么用**: 用户在画布确认结构后触发。
- **依赖**: `imagegen` (沿用 cowart 输出解析逻辑); MCP `insert_cowart_image`。

### skill: `review-figure`
- **做什么**: 用 AutoFigure VLM-Judge rubric (视觉设计 / 沟通有效性 / 内容忠实度三维度, 0-10 + 反馈) 评审当前结构图。
- **怎么用**: 自动模式下驱动 Review-Refine 循环; 人工模式下作为一次性体检。
- **依赖**: vendored rubric prompt; 多模态模型读图。

### skill: `open-canvas`
- 直接复用 cowart, 在 Codex 内置浏览器拉起 tldraw 画布。

### MCP 工具 `render_structure` ★ (核心新工程)
- **做什么**: mxGraph XML → tldraw 可拖拽图形 (带已知 meta)。
- **接口**: 输入 XML + pageId; 输出创建的 shape ids。

### MCP 工具 `get_structure` ★ (核心新工程)
- **做什么**: 读选中区域的 tldraw 图形 → 重建 mxGraph XML。
- **接口**: 输入 pageId/selection; 输出 XML。

## 双模式 refine

- **人工模式**: 用户在 cowart 画布上直接拖拽/批注/即时改 (cowart 本色)。
- **自动模式**: VLM-Judge 打分 → 反馈 → 重生成, 循环若干轮 (AutoFigure 本色)。
- 二者可组合: agent 自动迭代几轮后交人工微调。这是融合后独有的能力——AutoFigure 把人锁在网页里被动看 agent 迭代, 我们让人在 Codex 活画布里实时干预。

## 事前尸检 (Pre-mortem): 八大死因与处置

| # | 死因 | v0.1 处置 |
| :--- | :--- | :--- |
| 1 | 三个异构运行时 (Node/Python/浏览器) 塞进一个插件 | 只留 Node; Python/Mermaid/Puppeteer/Playwright 全推迟 roadmap |
| 2 | 位图不可编辑 vs 矢量无质感 正面对撞 | 双层模型: 矢量骨架编辑 + 位图成品; happy-figure 两阶段正好对位 |
| 3 | happy-figure 是 alpha 半成品 (ch3-7 施工中), 且声明"不出图/不碰画布" | 只 vendored 用得上的「技术路线图」母版 + Stage1/2 结构, 纯文本, 不依赖施工章节 |
| 4 | code-driven-gifs 的 GIF 打分器对科研无效 | 换成 AutoFigure VLM-Judge 科研 rubric |
| 5 | Mermaid 表达力撑不起科研图 (机制/装置/封面图无法表达) | 不用 Mermaid, 用 mxGraph XML; v0.1 只做技术路线图一种 |
| 6 | Codex `imagegen` 输出契约不稳定 | 直接沿用 cowart 已写好的解析逻辑 (查 JSONL/防陈旧图) |
| 7 | "全程画布闭环"是伪实时 (实为文件往返+子进程) | 结构编辑 (快) 与出图 (慢) 显式分离, 对齐预期 |
| 8 | AutoFigure 是 Python+Playwright 重运行时 (同源死因1) | 只借鉴其 prompt/rubric/循环逻辑, Node 重写; 绝不整包塞入 |

## v0.1 范围红线

**v0.1 只证明一件事**: 论文 → 可编辑矢量骨架 → imagegen 期刊位图 → 画布内闭环改, 针对**技术路线图 / 架构图一种**。这是测试产物, 证明融合假设成立。

成败分水岭 (单一核心工程): 两个新 MCP 工具 `render_structure` / `get_structure` (mxGraph XML ↔ tldraw 双向)。其余皆为已有零件组装 + vendored 文本。

## 明确推迟到 Roadmap

- 其他科研图类型 (机制解释图、实验装置图、多面板比较图、图形摘要、期刊封面图)
- 动画 GIF (整个 Python code-driven-gifs 引擎)
- 与 draw.io 生态双向互通
- 批量生产 / 队列化
- 参考图风格迁移
- AutoFigure Python + Playwright 引擎整包集成

## 验收标准

v0.1 成功当且仅当:

- 用户在 Codex 内贴一段技术类论文方法段, 能得到一张可拖拽编辑的 mxGraph XML 矢量结构图渲染在画布上。
- 用户在画布上挪动/改标签/删模块后, `get_structure` 能精确读回改动并重建 XML。
- 用户确认结构后, 经 `structure-to-figure` + Codex `imagegen` 得到放在骨架旁边的期刊质感位图。
- `review-figure` 能用 VLM-Judge rubric 给出 0-10 评分 + 具体反馈。
- 整个流程在单一 Node 运行时的 Codex 插件内完成, 不依赖 Python/Mermaid/Playwright。
