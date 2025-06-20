"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useWatchContractEvent } from 'wagmi';
import { Address, Abi, decodeEventLog, Hex } from 'viem';
import developerRegistryAbiJson from '@/abis/DeveloperRegistry.json';
import constantsAbiJson from '@/abis/Constants.json';
import { computeRoleHash, createRoleHashMap, getRoleNamesFromAbi } from '@/utils/crypto';

// Define proper types for the event args
type RoleGrantedEventArgs = {
  role: Hex; // bytes32
  account: Address;
  sender: Address;
};

// Add RoleRevoked and KYC event types
type RoleRevokedEventArgs = {
  role: Hex;
  account: Address;
  sender: Address;
};

type KYCSubmittedEventArgs = {
  developer: Address;
  kycHash: Hex; // bytes32
};

type KYCStatusChangedEventArgs = {
  developer: Address;
  isVerified: boolean;
};

type DeveloperFundedCounterIncrementedEventArgs = {
  developer: Address;
  newCount: number; // uint32 in contract
};

interface DeveloperInfo {
  kycDataHash: Hex;
  isVerified: boolean;
  timesFunded: number; // This is a uint32 in the contract
}

const DEVELOPER_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_DEVELOPER_REGISTRY_ADDRESS as Address | undefined;

const developerRegistryAbi = developerRegistryAbiJson.abi;
const constantsAbi = constantsAbiJson.abi as Abi;

export function DeveloperRegistryAdmin() {
  const {} = useAccount();
  const { data: writeHash, writeContract, isPending: isWritePending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash: writeHash });

  // State for read data
  const [isPaused, setIsPaused] = useState<boolean | null>(null);

  // State for Role Granting & Revoking
  const [roleNames, setRoleNames] = useState<string[]>([]);
  const [selectedRoleName, setSelectedRoleName] = useState<string>('');
  const [grantRoleToAddress, setGrantRoleToAddress] = useState<string>('');
  const [revokeRoleFromAddress, setRevokeRoleFromAddress] = useState<string>('');
  const [roleEvents, setRoleEvents] = useState<(RoleGrantedEventArgs | RoleRevokedEventArgs)[]>([]);
  const [roleHashMap, setRoleHashMap] = useState<{ [hash: Hex]: string }>({});
  const [statusMessage, setStatusMessage] = useState<string>('');

  // State for HasRole Check
  const [checkRoleName, setCheckRoleName] = useState<string>('');
  const [checkRoleAccountAddress, setCheckRoleAccountAddress] = useState<string>('');
  const [hasRoleResult, setHasRoleResult] = useState<boolean | string | null>(null);
  const [hasRoleStatus, setHasRoleStatus] = useState<string>('');

  // State for KYC Management
  const [kycDeveloperAddress, setKycDeveloperAddress] = useState<string>('');
  const [kycDocsHash, setKycDocsHash] = useState<string>('');
  const [kycDataLocation, setKycDataLocation] = useState<string>('');
  const [kycVerifiedStatus, setKycVerifiedStatus] = useState<boolean>(false);
  const [viewKycDeveloperAddress, setViewKycDeveloperAddress] = useState<string>('');
  const [developerInfo, setDeveloperInfo] = useState<DeveloperInfo | null>(null);
  const [developerKycLocation, setDeveloperKycLocation] = useState<string | null>(null);
  const [kycEvents, setKycEvents] = useState<(
      KYCSubmittedEventArgs | 
      KYCStatusChangedEventArgs |
      DeveloperFundedCounterIncrementedEventArgs
    )[]>([]);

  // Move useMemo declarations before useReadContract hooks
  const selectedRoleBytes32 = useMemo(() => {
    if (!selectedRoleName) return null;
    
    try {
      return computeRoleHash(selectedRoleName);
    } catch (error) {
      console.error("Error computing role hash:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setStatusMessage(`Error computing role hash: ${errorMessage}`);
      return null;
    }
  }, [selectedRoleName]);

  const checkRoleBytes32 = useMemo(() => {
    if (!checkRoleName) return null;
    
    try {
      return computeRoleHash(checkRoleName);
    } catch (error) {
      console.error("Error computing check role hash:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setHasRoleStatus(`Error computing role hash for check: ${errorMessage}`);
      return null;
    }
  }, [checkRoleName]);

  // --- Read Hooks ---
  const { data: pausedData, refetch: refetchPaused } = useReadContract({
    address: DEVELOPER_REGISTRY_ADDRESS,
    abi: developerRegistryAbi,
    functionName: 'paused',
    query: { enabled: !!DEVELOPER_REGISTRY_ADDRESS }
  });

  const { data: hasRoleData, refetch: fetchHasRole, isLoading: isHasRoleLoading, error: hasRoleError } = useReadContract({
    address: DEVELOPER_REGISTRY_ADDRESS,
    abi: developerRegistryAbi,
    functionName: 'hasRole',
    args: checkRoleBytes32 && checkRoleAccountAddress ? [checkRoleBytes32, checkRoleAccountAddress as Address] : undefined,
    query: {
      enabled: false,
    },
  });

  // Read Hooks for View KYC Info
  const { data: devInfoData, refetch: fetchDeveloperInfo, isLoading: isDevInfoLoading, error: devInfoError } = useReadContract({
    address: DEVELOPER_REGISTRY_ADDRESS,
    abi: developerRegistryAbi,
    functionName: 'getDeveloperInfo',
    args: viewKycDeveloperAddress ? [viewKycDeveloperAddress as Address] : undefined,
    query: { enabled: false }
  });

  const { data: kycLocationData, refetch: fetchKycLocation, isLoading: isKycLocationLoading, error: kycLocationError } = useReadContract({
    address: DEVELOPER_REGISTRY_ADDRESS,
    abi: developerRegistryAbi,
    functionName: 'getKycDataLocation',
    args: viewKycDeveloperAddress ? [viewKycDeveloperAddress as Address] : undefined,
    query: { enabled: false }
  });

  // Effects
  useEffect(() => { if (pausedData !== undefined) setIsPaused(pausedData as boolean); }, [pausedData]);

  useEffect(() => {
    const names = getRoleNamesFromAbi(constantsAbi);
    setRoleNames(names);
    setRoleHashMap(createRoleHashMap(names));
  }, []);

  useEffect(() => {
    if (selectedRoleName) {
      setStatusMessage('');
    }
  }, [selectedRoleName]);

  useEffect(() => {
    if (checkRoleName) {
      setHasRoleStatus('');
      setHasRoleResult(null);
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
    address: DEVELOPER_REGISTRY_ADDRESS,
    abi: developerRegistryAbi,
    eventName: 'RoleGranted',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({
            abi: developerRegistryAbi, 
            data: log.data,
            topics: log.topics,
            eventName: 'RoleGranted'
          });
          const args = decoded.args as unknown as RoleGrantedEventArgs; 
          const roleName = roleHashMap[args.role] || args.role; // Fallback to hash
          setRoleEvents(prevEvents => [...prevEvents, args]);
          setStatusMessage(`RoleGranted event: Role ${roleName} (${args.role.substring(0,10)}...) granted to ${args.account} by ${args.sender}`);
        } catch (e: unknown) {
          console.error("Error decoding RoleGranted event:", e);
          setStatusMessage("Error processing RoleGranted event.");
        }
      });
    },
    onError(error) {
      console.error('Error watching RoleGranted event:', error);
      setStatusMessage(`Error watching RoleGranted event: ${error.message}`);
    }
  });

  // --- Event Watcher for RoleRevoked ---
  useWatchContractEvent({
    address: DEVELOPER_REGISTRY_ADDRESS,
    abi: developerRegistryAbi,
    eventName: 'RoleRevoked',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({
            abi: developerRegistryAbi,
            data: log.data,
            topics: log.topics,
            eventName: 'RoleRevoked'
          });
          const args = decoded.args as unknown as RoleRevokedEventArgs;
          const roleName = roleHashMap[args.role] || args.role;
          setRoleEvents(prevEvents => [...prevEvents, args]);
          setStatusMessage(`RoleRevoked event: Role ${roleName} (${args.role.substring(0,10)}...) revoked from ${args.account} by ${args.sender}`);
        } catch (e: unknown) {
          console.error("Error decoding RoleRevoked event:", e);
          setStatusMessage("Error processing RoleRevoked event.");
        }
      });
    },
    onError(error) {
      console.error('Error watching RoleRevoked event:', error);
      setStatusMessage(`Error watching RoleRevoked event: ${error.message}`);
    }
  });

  // --- Event Watcher for KYCSubmitted ---
  useWatchContractEvent({
    address: DEVELOPER_REGISTRY_ADDRESS,
    abi: developerRegistryAbi,
    eventName: 'KYCSubmitted',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({
            abi: developerRegistryAbi,
            data: log.data,
            topics: log.topics,
            eventName: 'KYCSubmitted'
          });
          const args = decoded.args as unknown as KYCSubmittedEventArgs;
          setKycEvents(prevEvents => [...prevEvents, args]);
          setStatusMessage(`KYCSubmitted event: Developer ${args.developer}, Hash: ${args.kycHash.substring(0,10)}...`);
        } catch (e: unknown) {
          console.error("Error decoding KYCSubmitted event:", e);
          setStatusMessage("Error processing KYCSubmitted event.");
        }
      });
    },
    onError(error) {
      console.error('Error watching KYCSubmitted event:', error);
      setStatusMessage(`Error watching KYCSubmitted event: ${error.message}`);
    }
  });

  // --- Event Watcher for KYCStatusChanged ---
  useWatchContractEvent({
    address: DEVELOPER_REGISTRY_ADDRESS,
    abi: developerRegistryAbi,
    eventName: 'KYCStatusChanged',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({
            abi: developerRegistryAbi,
            data: log.data,
            topics: log.topics,
            eventName: 'KYCStatusChanged'
          });
          const args = decoded.args as unknown as KYCStatusChangedEventArgs;
          setKycEvents(prevEvents => [...prevEvents, args]);
          setStatusMessage(`KYCStatusChanged event: Developer ${args.developer}, Verified: ${args.isVerified}`);
        } catch (e: unknown) {
          console.error("Error decoding KYCStatusChanged event:", e);
          setStatusMessage("Error processing KYCStatusChanged event.");
        }
      });
    },
    onError(error) {
      console.error('Error watching KYCStatusChanged event:', error);
      setStatusMessage(`Error watching KYCStatusChanged event: ${error.message}`);
    }
  });

  // --- Event Watcher for DeveloperFundedCounterIncremented ---
  useWatchContractEvent({
    address: DEVELOPER_REGISTRY_ADDRESS,
    abi: developerRegistryAbi,
    eventName: 'DeveloperFundedCounterIncremented',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({
            abi: developerRegistryAbi,
            data: log.data,
            topics: log.topics,
            eventName: 'DeveloperFundedCounterIncremented'
          });
          const args = decoded.args as unknown as DeveloperFundedCounterIncrementedEventArgs;
          setKycEvents(prevEvents => [...prevEvents, args]);
          setStatusMessage(`DeveloperFundedCounterIncremented: Dev ${args.developer}, New Count: ${args.newCount}`);
        } catch (e: unknown) {
          console.error("Error decoding DeveloperFundedCounterIncremented event:", e);
          setStatusMessage("Error processing DeveloperFundedCounterIncremented event.");
        }
      });
    },
    onError(error) {
      console.error('Error watching DeveloperFundedCounterIncremented event:', error);
      setStatusMessage(`Error watching DeveloperFundedCounterIncremented event: ${error.message}`);
    }
  });

  // Refetch function (existing + new)
  const refetchAll = useCallback(() => {
    refetchPaused();
    // ... refetch other data ...
    if (viewKycDeveloperAddress) { // Also refetch KYC info if an address is being viewed
      fetchDeveloperInfo();
      fetchKycLocation();
    }
  }, [refetchPaused, viewKycDeveloperAddress, fetchDeveloperInfo, fetchKycLocation]);

  // --- Write Functions ---
  const handleWrite = (functionName: string, args: unknown[], successMessage?: string) => {
    if (!DEVELOPER_REGISTRY_ADDRESS) { setStatusMessage('Developer Registry contract address not set'); return; }
    setStatusMessage('');
    writeContract({
      address: DEVELOPER_REGISTRY_ADDRESS,
      abi: developerRegistryAbi,
      functionName: functionName,
      args: args,
    }, {
      onSuccess: () => setStatusMessage(successMessage || 'Transaction submitted...'),
      onError: (error) => setStatusMessage(`Submission Error: ${error.message}`),
    });
  };

  const handleGrantRole = () => {
    if (!selectedRoleBytes32) {
      setStatusMessage('Selected role is not valid or its bytes32 value could not be computed.');
      return;
    }
    if (!grantRoleToAddress) {
      setStatusMessage('Please enter the address to grant the role to.');
      return;
    }
    try {
      const to = grantRoleToAddress as Address;
      handleWrite('grantRole', [selectedRoleBytes32, to], `Granting ${selectedRoleName} to ${to}...`);
    } catch (e: unknown) {
      if (e instanceof Error) {
        setStatusMessage(`Error preparing grantRole transaction: ${e.message}`);
      } else {
        setStatusMessage('An unknown error occurred while preparing grantRole transaction.');
      }
    }
  };

  const handleRevokeRole = () => {
    if (!selectedRoleBytes32) {
      setStatusMessage('Selected role is not valid or its bytes32 value could not be computed.');
      return;
    }
    if (!revokeRoleFromAddress) {
      setStatusMessage('Please enter the address to revoke the role from.');
      return;
    }
    try {
      const from = revokeRoleFromAddress as Address;
      handleWrite('revokeRole', [selectedRoleBytes32, from], `Revoking ${selectedRoleName} from ${from}...`);
    } catch (e: unknown) {
      if (e instanceof Error) {
        setStatusMessage(`Error preparing revokeRole transaction: ${e.message}`);
      } else {
        setStatusMessage('An unknown error occurred while preparing revokeRole transaction.');
      }
    }
  };

  const handlePause = () => handleWrite('pause', [], 'Pause transaction submitted...');
  const handleUnpause = () => handleWrite('unpause', [], 'Unpause transaction submitted...');

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

  // const handleSetDeveloperVerification = () => { // Removed as unused
  //   // ... existing code ...
  // };

  // --- KYC Write Functions ---
  const handleSubmitKyc = () => {
    if (!kycDeveloperAddress || !kycDocsHash || !kycDataLocation) {
      setStatusMessage('Please fill all KYC fields.');
      return;
    }
    // Keep 0x prefix check, but remove length check for arbitrary length hex
    if (!kycDocsHash.startsWith('0x')) { 
        setStatusMessage('KYC Documents Hash must be a hex string starting with 0x.');
        return;
    }
    // Optional: Add a regex to check for valid hex characters if desired, e.g. /^0x[0-9a-fA-F]*$/.test(kycDocsHash)
    // For now, primarily relying on the 0x prefix.

    // Basic address validation (viem will do more for type Address)
    if (!kycDeveloperAddress.startsWith('0x') || kycDeveloperAddress.length !== 42) {
        setStatusMessage('Invalid Developer Address format.');
        return;
    }
    try {
      const dev = kycDeveloperAddress as Address;
      const hash = kycDocsHash as Hex; // Keep as Hex, viem will validate if it's a valid hex string
      handleWrite('submitKYC', [dev, hash, kycDataLocation], `Submitting KYC for ${dev}...`);
    } catch (e: unknown) {
      if (e instanceof Error) {
        setStatusMessage(`Error preparing submitKYC transaction: ${e.message}`);
      } else {
        setStatusMessage('An unknown error occurred while preparing submitKYC transaction.');
      }
    }
  };

  const handleSetKycVerifiedStatus = () => {
    if (!kycDeveloperAddress) {
      setStatusMessage('Please enter developer address.');
      return;
    }
    try {
      const dev = kycDeveloperAddress as Address; // Use the same address state or a dedicated one
      handleWrite('setVerifiedStatus', [dev, kycVerifiedStatus], `Setting KYC status for ${dev} to ${kycVerifiedStatus}...`);
    } catch (e: unknown) {
      if (e instanceof Error) {
        setStatusMessage(`Error preparing setVerifiedStatus transaction: ${e.message}`);
      } else {
        setStatusMessage('An unknown error occurred while preparing setVerifiedStatus transaction.');
      }
    }
  };

  const handleViewKycInfo = () => {
    if (!viewKycDeveloperAddress) {
      setStatusMessage('Please enter developer address to view KYC info.');
      setDeveloperInfo(null);
      setDeveloperKycLocation(null);
      return;
    }
    setDeveloperInfo(null); // Clear previous results
    setDeveloperKycLocation(null);
    fetchDeveloperInfo();
    fetchKycLocation();
  };

  // --- Transaction Status Effect ---
  useEffect(() => {
    if (isConfirmed) {
      setStatusMessage(`Transaction successful! Hash: ${writeHash}`);
      refetchAll();
      // Clear inputs after successful transaction if desired
      // setSelectedRoleName('');
      // setGrantRoleToAddress('');
      // setSelectedRoleBytes32(null);
    }
    if (writeError && !isConfirmed) {
      setStatusMessage(`Transaction Error: ${writeError.message}`);
    }
    if (receiptError && !isConfirmed) {
      setStatusMessage(`Receipt Error: ${receiptError.message}`);
    }
  }, [isConfirmed, writeHash, writeError, receiptError, refetchAll]);

  useEffect(() => {
    if (devInfoData) {
        const info = devInfoData as { kycDataHash: Hex, isVerified: boolean, timesFunded: number };
        setDeveloperInfo(info);
    }
    if (devInfoError) setStatusMessage(`Error fetching developer info: ${devInfoError.message}`);
  }, [devInfoData, devInfoError]);

  useEffect(() => {
    if (kycLocationData) setDeveloperKycLocation(kycLocationData as string);
    if (kycLocationError) setStatusMessage(`Error fetching KYC location: ${kycLocationError.message}`);
  }, [kycLocationData, kycLocationError]);

  if (!DEVELOPER_REGISTRY_ADDRESS) {
    return <p className="text-red-500">Error: NEXT_PUBLIC_DEVELOPER_REGISTRY_ADDRESS is not set.</p>;
  }

  return (
    <div className="space-y-8 p-4 border rounded-lg shadow-md bg-white">
      <h2 className="text-2xl font-semibold text-black">Developer Registry Admin <span className="text-sm text-gray-600">({DEVELOPER_REGISTRY_ADDRESS})</span></h2>

      {/* Contract Status Section */}
      <div className="p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black mb-2">Contract Status</h3>
        <p className="text-black"><strong>Paused:</strong> {isPaused === null ? 'Loading...' : isPaused ? 'Yes' : 'No'}</p>
        <button onClick={refetchAll} className="mt-2 px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">Refresh Data</button>
      </div>

      {/* Grant Role Section */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Grant / Revoke Role</h3>
        <p className="text-sm text-gray-700">
          Grant roles like KYC_ADMIN_ROLE, PROJECT_HANDLER_ROLE. Revoke roles if necessary.
          Requires DEFAULT_ADMIN_ROLE on this contract.
        </p>
        <div>
          <label htmlFor="roleSelectDR" className="block text-sm font-medium text-black">Select Role:</label>
          <select id="roleSelectDR" value={selectedRoleName} onChange={(e) => setSelectedRoleName(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black">
            <option value="">-- Select a Role --</option>
            {roleNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {selectedRoleName && <p className="text-xs text-gray-700 mt-1">Computed Role Hash: {selectedRoleBytes32 || (selectedRoleName ? 'Calculating...' : 'N/A')}</p>}
        </div>

        {/* Grant Role Inputs */}
        <div className="mt-4">
            <label htmlFor="grantRoleAddressDevReg" className="block text-sm font-medium text-black">Address to Grant Role To:</label>
            <input
                type="text"
                id="grantRoleAddressDevReg"
                value={grantRoleToAddress} 
                onChange={(e) => setGrantRoleToAddress(e.target.value)}
                placeholder="0x... Address to grant role to"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
        </div>
        <button
            onClick={handleGrantRole}
            disabled={!selectedRoleBytes32 || !grantRoleToAddress || isWritePending || isConfirming}
            className="mt-2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
            Grant Role
        </button>

        {/* Revoke Role Inputs */}
        <div className="mt-4">
            <label htmlFor="revokeRoleAddressDevReg" className="block text-sm font-medium text-black">Address to Revoke Role From:</label>
            <input
                type="text"
                id="revokeRoleAddressDevReg"
                value={revokeRoleFromAddress}
                onChange={(e) => setRevokeRoleFromAddress(e.target.value)}
                placeholder="0x... Address to revoke role from"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
        </div>
        <button
            onClick={handleRevokeRole}
            disabled={!selectedRoleBytes32 || !revokeRoleFromAddress || isWritePending || isConfirming}
            className="mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
            Revoke Role
        </button>
      </div>

      {/* Check Role Section */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Check Role (hasRole)</h3>
        <div>
          <label htmlFor="checkRoleSelectDR" className="block text-sm font-medium text-black">Select Role to Check:</label>
          <select 
            id="checkRoleSelectDR" 
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
          <label htmlFor="checkRoleAddressDR" className="block text-sm font-medium text-black">Account Address to Check:</label>
          <input 
            type="text" 
            id="checkRoleAddressDR" 
            value={checkRoleAccountAddress} 
            onChange={(e) => { setCheckRoleAccountAddress(e.target.value); setHasRoleResult(null); setHasRoleStatus('');}} 
            placeholder="0x... (e.g., KYC Wallet for KYC_ADMIN_ROLE, or ProjectFactory for PROJECT_HANDLER_ROLE)" 
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

      {/* --- KYC Management Sections --- */}
      {/* Submit KYC Data */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Submit KYC Data</h3>
        <p className="text-sm text-gray-700">Requires KYC_ADMIN_ROLE.</p>
        <div>
          <label htmlFor="kycDevAddress" className="block text-sm font-medium text-black">Developer Address:</label>
          <input type="text" id="kycDevAddress" value={kycDeveloperAddress} onChange={(e) => setKycDeveloperAddress(e.target.value)} placeholder="0x..." className="mt-1 block w-full input-style text-black" />
        </div>
        <div>
          <label htmlFor="kycDocsHash" className="block text-sm font-medium text-black">KYC Documents Hash (hex string):</label>
          <input type="text" id="kycDocsHash" value={kycDocsHash} onChange={(e) => setKycDocsHash(e.target.value)} placeholder="0x... (arbitrary length hex)" className="mt-1 block w-full input-style text-black" />
        </div>
        <div>
          <label htmlFor="kycDataLocation" className="block text-sm font-medium text-black">KYC Data Location (e.g., IPFS CID):</label>
          <input type="text" id="kycDataLocation" value={kycDataLocation} onChange={(e) => setKycDataLocation(e.target.value)} placeholder="ipfs://..." className="mt-1 block w-full input-style text-black" />
        </div>
        <button 
            onClick={handleSubmitKyc} 
            disabled={
                isWritePending || 
                isConfirming || 
                !kycDeveloperAddress || 
                !kycDocsHash || 
                !kycDataLocation ||
                !kycDeveloperAddress.startsWith('0x') || kycDeveloperAddress.length !== 42 ||
                !kycDocsHash.startsWith('0x') // Only check for 0x prefix now for the hash
            } 
            className="button-style bg-purple-500 hover:bg-purple-600"
        >
            Submit KYC
        </button>
      </div>

      {/* Set Developer KYC Verification Status */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Set Developer KYC Verification Status</h3>
        <p className="text-sm text-gray-700">Requires KYC_ADMIN_ROLE.</p>
        <div>
          <label htmlFor="kycStatusDevAddress" className="block text-sm font-medium text-black">Developer Address:</label>
          <input type="text" id="kycStatusDevAddress" value={kycDeveloperAddress} onChange={(e) => setKycDeveloperAddress(e.target.value)} placeholder="0x..." className="mt-1 block w-full input-style text-black" />
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="kycVerifiedStatus" checked={kycVerifiedStatus} onChange={(e) => setKycVerifiedStatus(e.target.checked)} className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
          <label htmlFor="kycVerifiedStatus" className="ml-2 block text-sm font-medium text-black">Is Verified</label>
        </div>
        <button onClick={handleSetKycVerifiedStatus} disabled={isWritePending || isConfirming} className="button-style bg-lime-500 hover:bg-lime-600">Set Verified Status</button>
      </div>

      {/* View Developer KYC Information */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">View Developer KYC Information</h3>
        <div>
          <label htmlFor="viewKycDevAddress" className="block text-sm font-medium text-black">Developer Address:</label>
          <input type="text" id="viewKycDevAddress" value={viewKycDeveloperAddress} onChange={(e) => setViewKycDeveloperAddress(e.target.value)} placeholder="0x..." className="mt-1 block w-full input-style text-black" />
        </div>
        <button 
          onClick={handleViewKycInfo} 
          disabled={isDevInfoLoading || isKycLocationLoading || !viewKycDeveloperAddress} 
          className="button-style bg-cyan-500 hover:bg-cyan-600"
        >
          {isDevInfoLoading || isKycLocationLoading ? 'Loading Info...' : 'View KYC Info'}
        </button>
        {developerInfo && (
          <div className="mt-3 p-3 bg-gray-100 rounded text-sm">
            <p className="font-semibold text-black"><strong>Developer Info:</strong></p>
            <p className="text-black">KYC Data Hash: {developerInfo.kycDataHash}</p>
            <p className="text-black">Is Verified: {developerInfo.isVerified.toString()}</p>
            <p className="text-black">Times Funded: {developerInfo.timesFunded?.toString()}</p>
            <p className="text-black">KYC Data Location: {developerKycLocation || 'N/A'}</p>
          </div>
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

      {/* Status Message */}
      {statusMessage && (
        <div className={`mt-4 p-3 rounded ${writeError || receiptError ? 'bg-red-100 text-red-700' : isConfirmed ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
          <p className="text-sm font-medium">{statusMessage}</p>
        </div>
      )}
      
      {/* Recent RoleGranted Events */}
      <div className="p-4 border rounded bg-gray-50 mt-6">
        <h3 className="text-xl font-medium text-black mb-3">Recent RoleGranted Events</h3>
        {roleEvents.length === 0 && <p className="text-gray-700">No RoleGranted events detected yet.</p>}
        <ul className="space-y-3">
          {roleEvents.slice(-5).reverse().map((event: RoleGrantedEventArgs | RoleRevokedEventArgs, index) => { // Display last 5 events, reversed for newest first
            const roleName = roleHashMap[event.role] || event.role; // Fallback to hash
            const eventType = 'sender' in event && event.sender ? 'RoleGranted' : 'RoleRevoked'; 
            return (
              <li key={index} className="p-3 bg-white border border-gray-200 rounded shadow-sm">
                <p className="text-sm text-black"><strong>Event: {eventType}</strong></p>
                <p className="text-sm text-black"><strong>Role:</strong> {roleName} ({event.role.substring(0, 10)}...)</p>
                <p className="text-sm text-black"><strong>Account:</strong> {event.account}</p>
                {'sender' in event && event.sender && <p className="text-sm text-black"><strong>Sender:</strong> {event.sender}</p>}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Recent KYC Events */}
      <div className="p-4 border rounded bg-gray-50 mt-6">
        <h3 className="text-xl font-medium text-black mb-3">Recent KYC & Funding Events</h3>
        {kycEvents.length === 0 && <p className="text-gray-700">No KYC or funding events detected yet.</p>}
        <ul className="space-y-3">
          {kycEvents.slice(-5).reverse().map((event, index) => {
            if ('kycHash' in event) { // KYCSubmitted
              return (
                <li key={`kyc-submit-${index}`} className="p-3 bg-yellow-50 border-yellow-200 rounded shadow-sm">
                  <p className="text-sm text-black"><strong>Event: KYC Submitted</strong></p>
                  <p className="text-sm text-black">Developer: {event.developer}</p>
                  <p className="text-sm text-black">KYC Hash: {event.kycHash.substring(0, 12)}...</p>
                </li>
              );
            } else if ('isVerified' in event) { // KYCStatusChanged
              return (
                <li key={`kyc-status-${index}`} className="p-3 bg-green-50 border-green-200 rounded shadow-sm">
                  <p className="text-sm text-black"><strong>Event: KYC Status Changed</strong></p>
                  <p className="text-sm text-black">Developer: {event.developer}</p>
                  <p className="text-sm text-black">Is Verified: {event.isVerified.toString()}</p>
                </li>
              );
            } else if ('newCount' in event) { // DeveloperFundedCounterIncremented
              return (
                <li key={`kyc-fund-${index}`} className="p-3 bg-blue-50 border-blue-200 rounded shadow-sm">
                  <p className="text-sm text-black"><strong>Event: Project Funded</strong></p>
                  <p className="text-sm text-black">Developer: {event.developer}</p>
                  <p className="text-sm text-black">New Funded Count: {(event as DeveloperFundedCounterIncrementedEventArgs).newCount.toString()}</p>
                </li>
              );
            }
            return null; // Should not happen with defined types
          })}
        </ul>
      </div>

    </div>
  );
} 