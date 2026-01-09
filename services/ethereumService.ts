
import { ethers } from 'ethers';
import { USDC_ADDRESS, ERC20_ABI, BASE_CHAIN_ID, UNISWAP_ROUTER_ADDRESS, WETH_ADDRESS } from '../constants';

declare global {
  interface Window {
    ethereum?: any;
  }
}

interface PendingTransaction {
  id: string;
  promise: Promise<string>;
}

export class EthereumService {
  private provider: ethers.BrowserProvider | null = null;
  private signer: ethers.Signer | null = null;
  private pendingTransactions: Map<string, PendingTransaction> = new Map();
  private contractCache: Map<string, ethers.Contract> = new Map();
  private MAX_PENDING_TRANSACTIONS = 1; // Limit to 1 concurrent transaction for stability
  private eventListeners: { eventName: string; handler: (...args: any[]) => void }[] = [];

  constructor() {
    this.tryInitProvider();
  }

  private tryInitProvider(): boolean {
    if (typeof window !== 'undefined' && window.ethereum) {
      console.log("Ethereum provider detected:", window.ethereum);
      // Some providers (like Coinbase Wallet) might conflict; MetaMask is usually window.ethereum.isMetaMask
      this.provider = new ethers.BrowserProvider(window.ethereum);
      return true;
    }
    return false;
  }

  private getPendingTransactionCount(): number {
    // Remove completed transactions from the map
    for (const [id, tx] of this.pendingTransactions.entries()) {
      if (tx.promise.then) {
        // Check if promise is resolved/rejected
        tx.promise.catch(() => {}).then(() => {
          this.pendingTransactions.delete(id);
        });
      }
    }
    return this.pendingTransactions.size;
  }

  private async waitForTransactionSlot(): Promise<void> {
    while (this.getPendingTransactionCount() >= this.MAX_PENDING_TRANSACTIONS) {
      await new Promise(r => setTimeout(r, 200)); // Increased from 100ms to 200ms
    }
  }

  /**
   * Waits for window.ethereum to be injected if it's not immediately available.
   */
  private async waitForEthereum(timeout = 3000): Promise<boolean> {
    if (this.tryInitProvider()) return true;

    return new Promise((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        if (this.tryInitProvider()) {
          clearInterval(interval);
          resolve(true);
        } else if (Date.now() - start > timeout) {
          clearInterval(interval);
          console.warn("Ethereum provider detection timed out.");
          resolve(false);
        }
      }, 100);
    });
  }

  private getOrCreateContract(address: string, abi: any[], signerOrProvider?: ethers.Signer | ethers.Provider): ethers.Contract {
    const key = `${address}-${signerOrProvider ? 'signer' : 'provider'}`;
    
    if (!this.contractCache.has(key)) {
      const provider = signerOrProvider || this.provider;
      if (!provider) throw new Error('No provider available');
      const contract = new ethers.Contract(address, abi, provider);
      this.contractCache.set(key, contract);
    }
    
    return this.contractCache.get(key)!;
  }

  cleanup(): void {
    this.contractCache.clear();
    this.pendingTransactions.clear();
    this.eventListeners.forEach(({ eventName, handler }) => {
      if (window.ethereum) {
        window.ethereum.removeListener(eventName, handler);
      }
    });
    this.eventListeners = [];
  }

  async connect(): Promise<string> {
    const isAvailable = await this.waitForEthereum();
    
    if (!isAvailable || !this.provider) {
      // If we are in an iframe, window.ethereum might be blocked by browser security policies
      // or "Permissions-Policy: ethereum" headers.
      const isIframe = window.self !== window.top;
      let errorMsg = 'MetaMask not detected.';
      if (isIframe) {
        errorMsg += ' Warning: You are running in an iframe. Some browsers block wallet injection in frames for security. Please try opening the app in a new tab.';
      } else {
        errorMsg += ' Please ensure the MetaMask extension is installed, enabled, and that you have granted permission to this site.';
      }
      throw new Error(errorMsg);
    }

    try {
      // Direct request to accounts
      const accounts = await this.provider.send('eth_requestAccounts', []);
      this.signer = await this.provider.getSigner();
      
      // Attempt to switch to Base Mainnet
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${BASE_CHAIN_ID.toString(16)}` }],
        });
      } catch (err: any) {
        // This error code (4902) indicates that the chain has not been added to MetaMask.
        if (err.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: `0x${BASE_CHAIN_ID.toString(16)}`,
                chainName: 'Base Mainnet',
                nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://mainnet.base.org'],
                blockExplorerUrls: ['https://basescan.org'],
              },
            ],
          });
        } else {
          throw err;
        }
      }
      
      return accounts[0];
    } catch (err: any) {
      console.error("MetaMask connection error:", err);
      if (err.code === 4001) {
        throw new Error('Connection rejected by user.');
      }
      throw new Error(err.message || 'Failed to connect to MetaMask');
    }
  }

  async getBalances(address: string) {
    if (!this.provider && !this.tryInitProvider()) return { usdc: '0', eth: '0' };
    if (!this.provider) return { usdc: '0', eth: '0' };

    try {
      const usdcContract = this.getOrCreateContract(USDC_ADDRESS, ERC20_ABI, this.provider);
      const [usdcBal, ethBal] = await Promise.all([
        usdcContract.balanceOf(address).catch(() => 0n),
        this.provider.getBalance(address).catch(() => 0n)
      ]);
      return {
        usdc: ethers.formatUnits(usdcBal, 6),
        eth: ethers.formatEther(ethBal)
      };
    } catch (e) {
      console.error("Error fetching balances:", e);
      return { usdc: '0', eth: '0' };
    }
  }

  async approveUSDC(amount: string) {
    if (!this.signer) throw new Error('Wallet not connected');
    
    // Reuse cached contract
    const usdcContract = this.getOrCreateContract(USDC_ADDRESS, ERC20_ABI, this.signer);
    const amountInUnits = ethers.parseUnits(amount, 6);
    
    const address = await this.signer.getAddress();
    const allowance = await usdcContract.allowance(address, UNISWAP_ROUTER_ADDRESS);
    
    if (BigInt(allowance) >= BigInt(amountInUnits)) return true;

    const tx = await usdcContract.approve(UNISWAP_ROUTER_ADDRESS, ethers.MaxUint256);
    await tx.wait();
    return true;
  }

  async swapUSDCtoETH(amount: string): Promise<string> {
    if (!this.signer) throw new Error('Wallet not connected');
    
    // Wait for available transaction slot
    await this.waitForTransactionSlot();
    
    const amountInUnits = ethers.parseUnits(amount, 6);
    const recipient = await this.signer.getAddress();
    
    const fee = 500; // 0.05% tier on Uniswap V3 Base
    const path = ethers.solidityPacked(
      ['address', 'uint24', 'address'],
      [USDC_ADDRESS, fee, WETH_ADDRESS]
    );

    const coder = new ethers.AbiCoder();
    const inputs = [
      coder.encode(
        ['address', 'uint256', 'uint256', 'bytes', 'bool'],
        [recipient, amountInUnits, 0, path, true]
      )
    ];

    const router = this.getOrCreateContract(
      UNISWAP_ROUTER_ADDRESS,
      ['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable'],
      this.signer
    );

    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
    const txPromise = router.execute("0x00", inputs, deadline);
    
    // Track this transaction
    const txId = Math.random().toString(36).substr(2, 9);
    const trackingPromise = txPromise.then((tx: any) => {
      this.pendingTransactions.delete(txId);
      return tx.hash;
    }).catch((err: any) => {
      this.pendingTransactions.delete(txId);
      throw err;
    });
    
    this.pendingTransactions.set(txId, {
      id: txId,
      promise: trackingPromise
    });
    
    return trackingPromise;
  }
}

export const ethService = new EthereumService();
