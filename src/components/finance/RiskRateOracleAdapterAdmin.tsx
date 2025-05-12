"use client";

import React from 'react';
import { useAccount } from 'wagmi';
import { Address, Abi } from 'viem';
import riskRateOracleAdapterAbiJson from '@/abis/RiskRateOracleAdapter.json';

const RISK_RATE_ORACLE_ADAPTER_ADDRESS = process.env.NEXT_PUBLIC_RISK_RATE_ORACLE_ADAPTER_ADDRESS as Address | undefined;

const riskRateOracleAdapterAbi = riskRateOracleAdapterAbiJson.abi;

export function RiskRateOracleAdapterAdmin() {
  const { address: connectedAddress } = useAccount();

  if (!RISK_RATE_ORACLE_ADAPTER_ADDRESS) {
    return <p className="text-red-500">Error: NEXT_PUBLIC_RISK_RATE_ORACLE_ADAPTER_ADDRESS is not set in your .env.local file.</p>;
  }

  return (
    <div className="space-y-8 p-4 border rounded-lg shadow-md">
      <h2 className="text-2xl font-semibold">Risk Rate Oracle Adapter Admin</h2>
      <p>RiskRateOracleAdapter contract interactions will be implemented here.</p>
      <p>Connected Address: {connectedAddress}</p>
      <p>Contract Address: {RISK_RATE_ORACLE_ADAPTER_ADDRESS}</p>
    </div>
  );
} 