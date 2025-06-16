"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useWatchContractEvent } from 'wagmi';
import { Address, Abi, decodeEventLog, Hex, keccak256, toHex } from 'viem';
import pausableGovernorAbiJson from '@/abis/PausableGovernor.json';
import constantsAbiJson from '@/abis/Constants.json';

// Event Argument Types
type RoleGrantedEventArgs = { role: Hex; account: Address; sender: Address; };
type RoleRevokedEventArgs = { role: Hex; account: Address; sender: Address; };
type PausedTargetEventArgs = { target: Address; pauser: Address; };
type UnpausedTargetEventArgs = { target: Address; unpauser: Address; };
type PausableContractAddedEventArgs = { target: Address; admin: Address; };
type PausableContractRemovedEventArgs = { target: Address; admin: Address; };


const PAUSABLE_GOVERNOR_ADDRESS = process.env.NEXT_PUBLIC_PAUSABLE_GOVERNOR_ADDRESS as Address | undefined;

const pausableGovernorAbi = pausableGovernorAbiJson.abi as Abi;
const constantsAbi = constantsAbiJson.abi as Abi;

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

export function PausableGovernorAdmin() {
  const {} = useAccount();
  const { data: writeHash, writeContract, isPending: isWritePending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash: writeHash });

  const [statusMessage, setStatusMessage] = useState<string>('');

  // Role Management State
  const [roleNames, setRoleNames] = useState<string[]>([]);
  const [roleHashMap, setRoleHashMap] = useState<{ [hash: Hex]: string }>({});
  const [selectedRoleName, setSelectedRoleName] = useState<string>('');
  const [selectedRoleBytes32, setSelectedRoleBytes32] = useState<Hex | null>(null);
  const [grantRoleToAddress, setGrantRoleToAddress] = useState<string>('');
  const [revokeRoleFromAddress, setRevokeRoleFromAddress] = useState<string>('');
  const [checkRoleName, setCheckRoleName] = useState<string>('');
  const [checkRoleBytes32, setCheckRoleBytes32] = useState<Hex | null>(null);
  const [checkRoleAccountAddress, setCheckRoleAccountAddress] = useState<string>('');
  const [hasRoleResult, setHasRoleResult] = useState<boolean | string | null>(null);
  const [hasRoleStatus, setHasRoleStatus] = useState<string>('');

  // Governor Specific State
  const [targetContractAddress, setTargetContractAddress] = useState<string>('');
  const [managedContracts, setManagedContracts] = useState<Address[]>([]);
  const [roleEvents, setRoleEvents] = useState<(RoleGrantedEventArgs | RoleRevokedEventArgs)[]>([]);
  const [governorEvents, setGovernorEvents] = useState<(
      (PausedTargetEventArgs & { eventName: 'Paused' }) |
      (UnpausedTargetEventArgs & { eventName: 'Unpaused' }) |
      (PausableContractAddedEventArgs & { eventName: 'PausableContractAdded' }) |
      (PausableContractRemovedEventArgs & { eventName: 'PausableContractRemoved' })
    )[]>([]);

  // Read: isPausableContract
  const { data: isPausableContractResult, refetch: checkIsPausable } = useReadContract({
    address: PAUSABLE_GOVERNOR_ADDRESS,
    abi: pausableGovernorAbi,
    functionName: 'isPausableContract',
    args: targetContractAddress ? [targetContractAddress as Address] : undefined,
    query: { enabled: false }
  });
  
  const { data: hasRoleData, refetch: fetchHasRole, isLoading: isHasRoleLoading } = useReadContract({
    address: PAUSABLE_GOVERNOR_ADDRESS,
    abi: pausableGovernorAbi,
    functionName: 'hasRole',
    args: checkRoleBytes32 && checkRoleAccountAddress ? [checkRoleBytes32, checkRoleAccountAddress as Address] : undefined,
    query: { enabled: false },
  });

  useEffect(() => {
    const names = getRoleNamesFromAbi(constantsAbi);
    setRoleNames(names);
    setRoleHashMap(createRoleHashMap(names));
  }, []);

  useEffect(() => {
    if (selectedRoleName) {
      if (selectedRoleName === 'DEFAULT_ADMIN_ROLE') {
        setSelectedRoleBytes32('0x0000000000000000000000000000000000000000000000000000000000000000');
      } else {
        try {
          setSelectedRoleBytes32(keccak256(toHex(selectedRoleName)));
        } catch (e: unknown) { 
          console.error("Error computing role hash:", e); 
          setSelectedRoleBytes32(null);
          if (e instanceof Error) setStatusMessage(`Error computing role hash: ${e.message}`);
          else setStatusMessage('Unknown error computing role hash.');
         }
      }
    } else { 
      setSelectedRoleBytes32(null); 
    }
  }, [selectedRoleName]);

  useEffect(() => {
    if (checkRoleName) {
      if (checkRoleName === 'DEFAULT_ADMIN_ROLE') {
        setCheckRoleBytes32('0x0000000000000000000000000000000000000000000000000000000000000000');
      } else {
        try {
          setCheckRoleBytes32(keccak256(toHex(checkRoleName)));
        } catch (e: unknown) { 
          console.error("Error computing check role hash:", e); 
          setCheckRoleBytes32(null); 
          if (e instanceof Error) setStatusMessage(`Error computing check role hash: ${e.message}`);
          else setStatusMessage('Unknown error computing check role hash.');
        }
      }
    } else { 
      setCheckRoleBytes32(null); 
    }
  }, [checkRoleName]);
  
  useEffect(() => { if (hasRoleData !== undefined) setHasRoleResult(hasRoleData as boolean); }, [hasRoleData]);

  // Event Watchers
  useWatchContractEvent({
      address: PAUSABLE_GOVERNOR_ADDRESS,
      abi: pausableGovernorAbi,
      eventName: 'RoleGranted',
      onLogs(logs) {
          logs.forEach(log => {
              try {
                const decoded = decodeEventLog({ abi: pausableGovernorAbi, data: log.data, topics: log.topics, eventName: 'RoleGranted'});
                const args = decoded.args as unknown as RoleGrantedEventArgs;
                const roleName = roleHashMap[args.role] || args.role;
                setRoleEvents(prev => [...prev, args]);
                setStatusMessage(`RoleGranted Event: Role ${roleName} granted to ${args.account}`);
              } catch(e: unknown) { console.error("Error decoding RoleGranted:", e); }
          });
      }
  });
  useWatchContractEvent({
      address: PAUSABLE_GOVERNOR_ADDRESS,
      abi: pausableGovernorAbi,
      eventName: 'RoleRevoked',
      onLogs(logs) {
          logs.forEach(log => {
            try {
                const decoded = decodeEventLog({ abi: pausableGovernorAbi, data: log.data, topics: log.topics, eventName: 'RoleRevoked'});
                const args = decoded.args as unknown as RoleRevokedEventArgs;
                const roleName = roleHashMap[args.role] || args.role;
                setRoleEvents(prev => [...prev, args]);
                setStatusMessage(`RoleRevoked Event: Role ${roleName} revoked from ${args.account}`);
            } catch(e: unknown) { console.error("Error decoding RoleRevoked:", e); }
          });
      }
  });
  useWatchContractEvent({
      address: PAUSABLE_GOVERNOR_ADDRESS,
      abi: pausableGovernorAbi,
      eventName: 'Paused',
      onLogs(logs) {
          logs.forEach(log => {
            try {
                const decoded = decodeEventLog({ abi: pausableGovernorAbi, data: log.data, topics: log.topics, eventName: 'Paused'});
                const args = decoded.args as unknown as PausedTargetEventArgs; 
                setGovernorEvents(prev => [...prev, { ...args, eventName: 'Paused' as const}]);
                setStatusMessage(`Paused Event: Target ${args.target} by ${args.pauser}`);
            } catch(e: unknown) { console.error("Error decoding Paused event:", e); }
          });
      }
  });
    useWatchContractEvent({
      address: PAUSABLE_GOVERNOR_ADDRESS,
      abi: pausableGovernorAbi,
      eventName: 'Unpaused',
      onLogs(logs) {
          logs.forEach(log => {
            try {
                const decoded = decodeEventLog({ abi: pausableGovernorAbi, data: log.data, topics: log.topics, eventName: 'Unpaused'});
                const args = decoded.args as unknown as UnpausedTargetEventArgs; 
                setGovernorEvents(prev => [...prev, { ...args, eventName: 'Unpaused' as const}]);
                setStatusMessage(`Unpaused Event: Target ${args.target} by ${args.unpauser}`);
            } catch(e: unknown) { console.error("Error decoding Unpaused event:", e); }
          });
      }
  });
  useWatchContractEvent({
      address: PAUSABLE_GOVERNOR_ADDRESS,
      abi: pausableGovernorAbi,
      eventName: 'PausableContractAdded',
      onLogs(logs) {
          logs.forEach(log => {
            try {
                const decoded = decodeEventLog({ abi: pausableGovernorAbi, data: log.data, topics: log.topics, eventName: 'PausableContractAdded'});
                const args = decoded.args as unknown as PausableContractAddedEventArgs;
                setGovernorEvents(prev => [...prev, { ...args, eventName: 'PausableContractAdded' as const}]);
                setStatusMessage(`PausableContractAdded Event: Target ${args.target} by ${args.admin}`);
                setManagedContracts(prev => [...prev, args.target]);
            } catch(e: unknown) { console.error("Error decoding PausableContractAdded event:", e); }
          });
      }
  });
  useWatchContractEvent({
      address: PAUSABLE_GOVERNOR_ADDRESS,
      abi: pausableGovernorAbi,
      eventName: 'PausableContractRemoved',
      onLogs(logs) {
          logs.forEach(log => {
            try {
                const decoded = decodeEventLog({ abi: pausableGovernorAbi, data: log.data, topics: log.topics, eventName: 'PausableContractRemoved'});
                const args = decoded.args as unknown as PausableContractRemovedEventArgs;
                setGovernorEvents(prev => [...prev, { ...args, eventName: 'PausableContractRemoved' as const}]);
                setStatusMessage(`PausableContractRemoved Event: Target ${args.target} by ${args.admin}`);
                setManagedContracts(prev => prev.filter(addr => addr.toLowerCase() !== args.target.toLowerCase()));
            } catch(e: unknown) { console.error("Error decoding PausableContractRemoved event:", e); }
          });
      }
  });


  const refetchAll = useCallback(() => { /* Potentially refetch managed contracts if not relying solely on events */ }, []);

  const handleWrite = (functionName: string, args: unknown[], successMessage?: string) => {
    if (!PAUSABLE_GOVERNOR_ADDRESS) { setStatusMessage('Pausable Governor contract address not set'); return; }
    writeContract({
      address: PAUSABLE_GOVERNOR_ADDRESS,
      abi: pausableGovernorAbi,
      functionName,
      args,
    }, {
      onSuccess: () => setStatusMessage(successMessage || 'Transaction submitted...'),
      onError: (error) => setStatusMessage(`Submission Error: ${error.message}`),
    });
  };

  const handleGrantRole = () => {
    if (!selectedRoleBytes32 || !grantRoleToAddress) { setStatusMessage('Role or address missing.'); return; }
    handleWrite('grantRole', [selectedRoleBytes32, grantRoleToAddress as Address], `Granting ${selectedRoleName} role...`);
  };

  const handleRevokeRole = () => {
    if (!selectedRoleBytes32 || !revokeRoleFromAddress) { setStatusMessage('Role or address to revoke from missing.'); return; }
    handleWrite('revokeRole', [selectedRoleBytes32, revokeRoleFromAddress as Address], `Revoking ${selectedRoleName} role...`);
  };
  
  const handleCheckHasRole = () => {
    if (!checkRoleBytes32 || !checkRoleAccountAddress) { setHasRoleStatus('Role or account address missing for check.'); setHasRoleResult(null); return; }
    setHasRoleStatus("Checking...");
    setHasRoleResult(null);
    fetchHasRole();
  };

  const handlePauseTarget = () => {
    if (!targetContractAddress) { setStatusMessage('Target contract address missing.'); return; }
    handleWrite('pause', [targetContractAddress as Address], `Pausing ${targetContractAddress}...`);
  };

  const handleUnpauseTarget = () => {
    if (!targetContractAddress) { setStatusMessage('Target contract address missing.'); return; }
    handleWrite('unpause', [targetContractAddress as Address], `Unpausing ${targetContractAddress}...`);
  };

  const handleAddPausable = () => {
    if (!targetContractAddress) { setStatusMessage('Target contract address missing.'); return; }
    handleWrite('addPausableContract', [targetContractAddress as Address], `Adding ${targetContractAddress} to pausable list...`);
  };

  const handleRemovePausable = () => {
    if (!targetContractAddress) { setStatusMessage('Target contract address missing.'); return; }
    handleWrite('removePausableContract', [targetContractAddress as Address], `Removing ${targetContractAddress} from pausable list...`);
  };
  
  const handleCheckIsPausable = () => {
    if (!targetContractAddress) { setStatusMessage('Target contract address missing.'); return; }
    checkIsPausable();
  }

  useEffect(() => {
    if (isPausableContractResult !== undefined) {
        setStatusMessage(`Contract ${targetContractAddress} isPausable: ${isPausableContractResult}`);
    }
  }, [isPausableContractResult, targetContractAddress]);


  useEffect(() => {
    if (isConfirmed) { setStatusMessage(`Transaction successful! Hash: ${writeHash}`); refetchAll(); }
    if (writeError) { setStatusMessage(`Transaction Error: ${writeError.message}`); }
    if (receiptError) { setStatusMessage(`Receipt Error: ${receiptError.message}`); }
  }, [isConfirmed, writeHash, writeError, receiptError, refetchAll]);

  if (!PAUSABLE_GOVERNOR_ADDRESS) {
    return <p className="text-red-500">Error: NEXT_PUBLIC_PAUSABLE_GOVERNOR_ADDRESS is not set.</p>;
  }

  return (
    <div className="space-y-8 p-4 border rounded-lg shadow-md bg-white">
      <h2 className="text-2xl font-semibold text-black">Pausable Governor Admin <span className="text-sm text-gray-600">({PAUSABLE_GOVERNOR_ADDRESS})</span></h2>
        {statusMessage && <p className={`text-sm p-2 my-2 rounded ${writeError || receiptError ? 'bg-red-100 text-red-700' : isConfirmed ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{statusMessage}</p>}

      {/* Role Management */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Role Management (for Governor)</h3>
        <p className="text-sm text-gray-700">Manage PAUSER_ROLE (to pause/unpause contracts via governor) and DEFAULT_ADMIN_ROLE (to add/remove pausable contracts).</p>
        {/* Grant Role */}
        <div>
          <label className="block text-sm font-medium">Select Role:</label>
          <select value={selectedRoleName} onChange={(e) => setSelectedRoleName(e.target.value)} className="input-style">
            <option value="">-- Select Role --</option>
            <option value="DEFAULT_ADMIN_ROLE">DEFAULT_ADMIN_ROLE</option>
            {roleNames.filter(name => name === 'PAUSER_ROLE').map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Address to Grant/Revoke Role:</label>
          <input type="text" value={grantRoleToAddress} onChange={(e) => {setGrantRoleToAddress(e.target.value); setRevokeRoleFromAddress(e.target.value);}} placeholder="0x..." className="input-style" />
        </div>
        <div className="flex space-x-2">
            <button onClick={handleGrantRole} disabled={!selectedRoleBytes32 || !grantRoleToAddress || isWritePending || isConfirming} className="button-style bg-orange-500 hover:bg-orange-600">Grant Role</button>
            <button onClick={handleRevokeRole} disabled={!selectedRoleBytes32 || !revokeRoleFromAddress || isWritePending || isConfirming} className="button-style bg-red-500 hover:bg-red-600">Revoke Role</button>
        </div>
        {/* Check Role */}
        <div className="mt-4">
            <label htmlFor="checkRoleNameGov" className="block text-sm font-medium">Select Role to Check:</label>
            <select id="checkRoleNameGov" value={checkRoleName} onChange={(e) => { setCheckRoleName(e.target.value); setHasRoleResult(null); setHasRoleStatus('');}} className="input-style">
                <option value="">-- Select Role --</option>
                <option value="DEFAULT_ADMIN_ROLE">DEFAULT_ADMIN_ROLE</option>
                {roleNames.filter(name => name === 'PAUSER_ROLE').map(name => <option key={`check-${name}`} value={name}>{name}</option>)}
            </select>
            <label htmlFor="checkRoleAccGov" className="block text-sm font-medium mt-2">Account Address to Check:</label>
            <input type="text" id="checkRoleAccGov" value={checkRoleAccountAddress} onChange={(e) => {setCheckRoleAccountAddress(e.target.value); setHasRoleResult(null); setHasRoleStatus('');}} placeholder="0x..." className="input-style" />
            <button onClick={handleCheckHasRole} disabled={!checkRoleBytes32 || !checkRoleAccountAddress || isHasRoleLoading} className="button-style bg-teal-500 hover:bg-teal-600 mt-1">
              {isHasRoleLoading ? 'Checking...' : 'Check Role'}
            </button>
            {hasRoleStatus && <p className="text-xs text-gray-600">{hasRoleStatus}</p>}
            {hasRoleResult !== null && <p>Has Role: {hasRoleResult.toString()}</p>}
        </div>
      </div>

      {/* Pause/Unpause Target Contract */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Pause/Unpause Registered Contract</h3>
        <p className="text-sm text-gray-700">Requires this connected wallet to have PAUSER_ROLE on the PausableGovernor.</p>
        <div>
          <label htmlFor="targetContract" className="block text-sm font-medium">Target Contract Address:</label>
          <input type="text" id="targetContract" value={targetContractAddress} onChange={(e) => setTargetContractAddress(e.target.value)} placeholder="0x... address of registered contract" className="input-style" />
        </div>
        <div className="flex space-x-2">
            <button onClick={handlePauseTarget} disabled={!targetContractAddress || isWritePending || isConfirming} className="button-style bg-yellow-500 hover:bg-yellow-600">Pause Target</button>
            <button onClick={handleUnpauseTarget} disabled={!targetContractAddress || isWritePending || isConfirming} className="button-style bg-green-500 hover:bg-green-600">Unpause Target</button>
        </div>
      </div>

      {/* Manage Pausable Contracts List */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Manage Pausable Contracts List</h3>
        <p className="text-sm text-gray-700">Requires this connected wallet to have DEFAULT_ADMIN_ROLE on the PausableGovernor.</p>
        <p className="text-xs text-orange-600">Note: Adding a contract here only registers it with the governor. The target contract must separately grant PAUSER_ROLE to this PausableGovernor contract ({PAUSABLE_GOVERNOR_ADDRESS}).</p>
        <div>
          <label htmlFor="manageTargetContract" className="block text-sm font-medium">Target Contract Address for List Management:</label>
          <input type="text" id="manageTargetContract" value={targetContractAddress} onChange={(e) => setTargetContractAddress(e.target.value)} placeholder="0x... address of contract" className="input-style" />
        </div>
        <div className="flex space-x-2">
            <button onClick={handleAddPausable} disabled={!targetContractAddress || isWritePending || isConfirming} className="button-style bg-blue-500 hover:bg-blue-600">Add to Pausable List</button>
            <button onClick={handleRemovePausable} disabled={!targetContractAddress || isWritePending || isConfirming} className="button-style bg-red-500 hover:bg-red-600">Remove from Pausable List</button>
            <button onClick={handleCheckIsPausable} disabled={!targetContractAddress} className="button-style bg-gray-400 hover:bg-gray-500">Check if Pausable</button>
        </div>
      </div>
      
      {/* View Governor Configuration / Managed Contracts */}
      <div className="p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Currently Managed Pausable Contracts</h3>
        {managedContracts.length === 0 && <p className="text-gray-700">No contracts explicitly added/removed in this session (list populated by events).</p>}
        <ul className="list-disc pl-5">
            {managedContracts.map((addr, i) => <li key={i} className="text-sm font-mono">{addr}</li>)}
        </ul>
      </div>
      
      {/* Event Logs */} 
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 border rounded bg-gray-50">
          <h3 className="text-lg font-medium text-black mb-2">Recent Role Events (Governor)</h3>
          {roleEvents.length === 0 && <p className="text-xs text-gray-500">No role events.</p>}
          <ul className="text-xs space-y-1">
            {roleEvents.slice(-5).reverse().map((event, i) => {
                const eventType = 'sender' in event ? 'RoleGranted' : 'RoleRevoked';
                return <li key={`role-${i}`}>{`${eventType}: ${roleHashMap[event.role] || event.role.substring(0,10)+"..."} to/from ${event.account}`}</li>
            })}
          </ul>
        </div>
        <div className="p-4 border rounded bg-gray-50">
          <h3 className="text-lg font-medium text-black mb-2">Recent Governor Action Events</h3>
          {governorEvents.length === 0 && <p className="text-xs text-gray-500">No governor action events.</p>}
          <ul className="text-xs space-y-1">
            {governorEvents.slice(-5).reverse().map((event, i) => {
                let details = `Target: ${event.target}`;
                if ('pauser' in event) details += `, Pauser: ${event.pauser}`;
                if ('unpauser' in event) details += `, Unpauser: ${event.unpauser}`;
                if ('admin' in event) details += `, Admin: ${event.admin}`;

                return (<li key={`gov-${i}`}>{`${event.eventName}: ${details}`}</li>);
            })}
          </ul>
        </div>
      </div>
    </div>
  );
} 