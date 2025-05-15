"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useWatchContractEvent, useBalance } from 'wagmi';
import { parseUnits, formatUnits, Address, decodeEventLog} from 'viem';
// import mockUsdcAbiJson from '../../out-finance/MockUSDC.sol/MockUSDC.json'; // Adjusted path
import mockUsdcAbiJson from '@/abis/MockUSDC.json'; // Use alias for new path

// Define proper types for the event args
type MintedEventArgs = {
  minter: Address;
  to: Address;
  amount: bigint;
};

// Ensure your .env.local file has NEXT_PUBLIC_MOCK_USDC_ADDRESS set
const MOCK_USDC_ADDRESS = process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS as Address | undefined;

const mockUsdcAbi = mockUsdcAbiJson.abi;

export function MockUsdcAdmin() {
  const {} = useAccount();
  const { data: writeHash, writeContract, isPending: isWritePending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash: writeHash });

  const [toAddress, setToAddress] = useState<string>('');
  const [mintAmount, setMintAmount] = useState<string>('');
  const [mintStatus, setMintStatus] = useState<string>('');

  const [balanceAccountAddress, setBalanceAccountAddress] = useState<string>('');
  const [fetchedBalance, setFetchedBalance] = useState<string | null>(null);
  const [lastMintEvent, setLastMintEvent] = useState<MintedEventArgs | null>(null);

  const { data: balanceData, refetch: fetchBalanceForAddress, isLoading: isBalanceLoading } = useBalance({
    address: balanceAccountAddress as Address | undefined,
    token: MOCK_USDC_ADDRESS,
    query: {
      enabled: !!MOCK_USDC_ADDRESS && !!balanceAccountAddress,
    }
  });

  useEffect(() => {
    if (balanceData) {
      setFetchedBalance(balanceData.formatted);
    }
  }, [balanceData]);
  
  useWatchContractEvent({
    address: MOCK_USDC_ADDRESS,
    abi: mockUsdcAbi,
    eventName: 'Minted',
    onLogs(logs) {
      console.log('Minted event raw logs:', JSON.stringify(logs, null, 2));
      if (logs.length > 0) {
        try {
          const log = logs[0];
          const decoded = decodeEventLog({
            abi: mockUsdcAbi,
            data: log.data,
            topics: log.topics,
            eventName: 'Minted'
          });
          
          const eventArgs = decoded.args as unknown as MintedEventArgs;

          if (eventArgs && typeof eventArgs.minter === 'string' && typeof eventArgs.to === 'string' && typeof eventArgs.amount === 'bigint') {
            setLastMintEvent(eventArgs);
            setMintStatus(`Minted event! Minter: ${eventArgs.minter}, To: ${eventArgs.to}, Amount: ${formatUnits(eventArgs.amount, 6)} USDC`);
          } else {
            console.error('Decoded Minted event args do not match expected structure:', decoded.args);
            setMintStatus('Error: Parsed Minted event data has unexpected structure.');
          }
        } catch (error) {
          console.error('Error decoding Minted event:', error);
          setMintStatus('Error parsing Minted event data.');
        }
      } else {
        // This case might not be an error, could just be no events in this batch.
        // console.warn('Minted event logs received, but no logs found in this batch.');
      }
    },
    onError(error) {
      console.error('Error watching Minted event:', error);
      setMintStatus(`Error watching Minted event: ${error.message}`);
    }
  });

  const refetchAll = useCallback(() => {
    if (MOCK_USDC_ADDRESS) {
      if (balanceAccountAddress) {
        fetchBalanceForAddress();
      }
    }
  }, [balanceAccountAddress, fetchBalanceForAddress]);

  const handleMint = () => {
    if (!MOCK_USDC_ADDRESS) {
      setMintStatus('MockUSDC contract address not set in .env');
      return;
    }
    if (!toAddress || !mintAmount) {
      setMintStatus('Please enter recipient address and amount.');
      return;
    }
    setMintStatus('');
    try {
      const amountInSmallestUnit = parseUnits(mintAmount, 6); // Assuming 6 decimals
      writeContract({
        address: MOCK_USDC_ADDRESS,
        abi: mockUsdcAbi,
        functionName: 'mint',
        args: [toAddress as Address, amountInSmallestUnit],
      }, {
        onSuccess: () => { setMintStatus(`Minting ${mintAmount} USDC to ${toAddress}...`); refetchAll(); },
        onError: (error) => {
          console.error("Minting error:", error);
          setMintStatus(`Minting error: ${error.message}`);
        },
      });
    } catch (e: unknown) {
      if (e instanceof Error) {
        console.error("Minting error:", e);
        setMintStatus(`Minting error: ${e.message}`);
      } else {
        console.error("An unknown error occurred during mint preparation.");
        setMintStatus("An unknown error occurred during mint preparation.");
      }
    }
  };

  const handleFetchBalance = () => {
    if (!MOCK_USDC_ADDRESS) {
      setFetchedBalance('MockUSDC contract address not set in .env');
      return;
    }
    if (balanceAccountAddress) {
      refetchAll();
    } else {
      setFetchedBalance("Please enter an account address.");
    }
  };
  
  // Move this hook definition BEFORE the useEffect that depends on it
  const { data: totalSupplyData, refetch: refetchTotalSupply } = useReadContract({
    address: MOCK_USDC_ADDRESS,
    abi: mockUsdcAbi,
    functionName: 'totalSupply',
    query: { enabled: !!MOCK_USDC_ADDRESS }
  });
  
  useEffect(() => {
    if (isConfirmed) {
      setMintStatus(`Successfully minted! Transaction hash: ${writeHash}`);
      if (toAddress.toLowerCase() === balanceAccountAddress.toLowerCase()) {
        refetchAll();
      } else {
        if (MOCK_USDC_ADDRESS) refetchTotalSupply();
      }
    }
    if (writeError || receiptError) {
      setMintStatus(`Error: ${writeError?.message || receiptError?.message}`);
    }
  }, [isConfirmed, writeHash, writeError, receiptError, toAddress, balanceAccountAddress, refetchAll, refetchTotalSupply]);

  useEffect(() => {
    if (balanceData) {
      setFetchedBalance(balanceData.formatted);
    }
  }, [balanceData]);

  if (!MOCK_USDC_ADDRESS) {
    return <p className="text-red-500">Error: NEXT_PUBLIC_MOCK_USDC_ADDRESS is not set in your .env.local file.</p>;
  }

  return (
    <div className="space-y-8 p-4 border rounded-lg shadow-md bg-white">
      <h2 className="text-2xl font-semibold text-black">MockUSDC Admin</h2>

      {/* Mint Section */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Mint Tokens</h3>
        <div>
          <label htmlFor="toAddress" className="block text-sm font-medium text-black">Recipient Address:</label>
          <input
            type="text"
            id="toAddress"
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            placeholder="0x..."
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
          />
        </div>
        <div>
          <label htmlFor="mintAmount" className="block text-sm font-medium text-black">Amount (USDC):</label>
          <input
            type="text"
            id="mintAmount"
            value={mintAmount}
            onChange={(e) => setMintAmount(e.target.value)}
            placeholder="e.g., 100"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
          />
        </div>
        <button
          onClick={handleMint}
          disabled={isWritePending || isConfirming || !toAddress || !mintAmount}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
        >
          {isWritePending ? 'Minting...' : isConfirming ? 'Confirming...' : 'Mint USDC'}
        </button>
        {mintStatus && (
            <p className={`text-sm mt-2 font-medium ${writeError || receiptError ? 'text-red-700' : isConfirmed ? 'text-green-700' : 'text-blue-700'}`}>
                {mintStatus}
            </p>
        )}
         {lastMintEvent && (
          <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded text-sm">
            <p className="font-semibold text-black"><strong>Last Mint Event:</strong></p>
            <p className="text-black">Minter: {lastMintEvent.minter}</p>
            <p className="text-black">To: {lastMintEvent.to}</p>
            <p className="text-black">Amount: {formatUnits(lastMintEvent.amount, 6)} USDC</p>
          </div>
        )}
      </div>

      {/* BalanceOf Section */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Check Balance</h3>
        <div>
          <label htmlFor="balanceAccountAddress" className="block text-sm font-medium text-black">Account Address:</label>
          <input
            type="text"
            id="balanceAccountAddress"
            value={balanceAccountAddress}
            onChange={(e) => { setBalanceAccountAddress(e.target.value); setFetchedBalance(null); }}
            placeholder="0x..."
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black placeholder-gray-500"
          />
        </div>
        <button
          onClick={handleFetchBalance}
          disabled={isBalanceLoading}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
        >
          {isBalanceLoading ? 'Fetching...' : 'Get Balance'}
        </button>
        {fetchedBalance !== null && <p className="text-sm mt-2 text-black"><strong>Balance:</strong> {fetchedBalance} USDC</p>}
      </div>

      {/* Total Supply Section */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-black">Total Supply</h3>
        <button
          onClick={() => refetchTotalSupply()}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400"
        >
          Refresh Total Supply
        </button>
        {totalSupplyData !== undefined && (
          <p className="text-sm mt-2 text-black">
            <strong>Total Supply:</strong> {formatUnits(totalSupplyData as bigint, 6)} USDC
          </p>
        )}
      </div>
    </div>
  );
} 