// 股票投资尽调 · 档案库（多标的持久化）。
//
//   $DSH_HOME/stock-research/
//   ├── dossiers/<slug>/
//   │   ├── meta.json        ticker/名称/市场/风格/评级/报告登记
//   │   ├── checklist.json   8 阶段清单（原 dd.json 内容）
//   │   └── snapshots/<date>.json  关键指标快照
//   └── state.json           { lastTicker }
//
// 一只股票一个档案夹，互不覆盖；旧版单文件 dd.json 在首次启动时自动迁移。
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const DATA_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'stock-research')
const DOSSIER_DIR = join(DATA_DIR, 'dossiers')
const LEGACY_FILE = join(DATA_DIR, 'dd.json')
const STATE_FILE = join(DATA_DIR, 'state.json')

export const STATUSES = ['todo', 'doing', 'done']
export const RATINGS = ['green', 'yellow', 'red', 'none']

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

const now = () => new Date().toISOString()
const today = () => now().slice(0, 10)
// 目录名：去掉文件系统非法字符，保留 00700.HK 这种写法
const slug = (ticker) => String(ticker || '').trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || 'untitled'
const dirOf = (ticker) => join(DOSSIER_DIR, slug(ticker))
const metaFile = (ticker) => join(dirOf(ticker), 'meta.json')
const checklistFile = (ticker) => join(dirOf(ticker), 'checklist.json')

function readJson(file, fallback = null) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8')
  renameSync(tmp, file)
}

export function ensureDirs() {
  mkdirSync(DOSSIER_DIR, { recursive: true })
}

// 旧版单文件 dd.json → dossiers/<ticker>/，迁移后备份成 dd.json.migrated 不再读取
function migrateLegacy() {
  if (!existsSync(LEGACY_FILE)) return null
  const dd = readJson(LEGACY_FILE, null)
  const ticker = (dd && dd.ticker) || '未命名标的'
  if (dd && Array.isArray(dd.items) && dd.items.length) {
    if (!existsSync(checklistFile(ticker))) {
      writeJson(metaFile(ticker), {
        ticker, name: '', market: '', style: '', horizon: '', rating: 'none',
        question: dd.question || '', tags: [], reports: [], createdAt: now(),
        updatedAt: dd.updatedAt || now(), migratedFrom: 'dd.json',
      })
      writeJson(checklistFile(ticker), { ticker, question: dd.question || '', items: dd.items, updatedAt: dd.updatedAt || now() })
    }
  }
  try { renameSync(LEGACY_FILE, `${LEGACY_FILE}.migrated`) } catch {}
  return ticker
}

// ---------------------------------------------------------------- 读写

const emptyMeta = (ticker) => ({
  ticker, name: '', market: '', style: '', horizon: '', rating: 'none',
  question: '', tags: [], reports: [], createdAt: now(), updatedAt: now(),
})

export function readMeta(ticker) {
  return readJson(metaFile(ticker), null) || emptyMeta(ticker)
}

export function readChecklist(ticker) {
  return readJson(checklistFile(ticker), null) || { ticker, question: '', items: [], updatedAt: '' }
}

export function ensureDossier(ticker, patch = {}) {
  ensureDirs()
  migrateLegacy()
  const existed = existsSync(metaFile(ticker))
  const meta = { ...readMeta(ticker), ...clean(patch), ticker }
  if (!existed) meta.createdAt = meta.createdAt || now()
  meta.updatedAt = now()
  writeJson(metaFile(ticker), meta)
  setLast(ticker)
  return meta
}

const clean = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v !== undefined && v !== ''))

// 摘要：一只股票一条，用于列表页
function summary(ticker) {
  const meta = readMeta(ticker)
  const cl = readChecklist(ticker)
  const done = cl.items.filter((it) => it.status === 'done').length
  return {
    ticker: meta.ticker || ticker,
    name: meta.name || '',
    market: meta.market || '',
    style: meta.style || '',
    horizon: meta.horizon || '',
    rating: meta.rating || 'none',
    question: meta.question || cl.question || '',
    progress: { done, total: cl.items.length },
    reports: (meta.reports || []).length,
    snapshots: countSnapshots(ticker),
    lastReport: (meta.reports || [])[0] || null,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt || cl.updatedAt || meta.createdAt,
  }
}

function countSnapshots(ticker) {
  try { return readdirSync(join(dirOf(ticker), 'snapshots')).filter((f) => f.endsWith('.json')).length } catch { return 0 }
}

export function listDossiers() {
  ensureDirs()
  migrateLegacy()
  let dirs = []
  try { dirs = readdirSync(DOSSIER_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) } catch {}
  return dirs
    .map((d) => ({ d, meta: readJson(join(DOSSIER_DIR, d, 'meta.json'), null) }))
    .filter((x) => x.meta)
    .map((x) => summary(x.meta.ticker))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

export function getDossier(ticker) {
  const meta = readMeta(ticker)
  const cl = readChecklist(ticker)
  if (!existsSync(metaFile(ticker)) && !cl.items.length) return null
  return { ...summary(ticker), meta, checklist: cl }
}

export function getLastTicker() {
  return readJson(STATE_FILE, {})?.lastTicker || ''
}

export function setLast(ticker) {
  if (!ticker) return
  mkdirSync(DATA_DIR, { recursive: true })
  writeJson(STATE_FILE, { lastTicker: ticker })
}

// ---------------------------------------------------------------- 清单

export function initChecklist(ticker, question = '', itemTitles, confirm = false) {
  ensureDossier(ticker, { question })
  const prev = readChecklist(ticker)
  if (prev.items.length && !confirm) return { conflict: true, ticker, items: prev.items.length }
  const list = Array.isArray(itemTitles) && itemTitles.length ? itemTitles : DEFAULT_CHECKLIST
  const checklist = {
    ticker,
    question: question || prev.question || '',
    items: list.map((title, i) => ({ index: i + 1, title, status: 'todo', note: '', updatedAt: now() })),
    updatedAt: now(),
  }
  writeJson(checklistFile(ticker), checklist)
  ensureDossier(ticker, { question: checklist.question })
  return checklist
}

export function updateItem(ticker, index, patch = {}) {
  const checklist = readChecklist(ticker)
  if (!checklist.items.length) return null
  let item = checklist.items.find((it) => it.index === index)
  if (!item) {
    item = { index, title: patch.title || `事项${index}`, status: 'todo', note: '', updatedAt: '' }
    checklist.items.push(item)
    checklist.items.sort((a, b) => a.index - b.index)
  }
  if (patch.title !== undefined) item.title = patch.title
  if (patch.status !== undefined && STATUSES.includes(patch.status)) item.status = patch.status
  if (patch.note !== undefined) item.note = String(patch.note).slice(0, 300)
  item.updatedAt = now()
  checklist.updatedAt = item.updatedAt
  writeJson(checklistFile(ticker), checklist)
  ensureDossier(ticker)
  return item
}

export function clearChecklist(ticker) {
  writeJson(checklistFile(ticker), { ticker, question: '', items: [], updatedAt: now() })
}

// ---------------------------------------------------------------- 报告与快照

export function archiveReport(ticker, { title = '', reportPath = '', rating = '', metrics = {}, note = '' } = {}) {
  const meta = ensureDossier(ticker)
  const date = today()
  const id = 'r' + Date.now().toString(36)
  const report = {
    id,
    title: title || `${meta.ticker || ticker} 尽调报告`,
    path: reportPath || '',
    date,
    rating: RATINGS.includes(rating) ? rating : meta.rating || 'none',
    note: note || '',
    metrics: sanitizeMetrics(metrics),
    createdAt: now(),
  }
  meta.reports = [report, ...(meta.reports || []).filter((r) => !(reportPath && r.path === reportPath))]
  if (RATINGS.includes(rating)) meta.rating = rating
  meta.updatedAt = now()
  writeJson(metaFile(ticker), meta)

  // 同日多次登记合并成一份快照，保留最新指标
  const snapFile = join(dirOf(ticker), 'snapshots', `${date}.json`)
  const prev = readJson(snapFile, null)
  const snapshot = {
    date,
    rating: meta.rating,
    metrics: { ...(prev?.metrics || {}), ...report.metrics },
    updatedAt: now(),
  }
  writeJson(snapFile, snapshot)
  return { report, snapshot, meta }
}

function sanitizeMetrics(metrics) {
  const out = {}
  for (const [k, v] of Object.entries(metrics || {})) {
    if (v === null || v === undefined || v === '') continue
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[,%$HKDRMB人民币亿 ]/g, ''))
    out[String(k).slice(0, 24)] = Number.isFinite(n) ? n : String(v).slice(0, 40)
  }
  return out
}

export function removeReport(ticker, id) {
  const meta = readMeta(ticker)
  const next = (meta.reports || []).filter((r) => r.id !== id)
  if (next.length === (meta.reports || []).length) return false
  meta.reports = next
  meta.updatedAt = now()
  writeJson(metaFile(ticker), meta)
  return true
}

export function removeDossier(ticker) {
  if (!existsSync(dirOf(ticker))) return false
  rmSync(dirOf(ticker), { recursive: true, force: true })
  if (getLastTicker() === ticker) {
    const rest = listDossiers()
    writeJson(STATE_FILE, { lastTicker: rest[0]?.ticker || '' })
  }
  return true
}

export function readSnapshots(ticker) {
  const dir = join(dirOf(ticker), 'snapshots')
  let files = []
  try { files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort() } catch { return [] }
  return files.map((f) => readJson(join(dir, f), null)).filter(Boolean)
}

// 最近两次快照的差异，用于「假设变了吗」
export function snapshotDiff(ticker) {
  const snaps = readSnapshots(ticker)
  if (snaps.length < 2) return { need: 2, have: snaps.length, rows: [] }
  const prev = snaps[snaps.length - 2]
  const cur = snaps[snaps.length - 1]
  const keys = [...new Set([...Object.keys(prev.metrics || {}), ...Object.keys(cur.metrics || {})])]
  const rows = keys.map((k) => {
    const a = prev.metrics?.[k]
    const b = cur.metrics?.[k]
    const delta = typeof a === 'number' && typeof b === 'number' ? b - a : null
    return { key: k, prev: a ?? null, now: b ?? null, delta }
  })
  return { need: 2, have: snaps.length, prevDate: prev.date, nowDate: cur.date, prevRating: prev.rating, nowRating: cur.rating, rows }
}

// 迁移入口（供测试与 CLI 调用）
export { migrateLegacy }
