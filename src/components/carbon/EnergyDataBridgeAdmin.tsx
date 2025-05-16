"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { Address, toBytes, bytesToHex, Hex } from 'viem';
import energyDataBridgeAbiJson from '@/abis/EnergyDataBridge.json';

const ENERGY_DATA_BRIDGE_ADDRESS = process.env.NEXT_PUBLIC_ENERGY_DATA_BRIDGE_ADDRESS as Address | undefined;

const energyDataBridgeAbi = energyDataBridgeAbiJson.abi;

interface RoleInfoEDB {
  name: string;
  hash: `0x${string}` | undefined;
}

interface RegisteredNodeInfo {
  operator: Address;
  peerId: `0x${string}`; // Assuming peerId is already in bytes32 hex format from contract
  isActive: boolean;
  // Add other fields if your contract returns more for registeredNodes
}

export function EnergyDataBridgeAdmin() {
  const { address: connectedAddress } = useAccount();
  const { data: writeHash, writeContract, isPending: isWritePending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash: writeHash });

  // State for read data
  const [creditTokenAddress, setCreditTokenAddress] = useState<Address>('0x');
  const [rewardDistributorAddress, setRewardDistributorAddress] = useState<Address>('0x');
  const [currentEmissionFactor, setCurrentEmissionFactor] = useState<bigint | undefined>(undefined);
  const [requiredNodes, setRequiredNodes] = useState<bigint | undefined>(undefined);
  const [processingDelay, setProcessingDelay] = useState<bigint | undefined>(undefined);
  const [isPaused, setIsPaused] = useState<boolean | null>(null);

  // Roles State
  const [defaultAdminRoleEDB, setDefaultAdminRoleEDB] = useState<`0x${string}` | undefined>(undefined);
  const [dataSubmitterRoleEDB, setDataSubmitterRoleEDB] = useState<`0x${string}` | undefined>(undefined);
  const [nodeManagerRoleEDB, setNodeManagerRoleEDB] = useState<`0x${string}` | undefined>(undefined);
  const [pauserRoleEDB, setPauserRoleEDB] = useState<`0x${string}` | undefined>(undefined);
  const [upgraderRoleEDB, setUpgraderRoleEDB] = useState<`0x${string}` | undefined>(undefined);

  const availableRolesEDB: RoleInfoEDB[] = [
    { name: 'DEFAULT_ADMIN_ROLE', hash: defaultAdminRoleEDB },
    { name: 'DATA_SUBMITTER_ROLE', hash: dataSubmitterRoleEDB },
    { name: 'NODE_MANAGER_ROLE', hash: nodeManagerRoleEDB },
    { name: 'PAUSER_ROLE', hash: pauserRoleEDB },
    { name: 'UPGRADER_ROLE', hash: upgraderRoleEDB },
  ].filter(role => role.hash !== undefined);

  // Role Management Inputs
  const [grantRoleAccountEDB, setGrantRoleAccountEDB] = useState<string>('');
  const [grantRoleSelectedEDB, setGrantRoleSelectedEDB] = useState<string>('');
  const [revokeRoleAccountEDB, setRevokeRoleAccountEDB] = useState<string>('');
  const [revokeRoleSelectedEDB, setRevokeRoleSelectedEDB] = useState<string>('');
  const [renounceRoleSelectedEDB, setRenounceRoleSelectedEDB] = useState<string>('');
  const [checkRoleAccountEDB, setCheckRoleAccountEDB] = useState<string>('');
  const [checkRoleSelectedEDB, setCheckRoleSelectedEDB] = useState<string>('');
  const [hasRoleResultEDB, setHasRoleResultEDB] = useState<string | null>(null);
  const [roleAdminResultEDB, setRoleAdminResultEDB] = useState<string | null>(null);

  // Node Management Inputs
  const [registerNodePeerId, setRegisterNodePeerId] = useState<string>('');
  const [registerNodeOperator, setRegisterNodeOperator] = useState<string>('');
  const [updateNodePeerId, setUpdateNodePeerId] = useState<string>('');
  const [updateNodeIsActive, setUpdateNodeIsActive] = useState<boolean>(true);
  const [queryNodePeerId, setQueryNodePeerId] = useState<string>('');
  const [queriedNodeInfo, setQueriedNodeInfo] = useState<RegisteredNodeInfo | null>(null); // To store fetched node details
  const [peerIdCount, setPeerIdCount] = useState<bigint | undefined>(undefined);

  // State for inputs
  const [newEmissionFactor, setNewEmissionFactor] = useState<string>('');
  const [newRequiredNodes, setNewRequiredNodes] = useState<string>('');
  const [newProcessingDelay, setNewProcessingDelay] = useState<string>(''); // In seconds

  // State for status messages
  const [statusMessage, setStatusMessage] = useState<string>('');

  // --- Read Hooks ---
  const { data: creditTokenData, refetch: refetchCreditToken } = useReadContract({ address: ENERGY_DATA_BRIDGE_ADDRESS, abi: energyDataBridgeAbi, functionName: 'carbonCreditToken' });
  const { data: rewardDistData, refetch: refetchRewardDist } = useReadContract({ address: ENERGY_DATA_BRIDGE_ADDRESS, abi: energyDataBridgeAbi, functionName: 'rewardDistributor' });
  const { data: emissionFactorData, refetch: refetchEmissionFactor } = useReadContract({ address: ENERGY_DATA_BRIDGE_ADDRESS, abi: energyDataBridgeAbi, functionName: 'emissionFactor' });
  const { data: requiredNodesData, refetch: refetchRequiredNodes } = useReadContract({ address: ENERGY_DATA_BRIDGE_ADDRESS, abi: energyDataBridgeAbi, functionName: 'requiredConsensusNodes' });
  const { data: processingDelayData, refetch: refetchProcessingDelay } = useReadContract({ address: ENERGY_DATA_BRIDGE_ADDRESS, abi: energyDataBridgeAbi, functionName: 'batchProcessingDelay' });
  const { data: pausedData, refetch: refetchPaused } = useReadContract({ address: ENERGY_DATA_BRIDGE_ADDRESS, abi: energyDataBridgeAbi, functionName: 'paused' });

  // Role Hash Reads for EnergyDataBridge
  const { data: darHashEDB } = useReadContract({ address: ENERGY_DATA_BRIDGE_ADDRESS, abi: energyDataBridgeAbi, functionName: 'DEFAULT_ADMIN_ROLE' });
  const { data: dataSubmitterHashEDB } = useReadContract({ address: ENERGY_DATA_BRIDGE_ADDRESS, abi: energyDataBridgeAbi, functionName: 'DATA_SUBMITTER_ROLE' });
  const { data: nodeManagerHashEDB } = useReadContract({ address: ENERGY_DATA_BRIDGE_ADDRESS, abi: energyDataBridgeAbi, functionName: 'NODE_MANAGER_ROLE' });
  const { data: pauserHashEDB } = useReadContract({ address: ENERGY_DATA_BRIDGE_ADDRESS, abi: energyDataBridgeAbi, functionName: 'PAUSER_ROLE' });
  const { data: upgraderHashEDB } = useReadContract({ address: ENERGY_DATA_BRIDGE_ADDRESS, abi: energyDataBridgeAbi, functionName: 'UPGRADER_ROLE' });

  // Node Management Read Hooks
  const { data: peerIdCountData, refetch: refetchPeerIdCount } = useReadContract({
    address: ENERGY_DATA_BRIDGE_ADDRESS,
    abi: energyDataBridgeAbi,
    functionName: 'getPeerIdCount',
  });

  const memoizedRegisteredNodeArgs = useMemo<[`0x${string}`] | undefined>(() => {
    if (!queryNodePeerId) return undefined;
    try {
        if (queryNodePeerId.startsWith('0x')) {
            if (queryNodePeerId.length === 66 && /^0x[0-9a-fA-F]{64}$/.test(queryNodePeerId)) {
                return [queryNodePeerId as `0x${string}`];
            }
            // Invalid hex, causes args to be undefined
            return undefined; 
        } else {
            // For non-hex, attempt conversion. toBytes will throw for invalid/too long.
            const bytes = toBytes(queryNodePeerId, { size: 32 });
            return [bytesToHex(bytes)]; // bytesToHex returns `0x${string}`
        }
    } catch (e) {
        console.warn("Could not prepare registeredNodeArgs from queryNodePeerId:", queryNodePeerId, e);
        return undefined; // Invalid format for conversion
    }
  }, [queryNodePeerId]);
  
  const { data: registeredNodeData, refetch: fetchRegisteredNode, isLoading: isRegisteredNodeLoading } = useReadContract({
    address: ENERGY_DATA_BRIDGE_ADDRESS,
    abi: energyDataBridgeAbi,
    functionName: 'registeredNodes',
    args: memoizedRegisteredNodeArgs, 
    query: { 
        enabled: false // Keep manual fetch via button
    }
  });

  // --- Effects to update state from reads ---
  useEffect(() => { if (creditTokenData) setCreditTokenAddress(creditTokenData as Address); }, [creditTokenData]);
  useEffect(() => { if (rewardDistData) setRewardDistributorAddress(rewardDistData as Address); }, [rewardDistData]);
  useEffect(() => { if (emissionFactorData !== undefined) setCurrentEmissionFactor(emissionFactorData as bigint); }, [emissionFactorData]);
  useEffect(() => { if (requiredNodesData !== undefined) setRequiredNodes(requiredNodesData as bigint); }, [requiredNodesData]);
  useEffect(() => { if (processingDelayData !== undefined) setProcessingDelay(processingDelayData as bigint); }, [processingDelayData]);
  useEffect(() => { if (pausedData !== undefined) setIsPaused(pausedData as boolean); }, [pausedData]);

  useEffect(() => { if (darHashEDB) setDefaultAdminRoleEDB(darHashEDB as `0x${string}`); }, [darHashEDB]);
  useEffect(() => { if (dataSubmitterHashEDB) setDataSubmitterRoleEDB(dataSubmitterHashEDB as `0x${string}`); }, [dataSubmitterHashEDB]);
  useEffect(() => { if (nodeManagerHashEDB) setNodeManagerRoleEDB(nodeManagerHashEDB as `0x${string}`); }, [nodeManagerHashEDB]);
  useEffect(() => { if (pauserHashEDB) setPauserRoleEDB(pauserHashEDB as `0x${string}`); }, [pauserHashEDB]);
  useEffect(() => { if (upgraderHashEDB) setUpgraderRoleEDB(upgraderHashEDB as `0x${string}`); }, [upgraderHashEDB]);

  useEffect(() => { if (peerIdCountData !== undefined) setPeerIdCount(peerIdCountData as bigint); }, [peerIdCountData]);
  useEffect(() => { if (registeredNodeData) setQueriedNodeInfo(registeredNodeData as unknown as RegisteredNodeInfo); }, [registeredNodeData]);

  const { data: hasRoleDataEDB, refetch: fetchHasRoleEDB, isLoading: isHasRoleLoadingEDB } = useReadContract({
    address: ENERGY_DATA_BRIDGE_ADDRESS,
    abi: energyDataBridgeAbi,
    functionName: 'hasRole',
    args: (checkRoleSelectedEDB && checkRoleAccountEDB) ? [checkRoleSelectedEDB as `0x${string}`, checkRoleAccountEDB as Address] : undefined,
    query: { enabled: false }
  });
  useEffect(() => {
    if (hasRoleDataEDB !== undefined) setHasRoleResultEDB(hasRoleDataEDB ? 'Yes' : 'No');
  }, [hasRoleDataEDB]);

  const { data: roleAdminDataEDB, refetch: fetchRoleAdminEDB, isLoading: isRoleAdminLoadingEDB } = useReadContract({
    address: ENERGY_DATA_BRIDGE_ADDRESS,
    abi: energyDataBridgeAbi,
    functionName: 'getRoleAdmin',
    args: checkRoleSelectedEDB ? [checkRoleSelectedEDB as `0x${string}`] : undefined,
    query: { enabled: false }
  });
  useEffect(() => {
    if (roleAdminDataEDB !== undefined) {
      const foundRole = availableRolesEDB.find(r => r.hash === (roleAdminDataEDB as `0x${string}`));
      setRoleAdminResultEDB(foundRole ? `${foundRole.name} (${roleAdminDataEDB})` : (roleAdminDataEDB as string));
    }
  }, [roleAdminDataEDB, availableRolesEDB]);

  // Refetch function
  const refetchAll = useCallback(() => {
    refetchCreditToken();
    refetchRewardDist();
    refetchEmissionFactor();
    refetchRequiredNodes();
    refetchProcessingDelay();
    refetchPaused();
    refetchPeerIdCount();
    if (queryNodePeerId) fetchRegisteredNode();
  }, [refetchCreditToken, refetchRewardDist, refetchEmissionFactor, refetchRequiredNodes, refetchProcessingDelay, refetchPaused, refetchPeerIdCount, queryNodePeerId, fetchRegisteredNode]);

  // --- Write Functions ---
  const handleWrite = (functionName: string, args: unknown[], successMessage?: string) => {
    if (!ENERGY_DATA_BRIDGE_ADDRESS) { setStatusMessage('Contract address not set'); return; }
    setStatusMessage('');
    try {
      writeContract({
        address: ENERGY_DATA_BRIDGE_ADDRESS,
        abi: energyDataBridgeAbi,
        functionName: functionName,
        args: args,
      }, {
        onSuccess: () => setStatusMessage(successMessage || 'Transaction submitted...'),
        onError: (error) => setStatusMessage(`Submission Error: ${error.message}`),
      });
    } catch (e: unknown) {
      console.error(`${functionName} error:`, e);
      if (e instanceof Error) {
        setStatusMessage(`Error calling ${functionName}: ${e.message}`);
      } else {
        setStatusMessage(`An unknown error occurred calling ${functionName}`);
      }
    }
  };

  const handleSetEmissionFactor = () => {
    if (!newEmissionFactor) { setStatusMessage('Please enter new emission factor.'); return; }
    try {
      const factor = BigInt(newEmissionFactor); // Use BigInt for uint256
      handleWrite('setEmissionFactor', [factor], 'Set emission factor transaction submitted...');
    } catch (e: unknown) {
      if (e instanceof Error) {
        setStatusMessage(`Invalid factor format: ${e.message}`);
      } else {
        setStatusMessage('An unknown error occurred while setting emission factor.');
      }
    }
  };

  const handleSetRequiredNodes = () => {
    if (!newRequiredNodes) { setStatusMessage('Please enter required consensus nodes.'); return; }
    try {
      const nodes = BigInt(newRequiredNodes);
      handleWrite('setRequiredConsensusNodes', [nodes], 'Set required nodes transaction submitted...');
    } catch (e: unknown) {
      if (e instanceof Error) {
        setStatusMessage(`Invalid nodes format: ${e.message}`);
      } else {
        setStatusMessage('An unknown error occurred while setting required nodes.');
      }
    }
  };

  const handleSetProcessingDelay = () => {
    if (!newProcessingDelay) { setStatusMessage('Please enter batch processing delay.'); return; }
    try {
      const delay = BigInt(newProcessingDelay); // Delay in seconds
      handleWrite('setBatchProcessingDelay', [delay], 'Set processing delay transaction submitted...');
    } catch (e: unknown) {
      if (e instanceof Error) {
        setStatusMessage(`Invalid delay format: ${e.message}`);
      } else {
        setStatusMessage('An unknown error occurred while setting processing delay.');
      }
    }
  };

  const handlePause = () => handleWrite('pause', [], 'Pause transaction submitted...');
  const handleUnpause = () => handleWrite('unpause', [], 'Unpause transaction submitted...');

  const handleGrantRole = () => {
    if (!grantRoleSelectedEDB) { setStatusMessage('Please select a role to grant.'); return; }
    if (!grantRoleAccountEDB) { setStatusMessage('Please enter an account address to grant the role to.'); return; }
    try {
      const accountAddress = grantRoleAccountEDB as Address;
      handleWrite('grantRole', [grantRoleSelectedEDB as `0x${string}`, accountAddress], `Granting ${availableRolesEDB.find(r=>r.hash === grantRoleSelectedEDB)?.name || grantRoleSelectedEDB} to ${accountAddress}...`);
    } catch(e: unknown) {
      if (e instanceof Error) {
        setStatusMessage(`Invalid address for grant role: ${e.message}`);
      } else {
        setStatusMessage('An unknown error occurred while granting role.');
      }
    }
  };

  const handleRevokeRole = () => {
    if (!revokeRoleSelectedEDB) { setStatusMessage('Please select a role to revoke.'); return; }
    if (!revokeRoleAccountEDB) { setStatusMessage('Please enter an account address to revoke the role from.'); return; }
    try {
      const accountAddress = revokeRoleAccountEDB as Address;
      handleWrite('revokeRole', [revokeRoleSelectedEDB as `0x${string}`, accountAddress], `Revoking ${availableRolesEDB.find(r=>r.hash === revokeRoleSelectedEDB)?.name || revokeRoleSelectedEDB} from ${accountAddress}...`);
    } catch(e: unknown) {
      if (e instanceof Error) {
        setStatusMessage(`Invalid address for revoke role: ${e.message}`);
      } else {
        setStatusMessage('An unknown error occurred while revoking role.');
      }
    }
  };

  const handleRenounceRole = () => {
    if (!renounceRoleSelectedEDB) { setStatusMessage('Please select a role to renounce.'); return; }
    if (!connectedAddress) { setStatusMessage('Please connect your wallet to renounce a role.'); return; }
    handleWrite('renounceRole', [renounceRoleSelectedEDB as `0x${string}`, connectedAddress], `Renouncing ${availableRolesEDB.find(r=>r.hash === renounceRoleSelectedEDB)?.name || renounceRoleSelectedEDB} for ${connectedAddress}...`);
  };

  const handleCheckRole = () => {
    if (!checkRoleSelectedEDB) { setHasRoleResultEDB("Please select a role."); setRoleAdminResultEDB(null); return; }
    if (checkRoleAccountEDB) {
      setHasRoleResultEDB(null);
      fetchHasRoleEDB();
    } else {
      setHasRoleResultEDB("Please enter an account address to check.");
    }
    setRoleAdminResultEDB(null);
    fetchRoleAdminEDB(); 
  };

  const handleRegisterNode = () => {
    if (!registerNodePeerId) { setStatusMessage('Please enter Peer ID.'); return; }
    if (!registerNodeOperator) { setStatusMessage('Please enter Operator address.'); return; }
    try {
      let peerIdBytes32Hex: Hex;
      if (registerNodePeerId.startsWith('0x')) {
        if (registerNodePeerId.length !== 66) { // 0x + 64 hex chars for bytes32
          throw new Error('Hex Peer ID must be 32 bytes long (e.g., 0x... with 64 hex characters).');
        }
        // Basic hex validation
        if (!/^0x[0-9a-fA-F]{64}$/.test(registerNodePeerId)) {
            throw new Error('Invalid characters in hex Peer ID.');
        }
        peerIdBytes32Hex = registerNodePeerId as Hex;
      } else {
        // Viem's toBytes can handle various string inputs (including base58 for peer IDs)
        // and will throw if the input is too large for the specified size or invalid.
        const bytesValue = toBytes(registerNodePeerId, { size: 32 });
        peerIdBytes32Hex = bytesToHex(bytesValue); // Convert ByteArray to Hex string
      }
      const operatorAddress = registerNodeOperator as Address;
      handleWrite('registerNode', [peerIdBytes32Hex, operatorAddress], 'Register node transaction submitted...');
    } catch (e: unknown) {
      if (e instanceof Error) {
        setStatusMessage(`Invalid input for register node: ${e.message}`);
      } else {
        setStatusMessage('An unknown error occurred while registering node.');
      }
    }
  };

  const handleUpdateNodeStatus = () => {
    if (!updateNodePeerId) { setStatusMessage('Please enter Peer ID.'); return; }
    try {
      let peerIdBytes32Hex: Hex;
      if (updateNodePeerId.startsWith('0x')) {
        if (updateNodePeerId.length !== 66) {
          throw new Error('Hex Peer ID for update must be 32 bytes long.');
        }
        if (!/^0x[0-9a-fA-F]{64}$/.test(updateNodePeerId)) {
            throw new Error('Invalid characters in hex Peer ID for update.');
        }
        peerIdBytes32Hex = updateNodePeerId as Hex;
      } else {
        const bytesValue = toBytes(updateNodePeerId, {size: 32});
        peerIdBytes32Hex = bytesToHex(bytesValue);
      }
      handleWrite('updateNodeStatus', [peerIdBytes32Hex, updateNodeIsActive], 'Update node status transaction submitted...');
    } catch (e: unknown) {
      if (e instanceof Error) {
        setStatusMessage(`Invalid input for update node status: ${e.message}`);
      } else {
        setStatusMessage('An unknown error occurred while updating node status.');
      }
    }
  };

  const handleFetchRegisteredNode = () => {
    if (!queryNodePeerId) { 
        setStatusMessage('Please enter a Peer ID to query.'); 
        setQueriedNodeInfo(null); 
        return; 
    }
    // The memoizedRegisteredNodeArgs will be undefined if queryNodePeerId is invalid based on the useMemo logic
    if (!memoizedRegisteredNodeArgs) {
        setStatusMessage('Invalid Peer ID format for query. Must be a valid bytes32 hex string or convertible string (e.g., base58).');
        setQueriedNodeInfo(null);
        return;
    }
    
    setQueriedNodeInfo(null); // Clear previous
    fetchRegisteredNode(); // This will use the 'args: memoizedRegisteredNodeArgs' from the hook config.
  };

  // --- Transaction Status Effect ---
  useEffect(() => {
    if (isConfirmed) {
      setStatusMessage(`Transaction successful! Hash: ${writeHash}`);
      refetchAll();
    }
    // Keep submission errors, otherwise clear on success
    if (writeError && !isConfirmed) {
      setStatusMessage(`Error: ${writeError.message}`);
    }
    if (receiptError && !isConfirmed) {
       setStatusMessage(`Receipt Error: ${receiptError.message}`);
    }
  }, [isConfirmed, writeHash, writeError, receiptError, refetchAll]);


  if (!ENERGY_DATA_BRIDGE_ADDRESS) {
    return <p className="text-red-500">Error: NEXT_PUBLIC_ENERGY_DATA_BRIDGE_ADDRESS is not set in your .env.local file.</p>;
  }

  return (
    <div className="space-y-8 p-4 border rounded-lg shadow-md bg-white">
      <h2 className="text-2xl font-semibold text-black">Energy Data Bridge Admin <span className="text-sm text-gray-600">({ENERGY_DATA_BRIDGE_ADDRESS})</span></h2>

      {/* Contract Status Section */}
      <div className="p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black mb-2">Contract Status & Config</h3>
        <p className="text-black"><strong>Carbon Credit Token:</strong> {creditTokenAddress}</p>
        <p className="text-black"><strong>Reward Distributor:</strong> {rewardDistributorAddress}</p>
        <p className="text-black"><strong>Paused:</strong> {isPaused === null ? 'Loading...' : isPaused ? 'Yes' : 'No'}</p>
        <p className="text-black"><strong>Emission Factor:</strong> {currentEmissionFactor?.toString() ?? 'Loading...'}</p>
        <p className="text-black"><strong>Required Consensus Nodes:</strong> {requiredNodes?.toString() ?? 'Loading...'}</p>
        <p className="text-black"><strong>Batch Processing Delay (seconds):</strong> {processingDelay?.toString() ?? 'Loading...'}</p>
        <button onClick={refetchAll} className="mt-2 px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">Refresh Data</button>
      </div>

      {/* Role Management Section */}
      <div className="p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black mb-3">Role Management (EnergyDataBridge)</h3>
        
        {/* Grant Role */}
        <div className="space-y-3 mb-6 p-3 border-t pt-4">
          <h4 className="text-lg font-medium text-black">Grant Role</h4>
          <div>
            <label htmlFor="grantRoleSelectEDB" className="block text-sm font-medium text-black">Role:</label>
            <select
              id="grantRoleSelectEDB"
              value={grantRoleSelectedEDB}
              onChange={(e) => setGrantRoleSelectedEDB(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-black bg-white"
            >
              <option value="">-- Select Role --</option>
              {availableRolesEDB.map(role => <option key={role.hash} value={role.hash}>{role.name} ({role.hash?.substring(0,6)}...)</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="grantRoleAccountEDB" className="block text-sm font-medium text-black">Account Address:</label>
            <input
              type="text"
              id="grantRoleAccountEDB"
              value={grantRoleAccountEDB}
              onChange={(e) => setGrantRoleAccountEDB(e.target.value)}
              placeholder="0x..."
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleGrantRole}
            disabled={isWritePending || isConfirming || !grantRoleSelectedEDB || !grantRoleAccountEDB}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Grant Role
          </button>
        </div>

        {/* Revoke Role */}
        <div className="space-y-3 mb-6 p-3 border-t pt-4">
          <h4 className="text-lg font-medium text-black">Revoke Role</h4>
          <div>
            <label htmlFor="revokeRoleSelectEDB" className="block text-sm font-medium text-black">Role:</label>
            <select
              id="revokeRoleSelectEDB"
              value={revokeRoleSelectedEDB}
              onChange={(e) => setRevokeRoleSelectedEDB(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-black bg-white"
            >
              <option value="">-- Select Role --</option>
              {availableRolesEDB.map(role => <option key={role.hash} value={role.hash}>{role.name} ({role.hash?.substring(0,6)}...)</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="revokeRoleAccountEDB" className="block text-sm font-medium text-black">Account Address:</label>
            <input
              type="text"
              id="revokeRoleAccountEDB"
              value={revokeRoleAccountEDB}
              onChange={(e) => setRevokeRoleAccountEDB(e.target.value)}
              placeholder="0x..."
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleRevokeRole}
            disabled={isWritePending || isConfirming || !revokeRoleSelectedEDB || !revokeRoleAccountEDB}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Revoke Role
          </button>
        </div>

        {/* Renounce Role */}
        <div className="space-y-3 mb-6 p-3 border-t pt-4">
          <h4 className="text-lg font-medium text-black">Renounce Role (for connected address)</h4>
          <div>
            <label htmlFor="renounceRoleSelectEDB" className="block text-sm font-medium text-black">Role:</label>
            <select
              id="renounceRoleSelectEDB"
              value={renounceRoleSelectedEDB}
              onChange={(e) => setRenounceRoleSelectedEDB(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-black bg-white"
            >
              <option value="">-- Select Role --</option>
              {availableRolesEDB.map(role => <option key={role.hash} value={role.hash}>{role.name} ({role.hash?.substring(0,6)}...)</option>)}
            </select>
          </div>
          <button
            onClick={handleRenounceRole}
            disabled={isWritePending || isConfirming || !renounceRoleSelectedEDB || !connectedAddress}
            className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Renounce Role
          </button>
        </div>

        {/* Check Role / Get Role Admin */}
        <div className="space-y-3 p-3 border-t pt-4">
          <h4 className="text-lg font-medium text-black">Check Role / Get Role Admin</h4>
          <div>
            <label htmlFor="checkRoleSelectEDB" className="block text-sm font-medium text-black">Role:</label>
            <select
              id="checkRoleSelectEDB"
              value={checkRoleSelectedEDB}
              onChange={(e) => { setCheckRoleSelectedEDB(e.target.value); setHasRoleResultEDB(null); setRoleAdminResultEDB(null); }}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-black bg-white"
            >
              <option value="">-- Select Role --</option>
              {availableRolesEDB.map(role => <option key={role.hash} value={role.hash}>{role.name} ({role.hash?.substring(0,6)}...)</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="checkRoleAccountEDB" className="block text-sm font-medium text-black">Account Address (for hasRole):</label>
            <input
              type="text"
              id="checkRoleAccountEDB"
              value={checkRoleAccountEDB}
              onChange={(e) => { setCheckRoleAccountEDB(e.target.value); setHasRoleResultEDB(null); }}
              placeholder="0x... (optional for getRoleAdmin)"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleCheckRole}
            disabled={isHasRoleLoadingEDB || isRoleAdminLoadingEDB || !checkRoleSelectedEDB}
            className="px-4 py-2 bg-teal-500 text-white rounded hover:bg-teal-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            {isHasRoleLoadingEDB || isRoleAdminLoadingEDB ? 'Fetching...' : 'Check Role Info'}
          </button>
          {hasRoleResultEDB && <p className="text-sm mt-2 text-black"><strong>Has Role:</strong> {hasRoleResultEDB}</p>}
          {roleAdminResultEDB && <p className="text-sm mt-1 text-black"><strong>Role Admin:</strong> {roleAdminResultEDB}</p>}
        </div>
      </div>

      {/* Node Management Section */}
      <div className="p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black mb-3">Node Management</h3>
        <p className="text-black mb-2"><strong>Registered Peer ID Count:</strong> {peerIdCount?.toString() ?? 'Loading...'}</p>

        {/* Register Node */}
        <div className="space-y-3 mb-6 p-3 border-t pt-4">
          <h4 className="text-lg font-medium text-black">Register Node</h4>
          <p className="text-sm text-gray-700">Requires NODE_MANAGER_ROLE.</p>
          <div>
            <label htmlFor="registerNodePeerIdEDB" className="block text-sm font-medium text-black">Peer ID (bytes32 string or hex):</label>
            <input
              type="text"
              id="registerNodePeerIdEDB"
              value={registerNodePeerId}
              onChange={(e) => setRegisterNodePeerId(e.target.value)}
              placeholder="e.g., 0x... or my_peer_id_string"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <div>
            <label htmlFor="registerNodeOperatorEDB" className="block text-sm font-medium text-black">Operator Address:</label>
            <input
              type="text"
              id="registerNodeOperatorEDB"
              value={registerNodeOperator}
              onChange={(e) => setRegisterNodeOperator(e.target.value)}
              placeholder="0x..."
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleRegisterNode}
            disabled={isWritePending || isConfirming || !registerNodePeerId || !registerNodeOperator}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Register Node
          </button>
        </div>

        {/* Update Node Status */}
        <div className="space-y-3 mb-6 p-3 border-t pt-4">
          <h4 className="text-lg font-medium text-black">Update Node Status</h4>
          <p className="text-sm text-gray-700">Requires NODE_MANAGER_ROLE.</p>
          <div>
            <label htmlFor="updateNodePeerIdEDB" className="block text-sm font-medium text-black">Peer ID (bytes32 string or hex):</label>
            <input
              type="text"
              id="updateNodePeerIdEDB"
              value={updateNodePeerId}
              onChange={(e) => setUpdateNodePeerId(e.target.value)}
              placeholder="e.g., 0x... or my_peer_id_string"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black">Set Active Status:</label>
            <div className="mt-1 flex items-center">
              <input
                id="updateNodeIsActiveTrueEDB"
                name="updateNodeIsActiveEDB"
                type="radio"
                checked={updateNodeIsActive === true}
                onChange={() => setUpdateNodeIsActive(true)}
                className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300"
              />
              <label htmlFor="updateNodeIsActiveTrueEDB" className="ml-2 block text-sm text-black">Active</label>
            </div>
            <div className="mt-1 flex items-center">
              <input
                id="updateNodeIsActiveFalseEDB"
                name="updateNodeIsActiveEDB"
                type="radio"
                checked={updateNodeIsActive === false}
                onChange={() => setUpdateNodeIsActive(false)}
                className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300"
              />
              <label htmlFor="updateNodeIsActiveFalseEDB" className="ml-2 block text-sm text-black">Inactive</label>
            </div>
          </div>
          <button
            onClick={handleUpdateNodeStatus}
            disabled={isWritePending || isConfirming || !updateNodePeerId}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Update Node Status
          </button>
        </div>

        {/* Query Registered Node */}
        <div className="space-y-3 p-3 border-t pt-4">
          <h4 className="text-lg font-medium text-black">Query Registered Node</h4>
          <div>
            <label htmlFor="queryNodePeerIdEDB" className="block text-sm font-medium text-black">Peer ID (bytes32 string or hex):</label>
            <input
              type="text"
              id="queryNodePeerIdEDB"
              value={queryNodePeerId}
              onChange={(e) => { setQueryNodePeerId(e.target.value); setQueriedNodeInfo(null);}}
              placeholder="e.g., 0x... or 12D3Koo..."
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleFetchRegisteredNode}
            disabled={isRegisteredNodeLoading || !queryNodePeerId || !memoizedRegisteredNodeArgs}
            className="px-4 py-2 bg-teal-500 text-white rounded hover:bg-teal-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            {isRegisteredNodeLoading ? 'Fetching...' : 'Get Node Info'}
          </button>
          {queriedNodeInfo && (
            <div className="mt-2 text-sm text-black bg-gray-100 p-2 rounded">
              <p><strong>Operator:</strong> {queriedNodeInfo.operator}</p>
              <p><strong>Peer ID:</strong> {queriedNodeInfo.peerId}</p>
              <p><strong>Is Active:</strong> {queriedNodeInfo.isActive ? 'Yes' : 'No'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Control Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Set Emission Factor */}
        <div className="space-y-4 p-4 border rounded bg-gray-50">
          <h3 className="text-xl font-medium text-black">Set Emission Factor</h3>
          <p className="text-sm text-gray-700">Set the emission factor (e.g., gCO2/kWh * 1e6). Requires DEFAULT_ADMIN_ROLE.</p>
          <div>
            <label htmlFor="newEmissionFactorEDB" className="block text-sm font-medium text-black">New Factor (uint256):</label>
            <input
              type="text"
              id="newEmissionFactorEDB"
              value={newEmissionFactor}
              onChange={(e) => setNewEmissionFactor(e.target.value)}
              placeholder={`e.g., 500000`}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleSetEmissionFactor}
            disabled={isWritePending || isConfirming || !newEmissionFactor}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Set Factor
          </button>
        </div>

        {/* Set Required Consensus Nodes */}
        <div className="space-y-4 p-4 border rounded bg-gray-50">
          <h3 className="text-xl font-medium text-black">Set Required Nodes</h3>
          <p className="text-sm text-gray-700">Requires DEFAULT_ADMIN_ROLE.</p>
          <div>
            <label htmlFor="newRequiredNodesEDB" className="block text-sm font-medium text-black">New Required Node Count:</label>
            <input
              type="text"
              id="newRequiredNodesEDB"
              value={newRequiredNodes}
              onChange={(e) => setNewRequiredNodes(e.target.value)}
              placeholder={`e.g., 3`}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleSetRequiredNodes}
            disabled={isWritePending || isConfirming || !newRequiredNodes}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Set Node Count
          </button>
        </div>

        {/* Set Batch Processing Delay */}
         <div className="space-y-4 p-4 border rounded bg-gray-50">
           <h3 className="text-xl font-medium text-black">Set Batch Processing Delay</h3>
           <p className="text-sm text-gray-700">Delay in seconds before a batch can be finalized. Requires DEFAULT_ADMIN_ROLE.</p>
           <div>
             <label htmlFor="newProcessingDelayEDB" className="block text-sm font-medium text-black">New Delay (seconds):</label>
             <input
               type="text"
               id="newProcessingDelayEDB"
               value={newProcessingDelay}
               onChange={(e) => setNewProcessingDelay(e.target.value)}
               placeholder={`e.g., 86400 (1 day)`}
               className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
             />
           </div>
           <button
             onClick={handleSetProcessingDelay}
             disabled={isWritePending || isConfirming || !newProcessingDelay}
             className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
           >
             Set Delay
           </button>
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

      </div>

      {/* Status Message */}
      {statusMessage && (
        <div className={`mt-4 p-3 rounded ${writeError || receiptError ? 'bg-red-100 text-red-700' : isConfirmed ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
          <p className="text-sm font-medium">{statusMessage}</p>
        </div>
      )}

      {/* Placeholder for events like EmissionFactorSet, RequiredNodesSet etc. if needed */}
      {/* <div className="p-4 border rounded bg-gray-50 mt-6">
        <h3 className="text-xl font-medium text-black mb-3">Recent Events</h3>
        <p className="text-gray-600">No relevant contract-specific events tracked yet for display.</p> 
      </div> */}

    </div>
  );
}
 