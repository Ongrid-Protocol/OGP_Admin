"use client";

import React, { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseUnits, formatUnits, Address, Abi } from 'viem';
import rewardDistributorAbiJson from '@/abis/RewardDistributor.json';
import mockUsdcAbiJson from '@/abis/MockUSDC.json'; // Use MockUSDC ABI

const REWARD_DISTRIBUTOR_ADDRESS = process.env.NEXT_PUBLIC_REWARD_DISTRIBUTOR_ADDRESS as Address | undefined;

const rewardDistributorAbi = rewardDistributorAbiJson.abi;
const mockUsdcAbi = mockUsdcAbiJson.abi; // Get the ABI array for MockUSDC

// Helper to format reward rate (needs context on units)
const formatRewardRate = (rate: bigint | undefined, decimals: number) => {
  if (rate === undefined) return 'Loading...';
  // Assuming rate is reward token wei per second per score unit
  try {
    return `${formatUnits(rate, decimals)} Tokens/sec per Score Unit`;
  } catch { return 'Error'; }
};

// Helper to format accumulated rewards (needs context on units)
const formatAccumulated = (value: bigint | undefined, decimals: number) => {
  if (value === undefined) return 'Loading...';
  // Assuming value is reward token wei per score unit
  try {
    return `${formatUnits(value, decimals)} Tokens/Score Unit`;
  } catch { return 'Error'; }
};

export function RewardDistributorAdmin() {
  const { address: connectedAddress } = useAccount();
  const { data: writeHash, writeContract, isPending: isWritePending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash: writeHash });

  // State for read data
  const [rewardTokenAddress, setRewardTokenAddress] = useState<Address>('0x');
  const [rewardTokenSymbol, setRewardTokenSymbol] = useState<string>('Token');
  const [rewardTokenDecimals, setRewardTokenDecimals] = useState<number>(18);
  const [accumulatedRewards, setAccumulatedRewards] = useState<bigint | undefined>(undefined);
  const [currentRate, setCurrentRate] = useState<bigint | undefined>(undefined);
  const [totalScore, setTotalScore] = useState<bigint | undefined>(undefined);
  const [isPaused, setIsPaused] = useState<boolean | null>(null);
  const [distributorBalance, setDistributorBalance] = useState<string>('');

  // State for inputs
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [newRate, setNewRate] = useState<string>('');
  const [checkNodeAddress, setCheckNodeAddress] = useState<string>('');
  const [claimableAmount, setClaimableAmount] = useState<string | null>(null);

  // State for status messages
  const [statusMessage, setStatusMessage] = useState<string>('');

  // --- Read Hooks ---
  const { data: rewardTokenAddrData, refetch: refetchRewardTokenAddr } = useReadContract({ address: REWARD_DISTRIBUTOR_ADDRESS, abi: rewardDistributorAbi, functionName: 'rewardToken' });
  const { data: accRewardsData, refetch: refetchAccRewards } = useReadContract({ address: REWARD_DISTRIBUTOR_ADDRESS, abi: rewardDistributorAbi, functionName: 'accumulatedRewardsPerScoreUnit' });
  const { data: rateData, refetch: refetchRate } = useReadContract({ address: REWARD_DISTRIBUTOR_ADDRESS, abi: rewardDistributorAbi, functionName: 'currentRewardRate' });
  const { data: scoreData, refetch: refetchScore } = useReadContract({ address: REWARD_DISTRIBUTOR_ADDRESS, abi: rewardDistributorAbi, functionName: 'totalContributionScore' });
  const { data: pausedData, refetch: refetchPaused } = useReadContract({ address: REWARD_DISTRIBUTOR_ADDRESS, abi: rewardDistributorAbi, functionName: 'paused' });

  // --- Read Hooks for Reward Token Info (Symbol, Decimals, Balance) ---
  const { data: symbolData } = useReadContract({ address: rewardTokenAddress, abi: mockUsdcAbi, functionName: 'symbol', query: { enabled: !!rewardTokenAddress && rewardTokenAddress !== '0x' } });
  const { data: decimalsData } = useReadContract({ address: rewardTokenAddress, abi: mockUsdcAbi, functionName: 'decimals', query: { enabled: !!rewardTokenAddress && rewardTokenAddress !== '0x' } });
  const { data: balanceData, refetch: refetchDistributorBalance } = useReadContract({
    address: rewardTokenAddress,
    abi: mockUsdcAbi, // Use MockUSDC ABI here
    functionName: 'balanceOf',
    args: [REWARD_DISTRIBUTOR_ADDRESS!],
    query: { enabled: !!rewardTokenAddress && rewardTokenAddress !== '0x' && !!REWARD_DISTRIBUTOR_ADDRESS },
  });

  // --- Read Hook for Claimable Rewards (on demand) ---
  const { data: claimableData, refetch: fetchClaimable, isLoading: isClaimableLoading, error: claimableError } = useReadContract({
    address: REWARD_DISTRIBUTOR_ADDRESS,
    abi: rewardDistributorAbi,
    functionName: 'claimableRewards',
    args: checkNodeAddress ? [checkNodeAddress as Address] : undefined,
    query: { enabled: false }, // Only fetch on demand
  });

  // --- Effects to update state from reads ---
  useEffect(() => { if (rewardTokenAddrData) setRewardTokenAddress(rewardTokenAddrData as Address); }, [rewardTokenAddrData]);
  useEffect(() => { if (accRewardsData !== undefined) setAccumulatedRewards(accRewardsData as bigint); }, [accRewardsData]);
  useEffect(() => { if (rateData !== undefined) setCurrentRate(rateData as bigint); }, [rateData]);
  useEffect(() => { if (scoreData !== undefined) setTotalScore(scoreData as bigint); }, [scoreData]);
  useEffect(() => { if (pausedData !== undefined) setIsPaused(pausedData as boolean); }, [pausedData]);
  useEffect(() => { if (symbolData) setRewardTokenSymbol(symbolData as string); }, [symbolData]);
  useEffect(() => { if (decimalsData) setRewardTokenDecimals(Number(decimalsData)); }, [decimalsData]);
  useEffect(() => { if (balanceData !== undefined) setDistributorBalance(formatUnits(balanceData as bigint, rewardTokenDecimals)); }, [balanceData, rewardTokenDecimals]);
  useEffect(() => { if (claimableData !== undefined) setClaimableAmount(formatUnits(claimableData as bigint, rewardTokenDecimals)); }, [claimableData, rewardTokenDecimals]);

  // Refetch function
  const refetchAll = () => {
    refetchRewardTokenAddr();
    refetchAccRewards();
    refetchRate();
    refetchScore();
    refetchPaused();
    refetchDistributorBalance();
    // Don't automatically refetch claimable, it's on demand
  };

  // --- Write Functions ---
  const handleWrite = (functionName: string, args: any[], successMessage?: string) => {
    if (!REWARD_DISTRIBUTOR_ADDRESS) { setStatusMessage('Contract address not set'); return; }
    setStatusMessage('');
    try {
      writeContract({
        address: REWARD_DISTRIBUTOR_ADDRESS,
        abi: rewardDistributorAbi,
        functionName: functionName,
        args: args,
      }, {
        onSuccess: () => setStatusMessage(successMessage || 'Transaction submitted...'),
        onError: (error) => setStatusMessage(`Submission Error: ${error.message}`),
      });
    } catch (e: any) {
      console.error(`${functionName} error:`, e);
      setStatusMessage(`Error calling ${functionName}: ${e.message}`);
    }
  };

  const handleDepositRewards = () => {
    if (!depositAmount) { setStatusMessage('Please enter deposit amount.'); return; }
    try {
      const amountWei = parseUnits(depositAmount, rewardTokenDecimals);
      // Need to approve the distributor contract first! Implement approve flow separately.
      // For now, assume approval is done.
      setStatusMessage('Approval required before depositing. Proceeding assuming approval is done...')
      handleWrite('depositRewards', [amountWei], 'Deposit transaction submitted...');
    } catch (e: any) {
      setStatusMessage(`Invalid amount: ${e.message}`);
    }
  };

  const handleSetRewardRate = () => {
    if (!newRate) { setStatusMessage('Please enter new reward rate.'); return; }
    try {
      // Assuming rate is in token wei per second per score unit
      const rateWei = parseUnits(newRate, rewardTokenDecimals);
      handleWrite('setRewardRate', [rateWei], 'Set rate transaction submitted...');
    } catch (e: any) {
      setStatusMessage(`Invalid rate format: ${e.message}`);
    }
  };

  const handlePause = () => handleWrite('pause', [], 'Pause transaction submitted...');
  const handleUnpause = () => handleWrite('unpause', [], 'Unpause transaction submitted...');

  // --- Claimable Handler ---
  const handleFetchClaimable = () => {
    if (!REWARD_DISTRIBUTOR_ADDRESS) { setClaimableAmount('Contract address not set'); return; }
    if (checkNodeAddress) {
      setClaimableAmount(null); // Clear previous
      fetchClaimable();
    } else {
      setClaimableAmount("Please enter an address.");
    }
  };

  // --- Transaction Status Effect ---
  useEffect(() => {
    if (isConfirmed) {
      setStatusMessage(`Transaction successful! Hash: ${writeHash}`);
      refetchAll();
    }
    // Keep submission errors, otherwise clear on success
    if (writeError && !isConfirmed) {
      setStatusMessage(`Error: ${writeError.message}`);
    }
    if (receiptError && !isConfirmed) {
       setStatusMessage(`Receipt Error: ${receiptError.message}`);
    }
  }, [isConfirmed, writeHash, writeError, receiptError, refetchAll]);


  if (!REWARD_DISTRIBUTOR_ADDRESS) {
    return <p className="text-red-500">Error: NEXT_PUBLIC_REWARD_DISTRIBUTOR_ADDRESS is not set in your .env.local file.</p>;
  }

  return (
    <div className="space-y-8 p-4 border rounded-lg shadow-md bg-white">
      <h2 className="text-2xl font-semibold text-gray-800">Reward Distributor Admin <span className="text-sm text-gray-500">({REWARD_DISTRIBUTOR_ADDRESS})</span></h2>

      {/* Contract Status Section */}
      <div className="p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-gray-700 mb-2">Contract Status & Config</h3>
        <p className="text-gray-700"><strong>Reward Token:</strong> {rewardTokenSymbol} ({rewardTokenAddress})</p>
        <p className="text-gray-700"><strong>Distributor Balance:</strong> {distributorBalance ? `${distributorBalance} ${rewardTokenSymbol}` : 'Loading...'}</p>
        <p className="text-gray-700"><strong>Paused:</strong> {isPaused === null ? 'Loading...' : isPaused ? 'Yes' : 'No'}</p>
        <p className="text-gray-700"><strong>Current Reward Rate:</strong> {formatRewardRate(currentRate, rewardTokenDecimals)}</p>
        <p className="text-gray-700"><strong>Total Contribution Score:</strong> {totalScore?.toString() ?? 'Loading...'}</p>
        <p className="text-gray-700"><strong>Accumulated Rewards/Score:</strong> {formatAccumulated(accumulatedRewards, rewardTokenDecimals)}</p>
        <button onClick={refetchAll} className="mt-2 px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Refresh Data</button>
      </div>

      {/* Control Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Deposit Rewards */}
        <div className="space-y-4 p-4 border rounded bg-gray-50">
          <h3 className="text-xl font-medium text-gray-700">Deposit Rewards</h3>
          <p className="text-sm text-gray-600">Requires REWARD_DEPOSITOR_ROLE. Ensure contract is approved to spend your {rewardTokenSymbol} first.</p>
          <div>
            <label htmlFor="depositAmount" className="block text-sm font-medium text-gray-700">Amount ({rewardTokenSymbol}):</label>
            <input
              type="text"
              id="depositAmount"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder={`e.g., 1000`}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          {/* TODO: Add Approve Button Here */}
          <button
            onClick={handleDepositRewards}
            disabled={isWritePending || isConfirming}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            Deposit Rewards
          </button>
        </div>

        {/* Set Reward Rate */}
        <div className="space-y-4 p-4 border rounded bg-gray-50">
          <h3 className="text-xl font-medium text-gray-700">Set Reward Rate</h3>
          <p className="text-sm text-gray-600">Rate in {rewardTokenSymbol} per second per score unit. Requires DEFAULT_ADMIN_ROLE.</p>
          <div>
            <label htmlFor="newRate" className="block text-sm font-medium text-gray-700">New Rate ({rewardTokenSymbol}/sec/score):</label>
            <input
              type="text"
              id="newRate"
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
              placeholder={`e.g., 0.001`}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          <button
            onClick={handleSetRewardRate}
            disabled={isWritePending || isConfirming}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            Set Rate
          </button>
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

        {/* Check Claimable Rewards */}
        <div className="space-y-4 p-4 border rounded bg-gray-50">
          <h3 className="text-xl font-medium text-gray-700">Check Claimable Rewards</h3>
          <div>
            <label htmlFor="checkNodeAddress" className="block text-sm font-medium text-gray-700">Node Operator Address:</label>
            <input
              type="text"
              id="checkNodeAddress"
              value={checkNodeAddress}
              onChange={(e) => { setCheckNodeAddress(e.target.value); setClaimableAmount(null); }}
              placeholder="0x..."
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          <button
            onClick={handleFetchClaimable}
            disabled={isClaimableLoading}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            {isClaimableLoading ? 'Checking...' : 'Check Rewards'}
          </button>
          {claimableError && <p className="text-red-500 text-sm mt-2">Error: {claimableError.message}</p>}
          {claimableAmount !== null && <p className="text-sm mt-2 text-gray-700">Claimable: {claimableAmount} {rewardTokenSymbol}</p>}
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