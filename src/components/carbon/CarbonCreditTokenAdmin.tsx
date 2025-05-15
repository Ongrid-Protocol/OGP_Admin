"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseUnits, formatUnits, Address, zeroAddress } from 'viem';
import carbonCreditTokenAbiJson from '@/abis/CarbonCreditToken.json';

// Define contract address from .env
const CARBON_CREDIT_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_CARBON_CREDIT_TOKEN_ADDRESS as Address | undefined;

// Simpler ABI assignment
const carbonCreditTokenAbi = carbonCreditTokenAbiJson.abi;

interface RoleInfo {
  name: string;
  hash: `0x${string}` | undefined;
}

export function CarbonCreditTokenAdmin() {
  const { address: connectedAddress } = useAccount();
  const { data: writeHash, writeContract, isPending: isWritePending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash: writeHash });

  // State for read data
  const [tokenName, setTokenName] = useState<string>('');
  const [tokenSymbol, setTokenSymbol] = useState<string>('');
  const [totalSupply, setTotalSupply] = useState<string>('');
  const [decimals, setDecimals] = useState<number>(18); // Default or fetch
  const [protocolTreasury, setProtocolTreasury] = useState<Address>('0x');
  const [isTokenPaused, setIsTokenPaused] = useState<boolean | null>(null);

  // Roles State
  const [defaultAdminRole, setDefaultAdminRole] = useState<`0x${string}` | undefined>(undefined);
  const [minterRole, setMinterRole] = useState<`0x${string}` | undefined>(undefined);
  const [pauserRole, setPauserRole] = useState<`0x${string}` | undefined>(undefined);
  const [treasuryManagerRole, setTreasuryManagerRole] = useState<`0x${string}` | undefined>(undefined);
  const [upgraderRole, setUpgraderRole] = useState<`0x${string}` | undefined>(undefined);
  
  const availableRoles: RoleInfo[] = [
    { name: 'DEFAULT_ADMIN_ROLE', hash: defaultAdminRole },
    { name: 'MINTER_ROLE', hash: minterRole },
    { name: 'PAUSER_ROLE', hash: pauserRole },
    { name: 'TREASURY_MANAGER_ROLE', hash: treasuryManagerRole },
    { name: 'UPGRADER_ROLE', hash: upgraderRole },
  ].filter(role => role.hash !== undefined);


  // State for balanceOf input and result
  const [balanceAccountAddress, setBalanceAccountAddress] = useState<string>('');
  const [fetchedBalance, setFetchedBalance] = useState<string | null>(null);

  // State for mintToTreasury input
  const [mintAmount, setMintAmount] = useState<string>('');
  const [generalStatus, setGeneralStatus] = useState<string>(''); // General status for multiple operations

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

  // Treasury Management Inputs
  const [newTreasuryAddress, setNewTreasuryAddress] = useState<string>('');
  const [transferTreasuryTo, setTransferTreasuryTo] = useState<string>('');
  const [transferTreasuryAmount, setTransferTreasuryAmount] = useState<string>('');
  const [retireTreasuryAmount, setRetireTreasuryAmount] = useState<string>('');
  const [retireTreasuryReason, setRetireTreasuryReason] = useState<string>('');


  // --- Read Hooks ---
  const { data: fetchedDecimals, refetch: refetchDecimals } = useReadContract({ address: CARBON_CREDIT_TOKEN_ADDRESS, abi: carbonCreditTokenAbi, functionName: 'decimals' });
  const { data: fetchedName, refetch: refetchName } = useReadContract({ address: CARBON_CREDIT_TOKEN_ADDRESS, abi: carbonCreditTokenAbi, functionName: 'name' });
  const { data: fetchedSymbol, refetch: refetchSymbol } = useReadContract({ address: CARBON_CREDIT_TOKEN_ADDRESS, abi: carbonCreditTokenAbi, functionName: 'symbol' });
  const { data: fetchedTotalSupply, refetch: refetchTotalSupply } = useReadContract({ address: CARBON_CREDIT_TOKEN_ADDRESS, abi: carbonCreditTokenAbi, functionName: 'totalSupply' });
  const { data: fetchedTreasury, refetch: refetchTreasury } = useReadContract({ address: CARBON_CREDIT_TOKEN_ADDRESS, abi: carbonCreditTokenAbi, functionName: 'protocolTreasury' });
  const { data: fetchedPausedStatus, refetch: refetchPausedStatus } = useReadContract({ address: CARBON_CREDIT_TOKEN_ADDRESS, abi: carbonCreditTokenAbi, functionName: 'paused' });

  // Role Hash Reads
  const { data: darHash } = useReadContract({ address: CARBON_CREDIT_TOKEN_ADDRESS, abi: carbonCreditTokenAbi, functionName: 'DEFAULT_ADMIN_ROLE' });
  const { data: minterHash } = useReadContract({ address: CARBON_CREDIT_TOKEN_ADDRESS, abi: carbonCreditTokenAbi, functionName: 'MINTER_ROLE' });
  const { data: pauserHash } = useReadContract({ address: CARBON_CREDIT_TOKEN_ADDRESS, abi: carbonCreditTokenAbi, functionName: 'PAUSER_ROLE' });
  const { data: treasuryManagerHash } = useReadContract({ address: CARBON_CREDIT_TOKEN_ADDRESS, abi: carbonCreditTokenAbi, functionName: 'TREASURY_MANAGER_ROLE' });
  const { data: upgraderHash } = useReadContract({ address: CARBON_CREDIT_TOKEN_ADDRESS, abi: carbonCreditTokenAbi, functionName: 'UPGRADER_ROLE' });


  useEffect(() => { if (fetchedDecimals) setDecimals(Number(fetchedDecimals)); }, [fetchedDecimals]);
  useEffect(() => { if (fetchedName) setTokenName(fetchedName as string); }, [fetchedName]);
  useEffect(() => { if (fetchedSymbol) setTokenSymbol(fetchedSymbol as string); }, [fetchedSymbol]);
  useEffect(() => { if (fetchedTotalSupply !== undefined) setTotalSupply(formatUnits(fetchedTotalSupply as bigint, decimals)); }, [fetchedTotalSupply, decimals]);
  useEffect(() => { if (fetchedTreasury) setProtocolTreasury(fetchedTreasury as Address); }, [fetchedTreasury]);
  useEffect(() => { if (fetchedPausedStatus !== undefined) setIsTokenPaused(fetchedPausedStatus as boolean); }, [fetchedPausedStatus]);

  useEffect(() => { if (darHash) setDefaultAdminRole(darHash as `0x${string}`); }, [darHash]);
  useEffect(() => { if (minterHash) setMinterRole(minterHash as `0x${string}`); }, [minterHash]);
  useEffect(() => { if (pauserHash) setPauserRole(pauserHash as `0x${string}`); }, [pauserHash]);
  useEffect(() => { if (treasuryManagerHash) setTreasuryManagerRole(treasuryManagerHash as `0x${string}`); }, [treasuryManagerHash]);
  useEffect(() => { if (upgraderHash) setUpgraderRole(upgraderHash as `0x${string}`); }, [upgraderHash]);


  // Fetch BalanceOf (on demand)
  const { data: balance, refetch: fetchBalance, isLoading: isBalanceLoading, error: balanceError } = useReadContract({
    address: CARBON_CREDIT_TOKEN_ADDRESS,
    abi: carbonCreditTokenAbi,
    functionName: 'balanceOf',
    args: balanceAccountAddress ? [balanceAccountAddress as Address] : undefined,
    query: { enabled: false },
  });

  useEffect(() => { if (balance !== undefined && balance !== null) setFetchedBalance(formatUnits(balance as bigint, decimals)); }, [balance, decimals]);
  
  const { data: hasRoleData, refetch: fetchHasRole, isLoading: isHasRoleLoading } = useReadContract({
    address: CARBON_CREDIT_TOKEN_ADDRESS,
    abi: carbonCreditTokenAbi,
    functionName: 'hasRole',
    args: (checkRoleSelected && checkRoleAccount) ? [checkRoleSelected as `0x${string}`, checkRoleAccount as Address] : undefined,
    query: { enabled: false }
  });
  useEffect(() => {
    if (hasRoleData !== undefined) setHasRoleResult(hasRoleData ? 'Yes' : 'No');
  }, [hasRoleData]);

  const { data: roleAdminData, refetch: fetchRoleAdmin, isLoading: isRoleAdminLoading } = useReadContract({
    address: CARBON_CREDIT_TOKEN_ADDRESS,
    abi: carbonCreditTokenAbi,
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


  // --- Refetch All Data ---
  const refetchAll = useCallback(() => {
    refetchDecimals();
    refetchName();
    refetchSymbol();
    refetchTotalSupply();
    refetchTreasury();
    refetchPausedStatus();
    // Role hashes are constants, no need to refetch them unless contract is upgraded with new roles.
    if (balanceAccountAddress) fetchBalance(); // Refetch balance if an address is set
  }, [refetchDecimals, refetchName, refetchSymbol, refetchTotalSupply, refetchTreasury, refetchPausedStatus, balanceAccountAddress, fetchBalance]);

  // --- Write Functions ---
  const handleWrite = (functionName: string, args: unknown[], successMessage?: string, specificStatusSetter?: React.Dispatch<React.SetStateAction<string>>) => {
    const statusSetter = specificStatusSetter || setGeneralStatus;
    if (!CARBON_CREDIT_TOKEN_ADDRESS) { statusSetter('Contract address not set'); return; }
    statusSetter('');
    try {
      writeContract({
        address: CARBON_CREDIT_TOKEN_ADDRESS,
        abi: carbonCreditTokenAbi,
        functionName: functionName,
        args: args,
      }, {
        onSuccess: () => statusSetter(successMessage || 'Transaction submitted...'),
        onError: (error) => statusSetter(`Submission Error: ${error.message}`),
      });
    } catch (e: unknown) {
      console.error(`${functionName} error:`, e);
      if (e instanceof Error) {
        statusSetter(`Error calling ${functionName}: ${e.message}`);
      } else {
        statusSetter(`An unknown error occurred calling ${functionName}`);
      }
    }
  };


  const handleMintToTreasury = async () => {
    if (!mintAmount) { setGeneralStatus('Please enter amount.'); return; }
    handleWrite('mintToTreasury', [parseUnits(mintAmount, decimals)], 'Mint to Treasury transaction submitted...');
  };

  const handleGrantRole = () => {
    if (!grantRoleSelected) { setGeneralStatus('Please select a role to grant.'); return; }
    if (!grantRoleAccount) { setGeneralStatus('Please enter an account address to grant the role to.'); return; }
    try {
      const accountAddress = grantRoleAccount as Address; // Basic validation, viem will do more
      handleWrite('grantRole', [grantRoleSelected as `0x${string}`, accountAddress], `Granting ${availableRoles.find(r=>r.hash === grantRoleSelected)?.name || grantRoleSelected} to ${accountAddress}...`);
    } catch(e: unknown) {
      if (e instanceof Error) {
        setGeneralStatus(`Invalid address for grant role: ${e.message}`);
      } else {
        setGeneralStatus('An unknown error occurred while granting role.');
      }
    }
  };

  const handleRevokeRole = () => {
    if (!revokeRoleSelected) { setGeneralStatus('Please select a role to revoke.'); return; }
    if (!revokeRoleAccount) { setGeneralStatus('Please enter an account address to revoke the role from.'); return; }
    try {
      const accountAddress = revokeRoleAccount as Address;
      handleWrite('revokeRole', [revokeRoleSelected as `0x${string}`, accountAddress], `Revoking ${availableRoles.find(r=>r.hash === revokeRoleSelected)?.name || revokeRoleSelected} from ${accountAddress}...`);
    } catch(e: unknown) {
      if (e instanceof Error) {
        setGeneralStatus(`Invalid address for revoke role: ${e.message}`);
      } else {
        setGeneralStatus('An unknown error occurred while revoking role.');
      }
    }
  };

  const handleRenounceRole = () => {
    if (!renounceRoleSelected) { setGeneralStatus('Please select a role to renounce.'); return; }
    if (!connectedAddress) { setGeneralStatus('Please connect your wallet to renounce a role.'); return; }
    handleWrite('renounceRole', [renounceRoleSelected as `0x${string}`, connectedAddress], `Renouncing ${availableRoles.find(r=>r.hash === renounceRoleSelected)?.name || renounceRoleSelected} for ${connectedAddress}...`);
  };

  const handlePauseToken = () => {
    handleWrite('pause', [], 'Pausing token contract...');
  };

  const handleUnpauseToken = () => {
    handleWrite('unpause', [], 'Unpausing token contract...');
  };

  const handleSetProtocolTreasury = () => {
    if (!newTreasuryAddress) { setGeneralStatus('Please enter the new treasury address.'); return; }
    try {
      const address = newTreasuryAddress as Address;
      handleWrite('setProtocolTreasury', [address], `Setting protocol treasury to ${address}...`);
    } catch (e: unknown) {
      if (e instanceof Error) {
        setGeneralStatus(`Invalid address for new treasury: ${e.message}`);
      } else {
        setGeneralStatus('An unknown error occurred while setting protocol treasury.');
      }
    }
  };

  const handleTransferFromTreasury = () => {
    if (!transferTreasuryTo) { setGeneralStatus('Please enter the recipient address.'); return; }
    if (!transferTreasuryAmount) { setGeneralStatus('Please enter the amount to transfer.'); return; }
    try {
      const toAddress = transferTreasuryTo as Address;
      const amountWei = parseUnits(transferTreasuryAmount, decimals);
      handleWrite('transferFromTreasury', [toAddress, amountWei], `Transferring ${transferTreasuryAmount} ${tokenSymbol} from treasury to ${toAddress}...`);
    } catch (e: unknown) {
      if (e instanceof Error) {
        setGeneralStatus(`Invalid input for treasury transfer: ${e.message}`);
      } else {
        setGeneralStatus('An unknown error occurred during treasury transfer.');
      }
    }
  };

  const handleRetireFromTreasury = () => {
    if (!retireTreasuryAmount) { setGeneralStatus('Please enter the amount to retire.'); return; }
    if (!retireTreasuryReason) { setGeneralStatus('Please enter a reason for retirement.'); return; }
    try {
      const amountWei = parseUnits(retireTreasuryAmount, decimals);
      handleWrite('retireFromTreasury', [amountWei, retireTreasuryReason], `Retiring ${retireTreasuryAmount} ${tokenSymbol} from treasury. Reason: ${retireTreasuryReason}...`);
    } catch (e: unknown) {
      if (e instanceof Error) {
        setGeneralStatus(`Invalid amount for treasury retirement: ${e.message}`);
      } else {
        setGeneralStatus('An unknown error occurred during treasury retirement.');
      }
    }
  };

  // --- Balance Of Handler ---
  const handleFetchBalance = () => {
    if (!CARBON_CREDIT_TOKEN_ADDRESS) { setFetchedBalance('Contract address not set in .env'); return; }
    if (balanceAccountAddress) { fetchBalance(); } 
    else { setFetchedBalance("Please enter an account address."); }
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
    fetchRoleAdmin(); // Fetch role admin for the selected role regardless of account
  };


  // --- Transaction Status Effect ---
  useEffect(() => {
    const statusSetter = setGeneralStatus; // Using general status for now
    if (isConfirmed) {
      statusSetter(`Transaction successful! Hash: ${writeHash}`);
      refetchAll();
    }
    if (writeError && !isConfirmed) { statusSetter(`Error: ${writeError.message}`); }
    if (receiptError && !isConfirmed) { statusSetter(`Receipt Error: ${receiptError.message}`); }
  }, [isConfirmed, writeHash, writeError, receiptError, refetchAll]);

  if (!CARBON_CREDIT_TOKEN_ADDRESS) {
    return <p className="text-red-500">Error: NEXT_PUBLIC_CARBON_CREDIT_TOKEN_ADDRESS is not set in your .env.local file.</p>;
  }

  return (
    <div className="space-y-8 p-4 border rounded-lg shadow-md bg-white">
      <h2 className="text-2xl font-semibold text-black">Carbon Credit Token Admin <span className="text-sm text-gray-600">({CARBON_CREDIT_TOKEN_ADDRESS})</span></h2>

      {/* Token Info Section */}
      <div className="p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black mb-2">Token Information</h3>
        <p className="text-black"><strong>Name:</strong> {tokenName || 'Loading...'}</p>
        <p className="text-black"><strong>Symbol:</strong> {tokenSymbol || 'Loading...'}</p>
        <p className="text-black"><strong>Decimals:</strong> {decimals}</p>
        <p className="text-black"><strong>Total Supply:</strong> {totalSupply ? `${totalSupply} ${tokenSymbol}` : 'Loading...'}</p>
        <p className="text-black"><strong>Protocol Treasury:</strong> {protocolTreasury === zeroAddress ? 'Not Set' : protocolTreasury}</p>
        <p className="text-black"><strong>Paused:</strong> {isTokenPaused === null ? 'Loading...' : isTokenPaused ? 'Yes' : 'No'}</p>
        <button onClick={refetchAll} className="mt-2 px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">Refresh All Data</button>
      </div>

      {/* Role Management Section */}
      <div className="p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black mb-3">Role Management</h3>
        
        {/* Grant Role */}
        <div className="space-y-3 mb-6 p-3 border-t pt-4">
          <h4 className="text-lg font-medium text-black">Grant Role</h4>
          <div>
            <label htmlFor="grantRoleSelectCCT" className="block text-sm font-medium text-black">Role:</label>
            <select
              id="grantRoleSelectCCT"
              value={grantRoleSelected}
              onChange={(e) => setGrantRoleSelected(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-black bg-white"
            >
              <option value="">-- Select Role --</option>
              {availableRoles.map(role => <option key={role.hash} value={role.hash}>{role.name} ({role.hash?.substring(0,6)}...)</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="grantRoleAccountCCT" className="block text-sm font-medium text-black">Account Address:</label>
            <input
              type="text"
              id="grantRoleAccountCCT"
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
            <label htmlFor="revokeRoleSelectCCT" className="block text-sm font-medium text-black">Role:</label>
            <select
              id="revokeRoleSelectCCT"
              value={revokeRoleSelected}
              onChange={(e) => setRevokeRoleSelected(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-black bg-white"
            >
              <option value="">-- Select Role --</option>
              {availableRoles.map(role => <option key={role.hash} value={role.hash}>{role.name} ({role.hash?.substring(0,6)}...)</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="revokeRoleAccountCCT" className="block text-sm font-medium text-black">Account Address:</label>
            <input
              type="text"
              id="revokeRoleAccountCCT"
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
            <label htmlFor="renounceRoleSelectCCT" className="block text-sm font-medium text-black">Role:</label>
            <select
              id="renounceRoleSelectCCT"
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
            <label htmlFor="checkRoleSelectCCT" className="block text-sm font-medium text-black">Role:</label>
            <select
              id="checkRoleSelectCCT"
              value={checkRoleSelected}
              onChange={(e) => { setCheckRoleSelected(e.target.value); setHasRoleResult(null); setRoleAdminResult(null); }}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-black bg-white"
            >
              <option value="">-- Select Role --</option>
              {availableRoles.map(role => <option key={role.hash} value={role.hash}>{role.name} ({role.hash?.substring(0,6)}...)</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="checkRoleAccountCCT" className="block text-sm font-medium text-black">Account Address (for hasRole):</label>
            <input
              type="text"
              id="checkRoleAccountCCT"
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


      {/* BalanceOf Section */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Check Balance</h3>
        <div>
          <label htmlFor="balanceAccountAddressCCT" className="block text-sm font-medium text-black">Account Address:</label>
          <input
            type="text"
            id="balanceAccountAddressCCT"
            value={balanceAccountAddress}
            onChange={(e) => { setBalanceAccountAddress(e.target.value); setFetchedBalance(null); }}
            placeholder="0x..."
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
          />
        </div>
        <button
          onClick={handleFetchBalance}
          disabled={isBalanceLoading || !balanceAccountAddress}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
        >
          {isBalanceLoading ? 'Fetching...' : 'Get Balance'}
        </button>
        {balanceError && <p className="text-red-600 text-sm font-medium mt-2">Error fetching balance: {balanceError.message}</p>}
        {fetchedBalance !== null && <p className="text-sm mt-2 text-black"><strong>Balance:</strong> {fetchedBalance} {tokenSymbol}</p>}
      </div>

      {/* MintToTreasury Section */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Mint to Treasury</h3>
        <p className="text-sm text-gray-700">Only callable by addresses with the MINTER_ROLE.</p>
        <div>
          <label htmlFor="mintAmountCCT" className="block text-sm font-medium text-black">Amount ({tokenSymbol}):</label>
          <input
            type="text"
            id="mintAmountCCT"
            value={mintAmount}
            onChange={(e) => setMintAmount(e.target.value)}
            placeholder={`e.g., 1000`}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
          />
        </div>
        <button
          onClick={handleMintToTreasury}
          disabled={isWritePending || isConfirming || !mintAmount}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
        >
          {isWritePending ? 'Submitting...' : isConfirming ? 'Confirming...' : 'Mint to Treasury'}
        </button>
      </div>
      
      {/* Pause/Unpause Control */}
      <div className="p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black mb-3">Pause Control</h3>
        <p className="text-sm text-gray-700 mb-2">Requires PAUSER_ROLE.</p>
        <div className="flex space-x-4">
            <button
              onClick={handlePauseToken}
              disabled={isWritePending || isConfirming || isTokenPaused === true}
              className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
            >
              Pause Token
            </button>
            <button
              onClick={handleUnpauseToken}
              disabled={isWritePending || isConfirming || isTokenPaused === false}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
            >
              Unpause Token
            </button>
        </div>
      </div>

      {/* Treasury Management Section */}
      <div className="p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black mb-3">Treasury Management</h3>
        
        {/* Set Protocol Treasury */}
        <div className="space-y-3 mb-6 p-3 border-t pt-4">
          <h4 className="text-lg font-medium text-black">Set Protocol Treasury</h4>
          <p className="text-sm text-gray-700">Requires DEFAULT_ADMIN_ROLE.</p>
          <div>
            <label htmlFor="newTreasuryAddressCCT" className="block text-sm font-medium text-black">New Treasury Address:</label>
            <input
              type="text"
              id="newTreasuryAddressCCT"
              value={newTreasuryAddress}
              onChange={(e) => setNewTreasuryAddress(e.target.value)}
              placeholder="0x..."
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleSetProtocolTreasury}
            disabled={isWritePending || isConfirming || !newTreasuryAddress}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Set Treasury
          </button>
        </div>

        {/* Transfer From Treasury */}
        <div className="space-y-3 mb-6 p-3 border-t pt-4">
          <h4 className="text-lg font-medium text-black">Transfer From Treasury</h4>
          <p className="text-sm text-gray-700">Requires TREASURY_MANAGER_ROLE.</p>
          <div>
            <label htmlFor="transferTreasuryToCCT" className="block text-sm font-medium text-black">To Address:</label>
            <input
              type="text"
              id="transferTreasuryToCCT"
              value={transferTreasuryTo}
              onChange={(e) => setTransferTreasuryTo(e.target.value)}
              placeholder="0x..."
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <div>
            <label htmlFor="transferTreasuryAmountCCT" className="block text-sm font-medium text-black">Amount ({tokenSymbol}):</label>
            <input
              type="text"
              id="transferTreasuryAmountCCT"
              value={transferTreasuryAmount}
              onChange={(e) => setTransferTreasuryAmount(e.target.value)}
              placeholder={`e.g., 500`}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleTransferFromTreasury}
            disabled={isWritePending || isConfirming || !transferTreasuryTo || !transferTreasuryAmount}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Transfer From Treasury
          </button>
        </div>

        {/* Retire From Treasury */}
        <div className="space-y-3 p-3 border-t pt-4">
          <h4 className="text-lg font-medium text-black">Retire From Treasury</h4>
          <p className="text-sm text-gray-700">Requires TREASURY_MANAGER_ROLE.</p>
          <div>
            <label htmlFor="retireTreasuryAmountCCT" className="block text-sm font-medium text-black">Amount ({tokenSymbol}):</label>
            <input
              type="text"
              id="retireTreasuryAmountCCT"
              value={retireTreasuryAmount}
              onChange={(e) => setRetireTreasuryAmount(e.target.value)}
              placeholder={`e.g., 100`}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <div>
            <label htmlFor="retireTreasuryReasonCCT" className="block text-sm font-medium text-black">Reason:</label>
            <input
              type="text"
              id="retireTreasuryReasonCCT"
              value={retireTreasuryReason}
              onChange={(e) => setRetireTreasuryReason(e.target.value)}
              placeholder="e.g., Offset for Project X"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleRetireFromTreasury}
            disabled={isWritePending || isConfirming || !retireTreasuryAmount || !retireTreasuryReason}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Retire From Treasury
          </button>
        </div>
      </div>


      {/* General Status Message */}
      {generalStatus && (
        <div className={`mt-4 p-3 rounded ${writeError || receiptError ? 'bg-red-100 text-red-700' : isConfirmed ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
          <p className="text-sm font-medium">{generalStatus}</p>
        </div>
      )}

    </div>
  );
} 