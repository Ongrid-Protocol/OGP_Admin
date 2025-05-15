"use client";

import { DeveloperDepositEscrowAdmin } from '@/components/finance/DeveloperDepositEscrowAdmin';
import { DeveloperRegistryAdmin } from '@/components/finance/DeveloperRegistryAdmin';
// import { DevEscrowAdmin } from '@/components/finance/DevEscrowAdmin'; // Removed
// import { DirectProjectVaultAdmin } from '@/components/finance/DirectProjectVaultAdmin'; // Removed
import { FeeRouterAdmin } from '@/components/finance/FeeRouterAdmin';
import { LiquidityPoolManagerAdmin } from '@/components/finance/LiquidityPoolManagerAdmin';
import { ProjectFactoryAdmin } from '@/components/finance/ProjectFactoryAdmin';
import { RepaymentRouterAdmin } from '@/components/finance/RepaymentRouterAdmin';
import { RiskRateOracleAdapterAdmin } from '@/components/finance/RiskRateOracleAdapterAdmin';
import { PausableGovernorAdmin } from '@/components/finance/PausableGovernorAdmin';
import { DirectProjectVaultAdmin } from '@/components/finance/DirectProjectVaultAdmin';

export default function FinancePage() {
  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-3xl font-bold mb-6">Finance Contracts</h1>
      <DeveloperDepositEscrowAdmin />
      <DeveloperRegistryAdmin />
      {/* <DevEscrowAdmin /> */}{/* Removed */}
      {/* <DirectProjectVaultAdmin /> */}{/* Will be added below */}
      <FeeRouterAdmin />
      <LiquidityPoolManagerAdmin />
      <ProjectFactoryAdmin />
      <RepaymentRouterAdmin />
      <RiskRateOracleAdapterAdmin />
      <PausableGovernorAdmin />
      <DirectProjectVaultAdmin />
    </div>
  );
} 