"use client";

import React from 'react';
import { useAccount } from 'wagmi';
import { Address, Abi } from 'viem';
import feeRouterAbiJson from '@/abis/FeeRouter.json';

const FEE_ROUTER_ADDRESS = process.env.NEXT_PUBLIC_FEE_ROUTER_ADDRESS as Address | undefined;

const feeRouterAbi = feeRouterAbiJson.abi;

export function FeeRouterAdmin() {
  const { address: connectedAddress } = useAccount();

  if (!FEE_ROUTER_ADDRESS) {
    return <p className="text-red-500">Error: NEXT_PUBLIC_FEE_ROUTER_ADDRESS is not set in your .env.local file.</p>;
  }

  return (
    <div className="space-y-8 p-4 border rounded-lg shadow-md">
      <h2 className="text-2xl font-semibold">Fee Router Admin</h2>
      <p>FeeRouter contract interactions will be implemented here.</p>
      <p>Connected Address: {connectedAddress}</p>
      <p>Contract Address: {FEE_ROUTER_ADDRESS}</p>
    </div>
  );
} 