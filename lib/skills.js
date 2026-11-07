// 股票投资尽调 · 技能快照提供方（7 个技能：2 股票专属 + 5 通用研究）。
// dsh 化的关键在 addendum：WebSearch/WebFetch/Task 等 Claude Code 工具名
// 映射到 dsh 环境；报告输出到工作区。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const RANK = 600
const INVOCATION = { modelInvocable: true, userInvocable: true }

function parse(file) {
  const text = readFileSync(file, 'utf8')
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return null
  const block = m[1]
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  const descM = block.match(/^description:\s*(.+)$/m)?.[1]
  let description = descM ? descM.trim().replace(/^(["'])(.*)\1$/, '$2') : null
  if (!description) {
    const lines = block.split(/\r?\n/)
    const start = lines.findIndex((l) => /^description:\s*>/.test(l))
    if (start !== -1) {
      const collected = []
      for (let i = start + 1; i < lines.length; i++) {
        if (/^\S/.test(lines[i])) break
        collected.push(lines[i].replace(/^\s+/, ''))
      }
      description = collected.join(' ').trim()
    }
  }
  if (!name || !description) return null
  // allowed-tools 行不是 dsh 概念，剥掉（addendum 已映射）
  return { name, description, body: text.slice(m[0].length) }
}

function readDir(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const sDir = join(dir, entry.name)
    const skillFile = join(sDir, 'SKILL.md')
    if (!existsSync(skillFile)) continue
    const parsed = parse(skillFile)
    if (!parsed) continue
    const auxFiles = readdirSync(sDir).filter((f) => f.endsWith('.md') && f !== 'SKILL.md')
    out.push({ dir: sDir, file: skillFile, ...parsed, dirName: entry.name, auxFiles })
  }
  return out
}

function addendum(skill) {
  return [
    '',
    '---',
    '',
    '## 在 DSH 插件里使用',
    '',
    `- 本技能目录：\`${skill.dir}\`；instructions.md / phases.md / examples.md 等附属文件用文件读取工具按需加载。`,
    '- 正文提到的 WebSearch / WebFetch：若当前环境提供网络搜索/抓取工具则直接用；没有时请用户粘贴相关资料或按已有知识做定性分析，不要编造具体数字和数据来源。',
    '- 正文提到的 Task / 多智能体并行：按当前环境能力执行——有子代理则并行，没有则按阶段顺序逐个完成，覆盖所有阶段不要跳。',
    '- 研究报告输出到**当前工作区**（如 `RESEARCH/` 目录），不要往插件安装目录写文件。',
    '- 每条事实性声明标注来源（URL 或文件路径），来源分级 A-E（A=官方公告，E=社交讨论）。',
    '- 本框架输出研究分析，不构成投资建议。最终结论附免责声明。',
    '',
  ].join('\n')
}

function rewrite(skill) {
  // allowed-tools 行已在 frontmatter 剥离；正文里 Claude Code 工具名由 addendum 映射，不做正文替换
  return skill.body
}

export function createSkillProvider(dirs) {
  const list = [].concat(dirs)
  const candidate = (s, auxFiles) => ({
    name: s.name,
    description: s.description,
    path: s.file,
    invocation: INVOCATION,
    source: 'bundled',
    provider: 'stock-research',
    rank: RANK,
    locator: s.dir,
    resourceBase: { kind: 'directory', path: s.dir },
    auxFiles,
  })

  return {
    name: 'stock-research',
    async list() {
      return list.flatMap(readDir).map((s) => {
        const c = candidate(s, s.auxFiles)
        const { auxFiles, ...rest } = c
        return rest
      })
    },
    async get(c) {
      const s = list.flatMap(readDir).find((x) => x.dir === c.locator && x.name === c.name)
      if (!s) return undefined
      const content = rewrite(s) + addendum(s)
      const { rank, locator, auxFiles, ...summary } = candidate(s, s.auxFiles)
      return { ...summary, content, auxFiles }
    },
  }
}

export { readDir, addendum }
