// 股票投资尽调 · 尽调清单持久化（$DSH_HOME/stock-research/）。
// dd.json：{ ticker, question, items: [{ index, title, status, note, updatedAt }] }
// status: todo | doing | done
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DATA_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'stock-research')
const DD_FILE = join(DATA_DIR, 'dd.json')
export const STATUSES = ['todo', 'doing', 'done']

// 标准尽调清单（方法论默认骨架，init 可覆盖）。
export const DEFAULT_CHECKLIST = [
  '界定研究问题与投资视角',
  '收集公司基本面（业务/财报/管理层）',
  '行业格局与竞争分析',
  '财务数据交叉验证（多来源）',
  '风险因素与反方观点收集',
  '估值逻辑与关键假设',
  '引用与来源校验（citation-validator）',
  '综合结论与投资建议（synthesizer）',
]

export function ensureDirs() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

function load() {
  try {
    const raw = JSON.parse(readFileSync(DD_FILE, 'utf8'))
    return raw && typeof raw === 'object' ? raw : null
  } catch {
    return null
  }
}

function save(dd) {
  ensureDirs()
  const tmp = `${DD_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(dd, null, 2), 'utf8')
  renameSync(tmp, DD_FILE)
}

export function getDD() {
  return load() || { ticker: '', question: '', items: [] }
}

export function initDD(ticker, question, itemTitles, confirm = false) {
  const prev = load()
  if (prev && prev.items.length && !confirm) {
    return { conflict: true, ticker: prev.ticker, items: prev.items.length }
  }
  const list = Array.isArray(itemTitles) && itemTitles.length ? itemTitles : DEFAULT_CHECKLIST
  const dd = {
    ticker,
    question,
    items: list.map((title, i) => ({
      index: i + 1,
      title,
      status: 'todo',
      note: '',
      updatedAt: new Date().toISOString(),
    })),
    updatedAt: new Date().toISOString(),
  }
  save(dd)
  return dd
}

export function updateItem(index, patch) {
  const dd = load()
  if (!dd) return null
  let item = dd.items.find((it) => it.index === index)
  if (!item) {
    item = { index, title: patch.title || `事项${index}`, status: 'todo', note: '', updatedAt: '' }
    dd.items.push(item)
    dd.items.sort((a, b) => a.index - b.index)
  }
  if (patch.title !== undefined) item.title = patch.title
  if (patch.status !== undefined && STATUSES.includes(patch.status)) item.status = patch.status
  if (patch.note !== undefined) item.note = String(patch.note).slice(0, 300)
  item.updatedAt = new Date().toISOString()
  dd.updatedAt = item.updatedAt
  save(dd)
  return item
}

export function clearDD() {
  save({ ticker: '', question: '', items: [] })
}
