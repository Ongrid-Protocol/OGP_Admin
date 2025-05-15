"use client";

import React, { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useWatchContractEvent } from 'wagmi';
import { parseUnits, formatUnits, Address, decodeEventLog } from 'viem';
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

export function MockUsdcAdmin() {
  const { address: connectedAddress } = useAccount();
  const { data: hash, writeContract, isPending: isMintPending, error: mintError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash });

  const [toAddress, setToAddress] = useState<string>('');
  const [mintAmount, setMintAmount] = useState<string>('');
  const [mintStatus, setMintStatus] = useState<string>('');

  const [balanceAccountAddress, setBalanceAccountAddress] = useState<string>('');
  const [fetchedBalance, setFetchedBalance] = useState<string | null>(null);
  const [lastMintEvent, setLastMintEvent] = useState<MintedEventArgs | null>(null);

  const { data: balance, refetch: fetchBalance, isLoading: isBalanceLoading, error: balanceError } = useReadContract({
    address: MOCK_USDC_ADDRESS,
    abi: mockUsdcAbiJson.abi,
    functionName: 'balanceOf',
    args: balanceAccountAddress ? [balanceAccountAddress as Address] : undefined,
    query: {
      enabled: false, // Only fetch when refetch is called
    },
  });

  useEffect(() => {
    if (balance !== undefined && balance !== null) {
      // Properly cast balance to bigint
      setFetchedBalance(formatUnits(balance as bigint, 6)); 
    }
  }, [balance]);
  
  useWatchContractEvent({
    address: MOCK_USDC_ADDRESS,
    abi: mockUsdcAbiJson.abi,
    eventName: 'Minted',
    onLogs(logs) {
      console.log('Minted event raw logs:', JSON.stringify(logs, null, 2));
      if (logs.length > 0) {
        try {
          const log = logs[0];
          // Use decodeEventLog to properly parse the event data
          const decoded = decodeEventLog({
            abi: mockUsdcAbiJson.abi,
            data: log.data,
            topics: log.topics,
            eventName: 'Minted'
          });
          
          // Now we can safely access the args
          const args = decoded.args as unknown[];
          // Minted event has indexed minter, indexed to, amount parameters in that order
          const minter = args[0] as Address;
          const to = args[1] as Address;
          const amount = args[2] as bigint;
          
          setLastMintEvent({ minter, to, amount });
          setMintStatus(`Minted event received! Minter: ${minter}, To: ${to}, Amount: ${formatUnits(amount, 6)} USDC`);
        } catch (error) {
          console.error('Error decoding Minted event:', error);
          setMintStatus('Error parsing Minted event data.');
        }
      } else {
        console.warn('Minted event logs received, but no logs found.');
        setMintStatus('Minted event received, but data is missing.');
      }
    },
    onError(error) {
      console.error('Error watching Minted event:', error);
      setMintStatus(`Error watching Minted event: ${error.message}`);
    }
  });

  const handleMint = async () => {
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
        abi: mockUsdcAbiJson.abi,
        functionName: 'mint',
        args: [toAddress as Address, amountInSmallestUnit],
      });
    } catch (e: any) {
      console.error("Minting error:", e);
      setMintStatus(`Minting error: ${e.message}`);
    }
  };

  const handleFetchBalance = () => {
    if (!MOCK_USDC_ADDRESS) {
      setFetchedBalance('MockUSDC contract address not set in .env');
      return;
    }
    if (balanceAccountAddress) {
      fetchBalance();
    } else {
      setFetchedBalance("Please enter an account address.");
    }
  };
  
  useEffect(() => {
    if (isConfirmed) {
      setMintStatus(`Successfully minted! Transaction hash: ${hash}`);
      // Optionally, refetch balance of 'toAddress' or connectedAddress if they were the recipient
      if (toAddress === balanceAccountAddress) {
        fetchBalance();
      }
    }
    if (mintError || receiptError) {
      setMintStatus(`Error: ${mintError?.message || receiptError?.message}`);
    }
  }, [isConfirmed, hash, mintError, receiptError, toAddress, balanceAccountAddress, fetchBalance]);


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
          disabled={isMintPending || isConfirming}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
        >
          {isMintPending ? 'Minting...' : isConfirming ? 'Confirming...' : 'Mint USDC'}
        </button>
        {mintStatus && (
            <p className={`text-sm mt-2 font-medium ${mintError || receiptError ? 'text-red-700' : isConfirmed ? 'text-green-700' : 'text-blue-700'}`}>
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
        {balanceError && <p className="text-red-600 text-sm font-medium mt-2">Error fetching balance: {balanceError.message}</p>}
        {fetchedBalance !== null && <p className="text-sm mt-2 text-black"><strong>Balance:</strong> {fetchedBalance} USDC</p>}
      </div>
    </div>
  );
} 