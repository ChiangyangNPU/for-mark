// vitest 全局环境桩：被测模块（i18n 等）在模块级读取浏览器 API
import { vi } from 'vitest'

vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
})

vi.stubGlobal('navigator', { language: 'zh-CN' })

vi.stubGlobal('window', { tmdAPI: undefined })
