// ============================================================================
// 股票投资尽调 · 浏览器半边
//   - 侧栏加「投资尽调」入口，主区域是研究所页面（/stock-research/，iframe）
//   - 页面里点「开始尽调」「复盘这只」：页面 postMessage 一段草稿，这里开新对话并填进输入框
//   - 明暗跟随 dsh 主题，切换时把配色发给页面
//
// 注意：这里**不要**自己写 window.__ModuleLoader__.load(...)。
// scripts/build.mjs 的 banner 已经包了一层注册，再包一次会让同一个 id 注册两次，
// 宿主 client-modules 会以 "duplicate factory registration" 抛错并让整个 web boot 失败。
// ============================================================================
const React = require('react')
const h = React.createElement

const PANEL = 'stock-research'
const SRC = '/stock-research/'

// 侧栏图标：一枚带升势折线的行情徽章
function PanelIcon(props) {
  const s = (props && props.size) || 18
  return h('svg', { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
    h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 5 }),
    h('path', { d: 'M7 15.5l3.2-4 2.6 2.6L17 9' }),
    h('path', { d: 'M14.4 9H17v2.6' }))
}

function apply(ctx) {
  const frames = new Set()
  let scheme = null
  const post = (frame) => {
    try { if (scheme && frame.contentWindow) frame.contentWindow.postMessage({ type: 'stock-research:scheme', scheme }, location.origin) } catch {}
  }
  ctx.inject(['theme'], (c) => {
    const push = (snap) => { scheme = snap.active.colorScheme; frames.forEach(post) }
    try { push(c.theme.getTheme()) } catch {}
    c.on('theme/change', push)
  })

  function LabPanel() {
    const ref = React.useRef(null)
    React.useEffect(() => {
      const self = ref.current
      if (self) frames.add(self)
      function onMessage(e) {
        const frame = ref.current
        if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return
        const m = e.data
        if (!m || m.type !== 'stock-research:start' || typeof m.prompt !== 'string') return
        try {
          ctx.uiWorkspace.startSession(undefined, { prompt: m.prompt, whenDraftExists: 'replace' })
        } catch (err) {
          console.error('[stock-research] 开新对话失败', err)
          try { frame.contentWindow.postMessage({ type: 'stock-research:start-failed', message: String((err && err.message) || err) }, location.origin) } catch {}
        }
      }
      addEventListener('message', onMessage)
      return () => { removeEventListener('message', onMessage); frames.delete(self) }
    }, [])
    return h('iframe', {
      ref,
      src: SRC,
      title: '投资尽调',
      allow: 'fullscreen',
      onLoad: (e) => post(e.currentTarget),
      style: { width: '100%', height: '100%', border: 0, display: 'block' },
    })
  }

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 12, label: () => '投资尽调' }, PanelIcon))
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, LabPanel))
}

exports.isPlugin = true
exports.inject = ['slots', 'uiWorkspace']
exports.apply = apply
