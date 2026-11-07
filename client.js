// ============================================================================
// 股票投资尽调 · 浏览器半边（最小面板）。
// 两块：📖 使用指南（触发方式 + 8 阶段框架概览）、📋 技能目录（7 技能描述浏览）。
// ============================================================================
const h = require('react').createElement
const { useState, useEffect } = require('react')

const PANEL_ID = 'stock-research'
const BASE = 'stock-research'

function PanelIcon(props) {
  return h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', ...props },
    h('rect', { x: 2.5, y: 2.5, width: 19, height: 19, rx: 5, fill: '#1a6f4b' }),
    h('path', { d: 'M6 16l3-4 3 3 4-6 2 2', stroke: '#fff', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    h('path', { d: 'M6 18h12', stroke: '#ffd24a', 'stroke-width': 1.4, 'stroke-linecap': 'round' }))
}

async function fetchJson(path) {
  const res = await fetch(BASE + path)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`)
  return data
}

// ---------- 使用指南 ----------
function GuideTab() {
  return h('div', null,
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '怎么发起一次投资尽调'),
      h('div', { style: styles.stepList },
        '在对话里一句话即可：',
        h('div', { style: styles.quote }, '「深度调研 600519」'),
        h('div', { style: styles.quote }, '「分析苹果 AAPL 的投资价值」'),
        h('div', { style: styles.quote }, '「帮我尽调腾讯 00700.HK，价值投资风格」'),
        '模型会：细化问题（投资风格/持有期/风险偏好）→ 8 阶段研究 → 产出 20 文件尽调报告。')),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '8 阶段框架'),
      h('div', { style: { ...styles.muted, lineHeight: 2 } },
        '① 公司事实底座 → ② 行业周期分析 → ③ 业务拆解 → ④ 财务质量 → ⑤ 股权治理 → ⑥ 市场分歧 → ⑦ 估值与护城河 → ⑧ 综合报告（含信号评级 🟢🟢🟢/🟡🟡🟡/🔴🔴）')),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '研究风格'),
      h('div', { style: { ...styles.muted, lineHeight: 1.8 } },
        '价值投资 · 成长投资 · 逆转投资 · 分红投资——分不清就先问。')),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '⚠️ 免责声明'),
      h('div', { style: styles.muted }, '本框架输出研究分析，不构成投资建议。所有投资存在风险。投资决策前请自行尽职调查并咨询合格财务顾问。')))
}

// ---------- 技能目录 ----------
function SkillsTab() {
  const [skills, setSkills] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetchJson('/api/skills').then((d) => setSkills(d.skills)).catch((e) => setError(e.message))
  }, [])
  return h('div', null,
    error ? h('div', { style: styles.error }, error) : null,
    skills === null ? h('div', { style: styles.muted }, '加载中…') : null,
    skills?.map((s) => h('div', { key: s.name, style: styles.card },
      h('div', { style: styles.skillName }, '/' + s.name),
      h('div', { style: styles.skillDesc }, s.description.length > 200 ? s.description.slice(0, 200) + '…' : s.description))))
}

function Panel() {
  const [tab, setTab] = useState('guide')
  return h('div', { style: styles.wrap },
    h('div', { style: styles.row },
      h('button', { style: tab === 'guide' ? styles.tabActive : styles.tab, onClick: () => setTab('guide') }, '📖 使用指南'),
      h('button', { style: tab === 'skills' ? styles.tabActive : styles.tab, onClick: () => setTab('skills') }, '📋 技能目录')),
    tab === 'guide' ? h(GuideTab) : h(SkillsTab))
}

const styles = {
  wrap: { padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box', fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif', fontSize: 13, color: '#1a1a1a' },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 },
  button: { padding: '6px 14px', border: 'none', borderRadius: 8, background: '#1a6f4b', color: '#fff', cursor: 'pointer', fontSize: 13 },
  tab: { padding: '8px 16px', border: '1px solid #d9d9de', borderRadius: 8, background: '#fff', color: '#1a1a1a', cursor: 'pointer', fontSize: 13 },
  tabActive: { padding: '8px 16px', border: '1px solid #1a6f4b', borderRadius: 8, background: '#e6f2ec', color: '#0e4d34', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  card: { background: '#fff', border: '1px solid #e3e3e6', borderRadius: 10, padding: 12, marginBottom: 10 },
  sectionTitle: { fontWeight: 700, marginBottom: 6 },
  stepList: { lineHeight: 1.9 },
  quote: { background: '#e6f2ec', borderRadius: 6, padding: '4px 10px', margin: '4px 0', color: '#0e4d34' },
  muted: { color: '#8a8a92' },
  error: { color: '#c0392b' },
  skillName: { fontWeight: 700, color: '#0e4d34' },
  skillDesc: { marginTop: 4, color: '#4a4a50', lineHeight: 1.5 },
}

function apply(ctx) {
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 12, label: () => '投资尽调' }, PanelIcon))
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: PANEL_ID }, Panel))
}

exports.isPlugin = true
exports.inject = ['slots']
exports.apply = apply
