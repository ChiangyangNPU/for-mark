/**
 * 自动保存：开启后每 5 秒把已关联文件、有未保存修改、非源码模式的当前标签写回磁盘。
 *
 * 设置面板与主进程菜单共用 setAutosaveOn() 单入口，保证 localStorage、
 * 菜单勾选、定时器三者一致。
 */
import { saveDocument } from './files'
import { activeTab } from './tabs'
import { isSourceMode } from './editor-core'
import { getAutosaveEnabled, setAutosaveEnabled } from './store'
import { native } from './native'

let enabled = getAutosaveEnabled()
let timer: number | undefined

export function isAutosaveOn(): boolean {
  return enabled
}

/** 切换自动保存：持久化 + 主进程菜单对齐 + 定时器启停 */
export function setAutosaveOn(on: boolean) {
  enabled = on
  setAutosaveEnabled(on)
  native?.setAutosaveEnabled(on)
  if (on) startAutosave()
  else stopAutosave()
}

/** 启动时：菜单勾选对齐 + 按需起定时器 */
export function initAutosave() {
  native?.setAutosaveEnabled(enabled)
  if (enabled) startAutosave()
}

export function startAutosave() {
  stopAutosave()
  if (!enabled) return
  timer = window.setInterval(() => {
    const t = activeTab()
    if (t?.path && t.dirty && !isSourceMode()) void saveDocument()
  }, 5000)
}

export function stopAutosave() {
  window.clearInterval(timer)
}
