// 股票投资尽调 · Host 半边（技能提供方 + 硬规则注入 + 尽调清单/技能查询原生工具 + 面板数据面）。
// 研究本身由模型用网络工具+分析能力完成；工具负责方法匹配与尽调进度持久化。
import Schema from '@deepseek-ai/schemastery'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSkillProvider } from '../lib/skills.js'
import { systemSection } from './systemPrompt.js'
import { registerApi } from '../lib/api.js'
import { listModules, getModule, searchModules } from '../lib/modules.js'
import {
  listDossiers, getDossier, initChecklist, updateItem, clearChecklist,
  getLastTicker, archiveReport, removeReport, snapshotDiff,
  DEFAULT_CHECKLIST, STATUSES, RATINGS,
} from '../lib/data.js'

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
    '管理股票尽职调查清单进度（持久化，**每只股票一个档案，互不覆盖**）：init 建清单（默认 8 项标准尽调骨架，可自定义）、' +
    'status 更新事项进度（todo/doing/done + 结论备注）、list 看单只或全部标的进度、clear 清空。' +
    '用户要求深度研究一只股票时先 init，每完成一个环节用 status 记录；多只股票可并行研究，用户在侧栏「投资尽调」里切换。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: str('init 建清单；status 更新事项；list 看进度；clear 清空', { enum: ['init', 'status', 'list', 'clear'] }),
      ticker: str('股票代码/名称（如 00700.HK、AAPL、贵州茅台）。status/clear/list 省略时用最近操作的那只'),
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
    const ticker = args.ticker || getLastTicker()

    if (args.action === 'init') {
      if (!args.ticker) throw new Error('init 需要 ticker（股票代码/名称）。')
      const titles = args.items
        ? args.items.split('|').map((t) => t.trim()).filter(Boolean)
        : DEFAULT_CHECKLIST
      const dd = initChecklist(args.ticker, args.question || '', titles, args.confirm === 'yes')
      if (dd.conflict) {
        return result(false, `「${dd.ticker}」已有 ${dd.items} 项清单。要重建请用 confirm:"yes"（旧清单会被覆盖；历史报告与快照保留）。`)
      }
      return result(true, `「${dd.ticker}」尽调清单已建立（${titles.length} 项）${dd.question ? `，研究问题：${dd.question}` : ''}。每完成一个环节用 status 更新进度；收尾时用 stock_archive 登记报告。`,
        titles.map((t, i) => `${i + 1}. ${t} [todo]`).join('\n'))
    }

    if (args.action === 'status') {
      if (!ticker) return result(false, '还没有任何尽调档案，先 init。')
      if (!args.index) throw new Error('status 需要 index（事项序号）。')
      const item = updateItem(ticker, args.index, { status: args.status, note: args.note })
      if (!item) return result(false, `「${ticker}」还没有清单，先 init。`)
      return result(true, `「${ticker}」事项 ${item.index}「${item.title}」→ ${item.status}${item.note ? `（${item.note}）` : ''}。`)
    }

    if (args.action === 'clear') {
      if (args.confirm !== 'yes') return result(false, '清空尽调清单请用 confirm:"yes"。')
      if (!ticker) return result(false, '没有可清空的清单。')
      clearChecklist(ticker)
      return result(true, `「${ticker}」尽调清单已清空（报告与快照保留）。`)
    }

    // list：给了 ticker 看单只，否则看全部标的
    if (args.ticker) {
      const d = getDossier(args.ticker)
      if (!d || !d.checklist.items.length) return result(false, `「${args.ticker}」没有清单，先 init。`)
      return result(true, `「${d.ticker}」尽调进度：${d.progress.done}/${d.progress.total} 完成${d.question ? `（${d.question}）` : ''}，报告 ${d.reports} 份。`,
        d.checklist.items.map((it) => `${it.index}. ${it.title} [${it.status}]${it.note ? ` ${it.note}` : ''}`).join('\n'))
    }
    const all = listDossiers()
    if (!all.length) return result(true, '还没有任何尽调档案。init 一只股票即可开始（默认 8 项标准骨架）。')
    return result(true, `共 ${all.length} 只标的的尽调档案：`,
      all.map((d) => `${RATING_MARK[d.rating] || '⚪'} ${d.ticker}${d.name ? ` ${d.name}` : ''} · ${d.progress.done}/${d.progress.total} · ${d.reports} 份报告 · ${String(d.updatedAt).slice(0, 10)}`).join('\n'))
  },
}

const RATING_MARK = { green: '🟢', yellow: '🟡', red: '🔴', none: '⚪' }

// ---------------------------------------------------------------------------
// 工具 1b：stock_archive —— 报告与指标登记（档案库的另一半）
// ---------------------------------------------------------------------------
export const stockArchiveTool = {
  name: 'stock_archive',
  description:
    '把尽调报告和关键指标登记进股票档案库，用户在侧栏「投资尽调」里就能看到历史、对比两次结论。' +
    '一轮尽调收尾（Phase 8）时 save 一次：报告只登记路径、不复制文件；同时存一份当日指标快照，' +
    '下次再研究同一只股票可 diff 出「估值/评级变了吗」。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: str('save 登记报告；list 全部标的；get 单只档案；diff 最近两次快照对比；remove 删某份报告', { enum: ['save', 'list', 'get', 'diff', 'remove'] }),
      ticker: str('股票代码/名称（save/get/diff/remove 必填；list 省略）'),
      title: str('save：报告标题'),
      reportPath: str('save：报告文件的绝对路径（Markdown/HTML/PDF 均可）'),
      rating: str('save：结论评级', { enum: RATINGS }),
      metrics: str('save：关键指标 JSON 字符串，如 {"pe":14.4,"marketCap":3.8,"revenue":7517,"netIncome":2248,"fcf":1826}'),
      note: str('save：一句话结论'),
      id: str('remove：报告 id（get 里能看到）'),
    },
  },
  output: OUTPUT,
  async execute(args) {
    check(args, this.parameters)

    if (args.action === 'list') {
      const all = listDossiers()
      if (!all.length) return result(true, '档案库是空的。跑一轮尽调后用 save 登记。')
      return result(true, `共 ${all.length} 只标的：`,
        all.map((d) => `${RATING_MARK[d.rating] || '⚪'} ${d.ticker}${d.name ? ` ${d.name}` : ''} · ${d.progress.done}/${d.progress.total} · 报告 ${d.reports} · 更新 ${String(d.updatedAt).slice(0, 10)}`).join('\n'))
    }

    if (!args.ticker) throw new Error(`${args.action} 需要 ticker。`)

    if (args.action === 'save') {
      let metrics = {}
      if (args.metrics) {
        try { metrics = JSON.parse(args.metrics) } catch { throw new Error('metrics 要是合法 JSON，如 {"pe":14.4}') }
      }
      if (args.reportPath && !/^([A-Za-z]:[\\/]|\\\\|\/)/.test(args.reportPath)) throw new Error('reportPath 要用绝对路径。')
      const { report, meta } = archiveReport(args.ticker, {
        title: args.title, reportPath: args.reportPath, rating: args.rating, metrics, note: args.note,
      })
      const bits = [report.title, report.rating !== 'none' ? `评级 ${RATING_MARK[report.rating]}` : '', Object.keys(report.metrics).length ? `${Object.keys(report.metrics).length} 个指标` : ''].filter(Boolean)
      return result(true, `已登记「${args.ticker}」：${bits.join(' · ')}（报告 ${meta.reports.length} 份）。用户在侧栏「投资尽调」里能看到并打开报告。`,
        report.path ? `报告路径：${report.path}` : '')
    }

    if (args.action === 'get') {
      const d = getDossier(args.ticker)
      if (!d) return result(false, `没有「${args.ticker}」的档案。`)
      const lines = [
        `${RATING_MARK[d.rating] || '⚪'} ${d.ticker} ${d.name || ''}`.trim(),
        `进度 ${d.progress.done}/${d.progress.total}${d.question ? ` ｜ 研究问题：${d.question}` : ''}`,
        ...(d.meta.reports || []).map((r) => `- [${r.id}] ${r.date} ${r.title}${r.rating !== 'none' ? ` ${RATING_MARK[r.rating]}` : ''}${r.path ? ` ${r.path}` : ''}`),
      ]
      return result(true, `「${d.ticker}」档案：`, lines.join('\n'))
    }

    if (args.action === 'diff') {
      const diff = snapshotDiff(args.ticker)
      if (!diff.rows.length) return result(false, `「${args.ticker}」只有 ${diff.have} 份快照，至少需要 2 份（不同日期各 save 一次）才能对比。`)
      const fmt = (v) => (v === null ? '—' : typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v))
      return result(true, `「${args.ticker}」${diff.prevDate} → ${diff.nowDate} 指标对比：`,
        diff.rows.map((r) => `${r.key}：${fmt(r.prev)} → ${fmt(r.now)}${r.delta !== null ? `（${r.delta > 0 ? '+' : ''}${Math.round(r.delta * 100) / 100}）` : ''}`).join('\n'))
    }

    // remove
    if (!args.id) throw new Error('remove 需要 id。')
    const ok = removeReport(args.ticker, args.id)
    return result(ok, ok ? `已删除「${args.ticker}」的报告 ${args.id}。` : `没找到报告 ${args.id}。`)
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
  ctx.effect(() => ctx.tools.register(stockArchiveTool), `${name}: tool archive`)
  ctx.effect(() => ctx.tools.register(stockModuleTool), `${name}: tool modules`)
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(skillDirs)), `${name}: skills`)

  if (config.injectRules !== false) {
    ctx.effect(() => ctx.systemPrompt.section(systemSection()), `${name}: methodology`)
  }

  ctx.effect(() => registerApi(ctx, { skillDirs }), `${name}: routes`)
}
