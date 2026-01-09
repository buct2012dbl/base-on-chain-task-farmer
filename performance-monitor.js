/**
 * 浏览器性能监控脚本
 * 在浏览器控制台中运行此代码来监控应用的性能表现
 */

// 1. 内存监控
function startMemoryMonitoring() {
  if (!performance.memory) {
    console.warn('性能监控不可用，请在Chrome中启用 --enable-precise-memory-info');
    return;
  }

  const memoryLog = [];
  const interval = setInterval(() => {
    const mem = performance.memory;
    const used = (mem.usedJSHeapSize / 1048576).toFixed(2);
    const limit = (mem.jsHeapSizeLimit / 1048576).toFixed(2);
    const percent = ((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100).toFixed(1);
    
    const log = `内存: ${used}MB / ${limit}MB (${percent}%)`;
    console.log(log);
    
    memoryLog.push({
      timestamp: new Date().toLocaleTimeString(),
      used: parseFloat(used),
      limit: parseFloat(limit),
      percent: parseFloat(percent)
    });

    // 警告: 内存占用超过70%
    if (parseFloat(percent) > 70) {
      console.warn('⚠️ 内存占用过高，建议停止执行或减少交易数量');
    }
  }, 1000);

  window.stopMemoryMonitoring = () => clearInterval(interval);
  console.log('内存监控已启动，执行 stopMemoryMonitoring() 停止监控');
}

// 2. 渲染性能监控
function monitorRenderPerformance() {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.duration > 16.67) { // 超过一帧时间(60fps)
        console.warn(
          `⚠️ 长帧检测: ${entry.name} 耗时 ${entry.duration.toFixed(2)}ms`
        );
      }
    }
  });

  observer.observe({ 
    entryTypes: ['measure', 'navigation', 'resource'],
    buffered: true 
  });

  console.log('渲染性能监控已启动');
}

// 3. 网络请求监控
function monitorNetworkRequests() {
  const originalFetch = window.fetch;
  let requestCount = 0;
  let totalTime = 0;

  window.fetch = function(...args) {
    const startTime = performance.now();
    requestCount++;

    return originalFetch.apply(this, args)
      .then(response => {
        const duration = performance.now() - startTime;
        totalTime += duration;
        
        console.log(
          `📡 请求 #${requestCount}: ${duration.toFixed(0)}ms - ${args[0]}`
        );

        if (duration > 5000) {
          console.warn(`⚠️ 慢请求检测: ${duration.toFixed(0)}ms`);
        }

        return response;
      });
  };

  window.getNetworkStats = () => {
    console.log(
      `📊 网络统计: ${requestCount} 个请求, 平均 ${(totalTime / requestCount).toFixed(0)}ms`
    );
  };
}

// 4. React组件渲染次数监控
function monitorReactRenders() {
  const renderCounts = new Map();

  // 使用console.log的拦截
  const originalLog = console.log;
  console.log = function(...args) {
    originalLog.apply(console, args);
    // 这里可以添加自定义逻辑
  };

  console.log('React渲染监控已启动');
}

// 5. Event Loop 堵塞检测
function detectEventLoopBlocking() {
  let lastFrameTime = performance.now();
  let blockingCount = 0;

  const checkBlocking = () => {
    const now = performance.now();
    const frameTime = now - lastFrameTime;
    lastFrameTime = now;

    if (frameTime > 50) { // 如果帧间隔超过50ms
      blockingCount++;
      console.warn(
        `⚠️ Event Loop 堵塞检测 #${blockingCount}: ${frameTime.toFixed(0)}ms`
      );
    }

    requestAnimationFrame(checkBlocking);
  };

  requestAnimationFrame(checkBlocking);
  console.log('Event Loop堵塞检测已启动');
}

// 6. 生成性能报告
function generatePerformanceReport() {
  const navigation = performance.getEntriesByType('navigation')[0];
  
  console.log('========== 性能报告 ==========');
  console.log(`DNS查询时间: ${(navigation.domainLookupEnd - navigation.domainLookupStart).toFixed(0)}ms`);
  console.log(`TCP连接时间: ${(navigation.connectEnd - navigation.connectStart).toFixed(0)}ms`);
  console.log(`TLS握手时间: ${(navigation.secureConnectionStart ? navigation.connectEnd - navigation.secureConnectionStart : 0).toFixed(0)}ms`);
  console.log(`首字节时间(TTFB): ${(navigation.responseStart - navigation.requestStart).toFixed(0)}ms`);
  console.log(`文档加载时间: ${(navigation.responseEnd - navigation.responseStart).toFixed(0)}ms`);
  console.log(`DOM解析时间: ${(navigation.domInteractive - navigation.domLoading).toFixed(0)}ms`);
  console.log(`页面加载完成时间: ${(navigation.loadEventEnd - navigation.loadEventStart).toFixed(0)}ms`);
  console.log('============================');
}

// 启动所有监控
console.log('🚀 启动性能监控...');
startMemoryMonitoring();
monitorRenderPerformance();
monitorNetworkRequests();
detectEventLoopBlocking();
generatePerformanceReport();

console.log('✅ 监控已就绪！可用命令:');
console.log('- stopMemoryMonitoring() : 停止内存监控');
console.log('- getNetworkStats() : 查看网络统计');
console.log('- generatePerformanceReport() : 生成性能报告');
