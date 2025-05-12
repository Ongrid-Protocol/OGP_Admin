"use client";

import React, { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseUnits, formatUnits, Address, Abi } from 'viem';
import energyDataBridgeAbiJson from '@/abis/EnergyDataBridge.json';

const ENERGY_DATA_BRIDGE_ADDRESS = process.env.NEXT_PUBLIC_ENERGY_DATA_BRIDGE_ADDRESS as Address | undefined;

const energyDataBridgeAbi = energyDataBridgeAbiJson.abi;

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

  // --- Effects to update state from reads ---
  useEffect(() => { if (creditTokenData) setCreditTokenAddress(creditTokenData as Address); }, [creditTokenData]);
  useEffect(() => { if (rewardDistData) setRewardDistributorAddress(rewardDistData as Address); }, [rewardDistData]);
  useEffect(() => { if (emissionFactorData !== undefined) setCurrentEmissionFactor(emissionFactorData as bigint); }, [emissionFactorData]);
  useEffect(() => { if (requiredNodesData !== undefined) setRequiredNodes(requiredNodesData as bigint); }, [requiredNodesData]);
  useEffect(() => { if (processingDelayData !== undefined) setProcessingDelay(processingDelayData as bigint); }, [processingDelayData]);
  useEffect(() => { if (pausedData !== undefined) setIsPaused(pausedData as boolean); }, [pausedData]);

  // Refetch function
  const refetchAll = () => {
    refetchCreditToken();
    refetchRewardDist();
    refetchEmissionFactor();
    refetchRequiredNodes();
    refetchProcessingDelay();
    refetchPaused();
  };

  // --- Write Functions ---
  const handleWrite = (functionName: string, args: any[], successMessage?: string) => {
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
    } catch (e: any) {
      console.error(`${functionName} error:`, e);
      setStatusMessage(`Error calling ${functionName}: ${e.message}`);
    }
  };

  const handleSetEmissionFactor = () => {
    if (!newEmissionFactor) { setStatusMessage('Please enter new emission factor.'); return; }
    try {
        // Assuming emission factor is a direct uint256 value (e.g., grams CO2 per kWh * 1e6?) - Needs clarification on expected units/precision
      const factor = BigInt(newEmissionFactor); // Use BigInt for uint256
      handleWrite('setEmissionFactor', [factor], 'Set emission factor transaction submitted...');
    } catch (e: any) {
      setStatusMessage(`Invalid factor format: ${e.message}`);
    }
  };

  const handleSetRequiredNodes = () => {
    if (!newRequiredNodes) { setStatusMessage('Please enter required consensus nodes.'); return; }
    try {
      const nodes = BigInt(newRequiredNodes);
      handleWrite('setRequiredConsensusNodes', [nodes], 'Set required nodes transaction submitted...');
    } catch (e: any) {
      setStatusMessage(`Invalid nodes format: ${e.message}`);
    }
  };

  const handleSetProcessingDelay = () => {
     if (!newProcessingDelay) { setStatusMessage('Please enter batch processing delay.'); return; }
     try {
       const delay = BigInt(newProcessingDelay); // Delay in seconds
       handleWrite('setBatchProcessingDelay', [delay], 'Set processing delay transaction submitted...');
     } catch (e: any) {
       setStatusMessage(`Invalid delay format: ${e.message}`);
     }
   };

  const handlePause = () => handleWrite('pause', [], 'Pause transaction submitted...');
  const handleUnpause = () => handleWrite('unpause', [], 'Unpause transaction submitted...');

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
      <h2 className="text-2xl font-semibold text-gray-800">Energy Data Bridge Admin <span className="text-sm text-gray-500">({ENERGY_DATA_BRIDGE_ADDRESS})</span></h2>

      {/* Contract Status Section */}
      <div className="p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-gray-700 mb-2">Contract Status & Config</h3>
        <p className="text-gray-700"><strong>Carbon Credit Token:</strong> {creditTokenAddress}</p>
        <p className="text-gray-700"><strong>Reward Distributor:</strong> {rewardDistributorAddress}</p>
        <p className="text-gray-700"><strong>Paused:</strong> {isPaused === null ? 'Loading...' : isPaused ? 'Yes' : 'No'}</p>
        <p className="text-gray-700"><strong>Emission Factor:</strong> {currentEmissionFactor?.toString() ?? 'Loading...'}</p>
        <p className="text-gray-700"><strong>Required Consensus Nodes:</strong> {requiredNodes?.toString() ?? 'Loading...'}</p>
        <p className="text-gray-700"><strong>Batch Processing Delay (seconds):</strong> {processingDelay?.toString() ?? 'Loading...'}</p>
        <button onClick={refetchAll} className="mt-2 px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Refresh Data</button>
      </div>

      {/* Control Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Set Emission Factor */}
        <div className="space-y-4 p-4 border rounded bg-gray-50">
          <h3 className="text-xl font-medium text-gray-700">Set Emission Factor</h3>
          <p className="text-sm text-gray-600">Set the emission factor (e.g., gCO2/kWh * 1e6). Requires DEFAULT_ADMIN_ROLE.</p>
          <div>
            <label htmlFor="newEmissionFactor" className="block text-sm font-medium text-gray-700">New Factor (uint256):</label>
            <input
              type="text"
              id="newEmissionFactor"
              value={newEmissionFactor}
              onChange={(e) => setNewEmissionFactor(e.target.value)}
              placeholder={`e.g., 500000`}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          <button
            onClick={handleSetEmissionFactor}
            disabled={isWritePending || isConfirming}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            Set Factor
          </button>
        </div>

        {/* Set Required Consensus Nodes */}
        <div className="space-y-4 p-4 border rounded bg-gray-50">
          <h3 className="text-xl font-medium text-gray-700">Set Required Nodes</h3>
          <p className="text-sm text-gray-600">Requires DEFAULT_ADMIN_ROLE.</p>
          <div>
            <label htmlFor="newRequiredNodes" className="block text-sm font-medium text-gray-700">New Required Node Count:</label>
            <input
              type="text"
              id="newRequiredNodes"
              value={newRequiredNodes}
              onChange={(e) => setNewRequiredNodes(e.target.value)}
              placeholder={`e.g., 3`}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          <button
            onClick={handleSetRequiredNodes}
            disabled={isWritePending || isConfirming}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            Set Node Count
          </button>
        </div>

        {/* Set Batch Processing Delay */}
         <div className="space-y-4 p-4 border rounded bg-gray-50">
           <h3 className="text-xl font-medium text-gray-700">Set Batch Processing Delay</h3>
           <p className="text-sm text-gray-600">Delay in seconds before a batch can be finalized. Requires DEFAULT_ADMIN_ROLE.</p>
           <div>
             <label htmlFor="newProcessingDelay" className="block text-sm font-medium text-gray-700">New Delay (seconds):</label>
             <input
               type="text"
               id="newProcessingDelay"
               value={newProcessingDelay}
               onChange={(e) => setNewProcessingDelay(e.target.value)}
               placeholder={`e.g., 86400 (1 day)`}
               className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
             />
           </div>
           <button
             onClick={handleSetProcessingDelay}
             disabled={isWritePending || isConfirming}
             className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
           >
             Set Delay
           </button>
         </div>


        {/* Pause/Unpause Contract */}
        <div className="space-y-4 p-4 border rounded bg-gray-50">
          <h3 className="text-xl font-medium text-gray-700">Pause Control</h3>
           <p className="text-sm text-gray-600">Requires PAUSER_ROLE.</p>
           <div className="flex space-x-4">
            <button
              onClick={handlePause}
              disabled={isWritePending || isConfirming || isPaused === true}
              className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              Pause
            </button>
            <button
              onClick={handleUnpause}
              disabled={isWritePending || isConfirming || isPaused === false}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              Unpause
            </button>
          </div>
        </div>

      </div>

      {/* Status Message */}
      {statusMessage && (
        <div className={`mt-4 p-3 rounded ${writeError || receiptError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          <p className="text-sm">{statusMessage}</p>
        </div>
      )}

    </div>
  );
}
