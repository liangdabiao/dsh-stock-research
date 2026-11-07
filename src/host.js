// 股票投资尽调 · Host 半边（最小宿主：技能提供方 + 硬规则注入 + 面板数据面）。
// 纯技能插件——零工具零网络，研究由模型在其环境中用网络工具+分析能力完成。
import Schema from '@deepseek-ai/schemastery'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSkillProvider } from '../lib/skills.js'
import { systemSection } from './systemPrompt.js'
import { registerApi } from '../lib/api.js'

export const name = 'stock-research' // = cordis.patch.yml 的 id

export const inject = ['skills', 'systemPrompt', 'webServer', 'connection']

export const Config = Schema.object({
  injectRules: Schema.boolean().default(true).description('注入研究方法论到系统提示'),
})

export function apply(ctx, config) {
  const skillDirs = [join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')]

  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(skillDirs)), `${name}: skills`)

  if (config.injectRules !== false) {
    ctx.effect(() => ctx.systemPrompt.section(systemSection()), `${name}: methodology`)
  }

  ctx.effect(() => registerApi(ctx, { skillDirs }), `${name}: routes`)
}
