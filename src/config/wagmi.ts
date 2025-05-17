import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'viem';
import { baseSepolia,base } from 'viem/chains';

// Import environment variables
const alchemyId = process.env.NEXT_PUBLIC_ALCHEMY_ID as string;
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID as string;

// Update chains array to only include baseSepolia
// The type needs to be explicitly cast for getDefaultConfig
export const chains = [baseSepolia,base] as const;

// Configure wagmi with RainbowKit
export const config = getDefaultConfig({
  appName: 'OnGrid Protocol Admin Panel',
  projectId: walletConnectProjectId,
  chains, // Use the updated chains array
  transports: {
    // Update transports to only include baseSepolia
    [baseSepolia.id]: http(`https://base-sepolia.g.alchemy.com/v2/${alchemyId}`),
    [base.id]: http(`https://base-mainnet.g.alchemy.com/v2/${alchemyId}`)
  },
  // You can customize these options
  ssr: true, // Server-side rendering support
}); 