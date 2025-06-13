"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useWatchContractEvent } from 'wagmi';
import { Address, Abi, decodeEventLog, Hex, keccak256, toHex } from 'viem';
import repaymentRouterAbiJson from '@/abis/RepaymentRouter.json';
import constantsAbiJson from '@/abis/Constants.json';

type RoleGrantedEventArgs = { role: Hex; account: Address; sender: Address; };
// Add other event types if specific to RepaymentRouter are needed (e.g., RepaymentProcessed)

type RoleRevokedEventArgs = { role: Hex; account: Address; sender: Address; };

type FundingSourceSetEventArgs = {
    projectId: bigint;
    fundingSource: Address;
    poolId: bigint;
    setter: Address;
};

type RepaymentRoutedEventArgs = {
    projectId: bigint;
    payer: Address;
    totalAmountRepaid: bigint;
    feeAmount: bigint;
    principalAmount: bigint;
    interestAmount: bigint;
    fundingSource: Address;
};

interface PaymentSummary {
    totalRepaid: bigint;
    lastPayment: bigint;
    paymentCount: bigint;
}

const REPAYMENT_ROUTER_ADDRESS = process.env.NEXT_PUBLIC_REPAYMENT_ROUTER_ADDRESS as Address | undefined;

const repaymentRouterAbi = repaymentRouterAbiJson.abi;
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

export function RepaymentRouterAdmin() {
  const {} = useAccount();
  const { data: writeHash, writeContract, isPending: isWritePending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash: writeHash });

  const [isPaused, setIsPaused] = useState<boolean | null>(null);
  const [roleNames, setRoleNames] = useState<string[]>([]);
  const [selectedRoleName, setSelectedRoleName] = useState<string>('');
  const [selectedRoleBytes32, setSelectedRoleBytes32] = useState<Hex | null>(null);
  const [grantRoleToAddress, setGrantRoleToAddress] = useState<string>('');
  const [revokeRoleFromAddress, setRevokeRoleFromAddress] = useState<string>('');
  const [roleEvents, setRoleEvents] = useState<(RoleGrantedEventArgs | RoleRevokedEventArgs)[]>([]);
  const [routerEvents, setRouterEvents] = useState<(FundingSourceSetEventArgs | RepaymentRoutedEventArgs)[]>([]);
  const [roleHashMap, setRoleHashMap] = useState<{ [hash: Hex]: string }>({});
  const [statusMessage, setStatusMessage] = useState<string>('');
  // Add state for other events like RepaymentProcessed

  // State for HasRole Check
  const [checkRoleName, setCheckRoleName] = useState<string>('');
  const [checkRoleBytes32, setCheckRoleBytes32] = useState<Hex | null>(null);
  const [checkRoleAccountAddress, setCheckRoleAccountAddress] = useState<string>('');
  const [hasRoleResult, setHasRoleResult] = useState<boolean | string | null>(null);
  const [hasRoleStatus, setHasRoleStatus] = useState<string>('');

  // State for Viewing Project Info
  const [viewProjectId, setViewProjectId] = useState<string>('');
  const [fundingSourceInfo, setFundingSourceInfo] = useState<{ source: Address | null; poolId: bigint | null }>({ source: null, poolId: null });
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);

  const { data: pausedData, refetch: refetchPaused } = useReadContract({
    address: REPAYMENT_ROUTER_ADDRESS,
    abi: repaymentRouterAbi,
    functionName: 'paused',
    query: { enabled: !!REPAYMENT_ROUTER_ADDRESS }
  });

  // --- Read Hooks for Viewing Project Info (on demand) ---
  const { data: fundingSourceData, refetch: fetchFundingSource } = useReadContract({
    address: REPAYMENT_ROUTER_ADDRESS,
    abi: repaymentRouterAbi,
    functionName: 'getFundingSource',
    args: viewProjectId ? [BigInt(viewProjectId)] : undefined,
    query: { enabled: false }
  });
  const { data: poolIdData, refetch: fetchPoolId } = useReadContract({
    address: REPAYMENT_ROUTER_ADDRESS,
    abi: repaymentRouterAbi,
    functionName: 'getPoolId',
    args: viewProjectId ? [BigInt(viewProjectId)] : undefined,
    query: { enabled: false }
  });
  const { data: paymentSummaryData, refetch: fetchPaymentSummary } = useReadContract({
    address: REPAYMENT_ROUTER_ADDRESS,
    abi: repaymentRouterAbi,
    functionName: 'getProjectPaymentSummary',
    args: viewProjectId ? [BigInt(viewProjectId)] : undefined,
    query: { enabled: false }
  });

  // --- HasRole Read Hook (on demand) ---
  const { data: hasRoleData, refetch: fetchHasRole, isLoading: isHasRoleLoading, error: hasRoleError } = useReadContract({
    address: REPAYMENT_ROUTER_ADDRESS,
    abi: repaymentRouterAbi,
    functionName: 'hasRole',
    args: checkRoleBytes32 && checkRoleAccountAddress ? [checkRoleBytes32, checkRoleAccountAddress as Address] : undefined,
    query: {
      enabled: false, // Only fetch when refetch is called
    },
  });

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

  useEffect(() => { if (pausedData !== undefined) setIsPaused(pausedData as boolean); }, [pausedData]);
  
  useEffect(() => { 
    const names = getRoleNamesFromAbi(constantsAbi);
    setRoleNames(names);
    setRoleHashMap(createRoleHashMap(names));
  }, []);

  useEffect(() => {
    if (selectedRoleName) {
      try {
        setSelectedRoleBytes32(keccak256(toHex(selectedRoleName)));
        setStatusMessage('');
      } catch (e: unknown) { 
        setSelectedRoleBytes32(null); 
        if (e instanceof Error) {
            setStatusMessage(`Error computing role hash: ${e.message}`);
        } else {
            setStatusMessage('An unknown error occurred while computing role hash.');
        }
      }
    } else { setSelectedRoleBytes32(null); }
  }, [selectedRoleName]);

  useEffect(() => {
    if (checkRoleName) {
      if (checkRoleName === 'DEFAULT_ADMIN_ROLE') {
        setCheckRoleBytes32('0x0000000000000000000000000000000000000000000000000000000000000000');
        setHasRoleStatus('');
      } else {
        try {
          setCheckRoleBytes32(keccak256(toHex(checkRoleName)));
          setHasRoleStatus('');
        } catch (e: unknown) { 
          setCheckRoleBytes32(null); 
          if (e instanceof Error) {
            setHasRoleStatus(`Error computing role hash for check: ${e.message}`); 
          } else {
            setHasRoleStatus('An unknown error occurred while computing role hash for check.');
          }
        }
      }
    } else { setCheckRoleBytes32(null); }
  }, [checkRoleName]);

  useWatchContractEvent({
    address: REPAYMENT_ROUTER_ADDRESS,
    abi: repaymentRouterAbi,
    eventName: 'RoleGranted',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({ abi: repaymentRouterAbi, data: log.data, topics: log.topics, eventName: 'RoleGranted' });
          const args = decoded.args as unknown as RoleGrantedEventArgs;
          const roleName = roleHashMap[args.role] || args.role; // Fallback to hash
          setRoleEvents(prev => [...prev, args]);
          setStatusMessage(`RoleGranted Event: Role ${roleName} (${args.role.substring(0,10)}...) granted to ${args.account}`);
        } catch (e: unknown) { console.error("Error decoding RoleGranted:", e); setStatusMessage("Error processing RoleGranted event."); }
      });
    },
    onError: (error) => { console.error('Error watching RoleGranted event:', error); setStatusMessage(`Error watching RoleGranted event: ${error.message}`); }
  });

  useWatchContractEvent({
    address: REPAYMENT_ROUTER_ADDRESS,
    abi: repaymentRouterAbi,
    eventName: 'RoleRevoked',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({ abi: repaymentRouterAbi, data: log.data, topics: log.topics, eventName: 'RoleRevoked' });
          const args = decoded.args as unknown as RoleRevokedEventArgs;
          const roleName = roleHashMap[args.role] || args.role;
          setRoleEvents(prev => [...prev, args]);
          setStatusMessage(`RoleRevoked Event: Role ${roleName} (${args.role.substring(0,10)}...) revoked from ${args.account}`);
        } catch (e: unknown) { console.error("Error decoding RoleRevoked:", e); setStatusMessage("Error processing RoleRevoked event."); }
      });
    },
    onError: (error) => { console.error('Error watching RoleRevoked event:', error); setStatusMessage(`Error watching RoleRevoked event: ${error.message}`); }
  });

  // --- Other Event Watchers ---
  useWatchContractEvent({
    address: REPAYMENT_ROUTER_ADDRESS,
    abi: repaymentRouterAbi,
    eventName: 'FundingSourceSet',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({ abi: repaymentRouterAbi, data: log.data, topics: log.topics, eventName: 'FundingSourceSet' });
          const args = decoded.args as unknown as FundingSourceSetEventArgs;
          setRouterEvents(prev => [...prev, args]);
          setStatusMessage(`FundingSourceSet for Project ${args.projectId.toString()} by ${args.setter}`);
        } catch (e: unknown) { console.error("Error decoding FundingSourceSet event:", e); }
      });
    }
  });

  useWatchContractEvent({
    address: REPAYMENT_ROUTER_ADDRESS,
    abi: repaymentRouterAbi,
    eventName: 'RepaymentRouted',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({ abi: repaymentRouterAbi, data: log.data, topics: log.topics, eventName: 'RepaymentRouted' });
          const args = decoded.args as unknown as RepaymentRoutedEventArgs;
          setRouterEvents(prev => [...prev, args]);
          setStatusMessage(`RepaymentRouted for Project ${args.projectId.toString()} from ${args.payer}`);
        } catch (e: unknown) { console.error("Error decoding RepaymentRouted event:", e); }
      });
    }
  });

  const refetchAll = useCallback(() => { 
    refetchPaused(); 
    if (viewProjectId) {
      fetchFundingSource();
      fetchPoolId();
      fetchPaymentSummary();
    }
  }, [refetchPaused, viewProjectId, fetchFundingSource, fetchPoolId, fetchPaymentSummary]);

  const handleWrite = (functionName: string, args: unknown[], successMsg?: string) => {
    if (!REPAYMENT_ROUTER_ADDRESS) { setStatusMessage('Contract address not set'); return; }
    setStatusMessage('');
    writeContract({ address: REPAYMENT_ROUTER_ADDRESS, abi: repaymentRouterAbi, functionName, args },
      { onSuccess: () => setStatusMessage(successMsg || 'Tx submitted'), onError: (e) => setStatusMessage(`Error: ${e.message}`) }
    );
  };

  const handleGrantRole = () => {
    if (!selectedRoleBytes32 || !grantRoleToAddress) { setStatusMessage('Role or address missing'); return; }
    handleWrite('grantRole', [selectedRoleBytes32, grantRoleToAddress as Address], `Granting ${selectedRoleName}...`);
  };

  const handleRevokeRole = () => {
    if (!selectedRoleBytes32 || !revokeRoleFromAddress) { setStatusMessage('Role or address to revoke from missing'); return; }
    handleWrite('revokeRole', [selectedRoleBytes32, revokeRoleFromAddress as Address], `Revoking ${selectedRoleName} from ${revokeRoleFromAddress}...`);
  };

  const handleCheckHasRole = () => {
    if (!checkRoleBytes32) { setHasRoleStatus('Selected role for check is invalid or hash not computed.'); setHasRoleResult(null); return; }
    if (!checkRoleAccountAddress) { setHasRoleStatus('Please enter account address to check role.'); setHasRoleResult(null); return; }
    setHasRoleStatus('Checking role...');
    setHasRoleResult(null); // Clear previous result
    fetchHasRole();
  };

  const handlePause = () => handleWrite('pause', [], 'Pausing contract...');
  const handleUnpause = () => handleWrite('unpause', [], 'Unpausing contract...');

  const handleViewProjectInfo = () => {
    if (!viewProjectId) {
      setStatusMessage("Please enter a Project ID.");
      return;
    }
    fetchFundingSource();
    fetchPoolId();
    fetchPaymentSummary();
  };

  useEffect(() => {
    if (isConfirmed) { setStatusMessage(`Success! Hash: ${writeHash}`); refetchAll(); }
    if (writeError) { setStatusMessage(`Transaction Error: ${writeError.message}`); }
    if (receiptError) { setStatusMessage(`Receipt Error: ${receiptError.message}`); }
  }, [isConfirmed, writeHash, writeError, receiptError, refetchAll]);

  useEffect(() => {
    if (fundingSourceData || poolIdData) {
      setFundingSourceInfo({
        source: fundingSourceData as Address | null,
        poolId: poolIdData as bigint | null
      });
    }
  }, [fundingSourceData, poolIdData]);

  useEffect(() => {
    if (paymentSummaryData) {
      setPaymentSummary(paymentSummaryData as PaymentSummary);
    }
  }, [paymentSummaryData]);

  if (!REPAYMENT_ROUTER_ADDRESS) return <p className="text-red-500 p-4">Error: NEXT_PUBLIC_REPAYMENT_ROUTER_ADDRESS is not set.</p>;

  return (
    <div className="space-y-8 p-4 border rounded-lg shadow-md bg-white">
      <h2 className="text-2xl font-semibold text-black">Repayment Router Admin <span className="text-sm text-gray-600">({REPAYMENT_ROUTER_ADDRESS})</span></h2>

      <div className="p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black mb-2">Contract Status</h3>
        <p className="text-black"><strong>Paused:</strong> {isPaused === null ? 'Loading...' : isPaused ? 'Yes' : 'No'}</p>
        <button onClick={refetchAll} className="mt-2 px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">Refresh Data</button>
      </div>

      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Grant Role</h3>
        <p className="text-sm text-gray-700">Grant roles (e.g., PAUSER_ROLE). For ProjectFactory/LPM to register projects, grant PROJECT_HANDLER_ROLE. Requires appropriate admin privileges (typically DEFAULT_ADMIN_ROLE on this contract).</p>
        <div>
            <label htmlFor="roleSelectRR" className="block text-sm font-medium text-black">Select Role:</label>
            <select id="roleSelectRR" value={selectedRoleName} onChange={(e) => setSelectedRoleName(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black">
            <option value="">-- Select Role --</option>
            {roleNames.map(name => (<option key={name} value={name}>{name}</option>))}
            </select>
            {selectedRoleName && <p className="text-xs text-gray-600 mt-1">Computed Role Hash: {selectedRoleBytes32 || (selectedRoleName ? 'Calculating...' : 'N/A')}</p>}
        </div>
        <div>
            <label htmlFor="grantRoleAddressRR" className="block text-sm font-medium text-black">Address to Grant Role:</label>
            <input type="text" id="grantRoleAddressRR" value={grantRoleToAddress} onChange={(e) => setGrantRoleToAddress(e.target.value)} placeholder="0x... (e.g., ProjectFactory for PROJECT_HANDLER_ROLE)" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500" />
        </div>
        <button onClick={handleGrantRole} disabled={!selectedRoleBytes32 || !grantRoleToAddress || isWritePending || isConfirming} className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed">Grant Role</button>
        <div className="mt-4">
            <label htmlFor="revokeRoleAddressRR" className="block text-sm font-medium text-black">Address to Revoke Role From:</label>
            <input type="text" id="revokeRoleAddressRR" value={revokeRoleFromAddress} onChange={(e) => setRevokeRoleFromAddress(e.target.value)} placeholder="0x..." className="mt-1 block w-full input-style text-black" />
        </div>
        <button onClick={handleRevokeRole} disabled={!selectedRoleBytes32 || !revokeRoleFromAddress || isWritePending || isConfirming} className="mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400">Revoke Role</button>
      </div>

      {/* Check Role Section */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Check Role (hasRole)</h3>
        <div>
            <label htmlFor="checkRoleSelectRR" className="block text-sm font-medium text-black">Select Role to Check:</label>
            <select 
              id="checkRoleSelectRR" 
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
            <label htmlFor="checkRoleAddressRR" className="block text-sm font-medium text-black">Account Address to Check:</label>
            <input 
              type="text" 
              id="checkRoleAddressRR" 
              value={checkRoleAccountAddress} 
              onChange={(e) => { setCheckRoleAccountAddress(e.target.value); setHasRoleResult(null); setHasRoleStatus('');}} 
              placeholder="0x... (e.g., ProjectFactory for PROJECT_HANDLER_ROLE)" 
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
      
      {/* View Project Info */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">View Project Routing Info</h3>
        <div>
          <label htmlFor="viewProjectId" className="block text-sm font-medium text-black">Project ID:</label>
          <input type="text" id="viewProjectId" value={viewProjectId} onChange={(e) => { setViewProjectId(e.target.value); setFundingSourceInfo({source: null, poolId: null}); setPaymentSummary(null); }} placeholder="Enter Project ID" className="input-style text-black" />
        </div>
        <button onClick={handleViewProjectInfo} disabled={!viewProjectId} className="button-style bg-cyan-500 hover:bg-cyan-600">View Info</button>
        {fundingSourceInfo.source && (
          <div className="mt-2 p-2 bg-gray-100 rounded text-sm">
            <p><strong>Funding Source:</strong> {fundingSourceInfo.source}</p>
            <p><strong>Pool ID:</strong> {fundingSourceInfo.poolId?.toString() ?? 'N/A'}</p>
          </div>
        )}
        {paymentSummary && (
          <div className="mt-2 p-2 bg-gray-100 rounded text-sm">
            <p className="font-semibold"><strong>Payment Summary:</strong></p>
            <p>Total Repaid: {paymentSummary.totalRepaid?.toString()}</p>
            <p>Payment Count: {paymentSummary.paymentCount?.toString()}</p>
            <p>Last Payment: {paymentSummary.lastPayment > 0 ? new Date(Number(paymentSummary.lastPayment) * 1000).toLocaleString() : 'N/A'}</p>
          </div>
        )}
      </div>

      <div className="p-4 border rounded bg-gray-100">
          <h3 className="text-xl font-medium text-black">Other Admin Functions</h3>
          <p className="italic text-gray-700">The `repay` function is called by developers, not admins. `setFundingSource` is called by ProjectFactory/LiquidityPoolManager.</p>
      </div>

      {statusMessage && (
        <div className={`mt-4 p-3 rounded ${writeError || receiptError ? 'bg-red-100 text-red-700' : isConfirmed ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
            <p className="text-sm font-medium">{statusMessage}</p>
        </div>
      )}

      {roleEvents.length > 0 && (
        <div className="p-4 border rounded bg-gray-50 mt-6">
          <h3 className="text-xl font-medium text-black mb-3">Recent RoleGranted Events</h3>
          {roleEvents.length === 0 && <p className="text-gray-600">No RoleGranted events detected yet.</p>}
          <ul className="space-y-3">
            {roleEvents.slice(-5).reverse().map((event, index) => {
              const roleName = roleHashMap[event.role] || event.role; // Fallback to hash
              const eventType = 'sender' in event ? 'RoleGranted' : 'RoleRevoked';
              return (
                <li key={`role-${index}`} className="p-3 bg-white border border-gray-200 rounded shadow-sm">
                  <p className="text-sm text-black"><strong>Event: {eventType}</strong></p>
                  <p className="text-sm text-black"><strong>Role:</strong> {roleName} ({event.role.substring(0, 10)}...)</p>
                  {'sender' in event && event.sender && <p className="text-sm text-black"><strong>Sender:</strong> {(event as RoleGrantedEventArgs).sender}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {routerEvents.length > 0 && (
        <div className="p-4 border rounded bg-gray-50 mt-6">
            <h3 className="text-xl font-medium text-black mb-3">Recent Router Events</h3>
            <ul className="space-y-3">
                {routerEvents.slice(-5).reverse().map((event, index) => {
                    if ('setter' in event) { // FundingSourceSet
                        return (
                            <li key={`router-event-${index}`} className="p-3 bg-blue-50 border-blue-200 rounded shadow-sm text-xs">
                                <p><strong>FundingSourceSet:</strong> Project {event.projectId.toString()} set by {event.setter}</p>
                                <p>Source: {event.fundingSource}, Pool ID: {event.poolId.toString()}</p>
                            </li>
                        )
                    } else { // RepaymentRouted
                        const e = event as RepaymentRoutedEventArgs;
                        return (
                            <li key={`router-event-${index}`} className="p-3 bg-green-50 border-green-200 rounded shadow-sm text-xs">
                                <p><strong>RepaymentRouted:</strong> Project {e.projectId.toString()} by {e.payer}</p>
                                <p>Total: {e.totalAmountRepaid.toString()}, Fee: {e.feeAmount.toString()}, Principal: {e.principalAmount.toString()}, Interest: {e.interestAmount.toString()}</p>
                            </li>
                        )
                    }
                })}
            </ul>
        </div>
      )}
    </div>
  );
} 