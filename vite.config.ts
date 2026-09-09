/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  // Electron 生产模式用 file:// 加载，必须用相对路径引用资源
  base: './',
  test: {
    environment: 'node',
    setupFiles: ['src/__tests__/setup.ts'],
  },
})
