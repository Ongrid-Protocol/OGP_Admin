"use client";

import React, { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseUnits, formatUnits, Address, Abi } from 'viem';
import carbonCreditExchangeAbiJson from '@/abis/CarbonCreditExchange.json';

const CARBON_CREDIT_EXCHANGE_ADDRESS = process.env.NEXT_PUBLIC_CARBON_CREDIT_EXCHANGE_ADDRESS as Address | undefined;

const carbonCreditExchangeAbi = carbonCreditExchangeAbiJson.abi;

// Helper to format percentage (assuming basis points)
const formatPercentage = (value: bigint | undefined) => {
  if (value === undefined) return 'Loading...';
  return `${Number(value) / 100}%`; // Divide by 100 for percentage from basis points
};

// Helper to format exchange rate (assuming CCT per 1 USDC, needs verification based on contract logic)
// Assuming USDC has 6 decimals and CCT has 18
const formatExchangeRate = (rate: bigint | undefined) => {
  if (rate === undefined) return 'Loading...';
  // Example: Rate might mean how many CCT wei per 1 USDC wei (10^6)
  // If rate = 2 * 10^18, it means 2 CCT per 1 USDC
  try {
    const ratePerUsdc = formatUnits(rate, 18); // Format CCT amount (18 decimals)
    return `${ratePerUsdc} CCT per USDC`;
  } catch (error) {
    console.error("Error formatting exchange rate:", error);
    return 'Error';
  }
};

export function CarbonCreditExchangeAdmin() {
  const { address: connectedAddress } = useAccount();
  const { data: writeHash, writeContract, isPending: isWritePending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash: writeHash });

  // State for read data
  const [cctAddress, setCctAddress] = useState<Address>('0x');
  const [usdcAddress, setUsdcAddress] = useState<Address>('0x');
  const [rewardDistributorAddress, setRewardDistributorAddress] = useState<Address>('0x');
  const [isExchangeEnabled, setIsExchangeEnabled] = useState<boolean | null>(null);
  const [exchangeRate, setExchangeRate] = useState<bigint | undefined>(undefined);
  const [protocolFee, setProtocolFee] = useState<bigint | undefined>(undefined);
  const [rewardFee, setRewardFee] = useState<bigint | undefined>(undefined);
  const [isPaused, setIsPaused] = useState<boolean | null>(null);

  // State for inputs
  const [newRate, setNewRate] = useState<string>('');
  const [newProtocolFee, setNewProtocolFee] = useState<string>('');
  const [newRewardFee, setNewRewardFee] = useState<string>('');

  // State for status messages
  const [statusMessage, setStatusMessage] = useState<string>('');

  // --- Read Hooks ---
  const { data: cctAddrData, refetch: refetchCctAddr } = useReadContract({ address: CARBON_CREDIT_EXCHANGE_ADDRESS, abi: carbonCreditExchangeAbi, functionName: 'carbonCreditToken' });
  const { data: usdcAddrData, refetch: refetchUsdcAddr } = useReadContract({ address: CARBON_CREDIT_EXCHANGE_ADDRESS, abi: carbonCreditExchangeAbi, functionName: 'usdcToken' });
  const { data: rewardDistAddrData, refetch: refetchRewardDistAddr } = useReadContract({ address: CARBON_CREDIT_EXCHANGE_ADDRESS, abi: carbonCreditExchangeAbi, functionName: 'rewardDistributor' });
  const { data: enabledData, refetch: refetchEnabled } = useReadContract({ address: CARBON_CREDIT_EXCHANGE_ADDRESS, abi: carbonCreditExchangeAbi, functionName: 'exchangeEnabled' });
  const { data: rateData, refetch: refetchRate } = useReadContract({ address: CARBON_CREDIT_EXCHANGE_ADDRESS, abi: carbonCreditExchangeAbi, functionName: 'exchangeRate' });
  const { data: protoFeeData, refetch: refetchProtoFee } = useReadContract({ address: CARBON_CREDIT_EXCHANGE_ADDRESS, abi: carbonCreditExchangeAbi, functionName: 'protocolFeePercentage' });
  const { data: rewardFeeData, refetch: refetchRewardFee } = useReadContract({ address: CARBON_CREDIT_EXCHANGE_ADDRESS, abi: carbonCreditExchangeAbi, functionName: 'rewardDistributorPercentage' });
  const { data: pausedData, refetch: refetchPaused } = useReadContract({ address: CARBON_CREDIT_EXCHANGE_ADDRESS, abi: carbonCreditExchangeAbi, functionName: 'paused' });

  // --- Effects to update state from reads ---
  useEffect(() => { if (cctAddrData) setCctAddress(cctAddrData as Address); }, [cctAddrData]);
  useEffect(() => { if (usdcAddrData) setUsdcAddress(usdcAddrData as Address); }, [usdcAddrData]);
  useEffect(() => { if (rewardDistAddrData) setRewardDistributorAddress(rewardDistAddrData as Address); }, [rewardDistAddrData]);
  useEffect(() => { if (enabledData !== undefined) setIsExchangeEnabled(enabledData as boolean); }, [enabledData]);
  useEffect(() => { if (rateData !== undefined) setExchangeRate(rateData as bigint); }, [rateData]);
  useEffect(() => { if (protoFeeData !== undefined) setProtocolFee(protoFeeData as bigint); }, [protoFeeData]);
  useEffect(() => { if (rewardFeeData !== undefined) setRewardFee(rewardFeeData as bigint); }, [rewardFeeData]);
  useEffect(() => { if (pausedData !== undefined) setIsPaused(pausedData as boolean); }, [pausedData]);

  // Refetch function
  const refetchAll = () => {
    refetchCctAddr();
    refetchUsdcAddr();
    refetchRewardDistAddr();
    refetchEnabled();
    refetchRate();
    refetchProtoFee();
    refetchRewardFee();
    refetchPaused();
  };

  // --- Write Functions ---

  // Generic handler for write functions
  const handleWrite = (functionName: string, args: any[]) => {
    if (!CARBON_CREDIT_EXCHANGE_ADDRESS) {
      setStatusMessage('Contract address not set in .env');
      return;
    }
    setStatusMessage('');
    try {
      writeContract({
        address: CARBON_CREDIT_EXCHANGE_ADDRESS,
        abi: carbonCreditExchangeAbi,
        functionName: functionName,
        args: args,
      });
    } catch (e: any) {
      console.error(`${functionName} error:`, e);
      setStatusMessage(`Error calling ${functionName}: ${e.message}`);
    }
  };

  const handleSetExchangeEnabled = (enabled: boolean) => handleWrite('setExchangeEnabled', [enabled]);
  const handlePause = () => handleWrite('pause', []);
  const handleUnpause = () => handleWrite('unpause', []);

  const handleSetExchangeRate = () => {
    if (!newRate) { setStatusMessage('Please enter a new rate.'); return; }
    try {
      // Assuming rate represents CCT wei per 1 USDC wei (needs verification)
      // Example: If user enters "2", meaning 2 CCT per USDC, convert to wei:
      // We need 2 * 10^18 CCT wei per 1 * 10^6 USDC wei.
      // The contract likely expects the rate scaled appropriately.
      // Assuming the contract takes the amount of CCT wei for 10^6 USDC wei:
      const rateInWei = parseUnits(newRate, 18); // CCT has 18 decimals
      handleWrite('setExchangeRate', [rateInWei]);
    } catch (e: any) {
      setStatusMessage(`Invalid rate format: ${e.message}`);
    }
  };

  const handleSetProtocolFee = () => {
    if (!newProtocolFee) { setStatusMessage('Please enter a new protocol fee percentage.'); return; }
    try {
      const feeBasisPoints = BigInt(Math.round(parseFloat(newProtocolFee) * 100)); // Convert % to basis points
      if (feeBasisPoints < 0 || feeBasisPoints > 10000) throw new Error('Fee must be between 0% and 100%');
      handleWrite('setProtocolFee', [feeBasisPoints]);
    } catch (e: any) {
      setStatusMessage(`Invalid fee format: ${e.message}`);
    }
  };

  const handleSetRewardFee = () => {
    if (!newRewardFee) { setStatusMessage('Please enter a new reward distributor fee percentage.'); return; }
    try {
      const feeBasisPoints = BigInt(Math.round(parseFloat(newRewardFee) * 100)); // Convert % to basis points
      if (feeBasisPoints < 0 || feeBasisPoints > 10000) throw new Error('Fee must be between 0% and 100%');
      handleWrite('setRewardDistributorPercentage', [feeBasisPoints]);
    } catch (e: any) {
      setStatusMessage(`Invalid fee format: ${e.message}`);
    }
  };

  // --- Transaction Status Effect ---
  useEffect(() => {
    if (isConfirmed) {
      setStatusMessage(`Transaction successful! Hash: ${writeHash}`);
      refetchAll(); // Refetch all data after successful transaction
      // Clear inputs on success?
      // setNewRate('');
      // setNewProtocolFee('');
      // setNewRewardFee('');
    }
    if (writeError || receiptError) {
      setStatusMessage(`Error: ${writeError?.message || receiptError?.message}`);
    }
  }, [isConfirmed, writeHash, writeError, receiptError, refetchAll]);


  if (!CARBON_CREDIT_EXCHANGE_ADDRESS) {
    return <p className="text-red-500">Error: NEXT_PUBLIC_CARBON_CREDIT_EXCHANGE_ADDRESS is not set in your .env.local file.</p>;
  }

  return (
    <div className="space-y-8 p-4 border rounded-lg shadow-md bg-white">
      <h2 className="text-2xl font-semibold text-gray-800">Carbon Credit Exchange Admin <span className="text-sm text-gray-500">({CARBON_CREDIT_EXCHANGE_ADDRESS})</span></h2>

      {/* Contract Status Section */}
      <div className="p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-gray-700 mb-2">Contract Status & Config</h3>
        <p className="text-gray-700"><strong>Exchange Enabled:</strong> {isExchangeEnabled === null ? 'Loading...' : isExchangeEnabled ? 'Yes' : 'No'}</p>
        <p className="text-gray-700"><strong>Paused:</strong> {isPaused === null ? 'Loading...' : isPaused ? 'Yes' : 'No'}</p>
        <p className="text-gray-700"><strong>Exchange Rate:</strong> {formatExchangeRate(exchangeRate)}</p>
        <p className="text-gray-700"><strong>Protocol Fee:</strong> {formatPercentage(protocolFee)}</p>
        <p className="text-gray-700"><strong>Reward Fee:</strong> {formatPercentage(rewardFee)}</p>
        <p className="text-gray-700"><strong>CCT Address:</strong> {cctAddress}</p>
        <p className="text-gray-700"><strong>USDC Address:</strong> {usdcAddress}</p>
        <p className="text-gray-700"><strong>Reward Distributor:</strong> {rewardDistributorAddress}</p>
        <button onClick={refetchAll} className="mt-2 px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Refresh Data</button>
      </div>

      {/* Control Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Enable/Disable Exchange */}
        <div className="space-y-4 p-4 border rounded bg-gray-50">
          <h3 className="text-xl font-medium text-gray-700">Toggle Exchange</h3>
          <p className="text-sm text-gray-600">Requires EXCHANGE_MANAGER_ROLE.</p>
          <div className="flex space-x-4">
            <button
              onClick={() => handleSetExchangeEnabled(true)}
              disabled={isWritePending || isConfirming || isExchangeEnabled === true}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              Enable Exchange
            </button>
            <button
              onClick={() => handleSetExchangeEnabled(false)}
              disabled={isWritePending || isConfirming || isExchangeEnabled === false}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              Disable Exchange
            </button>
          </div>
        </div>

        {/* Pause/Unpause Contract */}
        <div className="space-y-4 p-4 border rounded bg-gray-50">
          <h3 className="text-xl font-medium text-gray-700">Pause Control</h3>
          <p className="text-sm text-gray-600">Requires PAUSER_ROLE.</p>
          <div className="flex space-x-4">
            <button
              onClick={handlePause}
              disabled={isWritePending || isConfirming || isPaused === true}
              className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              Pause
            </button>
            <button
              onClick={handleUnpause}
              disabled={isWritePending || isConfirming || isPaused === false}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              Unpause
            </button>
          </div>
        </div>

        {/* Set Exchange Rate */}
        <div className="space-y-4 p-4 border rounded bg-gray-50">
          <h3 className="text-xl font-medium text-gray-700">Set Exchange Rate</h3>
          <p className="text-sm text-gray-600">Enter the amount of CCT per 1 USDC. Requires RATE_SETTER_ROLE.</p>
          <div>
            <label htmlFor="newRate" className="block text-sm font-medium text-gray-700">New Rate (CCT per USDC):</label>
            <input
              type="text"
              id="newRate"
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
              placeholder="e.g., 2.5"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          <button
            onClick={handleSetExchangeRate}
            disabled={isWritePending || isConfirming}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            Set Rate
          </button>
        </div>

        {/* Set Protocol Fee */}
        <div className="space-y-4 p-4 border rounded bg-gray-50">
          <h3 className="text-xl font-medium text-gray-700">Set Protocol Fee</h3>
          <p className="text-sm text-gray-600">Requires EXCHANGE_MANAGER_ROLE.</p>
          <div>
            <label htmlFor="newProtocolFee" className="block text-sm font-medium text-gray-700">New Fee (%):</label>
            <input
              type="text"
              id="newProtocolFee"
              value={newProtocolFee}
              onChange={(e) => setNewProtocolFee(e.target.value)}
              placeholder="e.g., 0.5"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          <button
            onClick={handleSetProtocolFee}
            disabled={isWritePending || isConfirming}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            Set Protocol Fee
          </button>
        </div>

        {/* Set Reward Fee */}
        <div className="space-y-4 p-4 border rounded bg-gray-50">
          <h3 className="text-xl font-medium text-gray-700">Set Reward Distributor Fee</h3>
          <p className="text-sm text-gray-600">Percentage of protocol fee sent to Reward Distributor. Requires EXCHANGE_MANAGER_ROLE.</p>
          <div>
            <label htmlFor="newRewardFee" className="block text-sm font-medium text-gray-700">New Fee (% of Protocol Fee):</label>
            <input
              type="text"
              id="newRewardFee"
              value={newRewardFee}
              onChange={(e) => setNewRewardFee(e.target.value)}
              placeholder="e.g., 50"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          <button
            onClick={handleSetRewardFee}
            disabled={isWritePending || isConfirming}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            Set Reward Fee
          </button>
        </div>
      </div>

      {/* Status Message */}
      {statusMessage && (
        <div className={`mt-4 p-3 rounded ${writeError || receiptError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          <p className="text-sm">{statusMessage}</p>
        </div>
      )}

    </div>
  );
} 