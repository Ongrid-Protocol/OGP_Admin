"use client";

import { CarbonCreditTokenAdmin } from '@/components/carbon/CarbonCreditTokenAdmin';
import { CarbonCreditExchangeAdmin } from '@/components/carbon/CarbonCreditExchangeAdmin';
import { RewardDistributorAdmin } from '@/components/carbon/RewardDistributorAdmin';
import { EnergyDataBridgeAdmin } from '@/components/carbon/EnergyDataBridgeAdmin';

export default function CarbonPage() {
  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-3xl font-bold mb-6">Carbon Contracts</h1>
      <CarbonCreditTokenAdmin />
      <CarbonCreditExchangeAdmin />
      <RewardDistributorAdmin />
      <EnergyDataBridgeAdmin />
    </div>
  );
} 