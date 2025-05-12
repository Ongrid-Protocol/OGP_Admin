"use client";

import React from 'react';
import { useAccount } from 'wagmi';
import { Address, Abi } from 'viem';
import liquidityPoolManagerAbiJson from '@/abis/LiquidityPoolManager.json';

const LIQUIDITY_POOL_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_LIQUIDITY_POOL_MANAGER_ADDRESS as Address | undefined;

const liquidityPoolManagerAbi = liquidityPoolManagerAbiJson.abi;

export function LiquidityPoolManagerAdmin() {
  const { address: connectedAddress } = useAccount();

  if (!LIQUIDITY_POOL_MANAGER_ADDRESS) {
    return <p className="text-red-500">Error: NEXT_PUBLIC_LIQUIDITY_POOL_MANAGER_ADDRESS is not set in your .env.local file.</p>;
  }

  return (
    <div className="space-y-8 p-4 border rounded-lg shadow-md">
      <h2 className="text-2xl font-semibold">Liquidity Pool Manager Admin</h2>
      <p>LiquidityPoolManager contract interactions will be implemented here.</p>
      <p>Connected Address: {connectedAddress}</p>
      <p>Contract Address: {LIQUIDITY_POOL_MANAGER_ADDRESS}</p>
    </div>
  );
} 