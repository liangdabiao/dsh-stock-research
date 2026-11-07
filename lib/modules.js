// 股票投资尽调 · 技能模块查询（7 个尽调技能），工具与面板 API 共用。
import { readDir } from './skills.js'

export function loadModules(skillDirs) {
  return skillDirs.flatMap((d) => readDir(d))
}

export function listModules(skillDirs) {
  return loadModules(skillDirs).map((m) => ({ name: m.name, dirName: m.dirName, description: m.description }))
}

export function getModule(skillDirs, id) {
  return loadModules(skillDirs).find((m) => m.name === id || m.dirName === id) || null
}

export function searchModules(skillDirs, keyword) {
  const needle = String(keyword).toLowerCase()
  return loadModules(skillDirs)
    .filter((m) => `${m.name} ${m.description} ${m.body}`.toLowerCase().includes(needle))
    .map((m) => {
      const at = `${m.name} ${m.description} ${m.body}`.toLowerCase().indexOf(needle)
      const snippet = `${m.name} ${m.description} ${m.body}`.slice(Math.max(0, at - 40), at + 80).replace(/\s+/g, ' ')
      return { name: m.name, dirName: m.dirName, description: m.description, snippet }
    })
}
