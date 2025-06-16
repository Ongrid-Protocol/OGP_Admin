"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useWatchContractEvent } from 'wagmi';
import { Address, Abi, decodeEventLog, Hex, keccak256, toHex } from 'viem';
import developerDepositEscrowAbiJson from '@/abis/DeveloperDepositEscrow.json';
import constantsAbiJson from '@/abis/Constants.json';

// Define proper types for the event args
type RoleGrantedEventArgs = {
  role: Hex; // bytes32
  account: Address;
  sender: Address;
};

// Add RoleRevoked and other DDE-specific event types
type RoleRevokedEventArgs = {
  role: Hex;
  account: Address;
  sender: Address;
};

type DepositReleasedEventArgs = {
  projectId: bigint; // uint256
  developer: Address;
  amount: bigint; // uint256
};

type DepositSlashedEventArgs = {
  projectId: bigint; // uint256
  developer: Address;
  amount: bigint; // uint256
  recipient: Address;
};

interface DepositInfo {
  amount: string;
  developer: Address;
  isSettled: boolean;
}

const DEVELOPER_DEPOSIT_ESCROW_ADDRESS = process.env.NEXT_PUBLIC_DEVELOPER_DEPOSIT_ESCROW_ADDRESS as Address | undefined;

const developerDepositEscrowAbi = developerDepositEscrowAbiJson.abi;
const constantsAbi = constantsAbiJson.abi as Abi;

// Helper to identify role-defining functions from Constants.json
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
      // Important: This assumes roles are identified by keccak256 of their string name.
      // If contracts use a different method (e.g., direct bytes32 values not derived from name string),
      // this mapping approach needs to be adjusted.
      hashMap[keccak256(toHex(name))] = name;
    } catch (e) {
      console.error(`Error creating hash for role ${name}:`, e);
    }
  });
  // Add DEFAULT_ADMIN_ROLE specifically if it's 0x00...00
  // The keccak256 of "DEFAULT_ADMIN_ROLE" is not 0x00. OpenZeppelin's DEFAULT_ADMIN_ROLE is bytes32(0).
  // We need to confirm how DEFAULT_ADMIN_ROLE is stored and compared.
  // For now, we'll rely on the keccak256 approach for consistency with grantRole.
  // If DEFAULT_ADMIN_ROLE is special (e.g. 0x00), it will need specific handling for display.
  hashMap['0x0000000000000000000000000000000000000000000000000000000000000000'] = 'DEFAULT_ADMIN_ROLE (Direct 0x00)';
  return hashMap;
};

export function DeveloperDepositEscrowAdmin() {
  const { } = useAccount(); // connectedAddress removed as it was unused
  const { data: writeHash, writeContract, isPending: isWritePending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash: writeHash });

  // State for contract data
  const [isPaused, setIsPaused] = useState<boolean | null>(null);
  // Add other specific states for DeveloperDepositEscrow if needed

  // State for Role Granting
  const [roleNames, setRoleNames] = useState<string[]>([]);
  const [selectedRoleName, setSelectedRoleName] = useState<string>('');
  const [selectedRoleBytes32, setSelectedRoleBytes32] = useState<Hex | null>(null);
  const [grantRoleToAddress, setGrantRoleToAddress] = useState<string>('');
  const [revokeRoleFromAddress, setRevokeRoleFromAddress] = useState<string>('');
  const [roleEvents, setRoleEvents] = useState<(RoleGrantedEventArgs | RoleRevokedEventArgs)[]>([]);
  const [depositEvents, setDepositEvents] = useState<(DepositReleasedEventArgs | DepositSlashedEventArgs)[]>([]);
  const [roleHashMap, setRoleHashMap] = useState<{ [hash: Hex]: string }>({});
  const [statusMessage, setStatusMessage] = useState<string>('');

  // State for HasRole Check
  const [checkRoleName, setCheckRoleName] = useState<string>('');
  const [checkRoleBytes32, setCheckRoleBytes32] = useState<Hex | null>(null);
  const [checkRoleAccountAddress, setCheckRoleAccountAddress] = useState<string>('');
  const [hasRoleResult, setHasRoleResult] = useState<boolean | string | null>(null);
  const [hasRoleStatus, setHasRoleStatus] = useState<string>('');

  // State for Deposit Management
  const [manageDepositProjectId, setManageDepositProjectId] = useState<string>('');
  const [slashFeeRecipient, setSlashFeeRecipient] = useState<string>('');
  const [viewDepositProjectId, setViewDepositProjectId] = useState<string>('');
  const [depositInfo, setDepositInfo] = useState<DepositInfo | null>(null);

  // --- Read Hooks ---
  const { data: pausedData, refetch: refetchPaused } = useReadContract({
    address: DEVELOPER_DEPOSIT_ESCROW_ADDRESS,
    abi: developerDepositEscrowAbi,
    functionName: 'paused',
    query: { enabled: !!DEVELOPER_DEPOSIT_ESCROW_ADDRESS }
  });

  // --- Read Hooks for View Deposit Status (on demand) ---
  const { data: depositAmountData, refetch: fetchDepositAmount, isLoading: isDepositAmountLoading } = useReadContract({
    address: DEVELOPER_DEPOSIT_ESCROW_ADDRESS,
    abi: developerDepositEscrowAbi,
    functionName: 'getDepositAmount',
    args: viewDepositProjectId ? [BigInt(viewDepositProjectId)] : undefined,
    query: { enabled: false }
  });

  const { data: projectDeveloperData, refetch: fetchProjectDeveloper, isLoading: isProjectDeveloperLoading } = useReadContract({
    address: DEVELOPER_DEPOSIT_ESCROW_ADDRESS,
    abi: developerDepositEscrowAbi,
    functionName: 'getProjectDeveloper',
    args: viewDepositProjectId ? [BigInt(viewDepositProjectId)] : undefined,
    query: { enabled: false }
  });

  const { data: isDepositSettledData, refetch: fetchIsDepositSettled, isLoading: isDepositSettledLoading } = useReadContract({
    address: DEVELOPER_DEPOSIT_ESCROW_ADDRESS,
    abi: developerDepositEscrowAbi,
    functionName: 'isDepositSettled',
    args: viewDepositProjectId ? [BigInt(viewDepositProjectId)] : undefined,
    query: { enabled: false }
  });

  // --- HasRole Read Hook (on demand) ---
  const { data: hasRoleData, refetch: fetchHasRole, isLoading: isHasRoleLoading, error: hasRoleError } = useReadContract({
    address: DEVELOPER_DEPOSIT_ESCROW_ADDRESS,
    abi: developerDepositEscrowAbi,
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
      if (selectedRoleName === 'DEFAULT_ADMIN_ROLE') {
        setSelectedRoleBytes32('0x0000000000000000000000000000000000000000000000000000000000000000');
        setStatusMessage('');
      } else {
        try {
          const roleHex = toHex(selectedRoleName);
          const roleHash = keccak256(roleHex);
          setSelectedRoleBytes32(roleHash);
          setStatusMessage('');
        } catch (e: unknown) {
          console.error("Error computing role hash:", e);
          setSelectedRoleBytes32(null);
          if (e instanceof Error) {
              setStatusMessage(`Error computing role hash: ${e.message}`);
          } else {
              setStatusMessage('An unknown error occurred while computing role hash.');
          }
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
        setHasRoleStatus('');
      } else {
        try {
          const roleHex = toHex(checkRoleName);
          const roleHash = keccak256(roleHex);
          setCheckRoleBytes32(roleHash);
          setHasRoleStatus('');
        } catch (e: unknown) {
          console.error("Error computing check role hash:", e);
          setCheckRoleBytes32(null);
          if (e instanceof Error) {
            setHasRoleStatus(`Error computing role hash for check: ${e.message}`);
          } else {
            setHasRoleStatus('An unknown error occurred while computing check role hash.');
          }
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
    address: DEVELOPER_DEPOSIT_ESCROW_ADDRESS,
    abi: developerDepositEscrowAbi,
    eventName: 'RoleGranted',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({
            abi: developerDepositEscrowAbi,
            data: log.data,
            topics: log.topics,
            eventName: 'RoleGranted'
          });
          const args = decoded.args as unknown as RoleGrantedEventArgs;
          const roleName = roleHashMap[args.role] || args.role; // Fallback to hash
          setRoleEvents(prevEvents => [...prevEvents, args]);
          setStatusMessage(`RoleGranted event: Role ${roleName} (${args.role.substring(0,10)}...) granted to ${args.account} by ${args.sender}`);
        } catch (e) {
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
    address: DEVELOPER_DEPOSIT_ESCROW_ADDRESS,
    abi: developerDepositEscrowAbi,
    eventName: 'RoleRevoked',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({
            abi: developerDepositEscrowAbi,
            data: log.data,
            topics: log.topics,
            eventName: 'RoleRevoked'
          });
          const args = decoded.args as unknown as RoleRevokedEventArgs;
          const roleName = roleHashMap[args.role] || args.role; 
          setRoleEvents(prevEvents => [...prevEvents, args]);
          setStatusMessage(`RoleRevoked event: Role ${roleName} (${args.role.substring(0,10)}...) revoked from ${args.account} by ${args.sender}`);
        } catch (e) {
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

  // --- Event Watcher for DepositReleased ---
  useWatchContractEvent({
    address: DEVELOPER_DEPOSIT_ESCROW_ADDRESS,
    abi: developerDepositEscrowAbi,
    eventName: 'DepositReleased',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({
            abi: developerDepositEscrowAbi,
            data: log.data,
            topics: log.topics,
            eventName: 'DepositReleased'
          });
          const args = decoded.args as unknown as DepositReleasedEventArgs;
          setDepositEvents(prevEvents => [...prevEvents, args]);
          setStatusMessage(`DepositReleased event: Project ${args.projectId.toString()}, Developer ${args.developer}, Amount ${args.amount.toString()}`);
        } catch (e) {
          console.error("Error decoding DepositReleased event:", e);
          setStatusMessage("Error processing DepositReleased event.");
        }
      });
    },
    onError(error) {
      console.error('Error watching DepositReleased event:', error);
      setStatusMessage(`Error watching DepositReleased event: ${error.message}`);
    }
  });

  // --- Event Watcher for DepositSlashed ---
  useWatchContractEvent({
    address: DEVELOPER_DEPOSIT_ESCROW_ADDRESS,
    abi: developerDepositEscrowAbi,
    eventName: 'DepositSlashed',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({
            abi: developerDepositEscrowAbi,
            data: log.data,
            topics: log.topics,
            eventName: 'DepositSlashed'
          });
          const args = decoded.args as unknown as DepositSlashedEventArgs;
          setDepositEvents(prevEvents => [...prevEvents, args]);
          setStatusMessage(`DepositSlashed event: Project ${args.projectId.toString()}, Developer ${args.developer}, Amount ${args.amount.toString()}, Recipient ${args.recipient}`);
        } catch (e) {
          console.error("Error decoding DepositSlashed event:", e);
          setStatusMessage("Error processing DepositSlashed event.");
        }
      });
    },
    onError(error) {
      console.error('Error watching DepositSlashed event:', error);
      setStatusMessage(`Error watching DepositSlashed event: ${error.message}`);
    }
  });

  const refetchAll = useCallback(() => {
    refetchPaused();
    // Call refetch for other specific data if added
    if (viewDepositProjectId) { // If a project ID is being viewed, refetch its details
        fetchDepositAmount();
        fetchProjectDeveloper();
        fetchIsDepositSettled();
    }
  }, [refetchPaused, viewDepositProjectId, fetchDepositAmount, fetchProjectDeveloper, fetchIsDepositSettled]);

  const handleWrite = (functionName: string, args: unknown[], successMessage?: string) => {
    if (!DEVELOPER_DEPOSIT_ESCROW_ADDRESS) { setStatusMessage('Developer Deposit Escrow contract address not set'); return; }
    setStatusMessage('');
    writeContract({
      address: DEVELOPER_DEPOSIT_ESCROW_ADDRESS,
      abi: developerDepositEscrowAbi,
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

  // --- Deposit Management Write Functions ---
  const handleReleaseDeposit = () => {
    if (!manageDepositProjectId) { setStatusMessage('Please enter Project ID for release.'); return; }
    try {
      handleWrite('releaseDeposit', [BigInt(manageDepositProjectId)], `Releasing deposit for Project ID ${manageDepositProjectId}...`);
    } catch (e: unknown) {
        if (e instanceof Error) {
            setStatusMessage(`Error preparing releaseDeposit: ${e.message}`);
        } else {
            setStatusMessage('An unknown error occurred while preparing releaseDeposit.');
        }
    }
  };

  const handleSlashDeposit = () => {
    if (!manageDepositProjectId || !slashFeeRecipient) { setStatusMessage('Please enter Project ID and Fee Recipient for slash.'); return; }
    try {
      handleWrite('slashDeposit', [BigInt(manageDepositProjectId), slashFeeRecipient as Address], `Slashing deposit for Project ID ${manageDepositProjectId} to ${slashFeeRecipient}...`);
    } catch (e: unknown) {
        if (e instanceof Error) {
            setStatusMessage(`Error preparing slashDeposit: ${e.message}`);
        } else {
            setStatusMessage('An unknown error occurred while preparing slashDeposit.');
        }
    }
  };

  const handleViewDepositStatus = () => {
    if (!viewDepositProjectId) {
        setStatusMessage('Please enter Project ID to view status.'); 
        setDepositInfo(null);
        return;
    }
    setDepositInfo(null); // Clear previous
    fetchDepositAmount();
    fetchProjectDeveloper();
    fetchIsDepositSettled();
  };

  // --- Transaction Status Effect ---
  useEffect(() => {
    if (isConfirmed) {
      setStatusMessage(`Transaction successful! Hash: ${writeHash}`);
      refetchAll();
      // Potentially clear some input fields after success
      // e.g., setManageDepositProjectId(''); setSlashFeeRecipient('');
    }
    if (writeError && !isConfirmed) {
      setStatusMessage(`Transaction Error: ${writeError.message}`);
    }
    if (receiptError && !isConfirmed) {
      setStatusMessage(`Receipt Error: ${receiptError.message}`);
    }
  }, [isConfirmed, writeHash, writeError, receiptError, refetchAll]);

  // --- Effect to aggregate and display deposit info ---
  useEffect(() => {
    if (depositAmountData != null && projectDeveloperData != null && isDepositSettledData != null) {
        setDepositInfo({
            amount: depositAmountData.toString(),
            developer: projectDeveloperData as Address,
            isSettled: isDepositSettledData as boolean,
        });
    } else {
        setDepositInfo(null);
    }
  }, [depositAmountData, projectDeveloperData, isDepositSettledData]);

  if (!DEVELOPER_DEPOSIT_ESCROW_ADDRESS) {
    return <p className="text-red-500">Error: NEXT_PUBLIC_DEVELOPER_DEPOSIT_ESCROW_ADDRESS is not set.</p>;
  }

  return (
    <div className="space-y-8 p-4 border rounded-lg shadow-md bg-white">
      <h2 className="text-2xl font-semibold text-black">Developer Deposit Escrow Admin <span className="text-sm text-gray-600">({DEVELOPER_DEPOSIT_ESCROW_ADDRESS})</span></h2>

      {/* Contract Status Section */}
      <div className="p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black mb-2">Contract Status</h3>
        <p className="text-black"><strong>Paused:</strong> {isPaused === null ? 'Loading...' : isPaused ? 'Yes' : 'No'}</p>
        {/* Add other relevant status displays here */}
        <button onClick={refetchAll} className="mt-2 px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">Refresh Data</button>
      </div>

      {/* Grant Role Section */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Grant Role</h3>
        <p className="text-sm text-gray-700">Requires DEFAULT_ADMIN_ROLE or specific role admin. Roles available: SLASHER_ROLE, DEPOSIT_ADMIN_ROLE, etc.</p>
        <div>
          <label htmlFor="roleSelectDDE" className="block text-sm font-medium text-black">Select Role:</label>
          <select
            id="roleSelectDDE"
            value={selectedRoleName}
            onChange={(e) => setSelectedRoleName(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black"
          >
            <option value="">-- Select a Role --</option>
            {roleNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {selectedRoleName && <p className="text-xs text-gray-600 mt-1">Computed Role Hash: {selectedRoleBytes32 || (selectedRoleName ? 'Calculating...' : 'N/A')}</p>}
        </div>
        <div>
          <label htmlFor="grantRoleAddressDDE" className="block text-sm font-medium text-black">Address to Grant Role:</label>
          <input
            type="text"
            id="grantRoleAddressDDE"
            value={grantRoleToAddress}
            onChange={(e) => setGrantRoleToAddress(e.target.value)}
            placeholder="0x..."
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
          />
        </div>
        <button
          onClick={handleGrantRole}
          disabled={!selectedRoleBytes32 || !grantRoleToAddress || isWritePending || isConfirming}
          className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          Grant Role
        </button>
        <div className="mt-4">
            <label htmlFor="revokeRoleAddressDDE" className="block text-sm font-medium text-black">Address to Revoke Role From:</label>
            <input
                type="text"
                id="revokeRoleAddressDDE"
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
          <label htmlFor="checkRoleSelectDDE" className="block text-sm font-medium text-black">Select Role to Check:</label>
          <select 
            id="checkRoleSelectDDE" 
            value={checkRoleName} 
            onChange={(e) => { setCheckRoleName(e.target.value); setHasRoleResult(null); setHasRoleStatus(''); }} 
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black"
          >
            <option value="">-- Select a Role --</option>
            {/* DEFAULT_ADMIN_ROLE needs special handling for hash if not in Constants.json */}
            <option value="DEFAULT_ADMIN_ROLE">DEFAULT_ADMIN_ROLE</option>
            {roleNames.map(name => (<option key={`check-${name}`} value={name}>{name}</option>))}
          </select>
          {checkRoleName && <p className="text-xs text-gray-600 mt-1">Computed Role Hash for Check: {checkRoleBytes32 || (checkRoleName ? 'Calculating...' : 'N/A')}</p>}
        </div>
        <div>
          <label htmlFor="checkRoleAddressDDE" className="block text-sm font-medium text-black">Account Address to Check:</label>
          <input 
            type="text" 
            id="checkRoleAddressDDE" 
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

      {/* --- Deposit Management Sections --- */}
      {/* Manually Release Deposit */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Manually Release Deposit</h3>
        <p className="text-sm text-gray-700">For emergency/contingency. Requires RELEASER_ROLE.</p>
        <div>
          <label htmlFor="manageDepositProjectId" className="block text-sm font-medium text-black">Project ID:</label>
          <input type="text" id="manageDepositProjectId" value={manageDepositProjectId} onChange={(e) => setManageDepositProjectId(e.target.value)} placeholder="Enter Project ID (uint256)" className="mt-1 block w-full input-style text-black" />
        </div>
        <button onClick={handleReleaseDeposit} disabled={isWritePending || isConfirming || !manageDepositProjectId} className="button-style bg-green-500 hover:bg-green-600">Release Deposit</button>
      </div>

      {/* Slash Deposit */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Slash Deposit</h3>
        <p className="text-sm text-gray-700">For project default. Requires SLASHER_ROLE.</p>
        <div>
          <label htmlFor="slashProjectId" className="block text-sm font-medium text-black">Project ID:</label>
          <input type="text" id="slashProjectId" value={manageDepositProjectId} onChange={(e) => setManageDepositProjectId(e.target.value)} placeholder="Same as Project ID above or enter new" className="mt-1 block w-full input-style text-black" />
        </div>
        <div>
          <label htmlFor="slashFeeRecipient" className="block text-sm font-medium text-black">Fee Recipient Address:</label>
          <input type="text" id="slashFeeRecipient" value={slashFeeRecipient} onChange={(e) => setSlashFeeRecipient(e.target.value)} placeholder="0x... (e.g., Protocol Treasury)" className="mt-1 block w-full input-style text-black" />
        </div>
        <button onClick={handleSlashDeposit} disabled={isWritePending || isConfirming || !manageDepositProjectId || !slashFeeRecipient} className="button-style bg-red-600 hover:bg-red-700">Slash Deposit</button>
      </div>

      {/* View Deposit Status */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">View Deposit Status</h3>
        <div>
          <label htmlFor="viewDepositProjectId" className="block text-sm font-medium text-black">Project ID:</label>
          <input type="text" id="viewDepositProjectId" value={viewDepositProjectId} onChange={(e) => { setViewDepositProjectId(e.target.value); setDepositInfo(null); }} placeholder="Enter Project ID (uint256)" className="mt-1 block w-full input-style text-black" />
        </div>
        <button 
          onClick={handleViewDepositStatus} 
          disabled={isDepositAmountLoading || isProjectDeveloperLoading || isDepositSettledLoading || !viewDepositProjectId} 
          className="button-style bg-sky-500 hover:bg-sky-600"
        >
          {isDepositAmountLoading || isProjectDeveloperLoading || isDepositSettledLoading ? 'Loading Status...' : 'View Deposit Status'}
        </button>
        {depositInfo && (
          <div className="mt-3 p-3 bg-gray-100 rounded text-sm">
            <p className="font-semibold text-black"><strong>Deposit Details (Project: {viewDepositProjectId}):</strong></p>
            <p className="text-black">Amount: {depositInfo.amount} (raw units)</p>
            <p className="text-black">Developer: {depositInfo.developer}</p>
            <p className="text-black">Is Settled: {depositInfo.isSettled.toString()}</p>
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
        {roleEvents.length === 0 && <p className="text-gray-600">No RoleGranted events detected yet.</p>}
        <ul className="space-y-3">
          {roleEvents.slice(-5).map((event, index) => { // Display last 5 events
            const roleName = roleHashMap[event.role] || event.role; // Fallback to hash
            const eventType = event.sender ? 'RoleGranted' : 'RoleRevoked'; // Simplified, check specific event type if needed
            return (
              <li key={index} className="p-3 bg-white border border-gray-200 rounded shadow-sm">
                <p className="text-sm text-black"><strong>Event: {eventType}</strong></p>
                <p className="text-sm text-black"><strong>Role:</strong> {roleName} ({event.role.substring(0, 10)}...)</p>
                <p className="text-sm text-black"><strong>Account:</strong> {event.account}</p>
                <p className="text-sm text-black"><strong>Sender:</strong> {event.sender}</p>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Recent Deposit Events */}
      <div className="p-4 border rounded bg-gray-50 mt-6">
        <h3 className="text-xl font-medium text-black mb-3">Recent Deposit Events</h3>
        {depositEvents.length === 0 && <p className="text-gray-600">No deposit events detected yet.</p>}
        <ul className="space-y-3">
          {depositEvents.slice(-5).reverse().map((event, index) => {
            if ('recipient' in event) { // DepositSlashed
              const e = event as DepositSlashedEventArgs;
              return (
                <li key={`dep-${index}`} className="p-3 bg-red-50 border border-red-200 rounded shadow-sm">
                  <p className="text-sm text-black"><strong>Event: DepositSlashed</strong></p>
                  <p className="text-black">Project ID: {e.projectId.toString()}</p>
                  <p className="text-black">Developer: {e.developer}</p>
                  <p className="text-black">Amount: {e.amount.toString()}</p>
                  <p className="text-black">Recipient: {e.recipient}</p>
                </li>
              );
            } else { // DepositReleased
              const e = event as DepositReleasedEventArgs;
              return (
                <li key={`dep-${index}`} className="p-3 bg-green-50 border border-green-200 rounded shadow-sm">
                  <p className="text-sm text-black"><strong>Event: DepositReleased</strong></p>
                  <p className="text-black">Project ID: {e.projectId.toString()}</p>
                  <p className="text-black">Developer: {e.developer}</p>
                  <p className="text-black">Amount: {e.amount.toString()}</p>
                </li>
              );
            }
          })}
        </ul>
      </div>

      {/* Placeholder for other DeveloperDepositEscrow specific functionalities */}
      {/* e.g., fundDeposit, releaseDeposit, slashDeposit if they have admin aspects */}
      <div className="p-4 border rounded bg-gray-100">
        <p className="text-gray-600 italic">Other DeveloperDepositEscrow functions will be added here as needed.</p>
      </div>

    </div>
  );
} 