"use client";

import { MockUsdcAdmin } from '@/components/mocktoken/MockUsdcAdmin';

export default function MockTokenPage() {
  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-3xl font-bold mb-6">Mock Token Contract</h1>
      <MockUsdcAdmin />
    </div>
  );
} 