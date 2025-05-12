"use client";

import React from 'react';
import { useAccount } from 'wagmi';
import { Address, Abi } from 'viem';
import developerRegistryAbiJson from '@/abis/DeveloperRegistry.json';

const DEVELOPER_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_DEVELOPER_REGISTRY_ADDRESS as Address | undefined;

const developerRegistryAbi = developerRegistryAbiJson.abi;

export function DeveloperRegistryAdmin() {
  const { address: connectedAddress } = useAccount();

  if (!DEVELOPER_REGISTRY_ADDRESS) {
    return <p className="text-red-500">Error: NEXT_PUBLIC_DEVELOPER_REGISTRY_ADDRESS is not set in your .env.local file.</p>;
  }

  return (
    <div className="space-y-8 p-4 border rounded-lg shadow-md">
      <h2 className="text-2xl font-semibold">Developer Registry Admin</h2>
      <p>DeveloperRegistry contract interactions will be implemented here.</p>
      <p>Connected Address: {connectedAddress}</p>
      <p>Contract Address: {DEVELOPER_REGISTRY_ADDRESS}</p>
    </div>
  );
} 