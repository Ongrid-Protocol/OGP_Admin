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
  // The contract stores percentages scaled by 100, e.g., 1% is 100, 0.5% is 50.
  // So, value / 100 gives the actual percentage.
  // Basis points would be value / 100 for percentage, then * 100 again for basis points, so it's just `value` if it was stored as BP.
  // The ABI indicates uint256 for these percentage fields. The comment in the Admin Guide says "scaled by 1e6", which is different.
  // The contract itself (e.g., _calculateProtocolFee) divides by 10_000 (DENOMINATOR), implying it expects values like 100 for 1%.
  return `${Number(value) / 100}%`; 
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
  const [newUsdcTokenAddress, setNewUsdcTokenAddress] = useState<string>('');

  // Roles State
  const [defaultAdminRole, setDefaultAdminRole] = useState<`0x${string}` | undefined>(undefined);
  const [exchangeManagerRole, setExchangeManagerRole] = useState<`0x${string}` | undefined>(undefined);
  const [pauserRole, setPauserRole] = useState<`0x${string}` | undefined>(undefined);
  const [rateSetterRole, setRateSetterRole] = useState<`0x${string}` | undefined>(undefined);
  // REWARD_DEPOSITOR_ROLE is used by this contract to call RewardDistributor, not managed on this contract itself for others.

  const availableRoles: { name: string; hash: `0x${string}` | undefined }[] = [
    { name: 'DEFAULT_ADMIN_ROLE', hash: defaultAdminRole },
    { name: 'EXCHANGE_MANAGER_ROLE', hash: exchangeManagerRole },
    { name: 'PAUSER_ROLE', hash: pauserRole },
    { name: 'RATE_SETTER_ROLE', hash: rateSetterRole },
  ].filter(role => role.hash !== undefined);

  // Role Management Inputs
  const [grantRoleAccount, setGrantRoleAccount] = useState<string>('');
  const [grantRoleSelected, setGrantRoleSelected] = useState<string>('');
  const [revokeRoleAccount, setRevokeRoleAccount] = useState<string>('');
  const [revokeRoleSelected, setRevokeRoleSelected] = useState<string>('');
  const [renounceRoleSelected, setRenounceRoleSelected] = useState<string>('');
  const [checkRoleAccount, setCheckRoleAccount] = useState<string>('');
  const [checkRoleSelected, setCheckRoleSelected] = useState<string>('');
  const [hasRoleResult, setHasRoleResult] = useState<string | null>(null);
  const [roleAdminResult, setRoleAdminResult] = useState<string | null>(null);

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

  // Role Hash Reads
  const { data: darHash } = useReadContract({ address: CARBON_CREDIT_EXCHANGE_ADDRESS, abi: carbonCreditExchangeAbi, functionName: 'DEFAULT_ADMIN_ROLE' });
  const { data: exManagerHash } = useReadContract({ address: CARBON_CREDIT_EXCHANGE_ADDRESS, abi: carbonCreditExchangeAbi, functionName: 'EXCHANGE_MANAGER_ROLE' });
  const { data: pauserHash } = useReadContract({ address: CARBON_CREDIT_EXCHANGE_ADDRESS, abi: carbonCreditExchangeAbi, functionName: 'PAUSER_ROLE' });
  const { data: rateSetterHash } = useReadContract({ address: CARBON_CREDIT_EXCHANGE_ADDRESS, abi: carbonCreditExchangeAbi, functionName: 'RATE_SETTER_ROLE' });

  // --- Effects to update state from reads ---
  useEffect(() => { if (cctAddrData) setCctAddress(cctAddrData as Address); }, [cctAddrData]);
  useEffect(() => { if (usdcAddrData) setUsdcAddress(usdcAddrData as Address); }, [usdcAddrData]);
  useEffect(() => { if (rewardDistAddrData) setRewardDistributorAddress(rewardDistAddrData as Address); }, [rewardDistAddrData]);
  useEffect(() => { if (enabledData !== undefined) setIsExchangeEnabled(enabledData as boolean); }, [enabledData]);
  useEffect(() => { if (rateData !== undefined) setExchangeRate(rateData as bigint); }, [rateData]);
  useEffect(() => { if (protoFeeData !== undefined) setProtocolFee(protoFeeData as bigint); }, [protoFeeData]);
  useEffect(() => { if (rewardFeeData !== undefined) setRewardFee(rewardFeeData as bigint); }, [rewardFeeData]);
  useEffect(() => { if (pausedData !== undefined) setIsPaused(pausedData as boolean); }, [pausedData]);

  useEffect(() => { if (darHash) setDefaultAdminRole(darHash as `0x${string}`); }, [darHash]);
  useEffect(() => { if (exManagerHash) setExchangeManagerRole(exManagerHash as `0x${string}`); }, [exManagerHash]);
  useEffect(() => { if (pauserHash) setPauserRole(pauserHash as `0x${string}`); }, [pauserHash]);
  useEffect(() => { if (rateSetterHash) setRateSetterRole(rateSetterHash as `0x${string}`); }, [rateSetterHash]);

  const { data: hasRoleData, refetch: fetchHasRole, isLoading: isHasRoleLoading } = useReadContract({
    address: CARBON_CREDIT_EXCHANGE_ADDRESS,
    abi: carbonCreditExchangeAbi,
    functionName: 'hasRole',
    args: (checkRoleSelected && checkRoleAccount) ? [checkRoleSelected as `0x${string}`, checkRoleAccount as Address] : undefined,
    query: { enabled: false }
  });
  useEffect(() => {
    if (hasRoleData !== undefined) setHasRoleResult(hasRoleData ? 'Yes' : 'No');
  }, [hasRoleData]);

  const { data: roleAdminData, refetch: fetchRoleAdmin, isLoading: isRoleAdminLoading } = useReadContract({
    address: CARBON_CREDIT_EXCHANGE_ADDRESS,
    abi: carbonCreditExchangeAbi,
    functionName: 'getRoleAdmin',
    args: checkRoleSelected ? [checkRoleSelected as `0x${string}`] : undefined,
    query: { enabled: false }
  });
  useEffect(() => {
    if (roleAdminData !== undefined) {
      const foundRole = availableRoles.find(r => r.hash === (roleAdminData as `0x${string}`));
      setRoleAdminResult(foundRole ? `${foundRole.name} (${roleAdminData})` : (roleAdminData as string));
    }
  }, [roleAdminData, availableRoles]);

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
      }, {
        onSuccess: () => setStatusMessage(`${functionName} transaction submitted...`),
        onError: (error) => setStatusMessage(`Submission Error (${functionName}): ${error.message}`),
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
      // The contract expects the rate in CCT wei per 1 USDC unit (10^6 for USDC usually).
      // If user enters "2.5" CCT per USDC:
      // Target value for contract should be: 2.5 * 10^CCT_Decimals / 10^USDC_Decimals * 10^6 (if rate is CCT_WEI per USDC_WEI)
      // Or, if the rate is how much CCT you get for 1 USDC (10^6 units), then it's parseUnits(newRate, CCT_DECIMALS)
      // Based on `exchangeCreditsForUSDC`, it calculates `usdcAmount = (creditAmount * exchangeRate) / 10**CCT_DECIMALS;`
      // This implies `exchangeRate` is in `USDC_WEI per CCT_UNIT` (i.e., USDC has 6 decimals, CCT has 18).
      // So, if user enters "0.1" (meaning 0.1 USDC for 1 CCT), we parse it with USDC decimals.
      // Let's assume the `exchangeRate` variable in the contract is `amount of CCT per USDC`.
      // The example `formatExchangeRate` implies `exchangeRate` is CCT wei for 1 USDC (10^18 for CCT, 10^6 for USDC).
      // Contract: `usdcAmount = (creditAmount * exchangeRate) / 10**carbonCreditToken.decimals()`
      // This suggests exchangeRate is `USDC per CCT_UNIT (smallest unit)`. So if CCT has 18 decimals, and USDC has 6, and rate is 0.1 USDC per 1 CCT:
      // rate stored = 0.1 * 10^6 = 100000 (USDC has 6 decimals)
      const rateInSmallestUnit = parseUnits(newRate, 6); // Assuming rate is USDC per CCT, and USDC has 6 decimals.
      handleWrite('setExchangeRate', [rateInSmallestUnit]);
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

  const handleSetUsdcToken = () => {
    if (!newUsdcTokenAddress) { setStatusMessage('Please enter the new USDC token address.'); return; }
    try {
      const address = newUsdcTokenAddress as Address;
      handleWrite('setUSDCToken', [address]);
    } catch (e: any) {
      setStatusMessage(`Invalid address for USDC token: ${e.message}`);
    }
  };

  const handleGrantRole = () => {
    if (!grantRoleSelected) { setStatusMessage('Please select a role to grant.'); return; }
    if (!grantRoleAccount) { setStatusMessage('Please enter an account address to grant the role to.'); return; }
    try {
      const accountAddress = grantRoleAccount as Address;
      handleWrite('grantRole', [grantRoleSelected as `0x${string}`, accountAddress]);
    } catch(e: any) {
      setStatusMessage(`Invalid address for grant role: ${e.message}`);
    }
  };

  const handleRevokeRole = () => {
    if (!revokeRoleSelected) { setStatusMessage('Please select a role to revoke.'); return; }
    if (!revokeRoleAccount) { setStatusMessage('Please enter an account address to revoke the role from.'); return; }
    try {
      const accountAddress = revokeRoleAccount as Address;
      handleWrite('revokeRole', [revokeRoleSelected as `0x${string}`, accountAddress]);
    } catch(e: any) {
      setStatusMessage(`Invalid address for revoke role: ${e.message}`);
    }
  };

  const handleRenounceRole = () => {
    if (!renounceRoleSelected) { setStatusMessage('Please select a role to renounce.'); return; }
    if (!connectedAddress) { setStatusMessage('Please connect your wallet to renounce a role.'); return; }
    handleWrite('renounceRole', [renounceRoleSelected as `0x${string}`, connectedAddress]);
  };

  const handleCheckRole = () => {
    if (!checkRoleSelected) { setHasRoleResult("Please select a role."); setRoleAdminResult(null); return; }
    if (checkRoleAccount) {
      setHasRoleResult(null);
      fetchHasRole();
    } else {
      setHasRoleResult("Please enter an account address to check.");
    }
    setRoleAdminResult(null);
    fetchRoleAdmin(); 
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
      <h2 className="text-2xl font-semibold text-black">Carbon Credit Exchange Admin <span className="text-sm text-gray-600">({CARBON_CREDIT_EXCHANGE_ADDRESS})</span></h2>

      {/* Contract Status Section */}
      <div className="p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black mb-2">Contract Status & Config</h3>
        <p className="text-black"><strong>Exchange Enabled:</strong> {isExchangeEnabled === null ? 'Loading...' : isExchangeEnabled ? 'Yes' : 'No'}</p>
        <p className="text-black"><strong>Paused:</strong> {isPaused === null ? 'Loading...' : isPaused ? 'Yes' : 'No'}</p>
        <p className="text-black"><strong>Exchange Rate:</strong> {formatExchangeRate(exchangeRate)}</p>
        <p className="text-black"><strong>Protocol Fee:</strong> {formatPercentage(protocolFee)}</p>
        <p className="text-black"><strong>Reward Fee:</strong> {formatPercentage(rewardFee)}</p>
        <p className="text-black"><strong>CCT Address:</strong> {cctAddress}</p>
        <p className="text-black"><strong>USDC Address:</strong> {usdcAddress}</p>
        <p className="text-black"><strong>Reward Distributor:</strong> {rewardDistributorAddress}</p>
        <button onClick={refetchAll} className="mt-2 px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">Refresh Data</button>
      </div>

      {/* Role Management Section */}
      <div className="p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black mb-3">Role Management</h3>
        
        {/* Grant Role */}
        <div className="space-y-3 mb-6 p-3 border-t pt-4">
          <h4 className="text-lg font-medium text-black">Grant Role</h4>
          <div>
            <label htmlFor="grantRoleSelectCCE" className="block text-sm font-medium text-black">Role:</label>
            <select
              id="grantRoleSelectCCE"
              value={grantRoleSelected}
              onChange={(e) => setGrantRoleSelected(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-black bg-white"
            >
              <option value="">-- Select Role --</option>
              {availableRoles.map(role => <option key={role.hash} value={role.hash}>{role.name} ({role.hash?.substring(0,6)}...)</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="grantRoleAccountCCE" className="block text-sm font-medium text-black">Account Address:</label>
            <input
              type="text"
              id="grantRoleAccountCCE"
              value={grantRoleAccount}
              onChange={(e) => setGrantRoleAccount(e.target.value)}
              placeholder="0x..."
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleGrantRole}
            disabled={isWritePending || isConfirming || !grantRoleSelected || !grantRoleAccount}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Grant Role
          </button>
        </div>

        {/* Revoke Role */}
        <div className="space-y-3 mb-6 p-3 border-t pt-4">
          <h4 className="text-lg font-medium text-black">Revoke Role</h4>
          <div>
            <label htmlFor="revokeRoleSelectCCE" className="block text-sm font-medium text-black">Role:</label>
            <select
              id="revokeRoleSelectCCE"
              value={revokeRoleSelected}
              onChange={(e) => setRevokeRoleSelected(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-black bg-white"
            >
              <option value="">-- Select Role --</option>
              {availableRoles.map(role => <option key={role.hash} value={role.hash}>{role.name} ({role.hash?.substring(0,6)}...)</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="revokeRoleAccountCCE" className="block text-sm font-medium text-black">Account Address:</label>
            <input
              type="text"
              id="revokeRoleAccountCCE"
              value={revokeRoleAccount}
              onChange={(e) => setRevokeRoleAccount(e.target.value)}
              placeholder="0x..."
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleRevokeRole}
            disabled={isWritePending || isConfirming || !revokeRoleSelected || !revokeRoleAccount}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Revoke Role
          </button>
        </div>

        {/* Renounce Role */}
        <div className="space-y-3 mb-6 p-3 border-t pt-4">
          <h4 className="text-lg font-medium text-black">Renounce Role (for connected address)</h4>
          <div>
            <label htmlFor="renounceRoleSelectCCE" className="block text-sm font-medium text-black">Role:</label>
            <select
              id="renounceRoleSelectCCE"
              value={renounceRoleSelected}
              onChange={(e) => setRenounceRoleSelected(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-black bg-white"
            >
              <option value="">-- Select Role --</option>
              {availableRoles.map(role => <option key={role.hash} value={role.hash}>{role.name} ({role.hash?.substring(0,6)}...)</option>)}
            </select>
          </div>
          <button
            onClick={handleRenounceRole}
            disabled={isWritePending || isConfirming || !renounceRoleSelected || !connectedAddress}
            className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Renounce Role
          </button>
        </div>

        {/* Check Role / Get Role Admin */}
        <div className="space-y-3 p-3 border-t pt-4">
          <h4 className="text-lg font-medium text-black">Check Role / Get Role Admin</h4>
          <div>
            <label htmlFor="checkRoleSelectCCE" className="block text-sm font-medium text-black">Role:</label>
            <select
              id="checkRoleSelectCCE"
              value={checkRoleSelected}
              onChange={(e) => { setCheckRoleSelected(e.target.value); setHasRoleResult(null); setRoleAdminResult(null); }}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-black bg-white"
            >
              <option value="">-- Select Role --</option>
              {availableRoles.map(role => <option key={role.hash} value={role.hash}>{role.name} ({role.hash?.substring(0,6)}...)</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="checkRoleAccountCCE" className="block text-sm font-medium text-black">Account Address (for hasRole):</label>
            <input
              type="text"
              id="checkRoleAccountCCE"
              value={checkRoleAccount}
              onChange={(e) => { setCheckRoleAccount(e.target.value); setHasRoleResult(null); }}
              placeholder="0x... (optional for getRoleAdmin)"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleCheckRole}
            disabled={isHasRoleLoading || isRoleAdminLoading || !checkRoleSelected}
            className="px-4 py-2 bg-teal-500 text-white rounded hover:bg-teal-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            {isHasRoleLoading || isRoleAdminLoading ? 'Fetching...' : 'Check Role Info'}
          </button>
          {hasRoleResult && <p className="text-sm mt-2 text-black"><strong>Has Role:</strong> {hasRoleResult}</p>}
          {roleAdminResult && <p className="text-sm mt-1 text-black"><strong>Role Admin:</strong> {roleAdminResult}</p>}
        </div>

      </div>

      {/* Control Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Enable/Disable Exchange */}
        <div className="space-y-4 p-4 border rounded bg-gray-50">
          <h3 className="text-xl font-medium text-black">Toggle Exchange</h3>
          <p className="text-sm text-gray-700">Requires EXCHANGE_MANAGER_ROLE.</p>
          <div className="flex space-x-4">
            <button
              onClick={() => handleSetExchangeEnabled(true)}
              disabled={isWritePending || isConfirming || isExchangeEnabled === true}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
            >
              Enable Exchange
            </button>
            <button
              onClick={() => handleSetExchangeEnabled(false)}
              disabled={isWritePending || isConfirming || isExchangeEnabled === false}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
            >
              Disable Exchange
            </button>
          </div>
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

        {/* Set Exchange Rate */}
        <div className="space-y-4 p-4 border rounded bg-gray-50">
          <h3 className="text-xl font-medium text-black">Set Exchange Rate</h3>
          <p className="text-sm text-gray-700">Enter the amount of CCT per 1 USDC. Requires RATE_SETTER_ROLE.</p>
          <div>
            <label htmlFor="newRateCCT" className="block text-sm font-medium text-black">New Rate (CCT per USDC):</label>
            <input
              type="text"
              id="newRateCCT"
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
              placeholder="e.g., 2.5"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleSetExchangeRate}
            disabled={isWritePending || isConfirming || !newRate}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Set Rate
          </button>
        </div>

        {/* Set Protocol Fee */}
        <div className="space-y-4 p-4 border rounded bg-gray-50">
          <h3 className="text-xl font-medium text-black">Set Protocol Fee</h3>
          <p className="text-sm text-gray-700">Enter percentage (e.g., 0.5 for 0.5%). Requires FEE_MANAGER_ROLE.</p>
          <div>
            <label htmlFor="newProtocolFeeCCT" className="block text-sm font-medium text-black">New Protocol Fee (%):</label>
            <input
              type="text"
              id="newProtocolFeeCCT"
              value={newProtocolFee}
              onChange={(e) => setNewProtocolFee(e.target.value)}
              placeholder="e.g., 0.5"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleSetProtocolFee}
            disabled={isWritePending || isConfirming || !newProtocolFee}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Set Protocol Fee
          </button>
        </div>

        {/* Set Reward Fee */}
        <div className="space-y-4 p-4 border rounded bg-gray-50">
          <h3 className="text-xl font-medium text-black">Set Reward Distributor Fee</h3>
          <p className="text-sm text-gray-700">Enter percentage (e.g., 1 for 1%). Requires FEE_MANAGER_ROLE.</p>
          <div>
            <label htmlFor="newRewardFeeCCT" className="block text-sm font-medium text-black">New Reward Fee (%):</label>
            <input
              type="text"
              id="newRewardFeeCCT"
              value={newRewardFee}
              onChange={(e) => setNewRewardFee(e.target.value)}
              placeholder="e.g., 1"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleSetRewardFee}
            disabled={isWritePending || isConfirming || !newRewardFee}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Set Reward Fee
          </button>
        </div>

        {/* Set USDC Token Address */}
        <div className="space-y-4 p-4 border rounded bg-gray-50">
          <h3 className="text-xl font-medium text-black">Set USDC Token Address</h3>
          <p className="text-sm text-gray-700">Requires DEFAULT_ADMIN_ROLE.</p>
          <div>
            <label htmlFor="newUsdcTokenAddressCCE" className="block text-sm font-medium text-black">New USDC Token Address:</label>
            <input
              type="text"
              id="newUsdcTokenAddressCCE"
              value={newUsdcTokenAddress}
              onChange={(e) => setNewUsdcTokenAddress(e.target.value)}
              placeholder="0x..."
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleSetUsdcToken}
            disabled={isWritePending || isConfirming || !newUsdcTokenAddress}
            className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Set USDC Token
          </button>
        </div>

      </div>

      {/* Status Message */}
      {statusMessage && (
        <div className={`mt-4 p-3 rounded ${writeError || receiptError ? 'bg-red-100 text-red-700' : isConfirmed ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
          <p className="text-sm font-medium">{statusMessage}</p>
        </div>
      )}

      {/* Placeholder for events like ExchangeRateUpdated, FeesUpdated if needed */}
      {/* <div className="p-4 border rounded bg-gray-50 mt-6">
        <h3 className="text-xl font-medium text-black mb-3">Recent Events</h3>
        <p className="text-gray-600">No relevant contract-specific events tracked yet for display.</p> 
      </div> */}

    </div>
  );
} 