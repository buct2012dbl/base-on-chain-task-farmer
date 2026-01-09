#!/bin/bash
# Chrome 性能优化启动脚本（macOS）

# 关闭现有Chrome进程
pkill -f "Google Chrome"
sleep 2

# 启动Chrome并应用优化参数
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --disable-extensions-except=id \
  --disable-default-apps \
  --disable-plugins \
  --disable-sync \
  --disable-extensions \
  --no-service-autorun \
  --no-default-browser-check \
  --disable-background-timer-throttling \
  --disable-renderer-backgrounding \
  --disable-device-discovery-notifications \
  --disable-hang-monitor \
  --enable-memory-coordinator \
  --disable-breakpad \
  --disable-preconnect \
  --disable-default-apps \
  --disable-extensions-file-access-check \
  --disable-extensions-http-throttling \
  --disable-sync-types \
  --enable-tcp-fast-open \
  --enable-quic \
  "http://localhost:5173" &

echo "Chrome已启动，应用了性能优化参数"
echo "建议禁用的扩展:"
echo "  - 广告拦截器"
echo "  - 下载管理器"
echo "  - 其他钱包 (仅保留MetaMask)"
