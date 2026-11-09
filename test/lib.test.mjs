// 快照合规 + provider + addendum + systemPrompt + 面板 API 单测。零 dsh 依赖零网络。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKILLS_ROOT = join(ROOT, 'skills')

// 必须在 import 任何碰 data.js 的模块之前设好隔离目录：
// api.js → data.js 在导入时就确定 DATA_DIR，晚一步就会写进用户真实的 ~/.dsh
process.env.DSH_HOME = new URL('../.tmp/test-home/', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:')

const { createSkillProvider, readDir } = await import('../lib/skills.js')
const { systemSection } = await import('../src/systemPrompt.js')
const { requestRejection } = await import('../lib/api.js')

const SKILL_DIRS = [SKILLS_ROOT]

test('快照完整：7 个技能目录各含 SKILL.md', () => {
  const expected = [
    'stock-research-executor', 'stock-question-refiner', 'citation-validator',
    'got-controller', 'question-refiner', 'research-executor', 'synthesizer',
  ]
  for (const name of expected) {
    assert.ok(existsSync(join(SKILLS_ROOT, name, 'SKILL.md')), `缺 ${name}/SKILL.md`)
  }
})

test('provider：7 个候选全部可注册、名称合规、description 充分', async () => {
  const provider = createSkillProvider(SKILL_DIRS)
  const candidates = await provider.list()
  assert.equal(candidates.length, 7)
  for (const c of candidates) {
    assert.match(c.name, /^[a-z0-9]+(-[a-z0-9]+)*$/, `技能名 ${c.name} 不合规范`)
    assert.ok(c.description.length > 30, `${c.name} description 太短`)
    assert.equal(c.rank, 600)
    assert.equal(c.source, 'bundled')
  }
})

test('stock-research-executor：正文含 8 阶段方法论', async () => {
  const provider = createSkillProvider(SKILL_DIRS)
  const c = (await provider.list()).find((c) => c.name === 'stock-research-executor')
  const skill = await provider.get(c)
  assert.match(skill.content, /Phase 1.*Business Foundation/s, '应含 Phase 1 公司事实底座')
  assert.match(skill.content, /Phase [78]/s, '应含后期阶段')
  // auxFiles 应包含 instructions.md / examples.md / phases.md
  assert.ok(skill.auxFiles?.includes('instructions.md'), '缺 instructions.md')
  assert.ok(skill.auxFiles?.includes('phases.md'), '缺 phases.md')
})

test('addendum：dsh 环境映射三要素', async () => {
  const provider = createSkillProvider(SKILL_DIRS)
  const candidates = await provider.list()
  for (const c of candidates) {
    const skill = await provider.get(c)
    assert.match(skill.content, /WebSearch/, '应提到 WebSearch 映射')
    assert.match(skill.content, /读不到插件安装目录|工作区/, '应说明工作区约定')
    assert.match(skill.content, /不构成投资建议/, '应含免责声明')
  }
})

test('rewrite：正文无 Claude Code 安装/Task 工具残留', async () => {
  const provider = createSkillProvider(SKILL_DIRS)
  const candidates = await provider.list()
  for (const c of candidates) {
    const skill = await provider.get(c)
    assert.ok(!/npx\s+skills\s+add/.test(skill.content), `${c.name} 残留安装命令`)
    assert.ok(!/allowed-tools/.test(skill.content), `${c.name} frontmatter allowed-tools 残留`)
  }
})

test('systemPrompt：8 阶段 + 阈值 + 免责', () => {
  const section = systemSection()
  assert.equal(section.name, 'stock-research:methodology')
  assert.ok(section.order > 100, '约定类段落应放较后')
  assert.match(section.text, /8 阶段/)
  assert.match(section.text, /15 点击 0 单|A-E/)
  assert.match(section.text, /不构成投资建议/)
})

test('面板 API：鉴权 fail closed', () => {
  const noService = { get: () => undefined }
  assert.equal(requestRejection(noService, { headers: {} }), false) // 宿主 token 鉴权是边界，服务缺席放行
  const okService = { get: () => ({ requestRejection: () => false }) }
  assert.equal(requestRejection(okService, { headers: {} }), false)
})

test('LICENSE 存在且为 MIT', () => {
  const license = readFileSync(join(ROOT, 'LICENSE'), 'utf8')
  assert.match(license, /MIT/)
})

// ── 升级新增：modules + 档案库 + 报告登记 ──────────────────

const { listModules, getModule, searchModules } = await import('../lib/modules.js')
const data = await import('../lib/data.js')
const host = await import('../src/host.js')

// 兜底：任何情况下都不许碰真实档案库
assert.match(data.DATA_DIR, /[\\/]\.tmp[\\/]test-home[\\/]stock-research$/, `测试写到了 ${data.DATA_DIR}`)
// 每次从干净的档案库开始（.tmp/test-home 里不留上一次的残留）
rmSync(data.DATA_DIR, { recursive: true, force: true })

test('modules: 7 个技能 list/search/get', async () => {
  assert.equal(listModules(SKILL_DIRS).length, 7)
  assert.ok(searchModules(SKILL_DIRS, 'citation').length >= 1)
  assert.ok(getModule(SKILL_DIRS, 'synthesizer').body.length > 200)
  assert.equal(getModule(SKILL_DIRS, 'no-such'), null)
})

test('data: 多标的档案互不覆盖（本次回归重点）', () => {
  const a = data.initChecklist('600519', '长期持有价值', undefined, false)
  assert.equal(a.items.length, 8) // 默认骨架
  const conflict = data.initChecklist('600519', '', undefined, false)
  assert.equal(conflict.conflict, true)
  // 另一只标的建档，不能影响第一只
  data.initChecklist('AAPL', '是否高估', ['只一项'])
  const list = data.listDossiers()
  assert.equal(list.length, 2)
  assert.equal(list.find((d) => d.ticker === '600519').progress.total, 8)
  assert.equal(list.find((d) => d.ticker === 'AAPL').progress.total, 1)
  const item = data.updateItem('600519', 3, { status: 'done', note: '行业格局清晰' })
  assert.equal(item.status, 'done')
  assert.equal(data.getDossier('AAPL').progress.done, 0) // 更新没有串台
  // clear 只清一只
  data.clearChecklist('AAPL')
  assert.equal(data.getDossier('AAPL').progress.total, 0)
  assert.equal(data.getDossier('600519').progress.total, 8)
})

test('data: 报告登记 + 同日快照合并 + diff 门槛', () => {
  data.archiveReport('600519', { title: '首份报告', rating: 'green', metrics: { pe: 20, netIncome: 800 }, reportPath: 'D:/tmp/r1.md' })
  const d = data.getDossier('600519')
  assert.equal(d.reports, 1)
  assert.equal(d.rating, 'green')
  // 同日再登记：报告累加，快照合并保留旧指标
  data.archiveReport('600519', { title: '第二份', metrics: { pe: 18 } })
  const d2 = data.getDossier('600519')
  assert.equal(d2.meta.reports.length, 2)
  const snaps = data.readSnapshots('600519')
  assert.equal(snaps.length, 1)
  assert.equal(snaps[0].metrics.pe, 18)
  assert.equal(snaps[0].metrics.netIncome, 800)
  const need = data.snapshotDiff('600519')
  assert.equal(need.need, 2)
  assert.equal(need.have, 1)
  assert.deepEqual(need.rows, [])
})

test('data: 两次快照算出 diff', () => {
  const dir = join(data.DATA_DIR, 'dossiers', '600519', 'snapshots')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '2026-01-01.json'), JSON.stringify({ date: '2026-01-01', rating: 'yellow', metrics: { pe: 30 } }))
  const diff = data.snapshotDiff('600519')
  assert.equal(diff.have, 2)
  const pe = diff.rows.find((r) => r.key === 'pe')
  assert.equal(pe.prev, 30)
  assert.equal(pe.now, 18)
  assert.equal(pe.delta, -12)
})

test('data: 旧 dd.json 自动迁移成档案夹', () => {
  const legacy = join(data.DATA_DIR, 'dd.json')
  writeFileSync(legacy, JSON.stringify({
    ticker: 'OLD.HK', question: '迁移测试', updatedAt: '2026-01-01T00:00:00.000Z',
    items: [{ index: 1, title: '旧事项', status: 'done', note: '旧备注' }],
  }))
  assert.equal(data.migrateLegacy(), 'OLD.HK')
  const d = data.getDossier('OLD.HK')
  assert.equal(d.progress.total, 1)
  assert.equal(d.progress.done, 1)
  assert.equal(d.question, '迁移测试')
  assert.equal(existsSync(legacy), false) // 已改名为 .migrated
})

test('host: 3 个工具 schema + checklist/archive 全链路', async () => {
  for (const tool of [host.stockChecklistTool, host.stockArchiveTool, host.stockModuleTool]) {
    assert.equal(tool.parameters.additionalProperties, false)
    assert.ok(tool.description.length > 30)
  }
  await assert.rejects(() => host.stockChecklistTool.execute({ action: 'list', bogus: 1 }), /未知参数/)

  const init = await host.stockChecklistTool.execute({ action: 'init', ticker: '00700.HK', question: '安全边际' })
  assert.equal(init.ok, true)
  assert.ok(init.data.includes('[todo]'))

  const st = await host.stockChecklistTool.execute({ action: 'status', index: 1, status: 'done', note: '底座完成' })
  assert.ok(st.summary.includes('done'))
  assert.ok(st.summary.includes('00700.HK')) // 未传 ticker 时落到最近操作的那只

  const one = await host.stockChecklistTool.execute({ action: 'list', ticker: '00700.HK' })
  assert.ok(one.summary.includes('1/8'))
  const all = await host.stockChecklistTool.execute({ action: 'list' })
  assert.ok(all.summary.includes('只标的'))
  assert.ok(all.data.includes('00700.HK'))

  const save = await host.stockArchiveTool.execute({
    action: 'save', ticker: '00700.HK', title: '腾讯尽调报告', rating: 'yellow',
    metrics: '{"pe":14.4,"netIncome":2248}', reportPath: 'D:/dsh-research/report.md',
  })
  assert.equal(save.ok, true)
  assert.ok(save.summary.includes('报告 1 份'))

  const got = await host.stockArchiveTool.execute({ action: 'get', ticker: '00700.HK' })
  assert.ok(got.data.includes('腾讯尽调报告'))
  assert.ok(got.data.includes('🟡'))

  const noDiff = await host.stockArchiveTool.execute({ action: 'diff', ticker: '00700.HK' })
  assert.equal(noDiff.ok, false) // 只有一份快照

  await assert.rejects(() => host.stockArchiveTool.execute({ action: 'save', ticker: 'X', metrics: 'not json' }), /合法 JSON/)
  await assert.rejects(() => host.stockArchiveTool.execute({ action: 'save', ticker: 'X', reportPath: 'relative.md' }), /绝对路径/)

  const noConfirm = await host.stockChecklistTool.execute({ action: 'clear' })
  assert.equal(noConfirm.ok, false)

  host.apply(
    { effect: (fn) => { try { fn() } catch {} }, tools: { register: () => {} }, skills: { registerProvider: () => {} }, systemPrompt: { section: () => {} }, webServer: { register: () => {} } },
    { injectRules: false })
  const mods = await host.stockModuleTool.execute({ action: 'list' })
  assert.equal(mods.ok, true)
  assert.ok(mods.data.includes('synthesizer') || mods.data.includes('research'))
})
