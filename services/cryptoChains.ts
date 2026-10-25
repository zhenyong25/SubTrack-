import type { CryptoChain } from '../types';

// Networks a wallet address can be scanned on. Price keys are DefiLlama coin ids
// (https://coins.llama.fi): "coingecko:<id>" for native coins, "<chain>:<contract>" for tokens.

export type AddressFamily = 'bitcoin' | 'evm' | 'solana' | 'tron';

export interface ChainInfo {
  id: CryptoChain;
  name: string;
  family: AddressFamily;
  nativeSymbol: string;
  nativeDecimals: number;
  nativePriceKey: string;
  llamaChain?: string; // DefiLlama's name for token prices on this chain
  rpc?: string[]; // EVM JSON-RPC endpoints that allow browser calls and batched requests, tried in order
  explorer: (address: string) => string;
  color: string;
}

export const CHAINS: Record<CryptoChain, ChainInfo> = {
  bitcoin: { id: 'bitcoin', name: 'Bitcoin', family: 'bitcoin', nativeSymbol: 'BTC', nativeDecimals: 8, nativePriceKey: 'coingecko:bitcoin', explorer: a => `https://mempool.space/address/${a}`, color: '#f7931a' },
  ethereum: { id: 'ethereum', name: 'Ethereum', family: 'evm', nativeSymbol: 'ETH', nativeDecimals: 18, nativePriceKey: 'coingecko:ethereum', llamaChain: 'ethereum', rpc: ['https://eth-mainnet.public.blastapi.io', 'https://rpc.mevblocker.io', 'https://1rpc.io/eth', 'https://eth.drpc.org'], explorer: a => `https://etherscan.io/address/${a}`, color: '#627eea' },
  base: { id: 'base', name: 'Base', family: 'evm', nativeSymbol: 'ETH', nativeDecimals: 18, nativePriceKey: 'coingecko:ethereum', llamaChain: 'base', rpc: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://1rpc.io/base', 'https://base-mainnet.public.blastapi.io', 'https://base.drpc.org'], explorer: a => `https://basescan.org/address/${a}`, color: '#0052ff' },
  arbitrum: { id: 'arbitrum', name: 'Arbitrum', family: 'evm', nativeSymbol: 'ETH', nativeDecimals: 18, nativePriceKey: 'coingecko:ethereum', llamaChain: 'arbitrum', rpc: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com', 'https://arbitrum.drpc.org'], explorer: a => `https://arbiscan.io/address/${a}`, color: '#28a0f0' },
  optimism: { id: 'optimism', name: 'Optimism', family: 'evm', nativeSymbol: 'ETH', nativeDecimals: 18, nativePriceKey: 'coingecko:ethereum', llamaChain: 'optimism', rpc: ['https://mainnet.optimism.io', 'https://optimism-rpc.publicnode.com', 'https://optimism.drpc.org'], explorer: a => `https://optimistic.etherscan.io/address/${a}`, color: '#ff0420' },
  polygon: { id: 'polygon', name: 'Polygon', family: 'evm', nativeSymbol: 'POL', nativeDecimals: 18, nativePriceKey: 'coingecko:polygon-ecosystem-token', llamaChain: 'polygon', rpc: ['https://polygon.drpc.org', 'https://rpc-mainnet.matic.quiknode.pro', 'https://1rpc.io/matic', 'https://polygon-rpc.com'], explorer: a => `https://polygonscan.com/address/${a}`, color: '#8247e5' },
  bsc: { id: 'bsc', name: 'BNB Chain', family: 'evm', nativeSymbol: 'BNB', nativeDecimals: 18, nativePriceKey: 'coingecko:binancecoin', llamaChain: 'bsc', rpc: ['https://bsc-dataseed.bnbchain.org', 'https://bsc-rpc.publicnode.com', 'https://1rpc.io/bnb', 'https://bsc.drpc.org'], explorer: a => `https://bscscan.com/address/${a}`, color: '#f0b90b' },
  solana: { id: 'solana', name: 'Solana', family: 'solana', nativeSymbol: 'SOL', nativeDecimals: 9, nativePriceKey: 'coingecko:solana', llamaChain: 'solana', explorer: a => `https://solscan.io/account/${a}`, color: '#14f195' },
  tron: { id: 'tron', name: 'Tron', family: 'tron', nativeSymbol: 'TRX', nativeDecimals: 6, nativePriceKey: 'coingecko:tron', llamaChain: 'tron', explorer: a => `https://tronscan.org/#/address/${a}`, color: '#ff060a' },
};

export const EVM_CHAINS: CryptoChain[] = ['ethereum', 'base', 'arbitrum', 'optimism', 'polygon', 'bsc'];

// Which network family an address belongs to, from its format alone.
export const detectAddressFamily = (input: string): AddressFamily | null => {
  const address = input.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) return 'evm';
  if (/^(bc1[02-9ac-hj-np-z]{11,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/.test(address)) return 'bitcoin';
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return 'tron';
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return 'solana';
  return null;
};

export const chainsForFamily = (family: AddressFamily): CryptoChain[] =>
  family === 'evm' ? EVM_CHAINS : [family as CryptoChain];

export const shortAddress = (address: string) => (address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address);

// Popular tokens read directly on EVM networks without a token indexer (Ethereum mainnet
// uses Blockscout to find every token and falls back to this list). Decimals and symbols
// come back with the DefiLlama price, so only contracts are listed.
export const POPULAR_TOKENS: Partial<Record<CryptoChain, string[]>> = {
  ethereum: [
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
    '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
    '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', // stETH
    '0x514910771AF9Ca656af840dff83E8264EcF986CA', // LINK
    '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', // UNI
  ],
  base: [
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
    '0x4200000000000000000000000000000000000006', // WETH
    '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', // cbBTC
    '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', // DAI
    '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', // USDbC
    '0x940181a94A35A4569E4529A3CDfB74e38FD98631', // AERO
  ],
  arbitrum: [
    '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC
    '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', // USDC.e
    '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // USDT
    '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
    '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', // WBTC
    '0x912CE59144191C1204E64559FE8253a0e49E6548', // ARB
  ],
  optimism: [
    '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // USDC
    '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', // USDT
    '0x4200000000000000000000000000000000000006', // WETH
    '0x4200000000000000000000000000000000000042', // OP
  ],
  polygon: [
    '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // USDC
    '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC.e
    '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // USDT
    '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', // WETH
    '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', // WBTC
  ],
  bsc: [
    '0x55d398326f99059fF775485246999027B3197955', // USDT
    '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // USDC
    '0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409', // FDUSD
    '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', // BTCB
    '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', // ETH (Binance-peg)
    '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', // CAKE
  ],
};

export const STABLECOINS = new Set(['USDT', 'USDC', 'USDC.E', 'USDBC', 'DAI', 'FDUSD', 'USDE', 'PYUSD', 'TUSD', 'BUSD', 'USDS', 'USDT0', 'USDD', 'FRAX', 'LUSD', 'USD1']);
