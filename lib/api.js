// 面板数据面：/stock-research 前缀路由（技能目录 + 尽调清单）。
import { readDir } from './skills.js'
import { listModules, getModule } from './modules.js'
import { getDD } from './data.js'

const BASE = '/stock-research'

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

export function requestRejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return false // dsh 0.2.x 宿主已 token 鉴权，服务缺席时放行（fail-closed 会把面板永久 403）
  return connection.requestRejection({ headers: req.headers })
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
        const path = url.pathname.slice(BASE.length) || '/'

        if (path === '/api/health' && req.method === 'GET') {
          return json(res, 200, { ok: true })
        }
        if (path === '/api/skills' || path === '/api/modules') {
          const modules = listModules(skillDirs)
          return json(res, 200, { count: modules.length, skills: modules, modules })
        }
        if (path === '/api/module' && req.method === 'GET') {
          const mod = getModule(skillDirs, url.searchParams.get('id') || '')
          if (!mod) return json(res, 404, { error: '没有技能 ' + url.searchParams.get('id') })
          return json(res, 200, { module: { name: mod.name, description: mod.description, body: mod.body } })
        }
        if (path === '/api/dd' && req.method === 'GET') {
          return json(res, 200, { dd: getDD() })
        }
        json(res, 404, { error: 'not found' })
      } catch (err) {
        json(res, 500, { error: err?.message || '内部错误' })
      }
    },
  })
}
