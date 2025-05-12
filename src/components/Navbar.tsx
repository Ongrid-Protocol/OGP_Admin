"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export function Navbar() {
  const pathname = usePathname();

  const linkClasses = (path: string) => 
    `px-4 py-2 rounded hover:bg-gray-300 text-gray-700 hover:text-black ${pathname === path ? 'bg-gray-400 font-semibold text-black' : 'text-gray-600'}`;

  return (
    <nav className="bg-gray-200 p-4 mb-8 shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        <div className="flex space-x-4">
          <Link href="/finance" className={linkClasses('/finance')}>Finance Contracts</Link>
          <Link href="/carbon" className={linkClasses('/carbon')}>Carbon Contracts</Link>
          <Link href="/mocktoken" className={linkClasses('/mocktoken')}>Mock Token</Link>
        </div>
        <div>
          <ConnectButton />
        </div>
      </div>
    </nav>
  );
} 