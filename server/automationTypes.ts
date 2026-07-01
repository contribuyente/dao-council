import type { AutomationPeriod } from './period';

export type AutomationPaymentStatus =
  | 'created'
  | 'already-completed'
  | 'dry-run'
  | 'skipped'
  | 'blocked'
  | 'failed';

export type AutomationPaymentType = 'curators' | 'council';

export type AutomationPaymentResult = {
  type: AutomationPaymentType;
  status: AutomationPaymentStatus;
  periodKey: string;
  reason?: string;
  safeTxHash?: string;
  safeTxUrl?: string;
  nonce?: number;
  origin?: string;
  totalMana: number;
  totalUsd?: number;
  paymentCount: number;
  manaPriceUsd?: number;
  manaPriceSource?: string;
  stipendUsd?: number;
  warnings?: string[];
  completedAt?: string;
};

export type StoredAutomationResult = AutomationPaymentResult & {
  completedAt: string;
};

export type MonthlyAutomationResult = {
  period: AutomationPeriod;
  dryRun: boolean;
  curators: AutomationPaymentResult;
  council: AutomationPaymentResult;
  safeQueueUrl: string | null;
  discord?: {
    status: 'sent' | 'skipped' | 'failed';
    reason?: string;
  };
};
