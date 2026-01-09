
export interface TransactionLog {
  id: string;
  status: 'pending' | 'success' | 'error';
  hash?: string;
  message: string;
  timestamp: Date;
}

export interface WalletState {
  address: string | null;
  chainId: number | null;
  usdcBalance: string;
  ethBalance: string;
  isConnecting: boolean;
}

export interface SwapConfig {
  amountPerSwap: string;
  totalSwaps: number;
}
