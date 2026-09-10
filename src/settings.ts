/**
 * 设置面板：配置反射、语言/主题/自动保存/图片策略的事件装配。
 *
 * 图片策略的状态由本模块持有（粘贴上下文经 getCurrentImageStrategy 读取）。
 */
import { native } from './native'
import type { UpdateStatus } from './native'
import { applyDomTexts, menuLabels, getLocale, setLocale, t } from './i18n'
import { isDarkTheme, applyTheme } from './theme'
import { isAutosaveOn, setAutosaveOn } from './autosave'
import { getImageStrategy, setImageStrategy, getAutoCheckUpdate, setAutoCheckUpdate } from './store'
import { renderTabs, updateTitle } from './tabs'
import { currentMarkdown, updateWordCount } from './editor-core'
import type { ImageStrategy } from './paste-image'

/** 粘贴图片存储策略（设置面板配置） */
let imageStrategy: ImageStrategy = getImageStrategy()

/** 粘贴图片上下文读取当前策略（main.ts 装配注入） */
export function getCurrentImageStrategy(): ImageStrategy {
  return imageStrategy
}

/** 打开设置面板并反映当前配置值 */
export function openSettings() {
  const overlay = document.getElementById('settings-overlay')
  if (!overlay) return

  const langRadio = overlay.querySelector(
    `input[name="set-lang"][value="${getLocale()}"]`,
  ) as HTMLInputElement | null
  if (langRadio) langRadio.checked = true
  const isDark = isDarkTheme()
  const themeRadio = overlay.querySelector(
    `input[name="set-theme"][value="${isDark ? 'dark' : 'light'}"]`,
  ) as HTMLInputElement | null
  if (themeRadio) themeRadio.checked = true
  const autosaveBox = document.getElementById('set-autosave') as HTMLInputElement | null
  if (autosaveBox) {
    autosaveBox.checked = isAutosaveOn() && !!native
    autosaveBox.disabled = !native
  }
  const imgRadio = overlay.querySelector(
    `input[name="set-img"][value="${imageStrategy}"]`,
  ) as HTMLInputElement | null
  if (imgRadio) imgRadio.checked = true
  const autoCheckBox = document.getElementById('set-auto-check-update') as HTMLInputElement | null
  if (autoCheckBox) autoCheckBox.checked = getAutoCheckUpdate()

  overlay.hidden = false
}

/** 关闭设置面板 */
export function closeSettings() {
  document.getElementById('settings-overlay')?.setAttribute('hidden', '')
}

/** 设置面板全部控件事件装配（boot 时调用一次） */
export function wireSettings() {
  document.getElementById('settings-close')?.addEventListener('click', closeSettings)
  document.getElementById('settings-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSettings()
  })
  document.querySelectorAll('input[name="set-lang"]').forEach((input) => {
    input.addEventListener('change', () => {
      setLocale((input as HTMLInputElement).value)
      // 语言切换五联动：静态文案 / 标签栏 / 标题 / 字数 / 菜单
      applyDomTexts()
      renderTabs()
      updateTitle()
      updateWordCount(currentMarkdown())
      native?.setLocaleInfo(menuLabels())
    })
  })
  document.querySelectorAll('input[name="set-theme"]').forEach((input) => {
    input.addEventListener('change', () => {
      void applyTheme((input as HTMLInputElement).value === 'dark')
    })
  })
  document.getElementById('set-autosave')?.addEventListener('change', (e) => {
    setAutosaveOn((e.target as HTMLInputElement).checked)
  })
  document.querySelectorAll('input[name="set-img"]').forEach((input) => {
    input.addEventListener('change', () => {
      imageStrategy = (input as HTMLInputElement).value as ImageStrategy
      setImageStrategy(imageStrategy)
    })
  })

  // ---------- 更新 ----------
  const autoCheckBox = document.getElementById('set-auto-check-update') as HTMLInputElement | null
  if (autoCheckBox) {
    autoCheckBox.addEventListener('change', () => {
      setAutoCheckUpdate(autoCheckBox.checked)
      native?.setAutoCheckUpdate(autoCheckBox.checked)
    })
  }

  const updateCheckBtn = document.getElementById('update-check-btn') as HTMLButtonElement | null
  const updateStatus = document.getElementById('update-status')
  const updateInstallBtn = document.getElementById('update-install-btn') as HTMLButtonElement | null
  updateCheckBtn?.addEventListener('click', () => {
    void native?.checkForUpdates()
  })
  updateInstallBtn?.addEventListener('click', () => {
    native?.installUpdate()
  })

  /** 根据更新状态刷新设置面板文案与按钮可用性 */
  const applyUpdateStatus = (status: UpdateStatus) => {
    if (!updateStatus || !updateCheckBtn || !updateInstallBtn) return
    switch (status.status) {
      case 'idle':
        updateStatus.textContent = ''
        updateCheckBtn.disabled = false
        updateInstallBtn.hidden = true
        break
      case 'checking':
        updateStatus.textContent = t('settings.updateChecking')
        updateCheckBtn.disabled = true
        updateInstallBtn.hidden = true
        break
      case 'available':
        updateStatus.textContent = t('settings.updateAvailable', { version: status.version })
        updateCheckBtn.disabled = false
        updateInstallBtn.hidden = true
        break
      case 'not-available':
        updateStatus.textContent = t('settings.updateNotAvailable')
        updateCheckBtn.disabled = false
        updateInstallBtn.hidden = true
        break
      case 'downloading':
        updateStatus.textContent = t('settings.updateDownloading', {
          percent: Math.round(status.percent),
        })
        updateCheckBtn.disabled = true
        updateInstallBtn.hidden = true
        break
      case 'downloaded':
        updateStatus.textContent = t('settings.updateDownloaded')
        updateCheckBtn.disabled = true
        updateInstallBtn.hidden = false
        break
      case 'error':
        updateStatus.textContent = t('settings.updateError', { message: status.message })
        updateCheckBtn.disabled = false
        updateInstallBtn.hidden = true
        break
    }
  }
  native?.onUpdateStatus(applyUpdateStatus)

  // 启动时把"启动时自动检查更新"开关同步给主进程
  // （主进程据此决定是否在 app 启动后 5 秒自动检查）
  native?.setAutoCheckUpdate(getAutoCheckUpdate())
}
