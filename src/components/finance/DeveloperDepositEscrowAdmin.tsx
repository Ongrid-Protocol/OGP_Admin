"use client";

import React from 'react';
import { useAccount } from 'wagmi';
import { Address, Abi } from 'viem';
import developerDepositEscrowAbiJson from '@/abis/DeveloperDepositEscrow.json';

const DEVELOPER_DEPOSIT_ESCROW_ADDRESS = process.env.NEXT_PUBLIC_DEVELOPER_DEPOSIT_ESCROW_ADDRESS as Address | undefined;

const developerDepositEscrowAbi = developerDepositEscrowAbiJson.abi;

export function DeveloperDepositEscrowAdmin() {
  const { address: connectedAddress } = useAccount();

  if (!DEVELOPER_DEPOSIT_ESCROW_ADDRESS) {
    return <p className="text-red-500">Error: NEXT_PUBLIC_DEVELOPER_DEPOSIT_ESCROW_ADDRESS is not set in your .env.local file.</p>;
  }

  return (
    <div className="space-y-8 p-4 border rounded-lg shadow-md">
      <h2 className="text-2xl font-semibold">Developer Deposit Escrow Admin</h2>
      <p>DeveloperDepositEscrow contract interactions will be implemented here.</p>
      <p>Connected Address: {connectedAddress}</p>
      <p>Contract Address: {DEVELOPER_DEPOSIT_ESCROW_ADDRESS}</p>
    </div>
  );
} 