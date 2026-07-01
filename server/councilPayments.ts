import { isAddress } from 'viem';
import {
  councilMembers,
  type CouncilMember,
} from '../src/councilMembers';
import type { PaymentRecipient } from '../src/payments';
import type { ManaPrice } from './manaPrice';

export const DEFAULT_COUNCIL_STIPEND_USD = 1000;

export type CouncilPaymentPlan = {
  payments: PaymentRecipient[];
  stipendUsd: number;
  manaPerMember: number;
  totalMana: number;
  totalUsd: number;
  memberCount: number;
};

export function buildCouncilPayments({
  manaPrice,
  stipendUsd,
  members = councilMembers,
}: {
  manaPrice: ManaPrice;
  stipendUsd: number;
  members?: CouncilMember[];
}): CouncilPaymentPlan {
  if (!Number.isFinite(stipendUsd) || stipendUsd <= 0) {
    throw new Error('COUNCIL_STIPEND_USD must be a positive number.');
  }

  if (!Number.isFinite(manaPrice.usd) || manaPrice.usd <= 0) {
    throw new Error('MANA price must be a positive number.');
  }

  const invalidMember = members.find((member) => !isAddress(member.address));

  if (invalidMember) {
    throw new Error(`Invalid council address for ${invalidMember.name}.`);
  }

  const manaPerMember = stipendUsd / manaPrice.usd;
  const payments = members.map((member) => ({
    name: member.name,
    address: member.address,
    amountMana: manaPerMember,
  }));

  return {
    payments,
    stipendUsd,
    manaPerMember,
    totalMana: manaPerMember * members.length,
    totalUsd: stipendUsd * members.length,
    memberCount: members.length,
  };
}

export function parseCouncilStipendUsd(value: string | undefined) {
  if (!value) {
    return DEFAULT_COUNCIL_STIPEND_USD;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('COUNCIL_STIPEND_USD must be a positive number.');
  }

  return parsed;
}
