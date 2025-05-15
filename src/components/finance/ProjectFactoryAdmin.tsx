"use client";

import React, { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useWatchContractEvent } from 'wagmi';
import { Address, Abi, decodeEventLog, Hex, keccak256, toHex } from 'viem';
import projectFactoryAbiJson from '@/abis/ProjectFactory.json';
import constantsAbiJson from '@/abis/Constants.json';

type RoleGrantedEventArgs = { role: Hex; account: Address; sender: Address; };
type RoleRevokedEventArgs = { role: Hex; account: Address; sender: Address; };
type AddressesSetEventArgs = {
    liquidityPoolManager: Address;
    vaultImplementation: Address;
    devEscrowImplementation: Address;
    repaymentRouter: Address;
    feeRouter: Address;
    riskRateOracleAdapter: Address;
    pauserAdminForClones: Address;
    adminForVaultClones: Address;
    protocolTreasury: Address;
    // Add other fields from the event if necessary
};

type ProjectCreatedEventArgs = { 
  projectId: Hex; // bytes32
  projectAddress: Address; 
  developer: Address; 
  // Add other fields from the event as necessary
};

const PROJECT_FACTORY_ADDRESS = process.env.NEXT_PUBLIC_PROJECT_FACTORY_ADDRESS as Address | undefined;

const projectFactoryAbi = projectFactoryAbiJson.abi;
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

export function ProjectFactoryAdmin() {
  const { address: connectedAddress } = useAccount();
  const { data: writeHash, writeContract, isPending: isWritePending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash: writeHash });

  const [isPaused, setIsPaused] = useState<boolean | null>(null);
  const [developerRegistry, setDeveloperRegistry] = useState<Address | null>(null);
  const [protocolTreasury, setProtocolTreasury] = useState<Address | null>(null);
  const [newDeveloperRegistry, setNewDeveloperRegistry] = useState<string>('');
  const [newProtocolTreasury, setNewProtocolTreasury] = useState<string>('');

  // State for setAddresses function
  const [saLPM, setSaLPM] = useState<string>('');
  const [saVaultImpl, setSaVaultImpl] = useState<string>('');
  const [saDevEscrowImpl, setSaDevEscrowImpl] = useState<string>('');
  const [saRepaymentRouter, setSaRepaymentRouter] = useState<string>('');
  const [saFeeRouter, setSaFeeRouter] = useState<string>('');
  const [saRiskOracleAdapter, setSaRiskOracleAdapter] = useState<string>('');
  const [saPauserAdminClones, setSaPauserAdminClones] = useState<string>('');
  const [saAdminVaultClones, setSaAdminVaultClones] = useState<string>('');
  const [saProtocolTreasury, setSaProtocolTreasury] = useState<string>(''); // For setAddresses

  const [roleNames, setRoleNames] = useState<string[]>([]);
  const [selectedRoleName, setSelectedRoleName] = useState<string>('');
  const [selectedRoleBytes32, setSelectedRoleBytes32] = useState<Hex | null>(null);
  const [grantRoleToAddress, setGrantRoleToAddress] = useState<string>('');
  const [revokeRoleFromAddress, setRevokeRoleFromAddress] = useState<string>('');
  const [roleEvents, setRoleEvents] = useState<(RoleGrantedEventArgs | RoleRevokedEventArgs)[]>([]);
  const [projectEvents, setProjectEvents] = useState<ProjectCreatedEventArgs[]>([]);
  const [addressesSetEvents, setAddressesSetEvents] = useState<AddressesSetEventArgs[]>([]);
  const [roleHashMap, setRoleHashMap] = useState<{ [hash: Hex]: string }>({});
  const [statusMessage, setStatusMessage] = useState<string>('');

  // State for HasRole Check
  const [checkRoleName, setCheckRoleName] = useState<string>('');
  const [checkRoleBytes32, setCheckRoleBytes32] = useState<Hex | null>(null);
  const [checkRoleAccountAddress, setCheckRoleAccountAddress] = useState<string>('');
  const [hasRoleResult, setHasRoleResult] = useState<boolean | string | null>(null);
  const [hasRoleStatus, setHasRoleStatus] = useState<string>('');

  const { data: pausedData, refetch: refetchPaused } = useReadContract({
    address: PROJECT_FACTORY_ADDRESS, abi: projectFactoryAbi, functionName: 'paused',
    query: { enabled: !!PROJECT_FACTORY_ADDRESS }
  });
  const { data: devRegData, refetch: refetchDevReg } = useReadContract({
    address: PROJECT_FACTORY_ADDRESS, abi: projectFactoryAbi, functionName: 'developerRegistry',
    query: { enabled: !!PROJECT_FACTORY_ADDRESS }
  });
  const { data: protoTreasuryData, refetch: refetchProtoTreasury } = useReadContract({
    address: PROJECT_FACTORY_ADDRESS, abi: projectFactoryAbi, functionName: 'protocolTreasury',
    query: { enabled: !!PROJECT_FACTORY_ADDRESS }
  });

  // --- HasRole Read Hook (on demand) ---
  const { data: hasRoleData, refetch: fetchHasRole, isLoading: isHasRoleLoading, error: hasRoleError } = useReadContract({
    address: PROJECT_FACTORY_ADDRESS,
    abi: projectFactoryAbi,
    functionName: 'hasRole',
    args: checkRoleBytes32 && checkRoleAccountAddress ? [checkRoleBytes32, checkRoleAccountAddress as Address] : undefined,
    query: {
      enabled: false, // Only fetch when refetch is called
    },
  });

  useEffect(() => { if (pausedData !== undefined) setIsPaused(pausedData as boolean); }, [pausedData]);
  useEffect(() => { if (devRegData) setDeveloperRegistry(devRegData as Address); }, [devRegData]);
  useEffect(() => { if (protoTreasuryData) setProtocolTreasury(protoTreasuryData as Address); }, [protoTreasuryData]);
  
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
      } catch (e: any) { setSelectedRoleBytes32(null); setStatusMessage(`Error computing role hash: ${e.message}`); }
    } else { setSelectedRoleBytes32(null); }
  }, [selectedRoleName]);

  useEffect(() => {
    if (checkRoleName) {
      if (checkRoleName === 'DEFAULT_ADMIN_ROLE') {
        setCheckRoleBytes32('0x0000000000000000000000000000000000000000000000000000000000000000');
        setHasRoleStatus('');
      } else {
        try {
          setSelectedRoleBytes32(keccak256(toHex(checkRoleName)));
          setHasRoleStatus('');
        } catch (e: any) { 
          setCheckRoleBytes32(null); 
          setHasRoleStatus(`Error computing role hash for check: ${e.message}`); 
        }
      }
    } else { setCheckRoleBytes32(null); }
  }, [checkRoleName]);

  useWatchContractEvent({
    address: PROJECT_FACTORY_ADDRESS, abi: projectFactoryAbi, eventName: 'RoleGranted',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({ abi: projectFactoryAbi, data: log.data, topics: log.topics, eventName: 'RoleGranted' });
          const args = decoded.args as unknown as RoleGrantedEventArgs;
          const roleName = roleHashMap[args.role] || args.role; // Fallback to hash
          setRoleEvents(prev => [...prev, args]);
          setStatusMessage(`RoleGranted Event: Role ${roleName} (${args.role.substring(0,10)}...) granted to ${args.account}`);
        } catch (e) { console.error("Error decoding RoleGranted:", e); setStatusMessage("Error processing RoleGranted event."); }
      });
    },
    onError: (error) => { console.error('Error watching RoleGranted event:', error); setStatusMessage(`Error watching RoleGranted event: ${error.message}`);}
  });

  useWatchContractEvent({
    address: PROJECT_FACTORY_ADDRESS, abi: projectFactoryAbi, eventName: 'RoleRevoked',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({ abi: projectFactoryAbi, data: log.data, topics: log.topics, eventName: 'RoleRevoked' });
          const args = decoded.args as unknown as RoleRevokedEventArgs;
          const roleName = roleHashMap[args.role] || args.role;
          setRoleEvents(prev => [...prev, args]);
          setStatusMessage(`RoleRevoked Event: Role ${roleName} (${args.role.substring(0,10)}...) revoked from ${args.account}`);
        } catch (e) { console.error("Error decoding RoleRevoked:", e); setStatusMessage("Error processing RoleRevoked event."); }
      });
    },
    onError: (error) => { console.error('Error watching RoleRevoked event:', error); setStatusMessage(`Error watching RoleRevoked event: ${error.message}`);}
  });

  useWatchContractEvent({
    address: PROJECT_FACTORY_ADDRESS, abi: projectFactoryAbi, eventName: 'ProjectCreated',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({ abi: projectFactoryAbi, data: log.data, topics: log.topics, eventName: 'ProjectCreated' });
          setProjectEvents(prev => [...prev, decoded.args as unknown as ProjectCreatedEventArgs]);
          setStatusMessage(`Event: ProjectCreated ${ (decoded.args as any).projectId.substring(0,10)}...`);
        } catch (e) { console.error("Error decoding ProjectCreated:", e); setStatusMessage("Error processing event."); }
      });
    }
  });

  useWatchContractEvent({
    address: PROJECT_FACTORY_ADDRESS, abi: projectFactoryAbi, eventName: 'AddressesSet',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({ abi: projectFactoryAbi, data: log.data, topics: log.topics, eventName: 'AddressesSet' });
          setAddressesSetEvents(prev => [...prev, decoded.args as unknown as AddressesSetEventArgs]);
          setStatusMessage(`Event: AddressesSet - LiquidityPoolManager: ${(decoded.args as any).liquidityPoolManager?.substring(0,10)}...`);
        } catch (e) { console.error("Error decoding AddressesSet:", e); setStatusMessage("Error processing AddressesSet event."); }
      });
    }
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

  const refetchAll = () => { refetchPaused(); refetchDevReg(); refetchProtoTreasury(); };

  const handleWrite = (functionName: string, args: any[], successMsg?: string) => {
    if (!PROJECT_FACTORY_ADDRESS) { setStatusMessage('Contract address not set'); return; }
    setStatusMessage('');
    writeContract({ address: PROJECT_FACTORY_ADDRESS, abi: projectFactoryAbi, functionName, args },
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
  const handleSetDeveloperRegistry = () => {
    if (!newDeveloperRegistry) {setStatusMessage('New address missing'); return;}
    handleWrite('setDeveloperRegistry', [newDeveloperRegistry as Address], 'Setting Developer Registry...');
  };
  const handleSetProtocolTreasury = () => {
    if (!newProtocolTreasury) {setStatusMessage('New address missing'); return;}
    handleWrite('setProtocolTreasury', [newProtocolTreasury as Address], 'Setting Protocol Treasury...');
  };

  const handleSetAddresses = () => {
    // Validate all addresses are provided
    if (!saLPM || !saVaultImpl || !saDevEscrowImpl || !saRepaymentRouter || !saFeeRouter || !saRiskOracleAdapter || !saPauserAdminClones || !saAdminVaultClones || !saProtocolTreasury) {
        setStatusMessage('All addresses for setAddresses must be provided.');
        return;
    }
    try {
        const args = [
            saLPM as Address,
            saVaultImpl as Address,
            saDevEscrowImpl as Address,
            saRepaymentRouter as Address,
            saFeeRouter as Address,
            saRiskOracleAdapter as Address,
            saPauserAdminClones as Address,
            saAdminVaultClones as Address,
            saProtocolTreasury as Address
        ];
        handleWrite('setAddresses', args, 'Setting all core addresses via setAddresses...');
    } catch (e: any) {
        setStatusMessage(`Error preparing setAddresses transaction: ${e.message}`);
    }
  };

  useEffect(() => {
    if (isConfirmed) { setStatusMessage(`Success! Hash: ${writeHash}`); refetchAll(); }
    if (writeError) { setStatusMessage(`Transaction Error: ${writeError.message}`); }
    if (receiptError) { setStatusMessage(`Receipt Error: ${receiptError.message}`); }
  }, [isConfirmed, writeHash, writeError, receiptError, refetchAll]);

  if (!PROJECT_FACTORY_ADDRESS) return <p className="text-red-500 p-4">Error: NEXT_PUBLIC_PROJECT_FACTORY_ADDRESS is not set.</p>;

  return (
    <div className="space-y-8 p-4 border rounded-lg shadow-md bg-white">
      <h2 className="text-2xl font-semibold text-black">Project Factory Admin <span className="text-sm text-gray-600">({PROJECT_FACTORY_ADDRESS})</span></h2>

      <div className="p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black mb-2">Contract Status & Config</h3>
        <p className="text-black"><strong>Paused:</strong> {isPaused === null ? 'Loading...' : isPaused ? 'Yes' : 'No'}</p>
        <p className="text-black"><strong>Developer Registry:</strong> {developerRegistry || 'Loading...'}</p>
        <p className="text-black"><strong>Protocol Treasury:</strong> {protocolTreasury || 'Loading...'}</p>
        <button onClick={refetchAll} className="mt-2 px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">Refresh Data</button>
      </div>

      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Set Developer Registry</h3>
        <p className="text-sm text-gray-700">Requires DEFAULT_ADMIN_ROLE.</p>
        <input type="text" value={newDeveloperRegistry} onChange={(e) => setNewDeveloperRegistry(e.target.value)} placeholder="New Developer Registry Address" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500" />
        <button onClick={handleSetDeveloperRegistry} disabled={isWritePending || isConfirming || !newDeveloperRegistry} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400">Set Developer Registry</button>
      </div>

      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Set Protocol Treasury</h3>
        <p className="text-sm text-gray-700">Requires DEFAULT_ADMIN_ROLE.</p>
        <input type="text" value={newProtocolTreasury} onChange={(e) => setNewProtocolTreasury(e.target.value)} placeholder="New Protocol Treasury Address" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500" />
        <button onClick={handleSetProtocolTreasury} disabled={isWritePending || isConfirming || !newProtocolTreasury} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400">Set Protocol Treasury</button>
      </div>

      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Grant Role</h3>
        <p className="text-sm text-gray-700">Grant roles like PAUSER_ROLE, CREATOR_ROLE. Requires DEFAULT_ADMIN_ROLE or specific role admin.</p>
        <div>
            <label htmlFor="roleSelectPF" className="block text-sm font-medium text-black">Select Role:</label>
            <select id="roleSelectPF" value={selectedRoleName} onChange={(e) => setSelectedRoleName(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black">
            <option value="">-- Select Role --</option>
            {roleNames.map(name => (<option key={name} value={name}>{name}</option>))}
            </select>
            {selectedRoleName && <p className="text-xs text-gray-600 mt-1">Computed Role Hash: {selectedRoleBytes32 || (selectedRoleName ? 'Calculating...' : 'N/A')}</p>}
        </div>
        <div>
            <label htmlFor="grantRoleAddressPF" className="block text-sm font-medium text-black">Address to Grant Role:</label>
            <input type="text" id="grantRoleAddressPF" value={grantRoleToAddress} onChange={(e) => setGrantRoleToAddress(e.target.value)} placeholder="Address to grant role" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500" />
        </div>
        <button onClick={handleGrantRole} disabled={!selectedRoleBytes32 || !grantRoleToAddress || isWritePending || isConfirming} className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed">Grant Role</button>
      </div>

      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Revoke Role</h3>
        <p className="text-sm text-gray-700">Revoke a role from an address. Requires DEFAULT_ADMIN_ROLE or specific role admin.</p>
        <div>
            <label htmlFor="revokeRoleAddressPF" className="block text-sm font-medium text-black">Address to Revoke Role From:</label>
            <input type="text" id="revokeRoleAddressPF" value={revokeRoleFromAddress} onChange={(e) => setRevokeRoleFromAddress(e.target.value)} placeholder="Address to revoke role from" className="mt-1 block w-full input-style text-black" />
        </div>
        <button onClick={handleRevokeRole} disabled={!selectedRoleBytes32 || !revokeRoleFromAddress || isWritePending || isConfirming} className="mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400">Revoke Role</button>
      </div>

      {/* Check Role Section */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Check Role (hasRole)</h3>
        <div>
            <label htmlFor="checkRoleSelectPF" className="block text-sm font-medium text-black">Select Role to Check:</label>
            <select 
              id="checkRoleSelectPF" 
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
            <label htmlFor="checkRoleAddressPF" className="block text-sm font-medium text-black">Account Address to Check:</label>
            <input 
              type="text" 
              id="checkRoleAddressPF" 
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
      
      <div className="p-4 border rounded bg-gray-100">
          <h3 className="text-xl font-medium text-black">Other Admin Functions</h3>
          <p className="italic text-gray-700">Placeholder for `createProject`. This usually requires developer input for project details and is not typically an admin-only function without parameters.</p>
      </div>

      {/* Comprehensive setAddresses */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Configure Core Addresses (setAddresses)</h3>
        <p className="text-sm text-gray-700">Requires DEFAULT_ADMIN_ROLE. Sets all linked contract addresses and admin/pauser for clones.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label>Liquidity Pool Manager:</label><input type="text" value={saLPM} onChange={e => setSaLPM(e.target.value)} placeholder="0x..." className="input-style text-black" /></div>
            <div><label>Vault Implementation:</label><input type="text" value={saVaultImpl} onChange={e => setSaVaultImpl(e.target.value)} placeholder="0x..." className="input-style text-black" /></div>
            <div><label>DevEscrow Implementation:</label><input type="text" value={saDevEscrowImpl} onChange={e => setSaDevEscrowImpl(e.target.value)} placeholder="0x..." className="input-style text-black" /></div>
            <div><label>Repayment Router:</label><input type="text" value={saRepaymentRouter} onChange={e => setSaRepaymentRouter(e.target.value)} placeholder="0x..." className="input-style text-black" /></div>
            <div><label>Fee Router:</label><input type="text" value={saFeeRouter} onChange={e => setSaFeeRouter(e.target.value)} placeholder="0x..." className="input-style text-black" /></div>
            <div><label>Risk Rate Oracle Adapter:</label><input type="text" value={saRiskOracleAdapter} onChange={e => setSaRiskOracleAdapter(e.target.value)} placeholder="0x..." className="input-style text-black" /></div>
            <div><label>Pauser Admin for Clones:</label><input type="text" value={saPauserAdminClones} onChange={e => setSaPauserAdminClones(e.target.value)} placeholder="0x..." className="input-style text-black" /></div>
            <div><label>Admin for Vault Clones:</label><input type="text" value={saAdminVaultClones} onChange={e => setSaAdminVaultClones(e.target.value)} placeholder="0x..." className="input-style text-black" /></div>
            <div><label>Protocol Treasury (for setAddresses):</label><input type="text" value={saProtocolTreasury} onChange={e => setSaProtocolTreasury(e.target.value)} placeholder="0x..." className="input-style text-black" /></div>
        </div>
        <button onClick={handleSetAddresses} disabled={isWritePending || isConfirming} className="button-style bg-green-600 hover:bg-green-700">Set All Addresses</button>
      </div>

      {statusMessage && (
        <div className={`mt-4 p-3 rounded ${writeError || receiptError ? 'bg-red-100 text-red-700' : isConfirmed ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
            <p className="text-sm font-medium">{statusMessage}</p>
        </div>
      )}

      {(roleEvents.length > 0 || projectEvents.length > 0 || addressesSetEvents.length > 0) && (
        <div className="p-4 border rounded bg-gray-50 mt-6">
          <h3 className="text-xl font-medium text-black mb-3">Recent Events</h3>
          {roleEvents.length > 0 && (
            <div className="mb-4">
                <h4 className="text-lg font-medium text-black mb-2">Role Granted Events:</h4>
                <ul className="space-y-3">
                {roleEvents.slice(-3).reverse().map((event, index) => {
                    const roleName = roleHashMap[event.role] || event.role;
                    const eventType = 'sender' in event ? 'RoleGranted' : 'RoleRevoked';
                    return (
                    <li key={`role-${index}`} className="p-3 bg-white border border-gray-200 rounded shadow-sm">
                        <p className="text-sm text-black"><strong>Event: {eventType}</strong></p>
                        <p className="text-sm text-black"><strong>Role:</strong> {roleName} ({event.role.substring(0,10)}...)</p>
                        <p className="text-sm text-black"><strong>Account:</strong> {event.account}</p>
                        {(event as RoleGrantedEventArgs).sender && <p className="text-sm text-black"><strong>Sender:</strong> {(event as RoleGrantedEventArgs).sender}</p>}
                    </li>
                    );
                })}
                </ul>
            </div>
          )}
          {projectEvents.length > 0 && (
            <div>
                <h4 className="text-lg font-medium text-black mb-2">Project Created Events:</h4>
                <ul className="space-y-3">
                {projectEvents.slice(-3).reverse().map((event, index) => (
                    <li key={`project-${index}`} className="p-3 bg-white border border-gray-200 rounded shadow-sm">
                    <p className="text-sm text-black"><strong>Project ID:</strong> {event.projectId.substring(0,10)}...</p>
                    <p className="text-sm text-black"><strong>Project Address:</strong> {event.projectAddress}</p>
                    <p className="text-sm text-black"><strong>Developer:</strong> {event.developer}</p>
                    </li>
                ))}
                </ul>
            </div>
          )}
          {addressesSetEvents.length > 0 && (
            <div className="mt-4">
                <h4 className="text-lg font-medium text-black mb-2">Addresses Set Events:</h4>
                <ul className="space-y-3">
                {addressesSetEvents.slice(-3).reverse().map((event, index) => (
                    <li key={`addressesSet-${index}`} className="p-3 bg-green-50 border-green-200 rounded shadow-sm text-xs">
                        <p><strong>Event: AddressesSet</strong></p>
                        <p>LPM: {event.liquidityPoolManager}</p>
                        <p>VaultImpl: {event.vaultImplementation}</p>
                        <p>DevEscrowImpl: {event.devEscrowImplementation}</p>
                        {/* Add other addresses as needed */}
                    </li>
                ))}
                </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 