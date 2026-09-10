/**
 * 首帧引导脚本（同步加载，先于首次绘制执行）
 *
 * 1. 平台类：<html> 挂 win/mac 类，供 CSS 做平台差异布局
 *    （如 Windows/Linux 显示自绘窗口控制按钮）。模块 JS 挂类晚于首帧，
 *    会导致 Mac 短暂闪现窗口按钮，故提前到这里。
 * 2. 主题防闪（FOUC）：深色主题在首帧前挂到 <html>，与 style.css 的
 *    html.dark 选择器配套；模块 JS 里的主题恢复来不及（晚于首帧绘制）。
 *
 * 注意：键名须与 src/store.ts 的 THEME_KEY 一致；
 * CSP 的 script-src 'self' 禁止内联脚本，故拆为外部文件（同步加载效果相同）。
 */
try {
  if (/Mac|iPhone|iPad/.test(navigator.userAgent)) {
    document.documentElement.classList.add('mac')
  } else {
    document.documentElement.classList.add('win')
  }
  if (localStorage.getItem('tmd:theme') === 'dark') {
    document.documentElement.classList.add('dark')
  }
} catch {
  /* 环境异常时按浅色 / 无平台类渲染，不影响可用性 */
}
