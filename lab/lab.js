// 投资尽调研究所：页面逻辑（无框架，hash 路由 + fetch /api/*）
const app = document.getElementById('app')
const navCount = document.getElementById('nav-count')
const railFoot = document.getElementById('rail-foot')
const viewer = document.getElementById('viewer')
const viewerTitle = document.getElementById('viewer-title')
const viewerBody = document.getElementById('viewer-body')
const viewerPath = document.getElementById('viewer-path')

const state = { data: null, q: '', rating: 'all', error: '' }

const RATING = {
  green: { label: '绿', mark: '🟢', color: 'var(--green)' },
  yellow: { label: '黄', mark: '🟡', color: 'var(--yellow)' },
  red: { label: '红', mark: '🔴', color: 'var(--red)' },
  none: { label: '未评级', mark: '⚪', color: 'var(--grey)' },
}
const STATUS = { done: ['s-done', '完成'], doing: ['s-doing', '进行中'], todo: ['s-todo', '待做'] }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const rating = (r) => RATING[r] || RATING.none
const pct = (p) => (p && p.total ? Math.round((p.done / p.total) * 100) : 0)
const date = (iso) => (iso ? String(iso).slice(0, 10) : '')
const fmt = (v) => (v === null || v === undefined ? '—' : typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v))

// 页面挂在 /stock-research/ 下，接口也在同一前缀下。
// 这里不能用 '/api/...' 这种根绝对路径——那会打到宿主自己的 API 上（404）。
const BASE = location.pathname.replace(/\/+$/, '') || '/stock-research'

async function api(path, opts) {
  const res = await fetch(BASE + path, opts)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `请求失败（${res.status}）`)
  return body
}

// ---------- 主题 ----------
addEventListener('message', (e) => {
  if (e.origin !== location.origin) return
  const m = e.data
  if (m && m.type === 'stock-research:scheme' && m.scheme) document.documentElement.dataset.scheme = m.scheme
  if (m && m.type === 'stock-research:start-failed') toast('开新对话失败：' + (m.message || ''))
})

// ---------- 拉起对话 ----------
function start(prompt) {
  try {
    parent.postMessage({ type: 'stock-research:start', prompt }, location.origin)
    toast('已把研究任务填进新对话，确认后发送即可')
  } catch {
    toast('无法在当前环境开新对话，请手动复制下面这段：\n' + prompt)
  }
}
let toastTimer
function toast(text) {
  const el = document.getElementById('toast')
  el.textContent = text
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200)
}

// ---------- 路由 ----------
const route = () => location.hash.replace(/^#\/?/, '').split('?')[0]

function render() {
  const r = route()
  document.querySelectorAll('.nav a').forEach((a) => {
    const v = a.dataset.view
    const on = (v === 'home' && r === '') || (v === 'dossiers' && r.startsWith('dossiers')) ||
      (v === 'new' && r === 'new') || (v === 'method' && r === 'method') ||
      (v === 'dossiers' && r.startsWith('d/'))
    if (on) a.setAttribute('aria-current', 'true')
    else a.removeAttribute('aria-current')
  })
  if (r === '') return renderHome()
  if (r.startsWith('dossiers')) return renderDossiers()
  if (r.startsWith('d/')) return renderDetail(decodeURIComponent(r.slice(2)))
  if (r === 'new') return renderNew()
  if (r === 'method') return renderMethod()
  renderHome()
}

// ---------- 概览 ----------
function renderHome() {
  const d = state.data
  const s = d.stats
  const recent = d.dossiers.slice(0, 3)
  app.innerHTML = `
    <header class="head">
      <span class="eyebrow">Investment Due Diligence</span>
      <h1>投资尽调研究所</h1>
      <p>每只股票一个独立档案：8 阶段进度、历史报告、估值快照都留在这里，不会互相覆盖。</p>
    </header>
    <div class="stats">
      <div class="stat"><b>${s.dossiers}</b><small>在研标的</small></div>
      <div class="stat"><b>${s.reports}</b><small>尽调报告</small></div>
      <div class="stat"><b>${s.total ? Math.round((s.done / s.total) * 100) : 0}%</b><small>整体进度 ${s.done}/${s.total}</small></div>
      <div class="stat"><b>${s.rated.green || 0} / ${s.rated.yellow || 0} / ${s.rated.red || 0}</b><small>绿 / 黄 / 红 评级</small></div>
    </div>
    ${recent.length ? `
      <div class="sec-head"><h2>最近更新</h2><a class="more" href="#/dossiers">查看全部</a></div>
      <div class="grid">${recent.map(dossierCard).join('')}</div>`
    : `<div class="empty-box"><b>还没有任何尽调档案</b>在对话里说「帮我尽调腾讯 00700.HK，价值投资风格」，收尾时模型会把报告登记到这里。</div>`}
    <div class="sec-head"><h2>下一步</h2></div>
    <div class="grid">
      <div class="card" data-go="#/new">
        <div class="card-top"><span class="dot" style="background:var(--accent)"></span><span class="card-title">发起一只新标的</span></div>
        <div class="card-sub">填代码 + 风格，打开新对话并自动带上 8 阶段指令</div>
      </div>
      <div class="card" data-go="#/method">
        <div class="card-top"><span class="dot" style="background:var(--yellow)"></span><span class="card-title">看看方法论</span></div>
        <div class="card-sub">8 阶段框架、引用军规、信号评级规则</div>
      </div>
    </div>`
  bindCards()
}

function dossierCard(x) {
  const r = rating(x.rating)
  return `<div class="card" data-go="#/d/${encodeURIComponent(x.ticker)}">
    <div class="card-top">
      <span class="dot" style="background:${r.color}"></span>
      <span class="card-title">${esc(x.name || x.ticker)}</span>
      <span class="card-sub" style="margin-left:auto">${esc(x.ticker)}</span>
    </div>
    <div class="card-sub">${x.question ? esc(x.question) : '—'}</div>
    <div class="card-foot">
      <span>${r.mark} ${r.label}</span>
      <div class="bar"><i style="width:${pct(x.progress)}%"></i></div>
      <span>${x.progress.done}/${x.progress.total}</span>
      <span>${x.reports} 份报告</span>
      <span>${date(x.updatedAt)}</span>
    </div>
  </div>`
}

function bindCards() {
  app.querySelectorAll('[data-go]').forEach((el) => {
    el.addEventListener('click', () => { location.hash = el.dataset.go })
  })
}

// ---------- 尽调列表 ----------
function renderDossiers() {
  const all = state.data.dossiers
  const shown = all.filter((x) => {
    const hitQ = !state.q || [x.ticker, x.name, x.question].some((v) => String(v || '').toLowerCase().includes(state.q.toLowerCase()))
    const hitR = state.rating === 'all' || x.rating === state.rating
    return hitQ && hitR
  })
  app.innerHTML = `
    <header class="head"><h1>我的尽调</h1>
      <p>共 ${all.length} 只标的，${all.reduce((n, x) => n + x.reports, 0)} 份报告。</p></header>
    <div class="toolbar">
      <input class="search" id="q" placeholder="搜索代码 / 名称 / 研究问题" value="${esc(state.q)}">
      ${['all', 'green', 'yellow', 'red', 'none'].map((k) => {
        const label = k === 'all' ? '全部' : rating(k).mark + ' ' + rating(k).label
        return `<button class="pill" data-rating="${k}" aria-pressed="${state.rating === k}">${label}</button>`
      }).join('')}
    </div>
    ${shown.length ? `<div class="grid">${shown.map(dossierCard).join('')}</div>`
      : `<div class="empty-box"><b>没有匹配的标的</b>换个关键词，或者去「发起新尽调」。</div>`}`
  const q = document.getElementById('q')
  q.addEventListener('input', (e) => { state.q = e.target.value; renderDossiers(); setTimeout(() => document.getElementById('q')?.focus(), 0) })
  app.querySelectorAll('[data-rating]').forEach((b) => b.addEventListener('click', () => { state.rating = b.dataset.rating; renderDossiers() }))
  bindCards()
}

// ---------- 详情 ----------
async function renderDetail(ticker) {
  app.innerHTML = `<div class="loading">读取「${esc(ticker)}」档案…</div>`
  let d
  try { d = (await api('/api/dossier?ticker=' + encodeURIComponent(ticker))).dossier } catch (e) {
    app.innerHTML = `<div class="empty-box"><b>读不到这只标的</b>${esc(e.message)}</div>`
    return
  }
  const r = rating(d.rating)
  const diff = d.diff
  app.innerHTML = `
    <header class="head">
      <a class="card-sub" href="#/dossiers">← 我的尽调</a>
      <div class="detail-head" style="margin-top:6px">
        <h1 style="margin:0">${esc(d.name || d.ticker)}</h1>
        <span class="badge">${esc(d.ticker)}</span>
        ${d.market ? `<span class="badge grey">${esc(d.market)}</span>` : ''}
        ${d.style ? `<span class="badge grey">${esc(d.style)}</span>` : ''}
        <span class="badge" style="background:transparent;color:${r.color}">${r.mark} ${r.label}</span>
      </div>
      <p>${d.question ? esc(d.question) : '未记录研究问题'}</p>
    </header>

    <div class="panel">
      <div class="card-top" style="margin-bottom:8px">
        <b style="font-size:13px">尽调清单</b>
        <span class="card-sub" style="margin-left:auto">${d.progress.done}/${d.progress.total} 完成</span>
      </div>
      <div class="bar" style="margin-bottom:10px"><i style="width:${pct(d.progress)}%"></i></div>
      ${d.checklist.items.length ? d.checklist.items.map((it) => {
        const [cls, label] = STATUS[it.status] || STATUS.todo
        return `<div class="item">
          <span class="item-status ${cls}">${label}</span>
          <div><div class="item-title">${it.index}. ${esc(it.title)}</div>
          ${it.note ? `<div class="item-note">${esc(it.note)}</div>` : ''}</div>
        </div>`
      }).join('') : '<div class="card-sub">还没有清单。在对话里说「继续尽调 ' + esc(d.ticker) + '」让模型 init。</div>'}
    </div>

    <div class="panel">
      <div class="card-top" style="margin-bottom:4px"><b style="font-size:13px">历史报告</b><span class="card-sub" style="margin-left:auto">${(d.meta.reports || []).length} 份</span></div>
      ${(d.meta.reports || []).length ? d.meta.reports.map((rep) => `
        <div class="report-row" data-report="${esc(rep.id)}">
          <span class="dot" style="background:${rating(rep.rating).color}"></span>
          <div style="min-width:0">
            <div class="report-title">${esc(rep.title)}</div>
            <div class="report-path">${date(rep.date)}${rep.path ? ' · ' + esc(rep.path) : ' · 未登记路径'}</div>
          </div>
          <span class="card-sub" style="margin-left:auto">${esc(rep.note || '')}</span>
        </div>`).join('') : '<div class="card-sub">还没有登记报告。尽调收尾时模型会调用 stock_archive 存一份。</div>'}
    </div>

    ${diff && diff.rows && diff.rows.length ? `
    <div class="panel">
      <div class="card-top" style="margin-bottom:8px"><b style="font-size:13px">假设变了吗</b>
        <span class="card-sub" style="margin-left:auto">${esc(diff.prevDate)} → ${esc(diff.nowDate)}</span></div>
      <table><thead><tr><th>指标</th><th>上次</th><th>这次</th><th>变化</th></tr></thead><tbody>
        ${diff.rows.map((row) => {
          const dir = row.delta === null ? '' : row.delta > 0 ? 'up' : row.delta < 0 ? 'down' : ''
          const arrow = row.delta === null ? '' : row.delta > 0 ? '▲' : row.delta < 0 ? '▼' : '—'
          return `<tr><td>${esc(row.key)}</td><td>${fmt(row.prev)}</td><td>${fmt(row.now)}</td>
            <td class="${dir}">${row.delta === null ? '—' : `${arrow} ${Math.abs(Math.round(row.delta * 100) / 100)}`}</td></tr>`
        }).join('')}
      </tbody></table>
    </div>` : ''}

    <div class="toolbar" style="margin-top:18px">
      <button class="btn" data-review>复盘这只（带上上次结论）</button>
      <button class="btn ghost" data-delete>删除档案</button>
    </div>`

  app.querySelectorAll('[data-report]').forEach((el) => el.addEventListener('click', () => openReport(d.ticker, el.dataset.report)))
  app.querySelector('[data-review]').addEventListener('click', () => start(
    `复盘 ${d.ticker}${d.name ? ' ' + d.name : ''}：上次结论是「${d.question || '未记录'}」，评级 ${r.label}。` +
    `请先用 stock_checklist list 看当前清单（ticker=${d.ticker}），再更新有新数据的分项，` +
    `重点核对估值与自由现金流假设是否变化，最后用 stock_archive save 登记新报告和指标。`))
  app.querySelector('[data-delete]').addEventListener('click', async () => {
    if (!confirm(`删除「${d.ticker}」的整个档案？报告文件本身不会被删。`)) return
    await api('/api/dossier/remove', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticker: d.ticker }) })
    await boot()
    location.hash = '#/dossiers'
  })
}

// ---------- 报告阅读 ----------
async function openReport(ticker, id) {
  viewer.hidden = false
  viewerBody.innerHTML = '<div class="loading">渲染报告…</div>'
  try {
    const { report } = await api(`/api/report?ticker=${encodeURIComponent(ticker)}&id=${encodeURIComponent(id)}`)
    viewerTitle.textContent = report.title
    viewerPath.hidden = !report.path
    viewerPath.textContent = '路径'
    viewerPath.onclick = () => navigator.clipboard?.writeText(report.path)
    viewerBody.innerHTML = report.html || `<div class="empty-box"><b>文件不在原处</b>
      ${report.path ? esc(report.path) : '报告没有登记路径'}<br>可能被移动或删除；把新路径重新 save 一次即可。</div>`
  } catch (e) {
    viewerBody.innerHTML = `<div class="empty-box"><b>打不开这份报告</b>${esc(e.message)}</div>`
  }
}
function closeViewer() { viewer.hidden = true }
document.getElementById('viewer-close').addEventListener('click', closeViewer)
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeViewer() })

// ---------- 发起新尽调 ----------
const PHASES = [
  ['01', '公司事实底座', '业务、收入构成、用户资产、近期战略变化'],
  ['02', '行业周期分析', '周期位置、供需、竞争集中度、政策变量'],
  ['03', '业务拆解', '一句话生意本质、分部拆解、利润引擎'],
  ['04', '财务质量', 'ROE/ROIC 趋势、现金流与利润交叉验证、异常项'],
  ['05', '股权治理', '持股结构、减持与回购、资本配置记录'],
  ['06', '市场分歧', '多空逻辑、卖方目标价、可验证指标'],
  ['07', '估值与护城河', '护城河评分、相对估值、反推 DCF'],
  ['08', '综合报告', '信号评级、逻辑链、监控清单'],
]

function renderNew() {
  const last = state.data.dossiers[0]
  app.innerHTML = `
    <header class="head"><h1>发起新尽调</h1>
      <p>填好之后会打开一个新对话，指令已经写好，你可以再改。</p></header>
    <div class="panel"><div class="form">
      <div class="field"><label>股票代码 / 名称</label><input id="f-ticker" placeholder="如 00700.HK、600519、AAPL" value=""></div>
      <div class="field"><label>投资风格</label>
        <select id="f-style">
          <option value="价值投资">价值投资（重安全边际、现金流、估值）</option>
          <option value="成长投资">成长投资（重 TAM、竞争格局、增长可持续）</option>
          <option value="困境反转">困境反转（重资产负债表、重组进展）</option>
          <option value="分红投资">分红投资（重派息、FCF 覆盖）</option>
        </select></div>
      <div class="field"><label>持有期</label>
        <select id="f-horizon"><option>长线（3 年以上）</option><option>中线（1–3 年）</option><option>短线（1 年内）</option></select></div>
      <div class="field"><label>想回答的问题（可选）</label><input id="f-question" placeholder="如「当前估值是否已反映 AI 资本开支风险」"></div>
      <button class="btn" id="f-go">开始尽调 →</button>
    </div></div>
    ${last ? `<div class="sec-head"><h2>或者从上次继续</h2></div>
      <div class="grid"><div class="card" id="c-last">
        <div class="card-top"><span class="dot" style="background:${rating(last.rating).color}"></span>
        <span class="card-title">${esc(last.name || last.ticker)}</span></div>
        <div class="card-sub">上次进度 ${last.progress.done}/${last.progress.total}，${last.reports} 份报告</div>
        <div class="card-foot"><span>点这里复盘</span></div>
      </div></div>` : ''}`
  document.getElementById('f-go').addEventListener('click', () => {
    const ticker = document.getElementById('f-ticker').value.trim()
    if (!ticker) return toast('先填个股票代码')
    const style = document.getElementById('f-style').value
    const horizon = document.getElementById('f-horizon').value
    const question = document.getElementById('f-question').value.trim()
    start(`帮我尽调 ${ticker}，${style}风格，持有期${horizon}${question ? `。我想回答的问题：${question}` : ''}。` +
      `请先用 stock_checklist init（ticker=${ticker}）建 8 阶段清单，按框架推进，每完成一个阶段用 status 记录；` +
      `收尾时用 stock_archive save 登记报告路径、评级和关键指标，方便下次对比。`)
  })
  const c = document.getElementById('c-last')
  if (c) c.addEventListener('click', () => { location.hash = '#/d/' + encodeURIComponent(last.ticker) })
}

// ---------- 方法论 ----------
function renderMethod() {
  app.innerHTML = `
    <header class="head"><span class="eyebrow">Framework</span><h1>8 阶段尽调框架</h1>
      <p>来自 stock-research-executor 技能。每一阶段都要求：先拿数据再下结论，事实性陈述带来源。</p></header>
    <div class="grid">
      ${PHASES.map(([n, title, desc]) => `<div class="card" style="cursor:default">
        <div class="card-top"><span class="card-title" style="color:var(--accent)">${n}</span>
        <span class="card-title">${title}</span></div>
        <div class="card-sub">${desc}</div></div>`).join('')}
    </div>
    <div class="sec-head"><h2>引用军规</h2></div>
    <div class="panel" style="font-size:13px;color:var(--ink-2);line-height:1.9">
      每条事实性声明标注来源（URL 或文件路径），来源分级 A–E：<br>
      A 官方公告/财报 · B 主流财经媒体 · C 券商研报 · D 行业报告/博客 · E 社交讨论<br>
      利润与现金流交叉验证；公司与同行对比验证；数据缺口写 N/A，不编造。
    </div>
    <div class="sec-head"><h2>信号评级</h2></div>
    <div class="panel" style="font-size:13px;color:var(--ink-2);line-height:1.9">
      🟢🟢🟢 高确定性 · 🟡🟡🟡 中性/待验证 · 🔴🔴 回避<br>
      <span style="color:var(--ink-3)">研究框架输出分析，不构成投资建议。</span>
    </div>`
}

// ---------- 启动 ----------
async function boot() {
  app.innerHTML = '<div class="loading">加载中…</div>'
  try {
    state.data = await api('/api/catalog')
    navCount.textContent = state.data.dossiers.length || ''
    railFoot.innerHTML = `v${esc(state.data.version || '')}<br>${state.data.dossiers.length} 只标的 · ${state.data.stats.reports} 份报告`
  } catch (e) {
    app.innerHTML = `<div class="empty-box"><b>读不到档案库</b>${esc(e.message)}<br>插件可能刚装好，刷新页面再试。</div>`
    return
  }
  render()
}

addEventListener('hashchange', render)
boot()
