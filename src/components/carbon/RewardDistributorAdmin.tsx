"use client";

import React, { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseUnits, formatUnits, Address, Abi } from 'viem';
import rewardDistributorAbiJson from '@/abis/RewardDistributor.json';
import mockUsdcAbiJson from '@/abis/MockUSDC.json'; // Use MockUSDC ABI

const REWARD_DISTRIBUTOR_ADDRESS = process.env.NEXT_PUBLIC_REWARD_DISTRIBUTOR_ADDRESS as Address | undefined;

const rewardDistributorAbi = rewardDistributorAbiJson.abi;
const mockUsdcAbi = mockUsdcAbiJson.abi; // Get the ABI array for MockUSDC

interface RoleInfoRD {
  name: string;
  hash: `0x${string}` | undefined;
}

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

  // Roles State
  const [defaultAdminRoleRD, setDefaultAdminRoleRD] = useState<`0x${string}` | undefined>(undefined);
  const [metricUpdaterRoleRD, setMetricUpdaterRoleRD] = useState<`0x${string}` | undefined>(undefined);
  const [pauserRoleRD, setPauserRoleRD] = useState<`0x${string}` | undefined>(undefined);
  const [rewardDepositorRoleRD, setRewardDepositorRoleRD] = useState<`0x${string}` | undefined>(undefined);
  const [upgraderRoleRD, setUpgraderRoleRD] = useState<`0x${string}` | undefined>(undefined);

  const availableRolesRD: RoleInfoRD[] = [
    { name: 'DEFAULT_ADMIN_ROLE', hash: defaultAdminRoleRD },
    { name: 'METRIC_UPDATER_ROLE', hash: metricUpdaterRoleRD },
    { name: 'PAUSER_ROLE', hash: pauserRoleRD },
    { name: 'REWARD_DEPOSITOR_ROLE', hash: rewardDepositorRoleRD },
    { name: 'UPGRADER_ROLE', hash: upgraderRoleRD },
  ].filter(role => role.hash !== undefined);

  // State for inputs
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [newRate, setNewRate] = useState<string>('');
  const [checkNodeAddress, setCheckNodeAddress] = useState<string>('');
  const [claimableAmount, setClaimableAmount] = useState<string | null>(null);

  // Role Management Inputs
  const [grantRoleAccountRD, setGrantRoleAccountRD] = useState<string>('');
  const [grantRoleSelectedRD, setGrantRoleSelectedRD] = useState<string>('');
  const [revokeRoleAccountRD, setRevokeRoleAccountRD] = useState<string>('');
  const [revokeRoleSelectedRD, setRevokeRoleSelectedRD] = useState<string>('');
  const [renounceRoleSelectedRD, setRenounceRoleSelectedRD] = useState<string>('');
  const [checkRoleAccountRD, setCheckRoleAccountRD] = useState<string>('');
  const [checkRoleSelectedRD, setCheckRoleSelectedRD] = useState<string>('');
  const [hasRoleResultRD, setHasRoleResultRD] = useState<string | null>(null);
  const [roleAdminResultRD, setRoleAdminResultRD] = useState<string | null>(null);

  // Update Node Contribution Inputs
  const [updateNodeOperator, setUpdateNodeOperator] = useState<string>('');
  const [updateNodeDelta, setUpdateNodeDelta] = useState<string>('');
  const [updateNodeTimestamp, setUpdateNodeTimestamp] = useState<string>('');

  // State for status messages
  const [statusMessage, setStatusMessage] = useState<string>('');

  // --- Read Hooks ---
  const { data: rewardTokenAddrData, refetch: refetchRewardTokenAddr } = useReadContract({ address: REWARD_DISTRIBUTOR_ADDRESS, abi: rewardDistributorAbi, functionName: 'rewardToken' });
  const { data: accRewardsData, refetch: refetchAccRewards } = useReadContract({ address: REWARD_DISTRIBUTOR_ADDRESS, abi: rewardDistributorAbi, functionName: 'accumulatedRewardsPerScoreUnit' });
  const { data: rateData, refetch: refetchRate } = useReadContract({ address: REWARD_DISTRIBUTOR_ADDRESS, abi: rewardDistributorAbi, functionName: 'currentRewardRate' });
  const { data: scoreData, refetch: refetchScore } = useReadContract({ address: REWARD_DISTRIBUTOR_ADDRESS, abi: rewardDistributorAbi, functionName: 'totalContributionScore' });
  const { data: pausedData, refetch: refetchPaused } = useReadContract({ address: REWARD_DISTRIBUTOR_ADDRESS, abi: rewardDistributorAbi, functionName: 'paused' });

  // Role Hash Reads for RewardDistributor
  const { data: darHashRD } = useReadContract({ address: REWARD_DISTRIBUTOR_ADDRESS, abi: rewardDistributorAbi, functionName: 'DEFAULT_ADMIN_ROLE' });
  const { data: metricUpdaterHashRD } = useReadContract({ address: REWARD_DISTRIBUTOR_ADDRESS, abi: rewardDistributorAbi, functionName: 'METRIC_UPDATER_ROLE' });
  const { data: pauserHashRD } = useReadContract({ address: REWARD_DISTRIBUTOR_ADDRESS, abi: rewardDistributorAbi, functionName: 'PAUSER_ROLE' });
  const { data: rewardDepositorHashRD } = useReadContract({ address: REWARD_DISTRIBUTOR_ADDRESS, abi: rewardDistributorAbi, functionName: 'REWARD_DEPOSITOR_ROLE' });
  const { data: upgraderHashRD } = useReadContract({ address: REWARD_DISTRIBUTOR_ADDRESS, abi: rewardDistributorAbi, functionName: 'UPGRADER_ROLE' });

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

  useEffect(() => { if (darHashRD) setDefaultAdminRoleRD(darHashRD as `0x${string}`); }, [darHashRD]);
  useEffect(() => { if (metricUpdaterHashRD) setMetricUpdaterRoleRD(metricUpdaterHashRD as `0x${string}`); }, [metricUpdaterHashRD]);
  useEffect(() => { if (pauserHashRD) setPauserRoleRD(pauserHashRD as `0x${string}`); }, [pauserHashRD]);
  useEffect(() => { if (rewardDepositorHashRD) setRewardDepositorRoleRD(rewardDepositorHashRD as `0x${string}`); }, [rewardDepositorHashRD]);
  useEffect(() => { if (upgraderHashRD) setUpgraderRoleRD(upgraderHashRD as `0x${string}`); }, [upgraderHashRD]);

  const { data: hasRoleDataRD, refetch: fetchHasRoleRD, isLoading: isHasRoleLoadingRD } = useReadContract({
    address: REWARD_DISTRIBUTOR_ADDRESS,
    abi: rewardDistributorAbi,
    functionName: 'hasRole',
    args: (checkRoleSelectedRD && checkRoleAccountRD) ? [checkRoleSelectedRD as `0x${string}`, checkRoleAccountRD as Address] : undefined,
    query: { enabled: false }
  });
  useEffect(() => {
    if (hasRoleDataRD !== undefined) setHasRoleResultRD(hasRoleDataRD ? 'Yes' : 'No');
  }, [hasRoleDataRD]);

  const { data: roleAdminDataRD, refetch: fetchRoleAdminRD, isLoading: isRoleAdminLoadingRD } = useReadContract({
    address: REWARD_DISTRIBUTOR_ADDRESS,
    abi: rewardDistributorAbi,
    functionName: 'getRoleAdmin',
    args: checkRoleSelectedRD ? [checkRoleSelectedRD as `0x${string}`] : undefined,
    query: { enabled: false }
  });
  useEffect(() => {
    if (roleAdminDataRD !== undefined) {
      const foundRole = availableRolesRD.find(r => r.hash === (roleAdminDataRD as `0x${string}`));
      setRoleAdminResultRD(foundRole ? `${foundRole.name} (${roleAdminDataRD})` : (roleAdminDataRD as string));
    }
  }, [roleAdminDataRD, availableRolesRD]);

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

  const handleGrantRole = () => {
    if (!grantRoleSelectedRD) { setStatusMessage('Please select a role to grant.'); return; }
    if (!grantRoleAccountRD) { setStatusMessage('Please enter an account address to grant the role to.'); return; }
    try {
      const accountAddress = grantRoleAccountRD as Address;
      handleWrite('grantRole', [grantRoleSelectedRD as `0x${string}`, accountAddress], `Granting ${availableRolesRD.find(r=>r.hash === grantRoleSelectedRD)?.name || grantRoleSelectedRD} to ${accountAddress}...`);
    } catch(e: any) {
      setStatusMessage(`Invalid address for grant role: ${e.message}`);
    }
  };

  const handleRevokeRole = () => {
    if (!revokeRoleSelectedRD) { setStatusMessage('Please select a role to revoke.'); return; }
    if (!revokeRoleAccountRD) { setStatusMessage('Please enter an account address to revoke the role from.'); return; }
    try {
      const accountAddress = revokeRoleAccountRD as Address;
      handleWrite('revokeRole', [revokeRoleSelectedRD as `0x${string}`, accountAddress], `Revoking ${availableRolesRD.find(r=>r.hash === revokeRoleSelectedRD)?.name || revokeRoleSelectedRD} from ${accountAddress}...`);
    } catch(e: any) {
      setStatusMessage(`Invalid address for revoke role: ${e.message}`);
    }
  };

  const handleRenounceRole = () => {
    if (!renounceRoleSelectedRD) { setStatusMessage('Please select a role to renounce.'); return; }
    if (!connectedAddress) { setStatusMessage('Please connect your wallet to renounce a role.'); return; }
    handleWrite('renounceRole', [renounceRoleSelectedRD as `0x${string}`, connectedAddress], `Renouncing ${availableRolesRD.find(r=>r.hash === renounceRoleSelectedRD)?.name || renounceRoleSelectedRD} for ${connectedAddress}...`);
  };

  const handleCheckRole = () => {
    if (!checkRoleSelectedRD) { setHasRoleResultRD("Please select a role."); setRoleAdminResultRD(null); return; }
    if (checkRoleAccountRD) {
      setHasRoleResultRD(null);
      fetchHasRoleRD();
    } else {
      setHasRoleResultRD("Please enter an account address to check.");
    }
    setRoleAdminResultRD(null);
    fetchRoleAdminRD(); 
  };

  const handleUpdateNodeContribution = () => {
    if (!updateNodeOperator) { setStatusMessage('Please enter operator address.'); return; }
    if (!updateNodeDelta) { setStatusMessage('Please enter contribution delta.'); return; }
    if (!updateNodeTimestamp) { setStatusMessage('Please enter timestamp.'); return; }
    try {
      const operatorAddress = updateNodeOperator as Address;
      const delta = BigInt(updateNodeDelta);
      const timestamp = BigInt(updateNodeTimestamp);
      handleWrite('updateNodeContribution', [operatorAddress, delta, timestamp], 'Update node contribution transaction submitted...');
    } catch (e: any) {
      setStatusMessage(`Invalid input for node contribution: ${e.message}`);
    }
  };

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
      <h2 className="text-2xl font-semibold text-black">Reward Distributor Admin <span className="text-sm text-gray-600">({REWARD_DISTRIBUTOR_ADDRESS})</span></h2>

      {/* Contract Status Section */}
      <div className="p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black mb-2">Contract Status & Config</h3>
        <p className="text-black"><strong>Reward Token:</strong> {rewardTokenSymbol} ({rewardTokenAddress})</p>
        <p className="text-black"><strong>Distributor Balance:</strong> {distributorBalance ? `${distributorBalance} ${rewardTokenSymbol}` : 'Loading...'}</p>
        <p className="text-black"><strong>Paused:</strong> {isPaused === null ? 'Loading...' : isPaused ? 'Yes' : 'No'}</p>
        <p className="text-black"><strong>Current Reward Rate:</strong> {formatRewardRate(currentRate, rewardTokenDecimals)}</p>
        <p className="text-black"><strong>Total Contribution Score:</strong> {totalScore?.toString() ?? 'Loading...'}</p>
        <p className="text-black"><strong>Accumulated Rewards/Score:</strong> {formatAccumulated(accumulatedRewards, rewardTokenDecimals)}</p>
        <button onClick={refetchAll} className="mt-2 px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">Refresh Data</button>
      </div>

      {/* Role Management Section */}
      <div className="p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black mb-3">Role Management (RewardDistributor)</h3>
        
        {/* Grant Role */}
        <div className="space-y-3 mb-6 p-3 border-t pt-4">
          <h4 className="text-lg font-medium text-black">Grant Role</h4>
          <div>
            <label htmlFor="grantRoleSelectRD" className="block text-sm font-medium text-black">Role:</label>
            <select
              id="grantRoleSelectRD"
              value={grantRoleSelectedRD}
              onChange={(e) => setGrantRoleSelectedRD(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-black bg-white"
            >
              <option value="">-- Select Role --</option>
              {availableRolesRD.map(role => <option key={role.hash} value={role.hash}>{role.name} ({role.hash?.substring(0,6)}...)</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="grantRoleAccountRD" className="block text-sm font-medium text-black">Account Address:</label>
            <input
              type="text"
              id="grantRoleAccountRD"
              value={grantRoleAccountRD}
              onChange={(e) => setGrantRoleAccountRD(e.target.value)}
              placeholder="0x..."
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleGrantRole}
            disabled={isWritePending || isConfirming || !grantRoleSelectedRD || !grantRoleAccountRD}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Grant Role
          </button>
        </div>

        {/* Revoke Role */}
        <div className="space-y-3 mb-6 p-3 border-t pt-4">
          <h4 className="text-lg font-medium text-black">Revoke Role</h4>
          <div>
            <label htmlFor="revokeRoleSelectRD" className="block text-sm font-medium text-black">Role:</label>
            <select
              id="revokeRoleSelectRD"
              value={revokeRoleSelectedRD}
              onChange={(e) => setRevokeRoleSelectedRD(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-black bg-white"
            >
              <option value="">-- Select Role --</option>
              {availableRolesRD.map(role => <option key={role.hash} value={role.hash}>{role.name} ({role.hash?.substring(0,6)}...)</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="revokeRoleAccountRD" className="block text-sm font-medium text-black">Account Address:</label>
            <input
              type="text"
              id="revokeRoleAccountRD"
              value={revokeRoleAccountRD}
              onChange={(e) => setRevokeRoleAccountRD(e.target.value)}
              placeholder="0x..."
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleRevokeRole}
            disabled={isWritePending || isConfirming || !revokeRoleSelectedRD || !revokeRoleAccountRD}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Revoke Role
          </button>
        </div>

        {/* Renounce Role */}
        <div className="space-y-3 mb-6 p-3 border-t pt-4">
          <h4 className="text-lg font-medium text-black">Renounce Role (for connected address)</h4>
          <div>
            <label htmlFor="renounceRoleSelectRD" className="block text-sm font-medium text-black">Role:</label>
            <select
              id="renounceRoleSelectRD"
              value={renounceRoleSelectedRD}
              onChange={(e) => setRenounceRoleSelectedRD(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-black bg-white"
            >
              <option value="">-- Select Role --</option>
              {availableRolesRD.map(role => <option key={role.hash} value={role.hash}>{role.name} ({role.hash?.substring(0,6)}...)</option>)}
            </select>
          </div>
          <button
            onClick={handleRenounceRole}
            disabled={isWritePending || isConfirming || !renounceRoleSelectedRD || !connectedAddress}
            className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Renounce Role
          </button>
        </div>

        {/* Check Role / Get Role Admin */}
        <div className="space-y-3 p-3 border-t pt-4">
          <h4 className="text-lg font-medium text-black">Check Role / Get Role Admin</h4>
          <div>
            <label htmlFor="checkRoleSelectRD" className="block text-sm font-medium text-black">Role:</label>
            <select
              id="checkRoleSelectRD"
              value={checkRoleSelectedRD}
              onChange={(e) => { setCheckRoleSelectedRD(e.target.value); setHasRoleResultRD(null); setRoleAdminResultRD(null); }}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-black bg-white"
            >
              <option value="">-- Select Role --</option>
              {availableRolesRD.map(role => <option key={role.hash} value={role.hash}>{role.name} ({role.hash?.substring(0,6)}...)</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="checkRoleAccountRD" className="block text-sm font-medium text-black">Account Address (for hasRole):</label>
            <input
              type="text"
              id="checkRoleAccountRD"
              value={checkRoleAccountRD}
              onChange={(e) => { setCheckRoleAccountRD(e.target.value); setHasRoleResultRD(null); }}
              placeholder="0x... (optional for getRoleAdmin)"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleCheckRole}
            disabled={isHasRoleLoadingRD || isRoleAdminLoadingRD || !checkRoleSelectedRD}
            className="px-4 py-2 bg-teal-500 text-white rounded hover:bg-teal-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            {isHasRoleLoadingRD || isRoleAdminLoadingRD ? 'Fetching...' : 'Check Role Info'}
          </button>
          {hasRoleResultRD && <p className="text-sm mt-2 text-black"><strong>Has Role:</strong> {hasRoleResultRD}</p>}
          {roleAdminResultRD && <p className="text-sm mt-1 text-black"><strong>Role Admin:</strong> {roleAdminResultRD}</p>}
        </div>
      </div>

      {/* Control Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Deposit Rewards */}
        <div className="space-y-4 p-4 border rounded bg-gray-50">
          <h3 className="text-xl font-medium text-black">Deposit Rewards</h3>
          <p className="text-sm text-gray-700">Requires REWARD_DEPOSITOR_ROLE. Ensure contract is approved to spend your {rewardTokenSymbol} first.</p>
          <div>
            <label htmlFor="depositAmountRD" className="block text-sm font-medium text-black">Amount ({rewardTokenSymbol}):</label>
            <input
              type="text"
              id="depositAmountRD"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder={`e.g., 1000`}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          {/* TODO: Add Approve Button Here */}
          <button
            onClick={handleDepositRewards}
            disabled={isWritePending || isConfirming || !depositAmount}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Deposit Rewards
          </button>
        </div>

        {/* Set Reward Rate */}
        <div className="space-y-4 p-4 border rounded bg-gray-50">
          <h3 className="text-xl font-medium text-black">Set Reward Rate</h3>
          <p className="text-sm text-gray-700">Rate in {rewardTokenSymbol} per second per score unit. Requires DEFAULT_ADMIN_ROLE.</p>
          <div>
            <label htmlFor="newRateRD" className="block text-sm font-medium text-black">New Rate ({rewardTokenSymbol}/sec/score):</label>
            <input
              type="text"
              id="newRateRD"
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
              placeholder={`e.g., 0.001`}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleSetRewardRate}
            disabled={isWritePending || isConfirming || !newRate}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Set Rate
          </button>
        </div>

        {/* Pause/Unpause Contract */}
        <div className="space-y-4 p-4 border rounded bg-gray-50">
          <h3 className="text-xl font-medium text-black">Pause Control</h3>
           <p className="text-sm text-gray-700">Requires PAUSER_ROLE.</p>
           <div className="flex space-x-4">
            <button
              onClick={handlePause}
              disabled={isWritePending || isConfirming || isPaused === true}
              className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
            >
              Pause
            </button>
            <button
              onClick={handleUnpause}
              disabled={isWritePending || isConfirming || isPaused === false}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
            >
              Unpause
            </button>
          </div>
        </div>

        {/* Update Node Contribution */}
        <div className="space-y-4 p-4 border rounded bg-gray-50">
          <h3 className="text-xl font-medium text-black">Update Node Contribution</h3>
          <p className="text-sm text-gray-700">Requires METRIC_UPDATER_ROLE (typically EnergyDataBridge). For admin testing/correction.</p>
          <div>
            <label htmlFor="updateNodeOperatorRD" className="block text-sm font-medium text-black">Operator Address:</label>
            <input
              type="text"
              id="updateNodeOperatorRD"
              value={updateNodeOperator}
              onChange={(e) => setUpdateNodeOperator(e.target.value)}
              placeholder="0x..."
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <div>
            <label htmlFor="updateNodeDeltaRD" className="block text-sm font-medium text-black">Contribution Delta (uint256):</label>
            <input
              type="text"
              id="updateNodeDeltaRD"
              value={updateNodeDelta}
              onChange={(e) => setUpdateNodeDelta(e.target.value)}
              placeholder="e.g., 100 (positive or negative if contract supports)"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <div>
            <label htmlFor="updateNodeTimestampRD" className="block text-sm font-medium text-black">Timestamp (uint64):</label>
            <input
              type="text"
              id="updateNodeTimestampRD"
              value={updateNodeTimestamp}
              onChange={(e) => setUpdateNodeTimestamp(e.target.value)}
              placeholder="Unix timestamp in seconds"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleUpdateNodeContribution}
            disabled={isWritePending || isConfirming || !updateNodeOperator || !updateNodeDelta || !updateNodeTimestamp}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Update Contribution
          </button>
        </div>

      </div>

      {/* Status Message */}
      {statusMessage && (
        <div className={`mt-4 p-3 rounded ${writeError || receiptError ? 'bg-red-100 text-red-700' : isConfirmed ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
          <p className="text-sm font-medium">{statusMessage}</p>
        </div>
      )}

    </div>
  );
}