"use client";

import React, { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useWatchContractEvent } from 'wagmi';
import { Address, Abi, decodeEventLog, Hex, keccak256, toHex } from 'viem';
import liquidityPoolManagerAbiJson from '@/abis/LiquidityPoolManager.json';
import constantsAbiJson from '@/abis/Constants.json';

// Define proper types for the event args
type RoleGrantedEventArgs = {
  role: Hex; // bytes32
  account: Address;
  sender: Address;
};
// Add other event types if specific to LiquidityPoolManager are needed
type RoleRevokedEventArgs = {
  role: Hex;
  account: Address;
  sender: Address;
};

type PoolCreatedEventArgs = {
  poolId: bigint;
  name: string;
  creator: Address;
};

type PoolRiskLevelSetEventArgs = { // Assuming an event for this based on guide, confirm ABI
    poolId: bigint;
    riskLevel: number; // uint16
    baseAprBps: number; // uint16
};

type LoanDefaultedEventArgs = {
  poolId: bigint;
  projectId: bigint;
  developer: Address;
  amountDefaulted: bigint;
  amountSlashed: bigint;
  remainingPoolAssets: bigint;
};

const LIQUIDITY_POOL_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_LIQUIDITY_POOL_MANAGER_ADDRESS as Address | undefined;

const liquidityPoolManagerAbi = liquidityPoolManagerAbiJson.abi;
const constantsAbi = constantsAbiJson.abi as Abi;

const getRoleNamesFromAbi = (abi: Abi): string[] => {
  return abi
    .filter(item => item.type === 'function' && item.outputs?.length === 1 && item.outputs[0].type === 'bytes32' && item.inputs?.length === 0)
    .map(item => (item as { name: string }).name);
};

// Helper to create a mapping from role hash to role name
const createRoleHashMap = (roleNames: string[]): { [hash: Hex]: string } => {
  const hashMap: { [hash: Hex]: string } = {};
  roleNames.forEach(name => {
    try {
      hashMap[keccak256(toHex(name))] = name;
    } catch (e) {
      console.error(`Error creating hash for role ${name}:`, e);
    }
  });
  hashMap['0x0000000000000000000000000000000000000000000000000000000000000000'] = 'DEFAULT_ADMIN_ROLE (Direct 0x00)';
  return hashMap;
};

export function LiquidityPoolManagerAdmin() {
  const { address: connectedAddress } = useAccount();
  const { data: writeHash, writeContract, isPending: isWritePending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash: writeHash });

  // State for contract data
  const [isPaused, setIsPaused] = useState<boolean | null>(null);
  // Add other specific states for LiquidityPoolManager if needed
  // For example, to display a list of created pools or their details if readable from manager

  // State for Role Granting
  const [roleNames, setRoleNames] = useState<string[]>([]);
  const [selectedRoleName, setSelectedRoleName] = useState<string>('');
  const [selectedRoleBytes32, setSelectedRoleBytes32] = useState<Hex | null>(null);
  const [grantRoleToAddress, setGrantRoleToAddress] = useState<string>('');
  const [revokeRoleFromAddress, setRevokeRoleFromAddress] = useState<string>('');
  const [roleEvents, setRoleEvents] = useState<(RoleGrantedEventArgs | RoleRevokedEventArgs)[]>([]);
  const [poolManagementEvents, setPoolManagementEvents] = useState<(PoolCreatedEventArgs | PoolRiskLevelSetEventArgs | LoanDefaultedEventArgs)[]>([]);
  const [roleHashMap, setRoleHashMap] = useState<{ [hash: Hex]: string }>({});
  const [statusMessage, setStatusMessage] = useState<string>('');

  // State for HasRole Check
  const [checkRoleName, setCheckRoleName] = useState<string>('');
  const [checkRoleBytes32, setCheckRoleBytes32] = useState<Hex | null>(null);
  const [checkRoleAccountAddress, setCheckRoleAccountAddress] = useState<string>('');
  const [hasRoleResult, setHasRoleResult] = useState<boolean | string | null>(null);
  const [hasRoleStatus, setHasRoleStatus] = useState<string>('');

  // State for Pool Management
  const [createPoolName, setCreatePoolName] = useState<string>('');
  const [setRiskPoolId, setSetRiskPoolId] = useState<string>('');
  const [setRiskLevel, setSetRiskLevel] = useState<string>('');
  const [setRiskBaseApr, setSetRiskBaseApr] = useState<string>('');
  const [defaultPoolId, setDefaultPoolId] = useState<string>('');
  const [defaultProjectId, setDefaultProjectId] = useState<string>('');
  const [defaultWriteOffAmount, setDefaultWriteOffAmount] = useState<string>('0');
  const [defaultSlashDeposit, setDefaultSlashDeposit] = useState<boolean>(false);
  const [viewPoolId, setViewPoolId] = useState<string>('');
  const [viewLoanPoolId, setViewLoanPoolId] = useState<string>('');
  const [viewLoanProjectId, setViewLoanProjectId] = useState<string>('');
  const [poolInfo, setPoolInfo] = useState<any | null>(null);
  const [poolLoanRecord, setPoolLoanRecord] = useState<any | null>(null);

  // --- Read Hooks ---
  const { data: pausedData, refetch: refetchPaused } = useReadContract({
    address: LIQUIDITY_POOL_MANAGER_ADDRESS,
    abi: liquidityPoolManagerAbi,
    functionName: 'paused',
    query: { enabled: !!LIQUIDITY_POOL_MANAGER_ADDRESS }
  });

  // --- Read Hooks for View Pool/Loan Info (on demand) ---
  const { data: poolInfoData, refetch: fetchPoolInfo, isLoading: isPoolInfoLoading } = useReadContract({
    address: LIQUIDITY_POOL_MANAGER_ADDRESS,
    abi: liquidityPoolManagerAbi,
    functionName: 'getPoolInfo',
    args: viewPoolId ? [BigInt(viewPoolId)] : undefined,
    query: { enabled: false },
  });
  const { data: poolRiskLevelsData, refetch: fetchPoolRiskLevels, isLoading: isPoolRiskLevelsLoading } = useReadContract({
    address: LIQUIDITY_POOL_MANAGER_ADDRESS,
    abi: liquidityPoolManagerAbi,
    functionName: 'poolRiskLevels',
    args: viewPoolId ? [BigInt(viewPoolId)] : undefined,
    query: { enabled: false },
  });
  const { data: poolAprRatesData, refetch: fetchPoolAprRates, isLoading: isPoolAprRatesLoading } = useReadContract({
    address: LIQUIDITY_POOL_MANAGER_ADDRESS,
    abi: liquidityPoolManagerAbi,
    functionName: 'poolAprRates',
    args: viewPoolId ? [BigInt(viewPoolId)] : undefined,
    query: { enabled: false },
  });
  const { data: poolLoanRecordData, refetch: fetchPoolLoanRecord, isLoading: isPoolLoanRecordLoading } = useReadContract({
    address: LIQUIDITY_POOL_MANAGER_ADDRESS,
    abi: liquidityPoolManagerAbi,
    functionName: 'getPoolLoanRecord',
    args: viewLoanPoolId && viewLoanProjectId ? [BigInt(viewLoanPoolId), BigInt(viewLoanProjectId)] : undefined,
    query: { enabled: false },
  });

  // --- HasRole Read Hook (on demand) ---
  const { data: hasRoleData, refetch: fetchHasRole, isLoading: isHasRoleLoading, error: hasRoleError } = useReadContract({
    address: LIQUIDITY_POOL_MANAGER_ADDRESS,
    abi: liquidityPoolManagerAbi,
    functionName: 'hasRole',
    args: checkRoleBytes32 && checkRoleAccountAddress ? [checkRoleBytes32, checkRoleAccountAddress as Address] : undefined,
    query: {
      enabled: false, // Only fetch when refetch is called
    },
  });

  // --- Effects ---
  useEffect(() => { if (pausedData !== undefined) setIsPaused(pausedData as boolean); }, [pausedData]);

  useEffect(() => {
    const names = getRoleNamesFromAbi(constantsAbi);
    setRoleNames(names);
    setRoleHashMap(createRoleHashMap(names));
  }, []);

  useEffect(() => {
    if (selectedRoleName) {
      try {
        const roleHex = toHex(selectedRoleName);
        const roleHash = keccak256(roleHex);
        setSelectedRoleBytes32(roleHash);
        setStatusMessage('');
      } catch (e: any) {
        console.error("Error computing role hash:", e);
        setSelectedRoleBytes32(null);
        setStatusMessage(`Error computing role hash: ${e.message}`);
      }
    } else {
      setSelectedRoleBytes32(null);
    }
  }, [selectedRoleName]);

  useEffect(() => {
    if (checkRoleName) {
      if (checkRoleName === 'DEFAULT_ADMIN_ROLE') {
        setCheckRoleBytes32('0x0000000000000000000000000000000000000000000000000000000000000000');
        setHasRoleStatus('');
      } else {
        try {
          const roleHex = toHex(checkRoleName);
          const roleHash = keccak256(roleHex);
          setCheckRoleBytes32(roleHash);
          setHasRoleStatus('');
        } catch (e: any) {
          console.error("Error computing check role hash:", e);
          setCheckRoleBytes32(null);
          setHasRoleStatus(`Error computing role hash for check: ${e.message}`);
        }
      }
    } else {
      setCheckRoleBytes32(null);
    }
  }, [checkRoleName]);

  useEffect(() => {
    if (hasRoleData !== undefined) {
      setHasRoleResult(hasRoleData as boolean);
      setHasRoleStatus('');
    }
    if (hasRoleError) {
        setHasRoleResult(`Error: ${hasRoleError.message}`);
        setHasRoleStatus('');
    }
  }, [hasRoleData, hasRoleError]);

  // --- Event Watcher for RoleGranted ---
  useWatchContractEvent({
    address: LIQUIDITY_POOL_MANAGER_ADDRESS,
    abi: liquidityPoolManagerAbi,
    eventName: 'RoleGranted',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({ abi: liquidityPoolManagerAbi, data: log.data, topics: log.topics, eventName: 'RoleGranted' });
          const args = decoded.args as unknown as RoleGrantedEventArgs;
          const roleName = roleHashMap[args.role] || args.role; // Fallback to hash
          setRoleEvents(prevEvents => [...prevEvents, args]);
          setStatusMessage(`RoleGranted event: Role ${roleName} (${args.role.substring(0,10)}...) granted to ${args.account} by ${args.sender}`);
        } catch (e) { console.error("Error decoding RoleGranted event:", e); setStatusMessage("Error processing RoleGranted event."); }
      });
    },
    onError(error) { console.error('Error watching RoleGranted event:', error); setStatusMessage(`Error watching RoleGranted event: ${error.message}`); }
  });

  useWatchContractEvent({
    address: LIQUIDITY_POOL_MANAGER_ADDRESS,
    abi: liquidityPoolManagerAbi,
    eventName: 'RoleRevoked',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({ abi: liquidityPoolManagerAbi, data: log.data, topics: log.topics, eventName: 'RoleRevoked' });
          const args = decoded.args as unknown as RoleRevokedEventArgs;
          const roleName = roleHashMap[args.role] || args.role;
          setRoleEvents(prevEvents => [...prevEvents, args]);
          setStatusMessage(`RoleRevoked event: Role ${roleName} (${args.role.substring(0,10)}...) revoked from ${args.account}`);
        } catch (e) { console.error("Error decoding RoleRevoked event:", e); setStatusMessage("Error processing RoleRevoked event."); }
      });
    },
    onError(error) { console.error('Error watching RoleRevoked event:', error); setStatusMessage(`Error watching RoleRevoked event: ${error.message}`); }
  });

  useWatchContractEvent({
    address: LIQUIDITY_POOL_MANAGER_ADDRESS,
    abi: liquidityPoolManagerAbi,
    eventName: 'PoolCreated',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({ abi: liquidityPoolManagerAbi, data: log.data, topics: log.topics, eventName: 'PoolCreated' });
          const args = decoded.args as unknown as PoolCreatedEventArgs;
          setPoolManagementEvents(prevEvents => [...prevEvents, args]);
          setStatusMessage(`PoolCreated event: ID ${args.poolId.toString()}, Name ${args.name}, Creator ${args.creator}`);
        } catch (e) { console.error("Error decoding PoolCreated event:", e); setStatusMessage("Error processing PoolCreated event."); }
      });
    },
    onError(error) { console.error('Error watching PoolCreated event:', error); setStatusMessage(`Error watching PoolCreated event: ${error.message}`); }
  });

  // Watch PoolRiskLevelSet - (NOTE: Assuming this event exists or a similar one like PoolConfigUpdated)
  // If no direct event, UI feedback will rely on transaction success and refetching data.
  useWatchContractEvent({
    address: LIQUIDITY_POOL_MANAGER_ADDRESS,
    abi: liquidityPoolManagerAbi,
    // eventName: 'PoolRiskLevelSet', // Replace with actual event name from ABI if it exists
    eventName: 'PoolConfigUpdated', // Example if a generic config update event is used
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({
            abi: liquidityPoolManagerAbi,
            data: log.data,
            topics: log.topics,
            eventName: 'PoolConfigUpdated' // Or the actual event name if different
          });
          // Assuming PoolConfigUpdated event provides args similar to PoolRiskLevelSetEventArgs
          // If the structure is different, a new EventArgs type for PoolConfigUpdated would be needed.
          const args = decoded.args as unknown as PoolRiskLevelSetEventArgs; 
          
          // Add a property to distinguish this event type if storing in a common array
          // For example: setPoolManagementEvents(prevEvents => [...prevEvents, { ...args, eventName: 'PoolConfigUpdated' }]);
          // Or, if PoolRiskLevelSetEventArgs is the correct structure:
          setPoolManagementEvents(prevEvents => [...prevEvents, args]);
          
          // Construct a more informative status message using decoded args
          let statusDetail = `Pool ${args.poolId?.toString()} config updated.`;
          if (args.riskLevel !== undefined) statusDetail += ` Risk Level: ${args.riskLevel}.`;
          if (args.baseAprBps !== undefined) statusDetail += ` Base APR: ${args.baseAprBps}bps.`;
          setStatusMessage(statusDetail);

        } catch (e) {
          console.error("Error decoding PoolConfigUpdated event:", e);
          // Keep a generic message or log specific decoding error
          setStatusMessage(`Error processing PoolConfigUpdated event. Raw log: ${JSON.stringify(log)}`);
        }
      });
    }
  });

  useWatchContractEvent({
    address: LIQUIDITY_POOL_MANAGER_ADDRESS,
    abi: liquidityPoolManagerAbi,
    eventName: 'LoanDefaulted',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({ abi: liquidityPoolManagerAbi, data: log.data, topics: log.topics, eventName: 'LoanDefaulted' });
          const args = decoded.args as unknown as LoanDefaultedEventArgs;
          setPoolManagementEvents(prevEvents => [...prevEvents, args]);
          setStatusMessage(`LoanDefaulted event: Pool ${args.poolId.toString()}, Project ${args.projectId.toString()}`);
        } catch (e) { console.error("Error decoding LoanDefaulted event:", e); setStatusMessage("Error processing LoanDefaulted event."); }
      });
    },
    onError(error) { console.error('Error watching LoanDefaulted event:', error); setStatusMessage(`Error watching LoanDefaulted event: ${error.message}`); }
  });

  const refetchAll = () => {
    refetchPaused();
    // Call refetch for other specific data if added
    if (viewPoolId) {
        fetchPoolInfo();
        fetchPoolRiskLevels();
        fetchPoolAprRates();
    }
    if (viewLoanPoolId && viewLoanProjectId) {
        fetchPoolLoanRecord();
    }
  };

  const handleWrite = (functionName: string, args: any[], successMessage?: string) => {
    if (!LIQUIDITY_POOL_MANAGER_ADDRESS) { setStatusMessage('Liquidity Pool Manager address not set'); return; }
    setStatusMessage('');
    writeContract({
      address: LIQUIDITY_POOL_MANAGER_ADDRESS,
      abi: liquidityPoolManagerAbi,
      functionName: functionName,
      args: args,
    }, {
      onSuccess: () => setStatusMessage(successMessage || 'Transaction submitted...'),
      onError: (error) => setStatusMessage(`Submission Error: ${error.message}`),
    });
  };

  const handleGrantRole = () => {
    if (!selectedRoleBytes32) { setStatusMessage('Selected role invalid or hash not computed.'); return; }
    if (!grantRoleToAddress) { setStatusMessage('Please enter address to grant role.'); return; }
    try {
      handleWrite('grantRole', [selectedRoleBytes32, grantRoleToAddress as Address], `Granting ${selectedRoleName} to ${grantRoleToAddress}...`);
    } catch (e: any) { setStatusMessage(`Error preparing grantRole: ${e.message}`); }
  };

  const handleRevokeRole = () => {
    if (!selectedRoleBytes32) { setStatusMessage('Selected role invalid or hash not computed.'); return; }
    if (!revokeRoleFromAddress) { setStatusMessage('Please enter address to revoke role from.'); return; }
    try {
      handleWrite('revokeRole', [selectedRoleBytes32, revokeRoleFromAddress as Address], `Revoking ${selectedRoleName} from ${revokeRoleFromAddress}...`);
    } catch (e: any) { setStatusMessage(`Error preparing revokeRole: ${e.message}`); }
  };

  const handleCheckHasRole = () => {
    if (!checkRoleBytes32) {
      setHasRoleStatus('Selected role for check is invalid or hash not computed.');
      setHasRoleResult(null);
      return;
    }
    if (!checkRoleAccountAddress) {
      setHasRoleStatus('Please enter account address to check role.');
      setHasRoleResult(null);
      return;
    }
    setHasRoleStatus('Checking role...');
    setHasRoleResult(null); // Clear previous result
    fetchHasRole();
  };

  const handlePause = () => handleWrite('pause', [], 'Pause transaction submitted...');
  const handleUnpause = () => handleWrite('unpause', [], 'Unpause transaction submitted...');
  // Add handlers for other LiquidityPoolManager functions like createLiquidityPool, allocateFundsToProject etc.

  const handleCreatePool = () => {
    if (!createPoolName) { setStatusMessage('Please enter a pool name.'); return; }
    handleWrite('createPool', [0, createPoolName], `Creating pool named ${createPoolName}...`);
  };

  const handleSetPoolRisk = () => {
    if (!setRiskPoolId || !setRiskLevel || !setRiskBaseApr) { setStatusMessage('Please fill all fields for setting pool risk.'); return; }
    try {
      const poolId = BigInt(setRiskPoolId);
      const riskLevel = parseInt(setRiskLevel, 10);
      const baseAprBps = parseInt(setRiskBaseApr, 10);
      if (isNaN(riskLevel) || riskLevel < 1 || riskLevel > 3) { setStatusMessage('Risk level must be 1, 2, or 3.'); return; }
      if (isNaN(baseAprBps) || baseAprBps < 0) { setStatusMessage('Base APR BPS must be a non-negative number.'); return; }
      handleWrite('setPoolRiskLevel', [poolId, riskLevel, baseAprBps], `Setting Pool ${poolId} risk to ${riskLevel}, APR ${baseAprBps}bps...`);
    } catch (e: any) { setStatusMessage(`Error preparing setPoolRiskLevel: ${e.message}`); }
  };

  const handleLoanDefault = () => {
    if (!defaultPoolId || !defaultProjectId) { setStatusMessage('Pool ID and Project ID are required for handling default.'); return; }
    try {
      const poolId = BigInt(defaultPoolId);
      const projectId = BigInt(defaultProjectId);
      const writeOff = defaultWriteOffAmount ? BigInt(defaultWriteOffAmount) : BigInt(0);
      handleWrite('handleLoanDefault', [poolId, projectId, writeOff, defaultSlashDeposit], `Handling default for Project ${projectId} in Pool ${poolId}...`);
    } catch (e: any) { setStatusMessage(`Error preparing handleLoanDefault: ${e.message}`); }
  };

  const handleViewPoolInfo = () => {
    if (!viewPoolId) { setStatusMessage('Please enter Pool ID to view info.'); setPoolInfo(null); return; }
    setPoolInfo(null); // Clear previous
    fetchPoolInfo();
    fetchPoolRiskLevels();
    fetchPoolAprRates();
  };

  const handleViewLoanRecord = () => {
    if (!viewLoanPoolId || !viewLoanProjectId) { setStatusMessage('Please enter Pool ID and Project ID to view loan record.'); setPoolLoanRecord(null); return; }
    setPoolLoanRecord(null); // Clear previous
    fetchPoolLoanRecord();
  };

  useEffect(() => {
    if (isConfirmed) { setStatusMessage(`Transaction successful! Hash: ${writeHash}`); refetchAll(); }
    if (writeError && !isConfirmed) { setStatusMessage(`Transaction Error: ${writeError.message}`); }
    if (receiptError && !isConfirmed) { setStatusMessage(`Receipt Error: ${receiptError.message}`); }
  }, [isConfirmed, writeHash, writeError, receiptError, refetchAll]);

  // Aggregate and display Pool Info
  useEffect(() => {
    if (poolInfoData != null && poolRiskLevelsData != null && poolAprRatesData != null) {
        setPoolInfo({
            ...(poolInfoData as object), // Cast to ensure it's spreadable if it's an object/struct
            riskLevel: (poolRiskLevelsData as any).toString(), 
            baseAprBps: (poolAprRatesData as any).toString(),
        });
    } else {
        setPoolInfo(null);
    }
  }, [poolInfoData, poolRiskLevelsData, poolAprRatesData]);

  // Display Pool Loan Record
  useEffect(() => {
    if (poolLoanRecordData) {
        setPoolLoanRecord(poolLoanRecordData);
    } else {
        setPoolLoanRecord(null);
    }
  }, [poolLoanRecordData]);

  if (!LIQUIDITY_POOL_MANAGER_ADDRESS) {
    return <p className="text-red-500">Error: NEXT_PUBLIC_LIQUIDITY_POOL_MANAGER_ADDRESS is not set.</p>;
  }

  return (
    <div className="space-y-8 p-4 border rounded-lg shadow-md bg-white">
      <h2 className="text-2xl font-semibold text-black">Liquidity Pool Manager Admin <span className="text-sm text-gray-600">({LIQUIDITY_POOL_MANAGER_ADDRESS})</span></h2>

      <div className="p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black mb-2">Contract Status</h3>
        <p className="text-black"><strong>Paused:</strong> {isPaused === null ? 'Loading...' : isPaused ? 'Yes' : 'No'}</p>
        {/* Display other relevant LiquidityPoolManager status (e.g., number of pools) */}
        <button onClick={refetchAll} className="mt-2 px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">Refresh Data</button>
      </div>
      
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Grant Role</h3>
        <p className="text-sm text-gray-700">Grant roles like PAUSER_ROLE, POOL_CREATOR_ROLE, ALLOCATOR_ROLE. Requires DEFAULT_ADMIN_ROLE or specific role admin.</p>
        <div>
          <label htmlFor="roleSelectLPM" className="block text-sm font-medium text-black">Select Role:</label>
          <select id="roleSelectLPM" value={selectedRoleName} onChange={(e) => setSelectedRoleName(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black">
            <option value="">-- Select a Role --</option>
            {roleNames.map(name => (<option key={name} value={name}>{name}</option>))}
          </select>
          {selectedRoleName && <p className="text-xs text-gray-600 mt-1">Computed Role Hash: {selectedRoleBytes32 || (selectedRoleName ? 'Calculating...' : 'N/A')}</p>}
        </div>
        <div>
          <label htmlFor="grantRoleAddressLPM" className="block text-sm font-medium text-black">Address to Grant Role:</label>
          <input type="text" id="grantRoleAddressLPM" value={grantRoleToAddress} onChange={(e) => setGrantRoleToAddress(e.target.value)} placeholder="0x..." className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500" />
        </div>
        <button onClick={handleGrantRole} disabled={!selectedRoleBytes32 || !grantRoleToAddress || isWritePending || isConfirming} className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed">
          Grant Role
        </button>
        <div className="mt-4">
            <label htmlFor="revokeRoleAddressLPM" className="block text-sm font-medium text-black">Address to Revoke Role From:</label>
            <input type="text" id="revokeRoleAddressLPM" value={revokeRoleFromAddress} onChange={(e) => setRevokeRoleFromAddress(e.target.value)} placeholder="0x..." className="mt-1 block w-full input-style text-black" />
        </div>
        <button onClick={handleRevokeRole} disabled={!selectedRoleBytes32 || !revokeRoleFromAddress || isWritePending || isConfirming} className="mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400">Revoke Role</button>
      </div>

      {/* Check Role Section */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Check Role (hasRole)</h3>
        <div>
          <label htmlFor="checkRoleSelectLPM" className="block text-sm font-medium text-black">Select Role to Check:</label>
          <select 
            id="checkRoleSelectLPM" 
            value={checkRoleName} 
            onChange={(e) => { setCheckRoleName(e.target.value); setHasRoleResult(null); setHasRoleStatus(''); }} 
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black"
          >
            <option value="">-- Select a Role --</option>
            <option value="DEFAULT_ADMIN_ROLE">DEFAULT_ADMIN_ROLE</option>
            {roleNames.map(name => (<option key={`check-${name}`} value={name}>{name}</option>))}
          </select>
          {checkRoleName && <p className="text-xs text-gray-600 mt-1">Computed Role Hash for Check: {checkRoleBytes32 || (checkRoleName ? 'Calculating...' : 'N/A')}</p>}
        </div>
        <div>
          <label htmlFor="checkRoleAddressLPM" className="block text-sm font-medium text-black">Account Address to Check:</label>
          <input 
            type="text" 
            id="checkRoleAddressLPM" 
            value={checkRoleAccountAddress} 
            onChange={(e) => { setCheckRoleAccountAddress(e.target.value); setHasRoleResult(null); setHasRoleStatus('');}} 
            placeholder="0x..." 
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500" 
          />
        </div>
        <button 
          onClick={handleCheckHasRole} 
          disabled={!checkRoleBytes32 || !checkRoleAccountAddress || isHasRoleLoading} 
          className="px-4 py-2 bg-teal-500 text-white rounded hover:bg-teal-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isHasRoleLoading ? 'Checking...' : 'Check if Role is Granted'}
        </button>
        {hasRoleStatus && <p className="text-sm mt-2 text-gray-700">{hasRoleStatus}</p>}
        {hasRoleResult !== null && (
          <p className={`text-sm mt-2 font-medium ${typeof hasRoleResult === 'boolean' ? (hasRoleResult ? 'text-green-700' : 'text-red-700') : 'text-yellow-700'}`}>
            <strong>Role Granted:</strong> {hasRoleResult.toString()}
          </p>
        )}
      </div>

      <div className="space-y-4 p-4 border rounded bg-gray-50">
          <h3 className="text-xl font-medium text-black">Pause Control</h3>
           <p className="text-sm text-gray-700">Requires PAUSER_ROLE.</p>
           <div className="flex space-x-4">
            <button onClick={handlePause} disabled={isWritePending || isConfirming || isPaused === true} className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed">Pause</button>
            <button onClick={handleUnpause} disabled={isWritePending || isConfirming || isPaused === false} className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed">Unpause</button>
          </div>
      </div>

      {/* --- Pool Management Functions --- */}
      {/* Create New Liquidity Pool */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Create New Liquidity Pool</h3>
        <p className="text-sm text-gray-700">Requires DEFAULT_ADMIN_ROLE.</p>
        <div>
          <label htmlFor="createPoolName" className="block text-sm font-medium text-black">Pool Name:</label>
          <input type="text" id="createPoolName" value={createPoolName} onChange={(e) => setCreatePoolName(e.target.value)} placeholder="Enter pool name" className="mt-1 block w-full input-style text-black" />
        </div>
        <button onClick={handleCreatePool} disabled={isWritePending || isConfirming || !createPoolName} className="button-style bg-indigo-500 hover:bg-indigo-600">Create Pool</button>
      </div>

      {/* Set Pool Risk Level and Base APR */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Set Pool Risk Level and Base APR</h3>
        <p className="text-sm text-gray-700">Requires DEFAULT_ADMIN_ROLE.</p>
        <div>
          <label htmlFor="setRiskPoolId" className="block text-sm font-medium text-black">Pool ID:</label>
          <input type="text" id="setRiskPoolId" value={setRiskPoolId} onChange={(e) => setSetRiskPoolId(e.target.value)} placeholder="Enter Pool ID" className="mt-1 block w-full input-style text-black" />
        </div>
        <div>
          <label htmlFor="setRiskLevel" className="block text-sm font-medium text-black">Risk Level (1-Low, 2-Medium, 3-High):</label>
          <input type="number" id="setRiskLevel" value={setRiskLevel} onChange={(e) => setSetRiskLevel(e.target.value)} placeholder="1, 2, or 3" className="mt-1 block w-full input-style text-black" />
        </div>
        <div>
          <label htmlFor="setRiskBaseApr" className="block text-sm font-medium text-black">Base APR (BPS, e.g., 1000 for 10%):</label>
          <input type="number" id="setRiskBaseApr" value={setRiskBaseApr} onChange={(e) => setSetRiskBaseApr(e.target.value)} placeholder="e.g., 1000" className="mt-1 block w-full input-style text-black" />
        </div>
        <button onClick={handleSetPoolRisk} disabled={isWritePending || isConfirming || !setRiskPoolId || !setRiskLevel || !setRiskBaseApr} className="button-style bg-purple-500 hover:bg-purple-600">Set Pool Risk/APR</button>
      </div>

      {/* Handle Loan Default in a Pool */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Handle Loan Default in Pool</h3>
        <p className="text-sm text-gray-700">Requires DEFAULT_ADMIN_ROLE.</p>
        <div>
          <label htmlFor="defaultPoolId" className="block text-sm font-medium text-black">Pool ID:</label>
          <input type="text" id="defaultPoolId" value={defaultPoolId} onChange={(e) => setDefaultPoolId(e.target.value)} placeholder="Enter Pool ID" className="mt-1 block w-full input-style text-black" />
        </div>
        <div>
          <label htmlFor="defaultProjectId" className="block text-sm font-medium text-black">Project ID:</label>
          <input type="text" id="defaultProjectId" value={defaultProjectId} onChange={(e) => setDefaultProjectId(e.target.value)} placeholder="Enter Project ID" className="mt-1 block w-full input-style text-black" />
        </div>
        <div>
          <label htmlFor="defaultWriteOffAmount" className="block text-sm font-medium text-black">Write-Off Amount (Optional, defaults to full outstanding if 0):</label>
          <input type="text" id="defaultWriteOffAmount" value={defaultWriteOffAmount} onChange={(e) => setDefaultWriteOffAmount(e.target.value)} placeholder="e.g., 5000 (raw units)" className="mt-1 block w-full input-style text-black" />
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="defaultSlashDeposit" checked={defaultSlashDeposit} onChange={(e) => setDefaultSlashDeposit(e.target.checked)} className="h-4 w-4 text-indigo-600 border-gray-300 rounded" />
          <label htmlFor="defaultSlashDeposit" className="ml-2 block text-sm font-medium text-black">Slash Developer Deposit?</label>
        </div>
        <button onClick={handleLoanDefault} disabled={isWritePending || isConfirming || !defaultPoolId || !defaultProjectId} className="button-style bg-red-600 hover:bg-red-700">Handle Loan Default</button>
      </div>

      {/* View Pool and Loan Information */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">View Pool Information</h3>
        <div>
          <label htmlFor="viewPoolId" className="block text-sm font-medium text-black">Pool ID:</label>
          <input type="text" id="viewPoolId" value={viewPoolId} onChange={(e) => { setViewPoolId(e.target.value); setPoolInfo(null); }} placeholder="Enter Pool ID" className="mt-1 block w-full input-style text-black" />
        </div>
        <button onClick={handleViewPoolInfo} disabled={isPoolInfoLoading || isPoolRiskLevelsLoading || isPoolAprRatesLoading} className="button-style bg-cyan-500 hover:bg-cyan-600">
          {isPoolInfoLoading || isPoolRiskLevelsLoading || isPoolAprRatesLoading ? 'Loading Pool Info...' : 'View Pool Info'}
        </button>
        {poolInfo && (
          <div className="mt-3 p-3 bg-gray-100 rounded text-sm">
            <p className="font-semibold text-black"><strong>Pool Details (ID: {viewPoolId}):</strong></p>
            <p className="text-black">Exists: {poolInfo.exists?.toString()}</p>
            <p className="text-black">Name: {poolInfo.name}</p>
            <p className="text-black">Total Assets: {poolInfo.totalAssets?.toString()}</p>
            <p className="text-black">Total Shares: {poolInfo.totalShares?.toString()}</p>
            <p className="text-black">Risk Level: {poolInfo.riskLevel}</p>
            <p className="text-black">Base APR (BPS): {poolInfo.baseAprBps}</p>
            {/* Add more fields from getPoolInfo as needed */}
          </div>
        )}
      </div>
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">View Pool Loan Record</h3>
        <div>
          <label htmlFor="viewLoanPoolId" className="block text-sm font-medium text-black">Pool ID for Loan:</label>
          <input type="text" id="viewLoanPoolId" value={viewLoanPoolId} onChange={(e) => { setViewLoanPoolId(e.target.value); setPoolLoanRecord(null);}} placeholder="Enter Pool ID" className="mt-1 block w-full input-style text-black" />
        </div>
        <div>
          <label htmlFor="viewLoanProjectId" className="block text-sm font-medium text-black">Project ID for Loan:</label>
          <input type="text" id="viewLoanProjectId" value={viewLoanProjectId} onChange={(e) => { setViewLoanProjectId(e.target.value); setPoolLoanRecord(null); }} placeholder="Enter Project ID" className="mt-1 block w-full input-style text-black" />
        </div>
        <button onClick={handleViewLoanRecord} disabled={isPoolLoanRecordLoading} className="button-style bg-cyan-500 hover:bg-cyan-600">
          {isPoolLoanRecordLoading ? 'Loading Loan Record...' : 'View Loan Record'}
        </button>
        {poolLoanRecord && (
          <div className="mt-3 p-3 bg-gray-100 rounded text-sm">
            <p className="font-semibold text-black"><strong>Loan Record (Pool: {viewLoanPoolId}, Project: {viewLoanProjectId}):</strong></p>
            <p className="text-black">Is Active: {poolLoanRecord.isActive?.toString()}</p>
            <p className="text-black">Principal: {poolLoanRecord.principal?.toString()}</p>
            <p className="text-black">APR (BPS): {poolLoanRecord.aprBps?.toString()}</p>
            <p className="text-black">Start Time: {new Date(Number(poolLoanRecord.startTime) * 1000).toLocaleString()}</p>
            {/* Add other fields from getPoolLoanRecord as needed */}
          </div>
        )}
      </div>

      {/* Placeholder for other LiquidityPoolManager functionalities */}
      <div className="p-4 border rounded bg-gray-100">
        <p className="text-gray-700 italic">Other LiquidityPoolManager functions (createPool, allocateFundsToProject, etc.) will be added here.</p>
      </div>

      {statusMessage && (
        <div className={`mt-4 p-3 rounded ${writeError || receiptError ? 'bg-red-100 text-red-700' : isConfirmed ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
          <p className="text-sm font-medium">{statusMessage}</p>
        </div>
      )}

      {/* Recent RoleGranted Events */}
      <div className="p-4 border rounded bg-gray-50 mt-6">
        <h3 className="text-xl font-medium text-black mb-3">Recent RoleGranted Events</h3>
        {roleEvents.length === 0 && <p className="text-gray-600">No RoleGranted events detected yet.</p>}
        <ul className="space-y-3">
          {roleEvents.slice(-5).reverse().map((event, index) => { // Display last 5, newest first
            const roleName = roleHashMap[event.role] || event.role; // Fallback to hash
            return (
              <li key={`role-${index}`} className="p-3 bg-white border border-gray-200 rounded shadow-sm">
                <p className="text-sm text-black"><strong>Role:</strong> {roleName} ({event.role.substring(0, 10)}...)</p>
                <p className="text-sm text-black"><strong>Account:</strong> {event.account}</p>
                <p className="text-sm text-black"><strong>Sender:</strong> {event.sender}</p>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Recent Pool Management Events */}
      <div className="p-4 border rounded bg-gray-50 mt-6">
        <h3 className="text-xl font-medium text-black mb-3">Recent Pool Management Events</h3>
        {poolManagementEvents.length === 0 && <p className="text-gray-600">No pool management events detected yet.</p>}
        <ul className="space-y-3">
          {poolManagementEvents.slice(-5).reverse().map((event: any, index) => {
            let eventDetails = <p>Unknown event type</p>;
            if (event.eventName === 'PoolCreated') {
              const e = event as PoolCreatedEventArgs;
              eventDetails = <>
                <p className="text-black"><strong>Event: PoolCreated</strong></p>
                <p className="text-black">Pool ID: {e.poolId.toString()}</p>
                <p className="text-black">Name: {e.name}</p>
                <p className="text-black">Creator: {e.creator}</p>
              </>;
            } else if (event.eventName === 'PoolConfigUpdated') { // Or actual event name for setPoolRiskLevel
                // Customize based on actual event args for PoolRiskLevelSet or similar
                eventDetails = <>
                    <p className="text-black"><strong>Event: PoolConfigUpdated</strong></p>
                    <p className="text-black">Details: {JSON.stringify(event)}</p> {/* Generic display */}
                </>;
            } else if (event.eventName === 'LoanDefaulted') {
              const e = event as LoanDefaultedEventArgs;
              eventDetails = <>
                <p className="text-black"><strong>Event: LoanDefaulted</strong></p>
                <p className="text-black">Pool ID: {e.poolId.toString()}</p>
                <p className="text-black">Project ID: {e.projectId.toString()}</p>
                <p className="text-black">Amount Defaulted: {e.amountDefaulted.toString()}</p>
              </>;
            }
            return (
              <li key={`pool-event-${index}`} className="p-3 bg-blue-50 border border-blue-200 rounded shadow-sm">
                {eventDetails}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
} 