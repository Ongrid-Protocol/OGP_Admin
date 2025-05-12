"use client";

import React, { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseUnits, formatUnits, Address, Abi } from 'viem';
import carbonCreditTokenAbiJson from '@/abis/CarbonCreditToken.json';

// Define contract address from .env
const CARBON_CREDIT_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_CARBON_CREDIT_TOKEN_ADDRESS as Address | undefined;

// Simpler ABI assignment
const carbonCreditTokenAbi = carbonCreditTokenAbiJson.abi;

export function CarbonCreditTokenAdmin() {
  const { address: connectedAddress } = useAccount();
  const { data: writeHash, writeContract, isPending: isWritePending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash: writeHash });

  // State for read data
  const [tokenName, setTokenName] = useState<string>('');
  const [tokenSymbol, setTokenSymbol] = useState<string>('');
  const [totalSupply, setTotalSupply] = useState<string>('');
  const [decimals, setDecimals] = useState<number>(18); // Default or fetch

  // State for balanceOf input and result
  const [balanceAccountAddress, setBalanceAccountAddress] = useState<string>('');
  const [fetchedBalance, setFetchedBalance] = useState<string | null>(null);

  // State for mintToTreasury input
  const [mintAmount, setMintAmount] = useState<string>('');
  const [mintStatus, setMintStatus] = useState<string>('');

  // --- Read Hooks ---

  // Fetch Decimals (run once)
  const { data: fetchedDecimals } = useReadContract({
    address: CARBON_CREDIT_TOKEN_ADDRESS,
    abi: carbonCreditTokenAbi,
    functionName: 'decimals',
    args: [],
  });

  useEffect(() => {
    if (fetchedDecimals) {
      setDecimals(Number(fetchedDecimals));
    }
  }, [fetchedDecimals]);

  // Fetch Name (run once)
  const { data: fetchedName } = useReadContract({
    address: CARBON_CREDIT_TOKEN_ADDRESS,
    abi: carbonCreditTokenAbi,
    functionName: 'name',
    args: [],
  });

  useEffect(() => {
    if (fetchedName) {
      setTokenName(fetchedName as string);
    }
  }, [fetchedName]);

  // Fetch Symbol (run once)
  const { data: fetchedSymbol } = useReadContract({
    address: CARBON_CREDIT_TOKEN_ADDRESS,
    abi: carbonCreditTokenAbi,
    functionName: 'symbol',
    args: [],
  });

  useEffect(() => {
    if (fetchedSymbol) {
      setTokenSymbol(fetchedSymbol as string);
    }
  }, [fetchedSymbol]);

  // Fetch TotalSupply (run once and potentially after mint/burn)
  const { data: fetchedTotalSupply, refetch: refetchTotalSupply } = useReadContract({
    address: CARBON_CREDIT_TOKEN_ADDRESS,
    abi: carbonCreditTokenAbi,
    functionName: 'totalSupply',
    args: [],
  });

  useEffect(() => {
    if (fetchedTotalSupply !== undefined) {
      setTotalSupply(formatUnits(fetchedTotalSupply as bigint, decimals));
    }
  }, [fetchedTotalSupply, decimals]);

  // Fetch BalanceOf (on demand)
  const { data: balance, refetch: fetchBalance, isLoading: isBalanceLoading, error: balanceError } = useReadContract({
    address: CARBON_CREDIT_TOKEN_ADDRESS,
    abi: carbonCreditTokenAbi,
    functionName: 'balanceOf',
    args: balanceAccountAddress ? [balanceAccountAddress as Address] : undefined,
    query: {
      enabled: false, // Only fetch when refetch is called
    },
  });

  useEffect(() => {
    if (balance !== undefined && balance !== null) {
      setFetchedBalance(formatUnits(balance as bigint, decimals));
    }
  }, [balance, decimals]);

  // --- Write Functions ---

  const handleMintToTreasury = async () => {
    if (!CARBON_CREDIT_TOKEN_ADDRESS) {
      setMintStatus('Contract address not set in .env');
      return;
    }
    if (!mintAmount) {
      setMintStatus('Please enter amount.');
      return;
    }
    setMintStatus('');
    try {
      const amountInSmallestUnit = parseUnits(mintAmount, decimals);
      writeContract({
        address: CARBON_CREDIT_TOKEN_ADDRESS,
        abi: carbonCreditTokenAbi,
        functionName: 'mintToTreasury',
        args: [amountInSmallestUnit],
      });
    } catch (e: any) {
      console.error("Minting error:", e);
      setMintStatus(`Minting error: ${e.message}`);
    }
  };

  // --- Balance Of Handler ---
  const handleFetchBalance = () => {
    if (!CARBON_CREDIT_TOKEN_ADDRESS) {
      setFetchedBalance('Contract address not set in .env');
      return;
    }
    if (balanceAccountAddress) {
      fetchBalance();
    } else {
      setFetchedBalance("Please enter an account address.");
    }
  };

  // --- Transaction Status Effect ---
  useEffect(() => {
    if (isConfirmed) {
      setMintStatus(`Transaction successful! Hash: ${writeHash}`);
      refetchTotalSupply(); // Refetch total supply after successful mint
      // Optionally refetch balance if relevant
    }
    if (writeError || receiptError) {
      setMintStatus(`Error: ${writeError?.message || receiptError?.message}`);
    }
  }, [isConfirmed, writeHash, writeError, receiptError, refetchTotalSupply]);

  if (!CARBON_CREDIT_TOKEN_ADDRESS) {
    return <p className="text-red-500">Error: NEXT_PUBLIC_CARBON_CREDIT_TOKEN_ADDRESS is not set in your .env.local file.</p>;
  }

  return (
    <div className="space-y-8 p-4 border rounded-lg shadow-md bg-white">
      <h2 className="text-2xl font-semibold text-gray-800">Carbon Credit Token Admin <span className="text-sm text-gray-500">({CARBON_CREDIT_TOKEN_ADDRESS})</span></h2>

      {/* Token Info Section */}
      <div className="p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-gray-700 mb-2">Token Information</h3>
        <p className="text-gray-700"><strong>Name:</strong> {tokenName || 'Loading...'}</p>
        <p className="text-gray-700"><strong>Symbol:</strong> {tokenSymbol || 'Loading...'}</p>
        <p className="text-gray-700"><strong>Decimals:</strong> {decimals}</p>
        <p className="text-gray-700"><strong>Total Supply:</strong> {totalSupply ? `${totalSupply} ${tokenSymbol}` : 'Loading...'}</p>
        <p className="text-gray-700"><strong>Connected Address:</strong> {connectedAddress || 'Not connected'}</p>
      </div>

      {/* BalanceOf Section */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-gray-700">Check Balance</h3>
        <div>
          <label htmlFor="balanceAccountAddress" className="block text-sm font-medium text-gray-700">Account Address:</label>
          <input
            type="text"
            id="balanceAccountAddress"
            value={balanceAccountAddress}
            onChange={(e) => { setBalanceAccountAddress(e.target.value); setFetchedBalance(null); }}
            placeholder="0x..."
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>
        <button
          onClick={handleFetchBalance}
          disabled={isBalanceLoading}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
        >
          {isBalanceLoading ? 'Fetching...' : 'Get Balance'}
        </button>
        {balanceError && <p className="text-red-500 text-sm mt-2">Error fetching balance: {balanceError.message}</p>}
        {fetchedBalance !== null && <p className="text-sm mt-2 text-gray-700">Balance: {fetchedBalance} {tokenSymbol}</p>}
      </div>

      {/* MintToTreasury Section */}
      <div className="space-y-4 p-4 border rounded bg-gray-50">
        <h3 className="text-xl font-medium text-gray-700">Mint to Treasury</h3>
        <p className="text-sm text-gray-600">Only callable by addresses with the MINTER_ROLE.</p>
        <div>
          <label htmlFor="mintAmount" className="block text-sm font-medium text-gray-700">Amount ({tokenSymbol}):</label>
          <input
            type="text"
            id="mintAmount"
            value={mintAmount}
            onChange={(e) => setMintAmount(e.target.value)}
            placeholder={`e.g., 1000`}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>
        <button
          onClick={handleMintToTreasury}
          disabled={isWritePending || isConfirming}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
        >
          {isWritePending ? 'Minting...' : isConfirming ? 'Confirming...' : 'Mint to Treasury'}
        </button>
        {mintStatus && <p className={`text-sm mt-2 ${writeError || receiptError ? 'text-red-500' : 'text-green-600'}`}>{mintStatus}</p>}
      </div>
    </div>
  );
} 