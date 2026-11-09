# dsh-stock-research · 股票投资尽调

DeepSeek Harness（dsh）插件：**8 阶段投资尽调研究框架**——公司事实底座、行业周期分析、业务拆解、财务质量、股权治理、市场分歧、估值与护城河、综合报告（含信号评级 🟢🟢🟢/🟡🟡🟡/🔴🔴）。

技能来自 [Claude-Code-Stock-Deep-Research-Agent](https://github.com/liangdabiao/Claude-Code-Stock-Deep-Research-Agent)（MIT，liangdabiao）。**纯技能零 API key**——研究由模型在其环境中用网络工具+分析能力完成。

## 7 个技能

| 技能 | 功能 |
|---|---|
| `stock-research-executor` | **核心引擎**：执行 8 阶段投资尽调流程，部署多智能体并行研究，生成带引用的报告 |
| `stock-question-refiner` | 将股票名/代码细化为结构化尽调指令（投资风格/持有期/风险偏好） |
| `citation-validator` | 验证报告中所有引用的准确性、来源质量和格式（A-E 来源分级） |
| `got-controller` | Graph of Thoughts 控制器：管理研究图状态 |
| `question-refiner` | 通用研究问题细化 |
| `research-executor` | 通用 7 阶段深度研究 |
| `synthesizer` | 综合多个研究智能体的发现 |

## 使用

对话里一句话：**「深度调研 600519」**或**「帮我尽调腾讯 00700.HK，价值投资风格」**。

模型会：细化问题 → 8 阶段研究（①公司事实底座 → ②行业周期 → ③业务拆解 → ④财务质量 → ⑤股权治理 → ⑥市场分歧 → ⑦估值护城河 → ⑧综合报告）→ 产出尽调报告（研究框架输出分析，**不构成投资建议**）。

## 研究所（侧栏「投资尽调」）

点侧栏图标进研究所页面，四个视图：

| 视图 | 内容 |
|---|---|
| 概览 | 在研标的数、报告数、整体进度、绿/黄/红评级分布、最近更新 |
| 我的尽调 | 按代码/名称/研究问题搜索 + 评级筛选；每张卡带评级色点、进度条、报告数 |
| 标的详情 | 8 阶段清单（含每项结论备注）、历史报告可点开阅读、**两次快照的指标对比**（PE/营收/评级变了吗） |
| 发起新尽调 | 填代码 + 风格 + 持有期 → 一键打开新对话，8 阶段指令已写好 |

## 档案库（多标的，互不覆盖）

```
$DSH_HOME/stock-research/
├── dossiers/<ticker>/
│   ├── meta.json        # 名称/市场/风格/评级/报告登记
│   ├── checklist.json   # 8 阶段清单
│   └── snapshots/       # 每次收尾存一份指标快照
└── state.json
```

- 每只股票一个档案夹，**再也不会出现「跑新标的把旧标的进度覆盖」**
- 报告**只登记路径、不复制文件**，报告本身留在你的工作区
- 旧版的单文件 `dd.json` 首次启动时自动迁移成档案夹

## 3 个工具

`stock_checklist`（清单，按 ticker 隔离）、`stock_archive`（登记报告/评级/指标、对比快照）、`stock_module`（查方法论）。

## 怎么实现的

技能随包分发；工具负责清单与档案持久化（`$DSH_HOME` 下，沙箱写不进去所以在 Host 进程里执行）；页面是 `lab/` 下的静态文件，由 `webServer` 以 `/stock-research/` 前缀提供，侧栏图标在主区用 iframe 打开，页面通过 postMessage 让宿主开新对话。系统提示注入 8 阶段方法论摘要 + 引用标准（A-E 来源分级）+ 免责声明。

## ⚠️ 免责声明

本研究框架输出分析，不构成投资建议或推荐。所有投资存在风险，包括本金损失。投资决策前请自行进行尽职调查并咨询合格的财务顾问。

## 自检

```bash
npm install && npm test && npm run selftest && npm run build
```

- `npm test`：8 个单测（快照合规/8 阶段方法论/引用军规/dsh 环境映射/面板鉴权/许可）
- `npm run selftest`：7 技能注册 + addendum 三要素 + systemPrompt + 许可，零网络


## 安装

```bash
dsh plugin --profile web add dsh-stock-research
```

## 许可

MIT（liangdabiao）
