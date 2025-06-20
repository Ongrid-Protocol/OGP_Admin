"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useWatchContractEvent } from 'wagmi';
import { Address, Abi, decodeEventLog, Hex } from 'viem';
import riskRateOracleAdapterAbiJson from '@/abis/RiskRateOracleAdapter.json';
import constantsAbiJson from '@/abis/Constants.json';
import { computeRoleHash, createRoleHashMap, getRoleNamesFromAbi } from '@/utils/crypto';

type RoleGrantedEventArgs = { role: Hex; account: Address; sender: Address; };
type RoleRevokedEventArgs = { role: Hex; account: Address; sender: Address; };
type ProjectRiskLevelSetEventArgs = { projectId: bigint; riskLevel: number; };
type RiskParamsPushedEventArgs = { projectId: bigint; aprBps: number; tenor: bigint; targetContract: Address, oracle: Address };
type PeriodicAssessmentRequestedEventArgs = { projectId: bigint; timestamp: bigint; targetContract: Address, poolId: bigint };
type AssessmentIntervalUpdatedEventArgs = { newInterval: bigint; oldInterval: bigint; };

const RISK_RATE_ORACLE_ADAPTER_ADDRESS = process.env.NEXT_PUBLIC_RISK_RATE_ORACLE_ADAPTER_ADDRESS as Address | undefined;

const riskRateOracleAdapterAbi = riskRateOracleAdapterAbiJson.abi;
const constantsAbi = constantsAbiJson.abi as Abi;

export function RiskRateOracleAdapterAdmin() {
  const {} = useAccount();
  const { data: writeHash, writeContract, isPending: isWritePending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash: writeHash });

  const [isPaused, setIsPaused] = useState<boolean | null>(null);
  const [assessmentInterval, setAssessmentInterval] = useState<bigint | null>(null);
  const [newInterval, setNewInterval] = useState<string>('');
  
  const [roleNames, setRoleNames] = useState<string[]>([]);
  const [selectedRoleName, setSelectedRoleName] = useState<string>('');
  const [grantRoleToAddress, setGrantRoleToAddress] = useState<string>('');
  const [revokeRoleFromAddress, setRevokeRoleFromAddress] = useState<string>('');
  const [roleEvents, setRoleEvents] = useState<(RoleGrantedEventArgs | RoleRevokedEventArgs)[]>([]);
  const [oracleEvents, setOracleEvents] = useState<(
    (ProjectRiskLevelSetEventArgs & { eventName: 'ProjectRiskLevelSet' }) | 
    (RiskParamsPushedEventArgs & { eventName: 'RiskParamsPushed' }) | 
    (PeriodicAssessmentRequestedEventArgs & { eventName: 'PeriodicAssessmentRequested' }) | 
    (AssessmentIntervalUpdatedEventArgs & { eventName: 'AssessmentIntervalUpdated' }) |
    ({ eventName: 'BatchRiskAssessmentTriggered', timestamp: bigint })
  )[]>([]);
  const [roleHashMap, setRoleHashMap] = useState<{ [hash: Hex]: string }>({});
  const [statusMessage, setStatusMessage] = useState<string>('');

  // State for HasRole Check
  const [checkRoleName, setCheckRoleName] = useState<string>('');
  const [checkRoleAccountAddress, setCheckRoleAccountAddress] = useState<string>('');
  const [hasRoleResult, setHasRoleResult] = useState<boolean | string | null>(null);
  const [hasRoleStatus, setHasRoleStatus] = useState<string>('');

  // State for Oracle Functions
  const [setProjectRiskProjectId, setSetProjectRiskProjectId] = useState<string>('');
  const [riskLevelToSet, setRiskLevelToSet] = useState<string>('');
  const [pushParamsProjectId, setPushParamsProjectId] = useState<string>('');
  const [pushParamsAprBps, setPushParamsAprBps] = useState<string>('');
  const [pushParamsTenor, setPushParamsTenor] = useState<string>('0');
  const [requestAssessmentProjectId, setRequestAssessmentProjectId] = useState<string>('');

  // State for View Oracle Config
  const [viewConfigProjectId, setViewConfigProjectId] = useState<string>('');
  const [targetContract, setTargetContract] = useState<Address | null>(null);
  const [poolIdForProject, setPoolIdForProject] = useState<bigint | null>(null);
  const [projectRiskLevelDisplay, setProjectRiskLevelDisplay] = useState<number | null>(null);
  const [lastAssessmentTimestamp, setLastAssessmentTimestamp] = useState<bigint | null>(null);

  // Memoize role hash computations
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

  const { data: pausedData, refetch: refetchPaused } = useReadContract({
    address: RISK_RATE_ORACLE_ADAPTER_ADDRESS,
    abi: riskRateOracleAdapterAbi,
    functionName: 'paused',
    query: { enabled: !!RISK_RATE_ORACLE_ADAPTER_ADDRESS }
  });
  const { data: intervalData, refetch: refetchInterval } = useReadContract({
    address: RISK_RATE_ORACLE_ADAPTER_ADDRESS,
    abi: riskRateOracleAdapterAbi,
    functionName: 'assessmentInterval',
    query: { enabled: !!RISK_RATE_ORACLE_ADAPTER_ADDRESS }
  });

  // --- Read Hooks for View Oracle Config (on demand) ---
  const { data: targetContractData, refetch: fetchTargetContract } = useReadContract({
    address: RISK_RATE_ORACLE_ADAPTER_ADDRESS,
    abi: riskRateOracleAdapterAbi,
    functionName: 'getTargetContract',
    args: viewConfigProjectId ? [BigInt(viewConfigProjectId)] : undefined,
    query: { enabled: false }
  });
  const { data: poolIdData, refetch: fetchPoolId } = useReadContract({
    address: RISK_RATE_ORACLE_ADAPTER_ADDRESS,
    abi: riskRateOracleAdapterAbi,
    functionName: 'getPoolId',
    args: viewConfigProjectId ? [BigInt(viewConfigProjectId)] : undefined,
    query: { enabled: false }
  });
  const { data: projectRiskLevelData, refetch: fetchProjectRiskLevel } = useReadContract({
    address: RISK_RATE_ORACLE_ADAPTER_ADDRESS,
    abi: riskRateOracleAdapterAbi,
    functionName: 'getProjectRiskLevel',
    args: viewConfigProjectId ? [BigInt(viewConfigProjectId)] : undefined,
    query: { enabled: false }
  });
  const { data: lastAssessmentData, refetch: fetchLastAssessment } = useReadContract({
    address: RISK_RATE_ORACLE_ADAPTER_ADDRESS,
    abi: riskRateOracleAdapterAbi,
    functionName: 'lastAssessmentTimestamp',
    args: viewConfigProjectId ? [BigInt(viewConfigProjectId)] : undefined,
    query: { enabled: false }
  });

  // --- HasRole Read Hook (on demand) ---
  const { data: hasRoleData, refetch: fetchHasRole, isLoading: isHasRoleLoading, error: hasRoleError } = useReadContract({
    address: RISK_RATE_ORACLE_ADAPTER_ADDRESS,
    abi: riskRateOracleAdapterAbi,
    functionName: 'hasRole',
    args: checkRoleBytes32 && checkRoleAccountAddress ? [checkRoleBytes32, checkRoleAccountAddress as Address] : undefined,
    query: {
      enabled: false, // Only fetch when refetch is called
    },
  });

  useEffect(() => { if (pausedData !== undefined) setIsPaused(pausedData as boolean); }, [pausedData]);
  useEffect(() => { if (intervalData !== undefined) setAssessmentInterval(intervalData as bigint); }, [intervalData]);

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

  useWatchContractEvent({
    address: RISK_RATE_ORACLE_ADAPTER_ADDRESS,
    abi: riskRateOracleAdapterAbi,
    eventName: 'RiskParamsPushed',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({ abi: riskRateOracleAdapterAbi, data: log.data, topics: log.topics, eventName: 'RiskParamsPushed' });
          const args = decoded.args as unknown as RiskParamsPushedEventArgs;
          setOracleEvents(prev => [...prev, { ...args, eventName: 'RiskParamsPushed' as const }]);
          setStatusMessage(`RiskParamsPushed: Project ${args.projectId.toString()}, APR ${args.aprBps}bps, Tenor ${args.tenor.toString()}`);
        } catch (e: unknown) { console.error("Error decoding RiskParamsPushed:", e); setStatusMessage("Error processing RiskParamsPushed event."); }
      });
    }
  });

  useWatchContractEvent({
    address: RISK_RATE_ORACLE_ADAPTER_ADDRESS,
    abi: riskRateOracleAdapterAbi,
    eventName: 'BatchRiskAssessmentTriggered',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({ abi: riskRateOracleAdapterAbi, data: log.data, topics: log.topics, eventName: 'BatchRiskAssessmentTriggered' });
          const args = decoded.args as unknown as { timestamp: bigint };
          setOracleEvents(prev => [...prev, {eventName: 'BatchRiskAssessmentTriggered' as const, ...args}]);
          setStatusMessage(`BatchRiskAssessmentTriggered event received at ${new Date(Number(args.timestamp) * 1000).toLocaleString()}.`);
        } catch (e: unknown) {
          console.error("Error decoding BatchRiskAssessmentTriggered event:", e);
        }
      });
    }
  });

  useWatchContractEvent({
    address: RISK_RATE_ORACLE_ADAPTER_ADDRESS,
    abi: riskRateOracleAdapterAbi,
    eventName: 'PeriodicAssessmentRequested',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({ abi: riskRateOracleAdapterAbi, data: log.data, topics: log.topics, eventName: 'PeriodicAssessmentRequested' });
          const args = decoded.args as unknown as PeriodicAssessmentRequestedEventArgs;
          setOracleEvents(prev => [...prev, { ...args, eventName: 'PeriodicAssessmentRequested' as const }]);
          setStatusMessage(`PeriodicAssessmentRequested: Project ${args.projectId.toString()}`);
        } catch (e: unknown) { console.error("Error decoding PeriodicAssessmentRequested:", e); setStatusMessage("Error processing PeriodicAssessmentRequested event."); }
      });
    }
  });

  useWatchContractEvent({
    address: RISK_RATE_ORACLE_ADAPTER_ADDRESS,
    abi: riskRateOracleAdapterAbi,
    eventName: 'AssessmentIntervalUpdated',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({ abi: riskRateOracleAdapterAbi, data: log.data, topics: log.topics, eventName: 'AssessmentIntervalUpdated' });
          const args = decoded.args as unknown as AssessmentIntervalUpdatedEventArgs;
          setOracleEvents(prev => [...prev, { ...args, eventName: 'AssessmentIntervalUpdated' as const }]);
          setStatusMessage(`AssessmentIntervalUpdated: New ${args.newInterval.toString()}, Old ${args.oldInterval.toString()}`);
          refetchInterval();
        } catch (e: unknown) { console.error("Error decoding AssessmentIntervalUpdated:", e); setStatusMessage("Error processing AssessmentIntervalUpdated event."); }
      });
    }
  });

  useWatchContractEvent({
    address: RISK_RATE_ORACLE_ADAPTER_ADDRESS,
    abi: riskRateOracleAdapterAbi,
    eventName: 'RoleGranted',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({ 
            abi: riskRateOracleAdapterAbi, 
            data: log.data, 
            topics: log.topics, 
            eventName: 'RoleGranted' 
          });
          const args = decoded.args as unknown as RoleGrantedEventArgs;
          setRoleEvents(prev => [...prev, args]);
          const roleName = roleHashMap[args.role] || args.role;
          setStatusMessage(`RoleGranted: ${roleName} to ${args.account}`);
        } catch (e: unknown) { 
          console.error("Error decoding RoleGranted:", e); 
          setStatusMessage("Error processing RoleGranted event."); 
        }
      });
    }
  });

  useWatchContractEvent({
    address: RISK_RATE_ORACLE_ADAPTER_ADDRESS,
    abi: riskRateOracleAdapterAbi,
    eventName: 'RoleRevoked',
    onLogs(logs) {
      logs.forEach(log => {
        try {
          const decoded = decodeEventLog({ 
            abi: riskRateOracleAdapterAbi, 
            data: log.data, 
            topics: log.topics, 
            eventName: 'RoleRevoked' 
          });
          const args = decoded.args as unknown as RoleRevokedEventArgs;
          setRoleEvents(prev => [...prev, args]);
          const roleName = roleHashMap[args.role] || args.role;
          setStatusMessage(`RoleRevoked: ${roleName} from ${args.account}`);
        } catch (e: unknown) { 
          console.error("Error decoding RoleRevoked:", e); 
          setStatusMessage("Error processing RoleRevoked event."); 
        }
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

  const refetchAll = useCallback(() => { 
    refetchPaused(); 
    refetchInterval(); 
    if (viewConfigProjectId) {
        fetchTargetContract();
        fetchPoolId();
        fetchProjectRiskLevel();
        fetchLastAssessment();
    }
  }, [refetchPaused, refetchInterval, viewConfigProjectId, fetchTargetContract, fetchPoolId, fetchProjectRiskLevel, fetchLastAssessment]);

  const handleWrite = (functionName: string, args: unknown[], successMsg?: string) => {
    if (!RISK_RATE_ORACLE_ADAPTER_ADDRESS) { setStatusMessage('Contract address not set'); return; }
    setStatusMessage('');
    writeContract({ address: RISK_RATE_ORACLE_ADAPTER_ADDRESS, abi: riskRateOracleAdapterAbi, functionName, args },
      { onSuccess: () => setStatusMessage(successMsg || 'Tx submitted'), onError: (e) => setStatusMessage(`Error: ${e.message}`) }
    );
  };

  const handleGrantRole = () => {
    if (!selectedRoleBytes32 || !grantRoleToAddress) { setStatusMessage('Role or address missing'); return; }
    handleWrite('grantRole', [selectedRoleBytes32, grantRoleToAddress as Address], `Granting ${selectedRoleName}...`);
  };

  const handleRevokeRole = () => {
    if (!selectedRoleBytes32 || !revokeRoleFromAddress) { setStatusMessage('Role or address to revoke from missing'); return; }
    handleWrite('revokeRole', [selectedRoleBytes32, revokeRoleFromAddress as Address], `Revoking ${selectedRoleName}...`);
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
  const handleSetAssessmentInterval = () => {
    if (!newInterval) { setStatusMessage('New interval is missing'); return; }
    try {
        const intervalBigInt = BigInt(newInterval);
        handleWrite('setAssessmentInterval', [intervalBigInt], 'Setting assessment interval...');
    } catch (e: unknown) { 
        if (e instanceof Error) setStatusMessage(`Invalid interval: ${e.message}`);
        else setStatusMessage('An unknown error occurred while setting interval.');
    }
  };

  // --- Oracle Function Handlers ---
  const handleSetProjectRiskLevel = () => {
    if (!setProjectRiskProjectId || !riskLevelToSet) { setStatusMessage('Project ID and Risk Level required.'); return; }
    try {
      const projectId = BigInt(setProjectRiskProjectId);
      const riskLevel = parseInt(riskLevelToSet, 10);
      if (isNaN(riskLevel) || riskLevel < 1 || riskLevel > 3) { setStatusMessage('Risk level must be 1, 2, or 3.'); return; }
      handleWrite('setProjectRiskLevel', [projectId, riskLevel], `Setting Project ${projectId} risk level to ${riskLevel}...`);
    } catch (e: unknown) { 
        if (e instanceof Error) setStatusMessage(`Error: ${e.message}`);
        else setStatusMessage('An unknown error occurred.');
    }
  };

  const handlePushRiskParams = () => {
    if (!pushParamsProjectId || !pushParamsAprBps) { setStatusMessage('Project ID and APR BPS required.'); return; }
    try {
      const projectId = BigInt(pushParamsProjectId);
      const aprBps = parseInt(pushParamsAprBps, 10);
      const tenor = BigInt(pushParamsTenor || "0");
      if (isNaN(aprBps) || aprBps < 0) { setStatusMessage('APR BPS must be a non-negative number.'); return; }
      handleWrite('pushRiskParams', [projectId, aprBps, tenor], `Pushing params for Project ${projectId}: APR ${aprBps}bps, Tenor ${tenor}...`);
    } catch (e: unknown) { 
        if (e instanceof Error) setStatusMessage(`Error: ${e.message}`);
        else setStatusMessage('An unknown error occurred.');
    }
  };

  const handleTriggerBatchAssessment = () => {
    handleWrite('triggerBatchRiskAssessment', [], 'Triggering batch risk assessment...');
  };

  const handleRequestPeriodicAssessment = () => {
    if (!requestAssessmentProjectId) { setStatusMessage('Project ID required.'); return; }
    try {
      const projectId = BigInt(requestAssessmentProjectId);
      handleWrite('requestPeriodicAssessment', [projectId], `Requesting periodic assessment for Project ${projectId}...`);
    } catch (e: unknown) { 
        if (e instanceof Error) setStatusMessage(`Error: ${e.message}`);
        else setStatusMessage('An unknown error occurred.');
    }
  };

  const handleViewOracleConfig = () => {
    if (!viewConfigProjectId) { setStatusMessage('Please enter Project ID to view oracle config.'); return; }
    fetchTargetContract();
    fetchPoolId();
    fetchProjectRiskLevel();
    fetchLastAssessment();
  };

  useEffect(() => {
    if (isConfirmed) { setStatusMessage(`Success! Hash: ${writeHash}`); refetchAll(); }
    if (writeError) { setStatusMessage(`Transaction Error: ${writeError.message}`); }
    if (receiptError) { setStatusMessage(`Receipt Error: ${receiptError.message}`); }
  }, [isConfirmed, writeHash, writeError, receiptError, refetchAll]);

  // --- Effects for View Oracle Config Data ---
  useEffect(() => { if (targetContractData != null) setTargetContract(targetContractData as Address);}, [targetContractData]);
  useEffect(() => { if (poolIdData != null) setPoolIdForProject(poolIdData as bigint);}, [poolIdData]);
  useEffect(() => { if (projectRiskLevelData != null) setProjectRiskLevelDisplay(projectRiskLevelData as number);}, [projectRiskLevelData]);
  useEffect(() => { if (lastAssessmentData != null) setLastAssessmentTimestamp(lastAssessmentData as bigint);}, [lastAssessmentData]);

  if (!RISK_RATE_ORACLE_ADAPTER_ADDRESS) return <p className="text-red-500 p-4">Error: NEXT_PUBLIC_RISK_RATE_ORACLE_ADAPTER_ADDRESS is not set.</p>;

  return (
    <div className="space-y-8 p-4 border rounded-lg shadow-md bg-white">
      <h2 className="text-2xl font-semibold text-black">Risk Rate Oracle Adapter Admin <span className="text-sm text-gray-600">({RISK_RATE_ORACLE_ADAPTER_ADDRESS})</span></h2>

      <div className="p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black mb-2">Contract Status</h3>
        <p className="text-black"><strong>Paused:</strong> {isPaused === null ? 'Loading...' : isPaused ? 'Yes' : 'No'}</p>
        <p className="text-black"><strong>Assessment Interval (seconds):</strong> {assessmentInterval?.toString() ?? 'Loading...'}</p>
        <button onClick={refetchAll} className="mt-2 px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">Refresh Data</button>
      </div>

      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Set Assessment Interval</h3>
        <p className="text-sm text-gray-700">Requires DEFAULT_ADMIN_ROLE.</p>
        <input type="text" value={newInterval} onChange={(e) => setNewInterval(e.target.value)} placeholder="New interval in seconds" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500" />
        <button onClick={handleSetAssessmentInterval} disabled={isWritePending || isConfirming || !newInterval} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400">Set Interval</button>
      </div>

      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Grant Role</h3>
        <p className="text-sm text-gray-700">Grant roles like PAUSER_ROLE, RISK_ORACLE_ROLE. Requires DEFAULT_ADMIN_ROLE or specific role admin.</p>
        <div>
            <label htmlFor="roleSelectRROA" className="block text-sm font-medium text-black">Select Role:</label>
            <select id="roleSelectRROA" value={selectedRoleName} onChange={(e) => setSelectedRoleName(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black">
            <option value="">-- Select Role --</option>
            {roleNames.map(name => (<option key={name} value={name}>{name}</option>))}
            </select>
            {selectedRoleName && <p className="text-xs text-gray-600 mt-1">Computed Role Hash: {selectedRoleBytes32 || (selectedRoleName ? 'Calculating...' : 'N/A')}</p>}
        </div>
        <div>
            <label htmlFor="grantRoleAddressRROA" className="block text-sm font-medium text-black">Address to Grant Role:</label>
            <input type="text" id="grantRoleAddressRROA" value={grantRoleToAddress} onChange={(e) => setGrantRoleToAddress(e.target.value)} placeholder="Address to grant role" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500" />
        </div>
        <button onClick={handleGrantRole} disabled={!selectedRoleBytes32 || !grantRoleToAddress || isWritePending || isConfirming} className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed">Grant Role</button>
        <div className="mt-4">
            <label htmlFor="revokeRoleAddressRROA" className="block text-sm font-medium text-black">Address to Revoke Role From:</label>
            <input type="text" id="revokeRoleAddressRROA" value={revokeRoleFromAddress} onChange={(e) => setRevokeRoleFromAddress(e.target.value)} placeholder="Address to revoke role from" className="mt-1 block w-full input-style text-black" />
        </div>
        <button onClick={handleRevokeRole} disabled={!selectedRoleBytes32 || !revokeRoleFromAddress || isWritePending || isConfirming} className="mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400">Revoke Role</button>
      </div>

      {/* Check Role Section */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Check Role (hasRole)</h3>
        <div>
            <label htmlFor="checkRoleSelectRROA" className="block text-sm font-medium text-black">Select Role to Check:</label>
            <select 
              id="checkRoleSelectRROA" 
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
            <label htmlFor="checkRoleAddressRROA" className="block text-sm font-medium text-black">Account Address to Check:</label>
            <input 
              type="text" 
              id="checkRoleAddressRROA" 
              value={checkRoleAccountAddress} 
              onChange={(e) => { setCheckRoleAccountAddress(e.target.value); setHasRoleResult(null); setHasRoleStatus('');}} 
              placeholder="0x... (e.g., Oracle Wallet for RISK_ORACLE_ROLE)" 
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
          <p className="italic text-gray-700">Placeholders for: setTargetContract, setProjectRiskLevel, pushRiskParams etc. These may require more complex input forms.</p>
      </div>

      {/* --- Oracle Management Sections --- */}
      {/* Set Project Risk Level */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Set Project Risk Level</h3>
        <p className="text-sm text-gray-700">Requires RISK_ORACLE_ROLE.</p>
        <div><label htmlFor="setProjectRiskProjectId">Project ID:</label><input type="text" id="setProjectRiskProjectId" value={setProjectRiskProjectId} onChange={e => setSetProjectRiskProjectId(e.target.value)} placeholder="Project ID (uint256)" className="input-style text-black" /></div>
        <div><label htmlFor="setProjectRiskLevel">Risk Level (1-3):</label><input type="number" id="setProjectRiskLevel" value={riskLevelToSet} onChange={e => setRiskLevelToSet(e.target.value)} placeholder="1, 2, or 3" className="input-style text-black" /></div>
        <button onClick={handleSetProjectRiskLevel} disabled={isWritePending || isConfirming} className="button-style bg-yellow-500 hover:bg-yellow-600">Set Project Risk Level</button>
      </div>

      {/* Push Updated Risk Parameters */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Push Updated Risk Parameters</h3>
        <p className="text-sm text-gray-700">Requires RISK_ORACLE_ROLE.</p>
        <div><label htmlFor="pushParamsProjectId">Project ID:</label><input type="text" id="pushParamsProjectId" value={pushParamsProjectId} onChange={e => setPushParamsProjectId(e.target.value)} placeholder="Project ID (uint256)" className="input-style text-black" /></div>
        <div><label htmlFor="pushParamsAprBps">New APR (BPS):</label><input type="number" id="pushParamsAprBps" value={pushParamsAprBps} onChange={e => setPushParamsAprBps(e.target.value)} placeholder="e.g., 1250 for 12.5%" className="input-style text-black" /></div>
        <div><label htmlFor="pushParamsTenor">New Tenor (0 if unchanged):</label><input type="text" id="pushParamsTenor" value={pushParamsTenor} onChange={e => setPushParamsTenor(e.target.value)} placeholder="e.g., 31536000 for 1 year" className="input-style text-black" /></div>
        <button onClick={handlePushRiskParams} disabled={isWritePending || isConfirming} className="button-style bg-yellow-600 hover:bg-yellow-700">Push Risk Parameters</button>
      </div>

      {/* Trigger Assessments */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Trigger Risk Assessments</h3>
        <p className="text-sm text-gray-700">Requires RISK_ORACLE_ROLE.</p>
        <button onClick={handleTriggerBatchAssessment} disabled={isWritePending || isConfirming} className="button-style bg-orange-500 hover:bg-orange-600">Trigger Batch Assessment</button>
        <div className="mt-4">
          <label htmlFor="requestAssessmentProjectId">Project ID for Periodic Assessment:</label>
          <input type="text" id="requestAssessmentProjectId" value={requestAssessmentProjectId} onChange={e => setRequestAssessmentProjectId(e.target.value)} placeholder="Project ID (uint256)" className="input-style text-black" />
        </div>
        <button onClick={handleRequestPeriodicAssessment} disabled={isWritePending || isConfirming || !requestAssessmentProjectId} className="button-style bg-orange-600 hover:bg-orange-700">Request Periodic Assessment</button>
      </div>
      
      {/* View Oracle Configuration */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">View Oracle Configuration for Project</h3>
        <div><label htmlFor="viewConfigProjectId">Project ID:</label><input type="text" id="viewConfigProjectId" value={viewConfigProjectId} onChange={e => {setViewConfigProjectId(e.target.value); setTargetContract(null); /* Clear others */ }} placeholder="Project ID (uint256)" className="input-style text-black" /></div>
        <button onClick={handleViewOracleConfig} disabled={isHasRoleLoading} className="button-style bg-teal-500 hover:bg-teal-600">
            {isHasRoleLoading ? 'Loading...' : 'View Config'}
        </button>
        {viewConfigProjectId && (
            <div className="mt-2 p-2 bg-gray-100 rounded">
                {targetContract && <p>Target Contract: {targetContract}</p>}
                {poolIdForProject !== null && <p>Pool ID: {poolIdForProject.toString()}</p>}
                {projectRiskLevelDisplay !== null && <p>Project Risk Level: {projectRiskLevelDisplay}</p>}
                {lastAssessmentTimestamp !== null && <p>Last Assessment: {new Date(Number(lastAssessmentTimestamp) * 1000).toLocaleString()}</p>}
            </div>
        )}
      </div>

      {statusMessage && (
        <div className={`mt-4 p-3 rounded ${writeError || receiptError ? 'bg-red-100 text-red-700' : isConfirmed ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
            <p className="text-sm font-medium">{statusMessage}</p>
        </div>
      )}

      <div className="p-4 border rounded bg-gray-50 mt-6">
        <h3 className="text-xl font-medium text-black mb-3">Recent Role Events</h3>
        {roleEvents.length === 0 && <p className="text-gray-600">No role events detected yet.</p>}
        <ul className="space-y-3">
          {roleEvents.slice(-5).reverse().map((event, index) => { // Display last 5, newest first
              const roleName = roleHashMap[event.role] || event.role; // Fallback to hash
              const eventType = 'sender' in event ? 'RoleGranted' : 'RoleRevoked';
              return (
              <li key={index} className="p-3 bg-white border border-gray-200 rounded shadow-sm">
                  <p className="text-sm text-black"><strong>Event: {eventType}</strong></p>
                  <p className="text-sm text-black"><strong>Role:</strong> {roleName} ({event.role.substring(0, 10)}...)</p>
                  <p className="text-sm text-black"><strong>Account:</strong> {event.account}</p>
                  {(event as RoleGrantedEventArgs).sender && <p className="text-sm text-black"><strong>Sender:</strong> {(event as RoleGrantedEventArgs).sender}</p>}
              </li>
              );
          })}
        </ul>
      </div>
      
      {oracleEvents.length > 0 && (
        <div className="p-4 border rounded bg-gray-50 mt-6">
          <h3 className="text-xl font-medium text-black mb-3">Recent Oracle Events</h3>
          <ul className="space-y-3">
            {oracleEvents.slice(-5).reverse().map((event, index) => (
              <li key={`oracle-${index}`} className="p-3 bg-blue-50 border-blue-200 rounded shadow-sm">
                <p className="text-sm text-black"><strong>Event: {event.eventName}</strong></p>
                {event.eventName === 'ProjectRiskLevelSet' && (
                    <>
                        <p className="text-black">Project ID: {event.projectId.toString()}</p>
                        <p className="text-black">Risk Level: {event.riskLevel.toString()}</p>
                    </>
                )}
                {event.eventName === 'RiskParamsPushed' && (
                    <>
                        <p className="text-black">Project ID: {event.projectId.toString()}</p>
                        <p className="text-black">APR BPS: {event.aprBps.toString()}</p>
                        <p className="text-black">Tenor: {event.tenor.toString()}</p>
                    </>
                )}
                {event.eventName === 'PeriodicAssessmentRequested' && (
                    <>
                        <p className="text-black">Project ID: {event.projectId.toString()}</p>
                        <p className="text-black">Last Assessment: {new Date(Number(event.timestamp) * 1000).toLocaleString()}</p>
                    </>
                )}
                {event.eventName === 'AssessmentIntervalUpdated' && (
                     <>
                        <p className="text-black">New Interval: {event.newInterval.toString()}</p>
                        <p className="text-black">Old Interval: {event.oldInterval.toString()}</p>
                    </>
                )}
                {event.eventName === 'BatchRiskAssessmentTriggered' && (
                    <p className="text-black">Timestamp: {new Date(Number(event.timestamp) * 1000).toLocaleString()}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
} 