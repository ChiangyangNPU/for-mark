#!/usr/bin/env bash
# 清理改名前的旧版应用 for-mark（新版为 TMD）
#
# 背景：应用从 for-mark 改名为 TMD 后，系统里会残留三类旧版痕迹：
#   1. /Applications/for-mark.app —— 新版装成 TMD.app，旧版不会被覆盖，两个图标并存
#   2. LaunchServices 注册记录 —— 双击 .md 的"打开方式"可能仍指向旧 Bundle ID
#   3. ~/Library 下的旧用户数据 —— 旧设置/缓存/偏好（按旧名与旧 Bundle ID 存放）
#
# 用法：npm run cleanup（或 bash scripts/cleanup-old-app.sh）
set -euo pipefail

OLD_APP="/Applications/for-mark.app"
NEW_APP="/Applications/TMD.app"
OLD_NAME="for-mark"
OLD_BUNDLE="com.chiangyang.for-mark"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

echo "==> [1/3] 检查旧版是否正在运行..."
if pgrep -x "$OLD_NAME" >/dev/null 2>&1; then
  echo "    旧版 for-mark 正在运行。请先 Cmd+Q 退出它，再重新运行本脚本。"
  exit 1
fi
echo "    未运行，继续。"

echo
echo "==> [2/3] 删除旧应用 $OLD_APP ..."
if [ -d "$OLD_APP" ]; then
  if rm -rf "$OLD_APP"; then
    echo "    已删除。"
  else
    echo "    删除失败（权限不足）。请手动操作：Finder → 应用程序 → 将 for-mark 拖到废纸篓。"
    exit 1
  fi
else
  echo "    未发现旧应用，跳过。"
fi

echo
echo "==> [3/3] 旧版用户数据（可选清理）"
echo "    以下路径均为旧版 for-mark 独有，与新版 TMD 无关："
echo "      ~/Library/Application Support/$OLD_NAME/   （旧设置、localStorage 恢复副本）"
echo "      ~/Library/Caches/$OLD_NAME/               （旧缓存）"
echo "      ~/Library/Preferences/$OLD_BUNDLE.plist   （旧偏好）"
echo "      ~/Library/Saved Application State/$OLD_BUNDLE.savedState （旧窗口状态）"
read -r -p "    清理后不可恢复，输入 y 确认清理（其他键跳过）：" ans
if [ "$ans" = "y" ] || [ "$ans" = "Y" ]; then
  rm -rf "$HOME/Library/Application Support/$OLD_NAME"
  rm -rf "$HOME/Library/Caches/$OLD_NAME"
  rm -f  "$HOME/Library/Preferences/$OLD_BUNDLE.plist"
  rm -rf "$HOME/Library/Saved Application State/$OLD_BUNDLE.savedState"
  echo "    旧用户数据已清理。"
else
  echo "    已跳过。"
fi

echo
echo "==> 刷新系统应用注册（LaunchServices）..."
# 注销旧应用残留记录（路径已不存在时忽略报错），重新注册新版
"$LSREGISTER" -u "$OLD_APP" 2>/dev/null || true
if [ -d "$NEW_APP" ]; then
  "$LSREGISTER" -f "$NEW_APP"
  echo "    已注册新版：${NEW_APP}"
else
  echo "    未发现 ${NEW_APP}，请先运行 npm run dist:install 安装新版。"
fi
# 重启 Finder 让图标/关联缓存即时生效
killall Finder 2>/dev/null || true

echo
echo "完成。若双击 .md 仍唤起旧版：右键 .md 文件 → 显示简介 → 打开方式 → 选 TMD → 点「全部更改」。"
