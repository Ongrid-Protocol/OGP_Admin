"use client";

import React, { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useWatchContractEvent } from 'wagmi';
import { Address, Abi, decodeEventLog, Hex, keccak256, toHex } from 'viem';
import feeRouterAbiJson from '@/abis/FeeRouter.json';
import constantsAbiJson from '@/abis/Constants.json';

// Define proper types for the event args
type RoleGrantedEventArgs = {
  role: Hex; // bytes32
  account: Address;
  sender: Address;
};
// Add other event types if needed, e.g., for treasury updates
type ProtocolTreasurySetEventArgs = { newTreasury: Address; oldTreasury: Address; };
type CarbonTreasurySetEventArgs = { newTreasury: Address; oldTreasury: Address; };
type RoleRevokedEventArgs = { role: Hex; account: Address; sender: Address; };
type FeeRoutedEventArgs = {
    repaymentRouter: Address;
    totalFeeAmount: bigint;
    protocolTreasuryAmount: bigint;
    carbonTreasuryAmount: bigint;
};

const FEE_ROUTER_ADDRESS = process.env.NEXT_PUBLIC_FEE_ROUTER_ADDRESS as Address | undefined;

const feeRouterAbi = feeRouterAbiJson.abi;
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

export function FeeRouterAdmin() {
  const { address: connectedAddress } = useAccount();
  const { data: writeHash, writeContract, isPending: isWritePending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash: writeHash });

  // State for contract data
  const [isPaused, setIsPaused] = useState<boolean | null>(null);
  const [protocolTreasury, setProtocolTreasury] = useState<Address | null>(null);
  const [carbonTreasury, setCarbonTreasury] = useState<Address | null>(null);
  const [newProtocolTreasury, setNewProtocolTreasury] = useState<string>('');
  const [newCarbonTreasury, setNewCarbonTreasury] = useState<string>('');

  // State for Role Granting
  const [roleNames, setRoleNames] = useState<string[]>([]);
  const [selectedRoleName, setSelectedRoleName] = useState<string>('');
  const [selectedRoleBytes32, setSelectedRoleBytes32] = useState<Hex | null>(null);
  const [grantRoleToAddress, setGrantRoleToAddress] = useState<string>('');
  const [revokeRoleFromAddress, setRevokeRoleFromAddress] = useState<string>('');
  const [roleEvents, setRoleEvents] = useState<(RoleGrantedEventArgs | RoleRevokedEventArgs)[]>([]);
  const [treasuryEvents, setTreasuryEvents] = useState<(ProtocolTreasurySetEventArgs | CarbonTreasurySetEventArgs)[]>([]);
  const [feeRoutedEvents, setFeeRoutedEvents] = useState<FeeRoutedEventArgs[]>([]);
  const [roleHashMap, setRoleHashMap] = useState<{ [hash: Hex]: string }>({});
  const [statusMessage, setStatusMessage] = useState<string>('');

  // State for HasRole Check
  const [checkRoleName, setCheckRoleName] = useState<string>('');
  const [checkRoleBytes32, setCheckRoleBytes32] = useState<Hex | null>(null);
  const [checkRoleAccountAddress, setCheckRoleAccountAddress] = useState<string>('');
  const [hasRoleResult, setHasRoleResult] = useState<boolean | string | null>(null);
  const [hasRoleStatus, setHasRoleStatus] = useState<string>('');

  // State for Viewing Fee Details
  const [viewFeeProjectId, setViewFeeProjectId] = useState<string>('');
  const [projectFeeDetails, setProjectFeeDetails] = useState<any | null>(null);
  const [nextPaymentInfo, setNextPaymentInfo] = useState<any | null>(null);

  // --- Read Hooks ---
  const { data: pausedData, refetch: refetchPaused } = useReadContract({
    address: FEE_ROUTER_ADDRESS,
    abi: feeRouterAbi,
    functionName: 'paused',
    query: { enabled: !!FEE_ROUTER_ADDRESS }
  });
  const { data: protocolTreasuryData, refetch: refetchProtocolTreasury } = useReadContract({
    address: FEE_ROUTER_ADDRESS,
    abi: feeRouterAbi,
    functionName: 'protocolTreasury',
    query: { enabled: !!FEE_ROUTER_ADDRESS }
  });
  const { data: carbonTreasuryData, refetch: refetchCarbonTreasury } = useReadContract({
    address: FEE_ROUTER_ADDRESS,
    abi: feeRouterAbi,
    functionName: 'carbonTreasury',
    query: { enabled: !!FEE_ROUTER_ADDRESS }
  });

  // --- Read Hooks for View Fee Details (on demand) ---
  const { data: projectFeeDetailsData, refetch: fetchProjectFeeDetails, isLoading: isProjectFeeDetailsLoading } = useReadContract({
    address: FEE_ROUTER_ADDRESS,
    abi: feeRouterAbi,
    functionName: 'getProjectFeeDetails',
    args: viewFeeProjectId ? [BigInt(viewFeeProjectId)] : undefined,
    query: { enabled: false }
  });

  const { data: nextPaymentInfoData, refetch: fetchNextPaymentInfo, isLoading: isNextPaymentInfoLoading } = useReadContract({
    address: FEE_ROUTER_ADDRESS,
    abi: feeRouterAbi,
    functionName: 'getNextPaymentInfo',
    args: viewFeeProjectId ? [BigInt(viewFeeProjectId)] : undefined,
    query: { enabled: false }
  });

  // --- HasRole Read Hook (on demand) ---
  const { data: hasRoleData, refetch: fetchHasRole, isLoading: isHasRoleLoading, error: hasRoleError } = useReadContract({
    address: FEE_ROUTER_ADDRESS,
    abi: feeRouterAbi,
    functionName: 'hasRole',
    args: checkRoleBytes32 && checkRoleAccountAddress ? [checkRoleBytes32, checkRoleAccountAddress as Address] : undefined,
    query: {
      enabled: false, // Only fetch when refetch is called
    },
  });

  // --- Effects ---
  useEffect(() => { if (pausedData !== undefined) setIsPaused(pausedData as boolean); }, [pausedData]);
  useEffect(() => { if (protocolTreasuryData) setProtocolTreasury(protocolTreasuryData as Address); }, [protocolTreasuryData]);
  useEffect(() => { if (carbonTreasuryData) setCarbonTreasury(carbonTreasuryData as Address); }, [carbonTreasuryData]);

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

  // --- Event Watchers ---
  useWatchContractEvent({
    address: FEE_ROUTER_ADDRESS,
    abi: feeRouterAbi,
    eventName: 'RoleGranted',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({ abi: feeRouterAbi, data: log.data, topics: log.topics, eventName: 'RoleGranted' });
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
    address: FEE_ROUTER_ADDRESS,
    abi: feeRouterAbi,
    eventName: 'ProtocolTreasurySet',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({ abi: feeRouterAbi, data: log.data, topics: log.topics, eventName: 'ProtocolTreasurySet' });
          const args = decoded.args as unknown as ProtocolTreasurySetEventArgs;
          setTreasuryEvents(prevEvents => [...prevEvents, args]);
          setStatusMessage(`ProtocolTreasurySet event: New: ${args.newTreasury}, Old: ${args.oldTreasury}`);
          refetchProtocolTreasury(); // Refetch to update display
        } catch (e) { console.error("Error decoding ProtocolTreasurySet event:", e); setStatusMessage("Error processing ProtocolTreasurySet event."); }
      });
    },
    onError(error) { console.error('Error watching ProtocolTreasurySet event:', error); setStatusMessage(`Error watching ProtocolTreasurySet event: ${error.message}`); }
  });
  
  useWatchContractEvent({
    address: FEE_ROUTER_ADDRESS,
    abi: feeRouterAbi,
    eventName: 'CarbonTreasurySet',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({ abi: feeRouterAbi, data: log.data, topics: log.topics, eventName: 'CarbonTreasurySet' });
          const args = decoded.args as unknown as CarbonTreasurySetEventArgs;
          setTreasuryEvents(prevEvents => [...prevEvents, args]);
          setStatusMessage(`CarbonTreasurySet event: New: ${args.newTreasury}, Old: ${args.oldTreasury}`);
          refetchCarbonTreasury(); // Refetch to update display
        } catch (e) { console.error("Error decoding CarbonTreasurySet event:", e); setStatusMessage("Error processing CarbonTreasurySet event."); }
      });
    },
    onError(error) { console.error('Error watching CarbonTreasurySet event:', error); setStatusMessage(`Error watching CarbonTreasurySet event: ${error.message}`); }
  });

  useWatchContractEvent({
    address: FEE_ROUTER_ADDRESS,
    abi: feeRouterAbi,
    eventName: 'RoleRevoked',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({ abi: feeRouterAbi, data: log.data, topics: log.topics, eventName: 'RoleRevoked' });
          const args = decoded.args as unknown as RoleRevokedEventArgs;
          const roleName = roleHashMap[args.role] || args.role;
          setRoleEvents(prevEvents => [...prevEvents, args]);
          setStatusMessage(`RoleRevoked event: Role ${roleName} (${args.role.substring(0,10)}...) revoked from ${args.account} by ${args.sender}`);
        } catch (e) { console.error("Error decoding RoleRevoked event:", e); setStatusMessage("Error processing RoleRevoked event."); }
      });
    },
    onError(error) { console.error('Error watching RoleRevoked event:', error); setStatusMessage(`Error watching RoleRevoked event: ${error.message}`); }
  });

  useWatchContractEvent({
    address: FEE_ROUTER_ADDRESS,
    abi: feeRouterAbi,
    eventName: 'FeeRouted',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({ abi: feeRouterAbi, data: log.data, topics: log.topics, eventName: 'FeeRouted' });
          const args = decoded.args as unknown as FeeRoutedEventArgs;
          setFeeRoutedEvents(prevEvents => [...prevEvents, args]);
          setStatusMessage(`FeeRouted event: Total ${args.totalFeeAmount.toString()}, Protocol ${args.protocolTreasuryAmount.toString()}, Carbon ${args.carbonTreasuryAmount.toString()}`);
        } catch (e) { console.error("Error decoding FeeRouted event:", e); setStatusMessage("Error processing FeeRouted event."); }
      });
    },
    onError(error) { console.error('Error watching FeeRouted event:', error); setStatusMessage(`Error watching FeeRouted event: ${error.message}`); }
  });

  const refetchAll = () => {
    refetchPaused();
    refetchProtocolTreasury();
    refetchCarbonTreasury();
    if (viewFeeProjectId) { // Also refetch fee details if a project ID is being viewed
      fetchProjectFeeDetails();
      fetchNextPaymentInfo();
    }
  };

  const handleWrite = (functionName: string, args: any[], successMessage?: string) => {
    if (!FEE_ROUTER_ADDRESS) { setStatusMessage('Fee Router contract address not set'); return; }
    setStatusMessage('');
    writeContract({
      address: FEE_ROUTER_ADDRESS,
      abi: feeRouterAbi,
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

  const handleSetProtocolTreasury = () => {
    if (!newProtocolTreasury) { setStatusMessage('Please enter new Protocol Treasury address.'); return; }
    try {
      handleWrite('setProtocolTreasury', [newProtocolTreasury as Address], `Setting Protocol Treasury to ${newProtocolTreasury}...`);
    } catch (e: any) { setStatusMessage(`Error: ${e.message}`); }
  };

  const handleSetCarbonTreasury = () => {
    if (!newCarbonTreasury) { setStatusMessage('Please enter new Carbon Treasury address.'); return; }
    try {
      handleWrite('setCarbonTreasury', [newCarbonTreasury as Address], `Setting Carbon Treasury to ${newCarbonTreasury}...`);
    } catch (e: any) { setStatusMessage(`Error: ${e.message}`); }
  };

  const handlePause = () => handleWrite('pause', [], 'Pause transaction submitted...');
  const handleUnpause = () => handleWrite('unpause', [], 'Unpause transaction submitted...');

  // --- View Fee Details Function ---
  const handleViewFeeDetails = () => {
    if (!viewFeeProjectId) { 
        setStatusMessage('Please enter Project ID to view fee details.'); 
        setProjectFeeDetails(null);
        setNextPaymentInfo(null);
        return; 
    }
    setProjectFeeDetails(null); // Clear previous
    setNextPaymentInfo(null);
    fetchProjectFeeDetails();
    fetchNextPaymentInfo();
  };

  useEffect(() => {
    if (isConfirmed) { setStatusMessage(`Transaction successful! Hash: ${writeHash}`); refetchAll(); }
    if (writeError && !isConfirmed) { setStatusMessage(`Transaction Error: ${writeError.message}`); }
    if (receiptError && !isConfirmed) { setStatusMessage(`Receipt Error: ${receiptError.message}`); }
  }, [isConfirmed, writeHash, writeError, receiptError, refetchAll]);

  // Effect for View Fee Details Data
  useEffect(() => {
    if (projectFeeDetailsData) setProjectFeeDetails(projectFeeDetailsData);
  }, [projectFeeDetailsData]);

  useEffect(() => {
    if (nextPaymentInfoData) setNextPaymentInfo(nextPaymentInfoData);
  }, [nextPaymentInfoData]);

  if (!FEE_ROUTER_ADDRESS) {
    return <p className="text-red-500">Error: NEXT_PUBLIC_FEE_ROUTER_ADDRESS is not set.</p>;
  }

  return (
    <div className="space-y-8 p-4 border rounded-lg shadow-md bg-white">
      <h2 className="text-2xl font-semibold text-black">Fee Router Admin <span className="text-sm text-gray-600">({FEE_ROUTER_ADDRESS})</span></h2>

      <div className="p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black mb-2">Contract Status</h3>
        <p className="text-black"><strong>Paused:</strong> {isPaused === null ? 'Loading...' : isPaused ? 'Yes' : 'No'}</p>
        <p className="text-black"><strong>Protocol Treasury:</strong> {protocolTreasury || 'Loading...'}</p>
        <p className="text-black"><strong>Carbon Treasury:</strong> {carbonTreasury || 'Loading...'}</p>
        <button onClick={refetchAll} className="mt-2 px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">Refresh Data</button>
      </div>

      {/* Set Treasuries Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4 p-4 border rounded bg-gray-50">
            <h3 className="text-xl font-medium text-black">Set Protocol Treasury</h3>
            <p className="text-sm text-gray-700">Requires DEFAULT_ADMIN_ROLE.</p>
            <input type="text" value={newProtocolTreasury} onChange={(e) => setNewProtocolTreasury(e.target.value)} placeholder="0x... Protocol Treasury" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500" />
            <button onClick={handleSetProtocolTreasury} disabled={isWritePending || isConfirming} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400">Set Protocol Treasury</button>
        </div>
        <div className="space-y-4 p-4 border rounded bg-gray-50">
            <h3 className="text-xl font-medium text-black">Set Carbon Treasury</h3>
            <p className="text-sm text-gray-700">Requires DEFAULT_ADMIN_ROLE.</p>
            <input type="text" value={newCarbonTreasury} onChange={(e) => setNewCarbonTreasury(e.target.value)} placeholder="0x... Carbon Treasury" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500" />
            <button onClick={handleSetCarbonTreasury} disabled={isWritePending || isConfirming} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400">Set Carbon Treasury</button>
        </div>
      </div>
      
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Grant Role</h3>
        <p className="text-sm text-gray-700">
            Grant roles like PAUSER_ROLE, PROJECT_HANDLER_ROLE (for ProjectFactory, LiquidityPoolManager), REPAYMENT_ROUTER_ROLE (for RepaymentRouter). Requires DEFAULT_ADMIN_ROLE or specific role admin.
        </p>
        <div>
          <label htmlFor="roleSelectFR" className="block text-sm font-medium text-black">Select Role:</label>
          <select id="roleSelectFR" value={selectedRoleName} onChange={(e) => setSelectedRoleName(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black">
            <option value="">-- Select a Role --</option>
            {roleNames.map(name => (<option key={name} value={name}>{name}</option>))}
          </select>
          {selectedRoleName && <p className="text-xs text-gray-600 mt-1">Computed Role Hash: {selectedRoleBytes32 || (selectedRoleName ? 'Calculating...' : 'N/A')}</p>}
        </div>
        <div>
          <label htmlFor="grantRoleAddressFR" className="block text-sm font-medium text-black">Address to Grant Role:</label>
          <input type="text" id="grantRoleAddressFR" value={grantRoleToAddress} onChange={(e) => setGrantRoleToAddress(e.target.value)} placeholder="0x..." className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500" />
        </div>
        <button onClick={handleGrantRole} disabled={!selectedRoleBytes32 || !grantRoleToAddress || isWritePending || isConfirming} className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed">
          Grant Role
        </button>
        <div className="mt-4">
            <label htmlFor="revokeRoleAddressFR" className="block text-sm font-medium text-black">Address to Revoke Role From:</label>
            <input type="text" id="revokeRoleAddressFR" value={revokeRoleFromAddress} onChange={(e) => setRevokeRoleFromAddress(e.target.value)} placeholder="0x..." className="input-style text-black" />
        </div>
        <button onClick={handleRevokeRole} disabled={!selectedRoleBytes32 || !revokeRoleFromAddress || isWritePending || isConfirming} className="mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400">Revoke Role</button>
      </div>

      {/* Check Role Section */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Check Role (hasRole)</h3>
        <div>
          <label htmlFor="checkRoleSelectFR" className="block text-sm font-medium text-black">Select Role to Check:</label>
          <select 
            id="checkRoleSelectFR" 
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
          <label htmlFor="checkRoleAddressFR" className="block text-sm font-medium text-black">Account Address to Check:</label>
          <input 
            type="text" 
            id="checkRoleAddressFR" 
            value={checkRoleAccountAddress} 
            onChange={(e) => { setCheckRoleAccountAddress(e.target.value); setHasRoleResult(null); setHasRoleStatus('');}} 
            placeholder="0x... (e.g., ProjectFactory address for PROJECT_HANDLER_ROLE)" 
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

      {/* View Fee-Related Information for Project */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">View Project Fee Details</h3>
        <div>
          <label htmlFor="viewFeeProjectId" className="block text-sm font-medium text-black">Project ID:</label>
          <input type="text" id="viewFeeProjectId" value={viewFeeProjectId} onChange={(e) => { setViewFeeProjectId(e.target.value); setProjectFeeDetails(null); setNextPaymentInfo(null); }} placeholder="Enter Project ID (uint256)" className="mt-1 block w-full input-style text-black" />
        </div>
        <button onClick={handleViewFeeDetails} disabled={isProjectFeeDetailsLoading || isNextPaymentInfoLoading} className="button-style bg-cyan-500 hover:bg-cyan-600">
          {isProjectFeeDetailsLoading || isNextPaymentInfoLoading ? 'Loading Details...' : 'View Fee Details'}
        </button>
        {projectFeeDetails && (
          <div className="mt-3 p-3 bg-gray-100 rounded text-sm">
            <p className="font-semibold text-black"><strong>Fee Details (Project: {viewFeeProjectId}):</strong></p>
            <p className="text-black">Creation Time: {new Date(Number(projectFeeDetails.creationTime) * 1000).toLocaleString()}</p>
            <p className="text-black">Last Mgmt Fee Timestamp: {new Date(Number(projectFeeDetails.lastMgmtFeeTimestamp) * 1000).toLocaleString()}</p>
            <p className="text-black">Loan Amount: {projectFeeDetails.loanAmount?.toString()}</p>
            <p className="text-black">Developer: {projectFeeDetails.developer}</p>
            {projectFeeDetails.repaymentSchedule && (
                <div className="ml-4 mt-1">
                    <p className="font-medium">Repayment Schedule:</p>
                    <p className="text-black">Type: {projectFeeDetails.repaymentSchedule.scheduleType?.toString() === '1' ? 'Weekly' : projectFeeDetails.repaymentSchedule.scheduleType?.toString() === '2' ? 'Monthly' : 'N/A'}</p>
                    <p className="text-black">Next Payment Due: {new Date(Number(projectFeeDetails.repaymentSchedule.nextPaymentDue) * 1000).toLocaleString()}</p>
                    <p className="text-black">Payment Amount: {projectFeeDetails.repaymentSchedule.paymentAmount?.toString()}</p>
                </div>
            )}
          </div>
        )}
        {nextPaymentInfo && (
          <div className="mt-3 p-3 bg-gray-100 rounded text-sm">
            <p className="font-semibold text-black"><strong>Next Payment Info (Project: {viewFeeProjectId}):</strong></p>
            <p className="text-black">Due Date: {new Date(Number(nextPaymentInfo.dueDate) * 1000).toLocaleString()}</p>
            <p className="text-black">Amount: {nextPaymentInfo.amount?.toString()}</p>
          </div>
        )}
      </div>

      {/* Status Message */}
      {statusMessage && (
        <div className={`mt-4 p-3 rounded ${writeError || receiptError ? 'bg-red-100 text-red-700' : isConfirmed ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
          <p className="text-sm font-medium">{statusMessage}</p>
        </div>
      )}

      {/* Recent Events (RoleGranted and Treasury Updates) */}
      <div className="p-4 border rounded bg-gray-50 mt-6">
        <h3 className="text-xl font-medium text-black mb-3">Recent Events</h3>
        {(roleEvents.length === 0 && treasuryEvents.length === 0) && <p className="text-gray-600">No relevant events detected yet.</p>}
        
        {roleEvents.length > 0 && (
          <div className="mb-4">
            <h4 className="text-lg font-medium text-black mb-2">Role Granted Events:</h4>
            <ul className="space-y-3">
              {roleEvents.slice(-3).reverse().map((event, index) => { // Display last 3, newest first
                const roleName = roleHashMap[event.role] || event.role; // Fallback to hash
                const eventType = 'sender' in event ? 'RoleGranted' : 'RoleRevoked';
                return (
                  <li key={`role-${index}`} className="p-3 bg-white border border-gray-200 rounded shadow-sm">
                    <p className="text-sm text-black"><strong>Event: {eventType}</strong></p>
                    <p className="text-sm text-black"><strong>Role:</strong> {roleName} ({event.role.substring(0, 10)}...)</p>
                    <p className="text-sm text-black"><strong>Account:</strong> {event.account}</p>
                    {(event as RoleGrantedEventArgs).sender && <p className="text-sm text-black"><strong>Sender:</strong> {(event as RoleGrantedEventArgs).sender}</p>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {treasuryEvents.length > 0 && (
          <div>
            <h4 className="text-lg font-medium text-black mb-2">Treasury Update Events:</h4>
            <ul className="space-y-3">
              {treasuryEvents.slice(-3).reverse().map((event, index) => { // Display last 3, newest first
                const isProtocolTreasury = 'newTreasury' in event && 'oldTreasury' in event && Object.keys(event).length === 2; // Basic check
                return (
                  <li key={`treasury-${index}`} className="p-3 bg-white border border-gray-200 rounded shadow-sm">
                    {isProtocolTreasury ? (
                      <>
                        <p className="text-sm text-black"><strong>Event:</strong> {(event as ProtocolTreasurySetEventArgs).newTreasury ? 'ProtocolTreasurySet' : 'CarbonTreasurySet'}</p>
                        <p className="text-sm text-black"><strong>New Treasury:</strong> {(event as ProtocolTreasurySetEventArgs).newTreasury}</p>
                        <p className="text-sm text-black"><strong>Old Treasury:</strong> {(event as ProtocolTreasurySetEventArgs).oldTreasury}</p>
                      </>
                    ) : (
                      <p className="text-sm text-black">Unknown treasury event format.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Fee Routed Events */}
      <div className="p-4 border rounded bg-gray-50 mt-6">
        <h3 className="text-xl font-medium text-black mb-3">Recent FeeRouted Events</h3>
        {feeRoutedEvents.length === 0 && <p className="text-gray-600">No FeeRouted events detected yet.</p>}
        <ul className="space-y-3">
          {feeRoutedEvents.slice(-3).reverse().map((event, index) => (
              <li key={`feeRouted-${index}`} className="p-3 bg-indigo-50 border border-indigo-200 rounded shadow-sm">
                <p className="text-sm text-black"><strong>Event: FeeRouted</strong></p>
                <p className="text-black">Repayment Router: {event.repaymentRouter}</p>
                <p className="text-black">Total Fee: {event.totalFeeAmount.toString()}</p>
                <p className="text-black">Protocol Treasury: {event.protocolTreasuryAmount.toString()}</p>
                <p className="text-black">Carbon Treasury: {event.carbonTreasuryAmount.toString()}</p>
              </li>
          ))}
        </ul>
      </div>

    </div>
  );
} 