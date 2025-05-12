"use client";

import React from 'react';
import { useAccount } from 'wagmi';
import { Address, Abi } from 'viem';
import projectFactoryAbiJson from '@/abis/ProjectFactory.json';

const PROJECT_FACTORY_ADDRESS = process.env.NEXT_PUBLIC_PROJECT_FACTORY_ADDRESS as Address | undefined;

const projectFactoryAbi = projectFactoryAbiJson.abi;

export function ProjectFactoryAdmin() {
  const { address: connectedAddress } = useAccount();

  if (!PROJECT_FACTORY_ADDRESS) {
    return <p className="text-red-500">Error: NEXT_PUBLIC_PROJECT_FACTORY_ADDRESS is not set in your .env.local file.</p>;
  }

  return (
    <div className="space-y-8 p-4 border rounded-lg shadow-md">
      <h2 className="text-2xl font-semibold">Project Factory Admin</h2>
      <p>ProjectFactory contract interactions will be implemented here.</p>
      <p>Connected Address: {connectedAddress}</p>
      <p>Contract Address: {PROJECT_FACTORY_ADDRESS}</p>
    </div>
  );
} 