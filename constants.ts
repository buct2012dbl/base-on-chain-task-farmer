
export const BASE_CHAIN_ID = 8453;

// Base Network USDC (6 Decimals) - 使用全小写避免校验问题
export const USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
// Base Network WETH - 使用全小写避免校验问题
export const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
// Uniswap V3 Universal Router (Base) - 使用全小写避免校验问题
export const UNISWAP_ROUTER_ADDRESS = '0x26261513f42d602997386198f608d907c406311c';

export const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)'
];

// Simplified Universal Router Command for Swap
export const UNIVERSAL_ROUTER_ABI = [
  'function execute(bytes commands, bytes[] inputs, uint256 deadline) payable'
];
