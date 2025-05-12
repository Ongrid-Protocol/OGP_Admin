"use client";

import React from 'react';
import { useAccount } from 'wagmi';
import { Address, Abi } from 'viem';
import repaymentRouterAbiJson from '@/abis/RepaymentRouter.json';

const REPAYMENT_ROUTER_ADDRESS = process.env.NEXT_PUBLIC_REPAYMENT_ROUTER_ADDRESS as Address | undefined;

const repaymentRouterAbi = repaymentRouterAbiJson.abi;

export function RepaymentRouterAdmin() {
  const { address: connectedAddress } = useAccount();

  if (!REPAYMENT_ROUTER_ADDRESS) {
    return <p className="text-red-500">Error: NEXT_PUBLIC_REPAYMENT_ROUTER_ADDRESS is not set in your .env.local file.</p>;
  }

  return (
    <div className="space-y-8 p-4 border rounded-lg shadow-md">
      <h2 className="text-2xl font-semibold">Repayment Router Admin</h2>
      <p>RepaymentRouter contract interactions will be implemented here.</p>
      <p>Connected Address: {connectedAddress}</p>
      <p>Contract Address: {REPAYMENT_ROUTER_ADDRESS}</p>
    </div>
  );
} 