
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ethService } from './services/ethereumService';
import { WalletState, SwapConfig, TransactionLog } from './types';
import { GoogleGenAI } from "@google/genai";

const App: React.FC = () => {
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    chainId: null,
    usdcBalance: '0',
    ethBalance: '0',
    isConnecting: false,
  });

  const [config, setConfig] = useState<SwapConfig>({
    amountPerSwap: '0.01',
    totalSwaps: 10,
  });

  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [aiTip, setAiTip] = useState<string>('');
  const [isIframe, setIsIframe] = useState(false);
  
  const stopRequested = useRef(false);
  const logQueueRef = useRef<TransactionLog[]>([]);
  const lastProgressUpdateRef = useRef(0);
  const allLogsRef = useRef<TransactionLog[]>([]);

  useEffect(() => {
    // Check if running in an iframe
    setIsIframe(window.self !== window.top);

    return () => {
      ethService.cleanup();
    };
  }, []);

  const handleOpenInNewTab = () => {
    window.open(window.location.href, '_blank');
  };

  const fetchAiTip = useCallback(async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `You are an expert on Base Chain airdrops. Give a short, 1-sentence tip about high-frequency trading for airdrop farming (e.g., mention gas, variety, or timing). Keep it under 20 words.`,
      });
      setAiTip(response.text || 'Trade smart, keep gas low!');
    } catch (e) {
      console.error('Gemini error', e);
    }
  }, []);

  useEffect(() => {
    fetchAiTip();
  }, [fetchAiTip]);

  const addLog = (message: string, status: TransactionLog['status'] = 'pending', hash?: string) => {
    const newLog: TransactionLog = {
      id: Math.random().toString(36).substr(2, 9),
      message,
      status,
      hash,
      timestamp: new Date(),
    };
    
    // 保存所有日志
    allLogsRef.current.unshift(newLog);
    
    // 只在UI中显示最近的6条日志（最小化DOM）
    setLogs(allLogsRef.current.slice(0, 6));
  };

  const connectWallet = async () => {
    setWallet(v => ({ ...v, isConnecting: true }));
    try {
      const address = await ethService.connect();
      const balances = await ethService.getBalances(address);
      setWallet({
        address,
        chainId: 8453,
        usdcBalance: balances.usdc,
        ethBalance: balances.eth,
        isConnecting: false,
      });
      addLog(`Connected to ${address}`, 'success');
    } catch (err: any) {
      addLog(`Connection failed: ${err.message}`, 'error');
      setWallet(v => ({ ...v, isConnecting: false }));
    }
  };

  const updateBalances = async () => {
    if (wallet.address) {
      const balances = await ethService.getBalances(wallet.address);
      setWallet(v => ({ ...v, usdcBalance: balances.usdc, ethBalance: balances.eth }));
    }
  };

  const startAutomatedSwaps = async () => {
    if (!wallet.address) return;
    setIsRunning(true);
    stopRequested.current = false;
    setProgress(0);
    logQueueRef.current = [];
    allLogsRef.current = [];
    setLogs([]);
    
    addLog(`Starting ${config.totalSwaps} swaps of ${config.amountPerSwap} USDC...`);

    try {
      addLog('Checking USDC allowance...');
      await ethService.approveUSDC(config.amountPerSwap);
      addLog('USDC approved for swapping', 'success');

      for (let i = 0; i < config.totalSwaps; i++) {
        if (stopRequested.current) {
          addLog('Operation stopped by user', 'error');
          break;
        }

        try {
          addLog(`[${i + 1}/${config.totalSwaps}] Initiating swap...`);
          const hash = await ethService.swapUSDCtoETH(config.amountPerSwap);
          addLog(`[${i + 1}/${config.totalSwaps}] Transaction sent`, 'success', hash);
          
          // Optimize progress update - only update every 5% change
          const newProgress = ((i + 1) / config.totalSwaps) * 100;
          if (newProgress - lastProgressUpdateRef.current >= 5) {
            setProgress(Math.round(newProgress));
            lastProgressUpdateRef.current = newProgress;
          }

          // Brief delay to allow the network to catch up
          // Increased to 15 seconds for stability with 1 concurrent transaction
          await new Promise(r => setTimeout(r, 15000));
        } catch (err: any) {
          addLog(`[${i + 1}/${config.totalSwaps}] Failed: ${err.message}`, 'error');
          if (err.message.toLowerCase().includes('user rejected') || err.message.toLowerCase().includes('4001')) {
             addLog('Transaction rejected by user. Stopping loop.', 'error');
             break;
          }
        }
      }
    } catch (err: any) {
      addLog(`Critical error: ${err.message}`, 'error');
    } finally {
      setIsRunning(false);
      setProgress(100);
      addLog('All tasks finished');
      
      // Cleanup resources
      ethService.cleanup();
    }
  };

  const stopSwaps = () => {
    stopRequested.current = true;
    addLog('Stopping... waiting for current transaction to finish.');
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center">
      <header className="w-full max-w-4xl flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
            Base Airdrop Farmer
          </h1>
          <p className="text-slate-400 text-sm">Automated Transaction Generator</p>
        </div>
        
        {wallet.address ? (
          <div className="text-right">
            <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Wallet Connected</div>
            <div className="text-emerald-400 font-mono text-sm">{wallet.address.slice(0,6)}...{wallet.address.slice(-4)}</div>
          </div>
        ) : (
          <button 
            onClick={connectWallet}
            disabled={wallet.isConnecting}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg font-semibold transition-all shadow-lg shadow-blue-500/20"
          >
            {wallet.isConnecting ? 'Detecting...' : 'Connect MetaMask'}
          </button>
        )}
      </header>

      {isIframe && !wallet.address && (
        <div className="w-full max-w-4xl mb-6 p-5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-sm shadow-lg backdrop-blur-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <strong>检测到您正在内嵌框架中运行。</strong>
              <p className="opacity-80 mt-1">
                由于浏览器安全策略，MetaMask 在内嵌框架（Iframe）中可能无法正常弹出。请尝试在新标签页中打开以解决连接问题。
              </p>
            </div>
          </div>
          <button 
            onClick={handleOpenInNewTab}
            className="whitespace-nowrap px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-lg font-bold transition-colors shadow-md flex items-center gap-2 shrink-0"
          >
            <span>在新标签页打开</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
            </svg>
          </button>
        </div>
      )}

      <main className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-1 space-y-6">
          <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl shadow-xl shadow-black/20">
            <h2 className="text-lg font-semibold mb-4 text-slate-200">Wallet Balances</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-slate-900/50 p-3 rounded-xl border border-slate-700/50">
                <span className="text-slate-400 text-sm">USDC</span>
                <span className="text-blue-400 font-semibold">{parseFloat(wallet.usdcBalance).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center bg-slate-900/50 p-3 rounded-xl border border-slate-700/50">
                <span className="text-slate-400 text-sm">ETH</span>
                <span className="text-emerald-400 font-semibold">{parseFloat(wallet.ethBalance).toFixed(4)}</span>
              </div>
            </div>
            {aiTip && (
              <div className="mt-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                <p className="text-xs text-indigo-300 italic">✨ AI Pro Tip: {aiTip}</p>
              </div>
            )}
          </div>

          <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl shadow-xl shadow-black/20">
            <h2 className="text-lg font-semibold mb-4 text-slate-200">Configuration</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1 uppercase tracking-wider">Amount (USDC)</label>
                <input 
                  type="number" 
                  step="0.000001"
                  value={config.amountPerSwap}
                  onChange={(e) => setConfig(prev => ({ ...prev, amountPerSwap: e.target.value }))}
                  disabled={isRunning}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="0.01"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1 uppercase tracking-wider">Total Count</label>
                <input 
                  type="number" 
                  value={config.totalSwaps}
                  onChange={(e) => setConfig(prev => ({ ...prev, totalSwaps: parseInt(e.target.value) || 0 }))}
                  disabled={isRunning}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="1000"
                />
              </div>
              
              <div className="pt-2">
                {!isRunning ? (
                  <button 
                    onClick={startAutomatedSwaps}
                    disabled={!wallet.address}
                    className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-all shadow-lg shadow-emerald-900/20"
                  >
                    🚀 Start Task
                  </button>
                ) : (
                  <button 
                    onClick={stopSwaps}
                    className="w-full py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-900/20"
                  >
                    🛑 Stop Execution
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-500 text-center mt-2 leading-tight">
                Requires one signature per transaction. Ensure your wallet is set to <strong>Base Mainnet</strong>.
              </p>
            </div>
          </div>
        </section>

        <section className="lg:col-span-2 space-y-6">
          <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl shadow-xl shadow-black/20">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-slate-200">Execution Progress</h2>
              <span className="text-sm text-slate-400 font-mono">{progress.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-slate-900 h-4 rounded-full overflow-hidden border border-slate-700">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 transition-all duration-700 ease-out" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden flex flex-col h-[500px] shadow-xl shadow-black/20">
            <div className="p-4 border-b border-slate-700 bg-slate-800/80 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-200">Activity Logs</h2>
              <button 
                onClick={() => setLogs([])}
                className="text-xs text-slate-400 hover:text-white transition-colors"
              >
                Clear History
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
              {logs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-600 italic">
                  Waiting for task initiation...
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className={`p-3 rounded-lg border flex flex-col gap-1 animate-in fade-in slide-in-from-top-2 duration-300 ${
                    log.status === 'success' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300' :
                    log.status === 'error' ? 'bg-red-500/5 border-red-500/20 text-red-300' :
                    'bg-blue-500/5 border-blue-500/20 text-blue-300'
                  }`}>
                    <div className="flex justify-between items-start">
                      <span className="font-semibold break-all">{log.message}</span>
                      <span className="text-[10px] opacity-60 whitespace-nowrap ml-2">
                        {log.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    {log.hash && (
                      <a 
                        href={`https://basescan.org/tx/${log.hash}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="underline opacity-70 hover:opacity-100 transition-opacity mt-1 flex items-center gap-1"
                      >
                        <span>⛓️ Basescan:</span>
                        <span className="font-mono">{log.hash.slice(0, 10)}...{log.hash.slice(-8)}</span>
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full max-w-4xl mt-12 pt-8 border-t border-slate-800 text-center text-slate-500 text-xs">
        <p>Built for the Base Ecosystem. Not financial advice. Use at your own risk.</p>
        <p className="mt-2 text-[10px] opacity-40">Powered by ethers.js v6 & Gemini API</p>
      </footer>
    </div>
  );
};

export default App;
