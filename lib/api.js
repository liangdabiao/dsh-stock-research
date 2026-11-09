// 面板数据面：/stock-research 前缀路由。
//   /stock-research/                  研究所页面（lab/ 静态资源）
//   /api/catalog                      档案列表 + 技能 + 方法论文案
//   /api/dossier?ticker=              单只标的的完整档案
//   /api/report?ticker=&id=           渲染后的报告 HTML
//   /api/dossier/remove  /api/report/remove   POST 删除
import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listModules, getModule } from './modules.js'
import { listDossiers, getDossier, removeDossier, removeReport, snapshotDiff, DATA_DIR } from './data.js'

const BASE = '/stock-research'
const LAB = fileURLToPath(new URL('../lab/', import.meta.url))

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
}

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

export function requestRejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return false // dsh 0.2.x 宿主已 token 鉴权，服务缺席时放行
  return connection.requestRejection({ headers: req.headers })
}

// 只放行 lab/ 里的文件：拒绝 ..、点开头的路径和指到目录外的符号链接
function safeFile(dir, rel) {
  if (!dir || String(rel).split('/').some((p) => p.startsWith('.'))) return null
  let base
  try { base = realpathSync(dir) } catch { return null }
  const file = normalize(join(base, rel))
  if (!file.startsWith(base + sep) || !existsSync(file)) return null
  const real = realpathSync(file)
  return real.startsWith(base + sep) && statSync(real).isFile() ? real : null
}

function serveFile(req, res, file) {
  res.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'content-length': statSync(file).size,
    'cache-control': 'no-cache',
  })
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
}

// 同源 JSON POST（对照 guizang 的 readJson）
function readJson(req, max = 8 * 1024) {
  return new Promise((resolve, reject) => {
    const origin = req.headers.origin
    if (req.method !== 'POST') return reject(Object.assign(new Error('method'), { status: 405 }))
    if (!/^application\/json\b/.test(req.headers['content-type'] || '')) return reject(Object.assign(new Error('type'), { status: 415 }))
    if (origin && origin.replace(/^https?:\/\//, '') !== req.headers.host) return reject(Object.assign(new Error('origin'), { status: 403 }))
    let size = 0
    const chunks = []
    req.on('data', (c) => { size += c.length; if (size > max) req.destroy(); else chunks.push(c) })
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch (e) { reject(Object.assign(e, { status: 400 })) } })
    req.on('error', reject)
  })
}

// ---------------------------------------------------------------- markdown

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
}

const isTableSep = (line) => /^\s*\|?[\s:-]*-[\s|:-]*$/.test(line) && line.includes('-') && line.includes('|')

// 够用的子集：标题 / 表格 / 列表 / 引用 / 代码块 / 分隔线 / 段落
export function renderMarkdown(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n')
  const out = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^\s*```/.test(line)) {
      const buf = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++])
      i++
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`)
      continue
    }
    if (!line.trim()) { i++; continue }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue }
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue }
    // 表格：当前行含 | 且下一行是分隔行
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const cells = (l) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim())
      const head = cells(line)
      i += 2
      const body = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) body.push(cells(lines[i++]))
      out.push('<div class="tbl"><table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>')
      continue
    }
    if (/^\s*>\s?/.test(line)) {
      const buf = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''))
      out.push(`<blockquote>${buf.map(inline).join('<br>')}</blockquote>`)
      continue
    }
    const ol = line.match(/^\s*(\d+)[.)]\s+(.*)$/)
    const ul = line.match(/^\s*[-*+]\s+(.*)$/)
    if (ol || ul) {
      const ordered = Boolean(ol)
      const buf = []
      while (i < lines.length) {
        const m = lines[i].match(ordered ? /^\s*(\d+)[.)]\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/)
        if (!m) break
        buf.push(m[ordered ? 2 : 1])
        i++
        // 列表项下的缩进续行
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-*+]\s/.test(lines[i])) buf[buf.length - 1] += ' ' + lines[i++].trim()
      }
      const tag = ordered ? 'ol' : 'ul'
      out.push(`<${tag}>` + buf.map((t) => `<li>${inline(t)}</li>`).join('') + `</${tag}>`)
      continue
    }
    const buf = [line]
    i++
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s|>|\s*```)/.test(lines[i]) && !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))) {
      buf.push(lines[i++])
    }
    out.push(`<p>${buf.map(inline).join('<br>')}</p>`)
  }
  return out.join('\n')
}

// ---------------------------------------------------------------- catalog

function readVersion() {
  try { return JSON.parse(readFileSync(join(LAB, '..', 'package.json'), 'utf8')).version } catch { return '' }
}

function readReport(ticker, id) {
  const d = getDossier(ticker)
  const report = d?.meta?.reports?.find((r) => r.id === id) || d?.meta?.reports?.[0]
  if (!report) return null
  const exists = Boolean(report.path) && existsSync(report.path)
  let html = ''
  if (exists && /\.(md|markdown|txt)$/i.test(report.path)) {
    try { html = renderMarkdown(readFileSync(report.path, 'utf8')) } catch { html = '' }
  }
  return { ...report, exists, html, ext: exists ? extname(report.path).toLowerCase() : '' }
}

function catalog(skillDirs) {
  const dossierList = listDossiers()
  return {
    version: readVersion(),
    platform: process.platform,
    dataDir: DATA_DIR,
    dossiers: dossierList.map((d) => ({ ...d, diff: d.snapshots >= 2 ? snapshotDiff(d.ticker) : null })),
    skills: listModules(skillDirs),
    stats: {
      dossiers: dossierList.length,
      reports: dossierList.reduce((n, d) => n + d.reports, 0),
      done: dossierList.reduce((n, d) => n + d.progress.done, 0),
      total: dossierList.reduce((n, d) => n + d.progress.total, 0),
      rated: Object.fromEntries(['green', 'yellow', 'red', 'none'].map((k) => [k, dossierList.filter((d) => d.rating === k).length])),
    },
  }
}

export function registerApi(ctx, { skillDirs }) {
  return ctx.webServer.register({
    kind: 'prefix',
    path: BASE,
    async handler(req, res) {
      try {
        const rejection = requestRejection(ctx, req)
        if (typeof rejection === 'number') return json(res, rejection, { error: '未授权' })

        const url = new URL(req.url, 'http://x')
        const path = decodeURIComponent(url.pathname.slice(BASE.length)) || '/'

        // ---- API ----
        if (path === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true })
        if (path === '/api/catalog' && req.method === 'GET') return json(res, 200, catalog(skillDirs))
        if ((path === '/api/skills' || path === '/api/modules') && req.method === 'GET') {
          const modules = listModules(skillDirs)
          return json(res, 200, { count: modules.length, skills: modules, modules })
        }
        if (path === '/api/module' && req.method === 'GET') {
          const mod = getModule(skillDirs, url.searchParams.get('id') || '')
          if (!mod) return json(res, 404, { error: '没有技能 ' + url.searchParams.get('id') })
          return json(res, 200, { module: { name: mod.name, description: mod.description, body: mod.body } })
        }
        if (path === '/api/dossier' && req.method === 'GET') {
          const ticker = url.searchParams.get('ticker') || ''
          const d = getDossier(ticker)
          if (!d) return json(res, 404, { error: '没有这个标的的档案' })
          return json(res, 200, { dossier: { ...d, diff: snapshotDiff(ticker) } })
        }
        if (path === '/api/dd' && req.method === 'GET') {
          // 兼容旧面板调用：返回最近活跃的那只
          const first = listDossiers()[0]
          const d = first ? getDossier(first.ticker) : null
          return json(res, 200, { dd: d ? { ...d.checklist } : { ticker: '', question: '', items: [] } })
        }
        if (path === '/api/report' && req.method === 'GET') {
          const ticker = url.searchParams.get('ticker') || ''
          const report = readReport(ticker, url.searchParams.get('id') || '')
          if (!report) return json(res, 404, { error: '没有这份报告' })
          return json(res, 200, { report })
        }
        if (path === '/api/dossier/remove') {
          try {
            const body = await readJson(req)
            return json(res, 200, { ok: removeDossier(String(body.ticker || '')) })
          } catch (e) { return json(res, e.status || 400, { ok: false, error: e.message }) }
        }
        if (path === '/api/report/remove') {
          try {
            const body = await readJson(req)
            return json(res, 200, { ok: removeReport(String(body.ticker || ''), String(body.id || '')) })
          } catch (e) { return json(res, e.status || 400, { ok: false, error: e.message }) }
        }
        if (path.startsWith('/api/')) return json(res, 404, { error: 'not found' })

        // ---- 静态页面 ----
        if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method' })
        const file = safeFile(LAB, path === '/' ? 'index.html' : path.replace(/^\/+/, ''))
        return file ? serveFile(req, res, file) : json(res, 404, { error: 'not found' })
      } catch (err) {
        json(res, 500, { error: err?.message || '内部错误' })
      }
    },
  })
}
