// 股票投资尽调 · Host 半边（技能提供方 + 硬规则注入 + 尽调清单/技能查询原生工具 + 面板数据面）。
// 研究本身由模型用网络工具+分析能力完成；工具负责方法匹配与尽调进度持久化。
import Schema from '@deepseek-ai/schemastery'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSkillProvider } from '../lib/skills.js'
import { systemSection } from './systemPrompt.js'
import { registerApi } from '../lib/api.js'
import { listModules, getModule, searchModules } from '../lib/modules.js'
import { getDD, initDD, updateItem, clearDD, DEFAULT_CHECKLIST, STATUSES } from '../lib/data.js'

export const name = 'stock-research' // = cordis.patch.yml 的 id

export const inject = ['tools', 'skills', 'systemPrompt', 'webServer', 'connection']

export const Config = Schema.object({
  injectRules: Schema.boolean().default(true).description('注入研究方法论到系统提示'),
})

function check(args, spec) {
  const problems = []
  for (const key of spec.required || []) {
    if (args?.[key] === undefined) problems.push(`缺少必填参数 ${key}`)
  }
  for (const [key, rule] of Object.entries(spec.properties || {})) {
    const value = args?.[key]
    if (value === undefined) continue
    if (rule.enum && !rule.enum.includes(value)) problems.push(`${key} 只能是 ${rule.enum.join(' / ')} 之一`)
  }
  for (const key of Object.keys(args || {})) {
    if (!spec.properties || !(key in spec.properties)) problems.push(`未知参数 ${key}`)
  }
  if (problems.length) throw new Error(`参数有误：${problems.join('；')}。`)
}

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const num = (description, extra = {}) => ({ type: 'number', description, ...extra })
const text = (value) => [{ type: 'text', text: value }]

const OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'summary'],
    properties: {
      ok: { type: 'boolean' },
      summary: { type: 'string', description: '给模型看的回执' },
      data: { type: 'string', description: '可选：清单/模块列表/正文' },
    },
  },
  render: (_args, value) => text(value.data ? `${value.summary}\n\n${value.data}` : value.summary),
}

const result = (ok, summary, data = '') => ({ ok, summary, data })

// ---------------------------------------------------------------------------
// 工具 1：stock_checklist —— 尽调清单持久化
// ---------------------------------------------------------------------------
export const stockChecklistTool = {
  name: 'stock_checklist',
  description:
    '管理一只股票的尽职调查清单进度（持久化）：init 建清单（默认 8 项标准尽调骨架，可自定义）、' +
    'status 更新事项进度（todo/doing/done + 结论备注）、list 看整体进度。' +
    '用户要求深度研究一只股票时先 init 清单，每完成一个环节用 status 记录，用户可在侧栏「股票尽调」面板看进度。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: str('init 建清单；status 更新事项；list 看进度；clear 清空', { enum: ['init', 'status', 'list', 'clear'] }),
      ticker: str('init：股票代码/名称（如 AAPL、贵州茅台）'),
      question: str('init：研究问题/投资视角（如「高估值下是否值得长期持有」）'),
      items: str('init：可选，自定义清单（竖线分隔）。缺省用 8 项标准尽调骨架'),
      index: num('status：事项序号（从 1 开始）'),
      status: str('status：todo 待做 / doing 进行中 / done 完成', { enum: STATUSES }),
      note: str('status：可选，该项结论/备注（一句话）'),
      confirm: str('init 覆盖已有清单 / clear 清空，都要传 "yes"', { enum: ['yes'] }),
    },
  },
  output: OUTPUT,
  async execute(args) {
    check(args, this.parameters)
    if (args.action === 'init') {
      if (!args.ticker) throw new Error('init 需要 ticker（股票代码/名称）。')
      const titles = args.items
        ? args.items.split('|').map((t) => t.trim()).filter(Boolean)
        : DEFAULT_CHECKLIST
      const dd = initDD(args.ticker, args.question || '', titles, args.confirm === 'yes')
      if (dd.conflict) {
        return result(false, `已有「${dd.ticker}」的尽调清单共 ${dd.items} 项。要覆盖请用 confirm:"yes" 重新 init。`)
      }
      return result(true, `「${dd.ticker}」尽调清单已建立（${titles.length} 项）${dd.question ? `，研究问题：${dd.question}` : ''}。每完成一个环节用 status 更新进度。`,
        titles.map((t, i) => `${i + 1}. ${t} [todo]`).join('\n'))
    }
    if (args.action === 'status') {
      if (!args.index) throw new Error('status 需要 index（事项序号）。')
      const item = updateItem(args.index, { status: args.status, note: args.note })
      if (!item) return result(false, '还没有尽调清单，先 init。')
      return result(true, `事项 ${item.index}「${item.title}」→ ${item.status}${item.note ? `（${item.note}）` : ''}。`)
    }
    if (args.action === 'clear') {
      if (args.confirm !== 'yes') return result(false, '清空尽调清单请用 confirm:"yes"。')
      clearDD()
      return result(true, '尽调清单已清空。')
    }
    // list
    const dd = getDD()
    if (!dd.items.length) return result(true, '还没有尽调清单。init 一个即可开始（默认 8 项标准骨架）。')
    const done = dd.items.filter((it) => it.status === 'done').length
    return result(true, `「${dd.ticker}」尽调进度：${done}/${dd.items.length} 完成${dd.question ? `（${dd.question}）` : ''}。`,
      dd.items.map((it) => `${it.index}. ${it.title} [${it.status}]${it.note ? ` ${it.note}` : ''}`).join('\n'))
  },
}

// ---------------------------------------------------------------------------
// 工具 2：stock_module —— 7 个尽调技能查询
// ---------------------------------------------------------------------------
export const stockModuleTool = {
  name: 'stock_module',
  description:
    '查询 7 个股票尽调方法技能（问题界定、研究执行、引用校验、思维图控制、综合结论等）。' +
    '开始研究前 search 匹配方法技能，get 拿完整方法论后照此执行。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: str('list 列全部技能；search 关键词搜索；get 取完整正文', { enum: ['list', 'search', 'get'] }),
      id: str('get：技能名（list/search 里能看到）'),
      keyword: str('search：关键词，如「引用」「citation」「风险」「结论」'),
      limit: num('search：最多返回条数，默认 8'),
    },
  },
  output: OUTPUT,
  async execute(args) {
    check(args, this.parameters)
    const skillDirs = skillDirsRef.dirs
    if (args.action === 'list') {
      const mods = listModules(skillDirs)
      return result(true, `共 ${mods.length} 个尽调技能：`,
        mods.map((m) => `- ${m.name}：${m.description}`).join('\n'))
    }
    if (args.action === 'search') {
      if (!args.keyword) throw new Error('search 需要 keyword。')
      const found = searchModules(skillDirs, args.keyword).slice(0, args.limit || 8)
      if (!found.length) return result(false, `没有匹配「${args.keyword}」的技能，试试 list 看全部。`)
      return result(true, `匹配到 ${found.length} 个技能：`,
        found.map((m) => `- ${m.name}：${m.description}\n  命中：…${m.snippet}…`).join('\n'))
    }
    if (!args.id) throw new Error('get 需要 id。')
    const mod = getModule(skillDirs, args.id)
    if (!mod) return result(false, `没有找到技能 ${args.id}（先 search/list 找名字）。`)
    return result(true, `技能「${mod.name}」完整方法论（照此执行）：`, mod.body)
  },
}

const skillDirsRef = { dirs: [] }

export function apply(ctx, config) {
  const skillDirs = [join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')]
  skillDirsRef.dirs = skillDirs

  ctx.effect(() => ctx.tools.register(stockChecklistTool), `${name}: tool checklist`)
  ctx.effect(() => ctx.tools.register(stockModuleTool), `${name}: tool modules`)
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(skillDirs)), `${name}: skills`)

  if (config.injectRules !== false) {
    ctx.effect(() => ctx.systemPrompt.section(systemSection()), `${name}: methodology`)
  }

  ctx.effect(() => registerApi(ctx, { skillDirs }), `${name}: routes`)
}
