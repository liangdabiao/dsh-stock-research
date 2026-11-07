// 快照合规 + provider + addendum + systemPrompt + 面板 API 单测。零 dsh 依赖零网络。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKILLS_ROOT = join(ROOT, 'skills')
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
  assert.equal(requestRejection(noService, { headers: {} }), 403)
  const okService = { get: () => ({ requestRejection: () => false }) }
  assert.equal(requestRejection(okService, { headers: {} }), false)
})

test('LICENSE 存在且为 MIT', () => {
  const license = readFileSync(join(ROOT, 'LICENSE'), 'utf8')
  assert.match(license, /MIT/)
})
