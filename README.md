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

## 怎么实现的

纯技能插件——零工具零网络零 API key。研究由模型在其环境中用网络工具 + 分析能力完成；系统提示注入 8 阶段方法论摘要 + 引用标准（A-E 来源分级）+ 免责声明。

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
