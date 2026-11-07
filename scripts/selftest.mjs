// 离线自检：7 技能注册 + addendum 三条 + systemPrompt + 面板 API。零网络零 key。
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { createSkillProvider } = await import('../lib/skills.js')
const { systemSection } = await import('../src/systemPrompt.js')

let failed = 0
const step = async (name, fn) => {
  process.stdout.write(`- ${name} … `)
  try {
    await fn()
    console.log('ok')
  } catch (err) {
    failed++
    console.log('失败')
    console.error(`  ${err.message}`)
  }
}

const provider = createSkillProvider([join(ROOT, 'skills')])
let candidates

await step('7 技能注册齐全（2 股票 + 5 通用）', async () => {
  candidates = await provider.list()
  if (candidates.length !== 7) throw new Error(`候选 ${candidates.length} ≠ 7`)
  const names = candidates.map((c) => c.name)
  for (const expected of ['stock-research-executor', 'stock-question-refiner', 'citation-validator', 'got-controller', 'synthesizer']) {
    if (!names.includes(expected)) throw new Error(`缺 ${expected}`)
  }
})

await step('7 技能逐个读取：正文完整 + auxFiles 存在', async () => {
  for (const c of candidates) {
    const skill = await provider.get(c)
    if (!skill.content || skill.content.length < 500) throw new Error(`${c.name} 正文过短`)
    if (c.name === 'stock-research-executor' && !skill.auxFiles?.includes('phases.md')) {
      throw new Error('executor 缺 phases.md')
    }
  }
})

await step('addendum 三要素全覆盖（web 映射 / 工作区 / 免责）', async () => {
  for (const c of candidates) {
    const skill = await provider.get(c)
    if (!skill.content.includes('WebSearch')) throw new Error(`${c.name} 缺 web 映射`)
    if (!skill.content.includes('不构成投资建议')) throw new Error(`${c.name} 缺免责`)
    if (!skill.content.includes('工作区')) throw new Error(`${c.name} 缺工作区约定`)
  }
})

await step('systemPrompt 含方法论核心', () => {
  const section = systemSection()
  if (!section.text.includes('8 阶段')) throw new Error('缺 8 阶段')
  if (!section.text.includes('A-E')) throw new Error('缺来源分级')
  if (!section.text.includes('不构成投资建议')) throw new Error('缺免责')
})

await step('LICENSE 为 MIT 且包含 liangdabiao', () => {
  const text = readFileSync(join(ROOT, 'LICENSE'), 'utf8')
  if (!text.includes('MIT')) throw new Error('LICENSE 非 MIT')
  if (!text.includes('liangdabiao')) throw new Error('LICENSE 缺版权')
})

await step('快照不含 RESEARCH/ 示例目录（体积控制）', () => {
  if (existsSync(join(ROOT, 'skills', 'RESEARCH'))) throw new Error('RESEARCH/ 不应入快照')
  if (existsSync(join(ROOT, 'RESEARCH'))) throw new Error('RESEARCH/ 不应在根目录')
})

if (failed > 0) {
  console.error(`\n自检失败 ${failed} 项`)
  process.exit(1)
}
console.log('\n全部通过。')

import { readdirSync } from 'node:fs'
