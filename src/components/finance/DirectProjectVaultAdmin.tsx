"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useWatchContractEvent } from 'wagmi';
import { Address, Abi, keccak256, toHex, formatUnits, Hex, decodeEventLog, parseUnits } from 'viem';
import directProjectVaultAbiJson from '@/abis/DirectProjectVault.json';
import constantsAbiJson from '@/abis/Constants.json';

// Event Argument Types
type RoleGrantedEventArgs = { role: Hex; account: Address; sender: Address; };
type RoleRevokedEventArgs = { role: Hex; account: Address; sender: Address; };
type FundingClosedEventArgs = { projectId: bigint; totalAssetsInvested: bigint; }; 
type LoanClosedEventArgs = { projectId: bigint; finalPrincipalRepaid: bigint; finalInterestAccrued: bigint; };
type RiskParamsUpdatedEventArgs = { projectId: bigint; newAprBps: number; };

const directProjectVaultAbi = directProjectVaultAbiJson.abi;
const constantsAbi = constantsAbiJson.abi as Abi;

// Helper functions (getRoleNamesFromAbi, createRoleHashMap) - can be imported from a shared util if they become common
const getRoleNamesFromAbi = (abi: Abi): string[] => {
  return abi
    .filter(item => item.type === 'function' && item.outputs?.length === 1 && item.outputs[0].type === 'bytes32' && item.inputs?.length === 0)
    .map(item => (item as { name: string }).name);
};

const createRoleHashMap = (roleNames: string[]): { [hash: Hex]: string } => {
  const hashMap: { [hash: Hex]: string } = {};
  roleNames.forEach(name => {
    try { hashMap[keccak256(toHex(name))] = name; } catch (e) { console.error(`Error hashing role ${name}:`, e); }
  });
  hashMap['0x0000000000000000000000000000000000000000000000000000000000000000'] = 'DEFAULT_ADMIN_ROLE';
  return hashMap;
};

export function DirectProjectVaultAdmin() {
  const {} = useAccount();
  const { data: writeHash, writeContract, isPending: isWritePending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash: writeHash });

  const [vaultAddress, setVaultAddress] = useState<Address | undefined>(undefined);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Role Management
  const [roleNames, setRoleNames] = useState<string[]>([]);
  const [roleHashMap, setRoleHashMap] = useState<{ [hash: Hex]: string }>({});
  const [selectedRoleName, setSelectedRoleName] = useState<string>('');
  const [selectedRoleBytes32, setSelectedRoleBytes32] = useState<Hex | null>(null);
  const [roleManagementAddress, setRoleManagementAddress] = useState<string>(''); // For grant/revoke/check
  const [roleEvents, setRoleEvents] = useState<(RoleGrantedEventArgs | RoleRevokedEventArgs)[]>([]);
  const [hasRoleResultVault, setHasRoleResultVault] = useState<boolean | string | null>(null);

  // Vault State & Data
  const [vaultDetails, setVaultDetails] = useState<{
    totalAssetsInvested: string;
    isFundingClosed: boolean | undefined;
    isLoanClosed: boolean | undefined;
    currentAprBps: bigint | undefined;
  } | null>(null);
  const [vaultActionEvents, setVaultActionEvents] = useState<(FundingClosedEventArgs | LoanClosedEventArgs | RiskParamsUpdatedEventArgs)[]>([]); 

  // New state for admin actions
  const [defaultWriteOffAmount, setDefaultWriteOffAmount] = useState<string>('');
  const [newAprBps, setNewAprBps] = useState<string>('');

  // --- Read Hooks for Vault Details (dynamically enabled) ---
  const { data: totalAssetsData, refetch: fetchTotalAssets, isLoading: isLoadingTotalAssets } = useReadContract({
    address: vaultAddress,
    abi: directProjectVaultAbi,
    functionName: 'getTotalAssetsInvested',
    query: { enabled: !!vaultAddress }
  });
  const { data: isFundingClosedData, refetch: fetchIsFundingClosed } = useReadContract({
    address: vaultAddress, abi: directProjectVaultAbi, functionName: 'isFundingClosed', query: { enabled: !!vaultAddress }
  });
  const { data: isLoanClosedData, refetch: fetchIsLoanClosed } = useReadContract({
    address: vaultAddress, abi: directProjectVaultAbi, functionName: 'isLoanClosed', query: { enabled: !!vaultAddress }
  });
  const { data: currentAprData, refetch: fetchCurrentApr } = useReadContract({
    address: vaultAddress, abi: directProjectVaultAbi, functionName: 'currentAprBps', query: { enabled: !!vaultAddress }
  });

  const { data: hasRoleDataVault, refetch: fetchHasRoleVault, isLoading: isHasRoleLoadingVault } = useReadContract({
    address: vaultAddress,
    abi: directProjectVaultAbi,
    functionName: 'hasRole',
    args: selectedRoleBytes32 && roleManagementAddress ? [selectedRoleBytes32, roleManagementAddress as Address] : undefined,
    query: { enabled: false },
  });

  useEffect(() => {
    const names = getRoleNamesFromAbi(constantsAbi);
    setRoleNames(names);
    setRoleHashMap(createRoleHashMap(names));
  }, []);

  useEffect(() => {
    if (selectedRoleName) {
      try {
        setSelectedRoleBytes32(selectedRoleName === 'DEFAULT_ADMIN_ROLE' ? '0x0000000000000000000000000000000000000000000000000000000000000000' : keccak256(toHex(selectedRoleName)));
      } catch (e) { console.error("Error computing role hash:", e); setSelectedRoleBytes32(null); }
    } else { setSelectedRoleBytes32(null); }
  }, [selectedRoleName]);

  useEffect(() => {
    if (hasRoleDataVault !== undefined) {
      setHasRoleResultVault(hasRoleDataVault as boolean);
    } else if (isHasRoleLoadingVault === false && hasRoleDataVault === undefined) { // Handle no data after load
        setHasRoleResultVault(null);
    }
  }, [hasRoleDataVault, isHasRoleLoadingVault]);
  
  // --- Event Watchers (scoped to vaultAddress if set) ---
  useWatchContractEvent({
    address: vaultAddress, 
    abi: directProjectVaultAbi,
    eventName: 'RoleGranted',
    onLogs(logs) {
        logs.forEach(log => {
            try {
                const decoded = decodeEventLog({
                    abi: directProjectVaultAbi,
                    data: log.data,
                    topics: log.topics,
                    eventName: 'RoleGranted'
                });
                const args = decoded.args as unknown as RoleGrantedEventArgs;
                const roleName = roleHashMap[args.role] || args.role;
                setRoleEvents(prev => [...prev, args]);
                setStatusMessage(`Vault RoleGranted: Role ${roleName} for ${args.account}`);
            } catch (e) {
                console.error("Error decoding vault RoleGranted event:", e);
                setStatusMessage("Error processing vault RoleGranted event.");
            }
        });
    },
    onError: (error) => console.error(`Error watching vault RoleGranted:`, error)
  });

  useWatchContractEvent({
    address: vaultAddress, 
    abi: directProjectVaultAbi,
    eventName: 'RoleRevoked',
    onLogs(logs) {
        logs.forEach(log => {
            try {
                const decoded = decodeEventLog({
                    abi: directProjectVaultAbi,
                    data: log.data,
                    topics: log.topics,
                    eventName: 'RoleRevoked'
                });
                const args = decoded.args as unknown as RoleRevokedEventArgs;
                const roleName = roleHashMap[args.role] || args.role;
                setRoleEvents(prev => [...prev, args]);
                setStatusMessage(`Vault RoleRevoked: Role ${roleName} for ${args.account}`);
            } catch (e) {
                console.error("Error decoding vault RoleRevoked event:", e);
                setStatusMessage("Error processing vault RoleRevoked event.");
            }
        });
    },
    onError: (error) => console.error(`Error watching vault RoleRevoked:`, error)
  });

  useWatchContractEvent({
    address: vaultAddress, abi: directProjectVaultAbi, eventName: 'FundingClosed',
    onLogs(logs) {
        logs.forEach(log => {
            try {
                const decoded = decodeEventLog({
                    abi: directProjectVaultAbi,
                    data: log.data,
                    topics: log.topics,
                    eventName: 'FundingClosed'
                });
                const args = decoded.args as unknown as FundingClosedEventArgs;
                setVaultActionEvents(prev => [...prev, args]);
                setStatusMessage(`Vault FundingClosed: Total Invested ${formatUnits(args.totalAssetsInvested, 6)} USDC`);
                refetchVaultDetails();
            } catch (e) {
                console.error("Error decoding vault FundingClosed event:", e);
                setStatusMessage("Error processing vault FundingClosed event.");
            }
        });
    }
  });

  useWatchContractEvent({
    address: vaultAddress, abi: directProjectVaultAbi, eventName: 'LoanClosed',
    onLogs(logs) {
        logs.forEach(log => {
            try {
                const decoded = decodeEventLog({
                    abi: directProjectVaultAbi,
                    data: log.data,
                    topics: log.topics,
                    eventName: 'LoanClosed'
                });
                const args = decoded.args as unknown as LoanClosedEventArgs;
                setVaultActionEvents(prev => [...prev, args]);
                setStatusMessage(`Vault LoanClosed: Final Principal ${formatUnits(args.finalPrincipalRepaid, 6)}, Final Interest ${formatUnits(args.finalInterestAccrued, 6)}`);
                refetchVaultDetails();
            } catch (e: unknown) {
                console.error("Error decoding vault LoanClosed event:", e);
                setStatusMessage("Error processing vault LoanClosed event.");
            }
        });
    }
  });

  useWatchContractEvent({
    address: vaultAddress, abi: directProjectVaultAbi, eventName: 'RiskParamsUpdated',
    onLogs(logs) {
        logs.forEach(log => {
            try {
                const decoded = decodeEventLog({ abi: directProjectVaultAbi, data: log.data, topics: log.topics, eventName: 'RiskParamsUpdated' });
                const args = decoded.args as unknown as RiskParamsUpdatedEventArgs;
                setVaultActionEvents(prev => [...prev, args]);
                setStatusMessage(`Vault RiskParamsUpdated: New APR ${args.newAprBps}bps`);
                refetchVaultDetails();
            } catch (e: unknown) {
                console.error("Error decoding vault RiskParamsUpdated event:", e);
                setStatusMessage("Error processing vault RiskParamsUpdated event.");
            }
        });
    }
  });

  const refetchVaultDetails = useCallback(() => {
    if (vaultAddress) {
      fetchTotalAssets();
      fetchIsFundingClosed();
      fetchIsLoanClosed();
      fetchCurrentApr();
      // Add other refetches here
    }
  }, [vaultAddress, fetchTotalAssets, fetchIsFundingClosed, fetchIsLoanClosed, fetchCurrentApr]);

  useEffect(() => {
    if (vaultAddress) refetchVaultDetails();
    else setVaultDetails(null); // Clear details if no vault address
  }, [vaultAddress, refetchVaultDetails]);

  useEffect(() => {
    if (totalAssetsData !== undefined && isFundingClosedData !== undefined && isLoanClosedData !== undefined && currentAprData !== undefined) {
        setVaultDetails({
            totalAssetsInvested: formatUnits(totalAssetsData as bigint, 6),
            isFundingClosed: isFundingClosedData as boolean,
            isLoanClosed: isLoanClosedData as boolean,
            currentAprBps: currentAprData as bigint,
            // Add other details as they are fetched
        });
    }
  }, [totalAssetsData, isFundingClosedData, isLoanClosedData, currentAprData]);


  const handleWriteToVault = (functionName: string, args: unknown[], successMessage?: string) => {
    if (!vaultAddress) { setStatusMessage('Vault address not set.'); return; }
    writeContract({
      address: vaultAddress,
      abi: directProjectVaultAbi,
      functionName,
      args,
    }, {
      onSuccess: () => { setStatusMessage(successMessage || 'Transaction submitted...'); refetchVaultDetails(); },
      onError: (error) => setStatusMessage(`Submission Error: ${error.message}`),
    });
  };
  
  const handleVaultGrantRole = () => {
    if (!selectedRoleBytes32 || !roleManagementAddress) { setStatusMessage('Role or address missing.'); return; }
    handleWriteToVault('grantRole', [selectedRoleBytes32, roleManagementAddress as Address], `Granting ${selectedRoleName} role on vault...`);
  };

  const handleVaultRevokeRole = () => {
    if (!selectedRoleBytes32 || !roleManagementAddress) { setStatusMessage('Role or address to revoke from missing.'); return; }
    handleWriteToVault('revokeRole', [selectedRoleBytes32, roleManagementAddress as Address], `Revoking ${selectedRoleName} role on vault...`);
  };

  const handleVaultCheckHasRole = () => {
    if (!selectedRoleBytes32 || !roleManagementAddress) { 
        setStatusMessage('Role or account for vault role check missing.'); 
        setHasRoleResultVault(null);
        return; 
    }
    setHasRoleResultVault(null); // Clear previous result
    fetchHasRoleVault();
  };

  const handleCloseFundingManually = () => {
    handleWriteToVault('closeFundingManually', [], 'Closing funding manually...');
  };

  const handleCloseLoan = () => {
    handleWriteToVault('closeLoan', [], 'Closing loan...');
  };

  const handleLoanDefault = () => {
    if (!defaultWriteOffAmount) { setStatusMessage('Write-off amount is required.'); return; }
    try {
        const amountWei = parseUnits(defaultWriteOffAmount, 6); // Assuming USDC decimals
        handleWriteToVault('handleLoanDefault', [amountWei], 'Handling loan default...');
    } catch (e: unknown) {
        if (e instanceof Error) setStatusMessage(`Error: ${e.message}`);
        else setStatusMessage('An unknown error occurred.');
    }
  };

  const handleUpdateRiskParams = () => {
    if (!newAprBps) { setStatusMessage('New APR is required.'); return; }
    try {
        const apr = parseInt(newAprBps, 10);
        if (isNaN(apr)) { setStatusMessage('Invalid APR value.'); return; }
        handleWriteToVault('updateRiskParams', [apr], 'Updating risk parameters...');
    } catch (e: unknown) {
        if (e instanceof Error) setStatusMessage(`Error: ${e.message}`);
        else setStatusMessage('An unknown error occurred.');
    }
  };

  useEffect(() => {
    if (isConfirmed) { setStatusMessage(`Vault Tx Successful: ${writeHash?.substring(0,10)}...`); refetchVaultDetails(); }
    if (writeError) { setStatusMessage(`Vault Tx Error: ${writeError.message}`); }
    if (receiptError) { setStatusMessage(`Vault Receipt Error: ${receiptError.message}`); }
  }, [isConfirmed, writeHash, writeError, receiptError, refetchVaultDetails]);

  return (
    <div className="space-y-8 p-4 border rounded-lg shadow-md bg-white">
      <h2 className="text-2xl font-semibold text-black">Direct Project Vault Admin</h2>
      <div>
        <label htmlFor="vaultAddressInput" className="block text-sm font-medium text-black">Vault Address to Manage:</label>
        <input
          type="text"
          id="vaultAddressInput"
          value={vaultAddress || ''}
          onChange={(e) => setVaultAddress(e.target.value as Address)}
          placeholder="0x... Enter DirectProjectVault address"
          className="input-style w-full text-black"
        />
      </div>

      {statusMessage && <p className={`text-sm p-2 my-2 rounded ${writeError || receiptError ? 'bg-red-100 text-red-700' : isConfirmed ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{statusMessage}</p>}
      
      {!vaultAddress && <p className="text-yellow-600">Please enter a Vault Address to manage.</p>}

      {vaultAddress && (
        <>
          {/* Vault Details Display */}
          <div className="p-4 border rounded bg-gray-50">
            <h3 className="text-xl font-medium text-black mb-2">Vault Details ({vaultAddress.substring(0,6)}...{vaultAddress.substring(vaultAddress.length - 4)})</h3>
            {isLoadingTotalAssets || !vaultDetails ? <p>Loading vault details...</p> : (
                <div className="text-sm">
                    <p>Total Assets Invested: {vaultDetails.totalAssetsInvested} USDC</p>
                    <p>Funding Closed: {vaultDetails.isFundingClosed?.toString()}</p>
                    <p>Loan Closed: {vaultDetails.isLoanClosed?.toString()}</p>
                    <p>Current APR (BPS): {vaultDetails.currentAprBps?.toString()}</p>
                    {/* Add more details here from other read hooks */}
                </div>
            )}
            <button onClick={refetchVaultDetails} className="button-style bg-blue-500 hover:bg-blue-600 mt-2 text-xs">Refresh Details</button>
          </div>

          {/* Vault Actions */}
          <div className="space-y-4 p-4 border rounded bg-gray-50">
            <h3 className="text-xl font-medium text-black">Vault Actions</h3>
            <p className="text-sm text-gray-700">Requires DEFAULT_ADMIN_ROLE on this specific vault.</p>
            <div className="flex space-x-2">
                <button onClick={handleCloseFundingManually} disabled={isWritePending || isConfirming || vaultDetails?.isFundingClosed} className="button-style bg-yellow-500 hover:bg-yellow-600">Close Funding Manually</button>
                <button onClick={handleCloseLoan} disabled={isWritePending || isConfirming || vaultDetails?.isLoanClosed || !vaultDetails?.isFundingClosed} className="button-style bg-green-500 hover:bg-green-600">Close Loan (if repaid)</button>
            </div>
            <div className="mt-4 pt-4 border-t">
                <label className="block text-sm font-medium">Handle Loan Default (Write-off Amount):</label>
                <input type="text" value={defaultWriteOffAmount} onChange={e => setDefaultWriteOffAmount(e.target.value)} placeholder="Amount to write off (USDC)" className="input-style text-black" />
                <button onClick={handleLoanDefault} disabled={isWritePending || isConfirming || !defaultWriteOffAmount} className="button-style bg-red-600 hover:bg-red-700 mt-1">Handle Default</button>
            </div>
          </div>

          {/* Update Risk Params */}
          <div className="space-y-4 p-4 border rounded bg-gray-50">
            <h3 className="text-xl font-medium text-black">Update Risk Parameters</h3>
            <p className="text-sm text-gray-700">Requires RISK_ORACLE_ROLE on this specific vault.</p>
            <div>
              <label className="block text-sm font-medium">New APR (BPS):</label>
              <input type="number" value={newAprBps} onChange={e => setNewAprBps(e.target.value)} placeholder="e.g., 1250 for 12.5%" className="input-style text-black" />
            </div>
            <button onClick={handleUpdateRiskParams} disabled={isWritePending || isConfirming || !newAprBps} className="button-style bg-purple-500 hover:bg-purple-600">Update Risk Params</button>
          </div>

          {/* Role Management for this Vault */}
          <div className="space-y-4 p-4 border rounded bg-gray-50">
            <h3 className="text-xl font-medium text-black">Role Management (for this Vault)</h3>
            <p className="text-sm text-gray-700">Manage roles like DEFAULT_ADMIN_ROLE, PAUSER_ROLE for this specific vault instance ({vaultAddress.substring(0,6)}...).</p>
            <div>
                <label className="block text-sm font-medium">Select Role:</label>
                <select value={selectedRoleName} onChange={(e) => setSelectedRoleName(e.target.value)} className="input-style">
                    <option value="">-- Select Role --</option>
                    <option value="DEFAULT_ADMIN_ROLE">DEFAULT_ADMIN_ROLE</option>
                    {roleNames.filter(name => name ==='PAUSER_ROLE' /* Add other vault-specific roles */).map(name => <option key={name} value={name}>{name}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium">Address for Role Action:</label>
                <input type="text" value={roleManagementAddress} onChange={(e) => setRoleManagementAddress(e.target.value)} placeholder="0x..." className="input-style text-black" />
            </div>
            <div className="flex space-x-2">
                <button onClick={handleVaultGrantRole} disabled={!selectedRoleBytes32 || !roleManagementAddress || isWritePending || isConfirming} className="button-style bg-orange-500 hover:bg-orange-600">Grant Role on Vault</button>
                <button onClick={handleVaultRevokeRole} disabled={!selectedRoleBytes32 || !roleManagementAddress || isWritePending || isConfirming} className="button-style bg-red-500 hover:bg-red-600">Revoke Role on Vault</button>
            </div>
             <div>
                <button onClick={handleVaultCheckHasRole} disabled={!selectedRoleBytes32 || !roleManagementAddress || isHasRoleLoadingVault} className="button-style bg-teal-500 hover:bg-teal-600 mt-1">
                    {isHasRoleLoadingVault ? 'Checking...' : 'Check Role on Vault'}
                </button>
                {hasRoleResultVault !== null && <p className="text-sm mt-1">Has Role on Vault: {hasRoleResultVault.toString()}</p>}
            </div>
          </div>

          {/* Event Logs for this Vault */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border rounded bg-gray-50">
              <h3 className="text-lg font-medium text-black mb-2">Recent Vault Role Events</h3>
              {roleEvents.length === 0 && <p className="text-xs text-gray-500">No role events for this vault.</p>}
              <ul className="text-xs space-y-1">
                {roleEvents
                .slice(-5).reverse().map((event: RoleGrantedEventArgs | RoleRevokedEventArgs, i) => {
                  const eventName = 'sender' in event ? 'RoleGranted' : 'RoleRevoked';
                  return <li key={`vrole-${i}`}>{`${eventName}: ${roleHashMap[event.role] || event.role} to/from ${event.account}`}</li>
                })}
              </ul>
            </div>
            <div className="p-4 border rounded bg-gray-50">
              <h3 className="text-lg font-medium text-black mb-2">Recent Vault Action Events</h3>
              {vaultActionEvents.length === 0 && <p className="text-xs text-gray-500">No action events for this vault.</p>}
              <ul className="text-xs space-y-1">
                {vaultActionEvents
                .slice(-5).reverse().map((event, i) => {
                  let eventName = 'Unknown Event';
                  let eventDetails = '';
                  if ('totalAssetsInvested' in event) {
                    eventName = 'FundingClosed';
                    eventDetails = `Total Invested: ${formatUnits(event.totalAssetsInvested, 6)} USDC`;
                  } else if ('finalPrincipalRepaid' in event) {
                    eventName = 'LoanClosed';
                    eventDetails = `Final Principal: ${formatUnits(event.finalPrincipalRepaid, 6)}`;
                  } else if ('newAprBps' in event) {
                      eventName = 'RiskParamsUpdated';
                      eventDetails = `New APR: ${event.newAprBps}bps`;
                  }
                  return <li key={`vaction-${i}`}>{`${eventName}: ${eventDetails}`}</li>
                })}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
} 