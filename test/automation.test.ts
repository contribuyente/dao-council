import { describe, expect, it } from 'vitest';
import { decodeFunctionData, parseEther } from 'viem';
import {
  MANA_TOKEN_ADDRESS,
  buildSafeTransactions,
} from '../src/payments';
import { buildCuratorPaymentDecision, shouldSkipStoredResult } from '../server/automation';
import { buildCouncilPayments } from '../server/councilPayments';
import { buildDiscordMessagePayload } from '../server/discord';
import { getPreviousMonthPeriod } from '../server/period';
import type { CurationsReport } from '../server/curations';
import type { MonthlyAutomationResult, StoredAutomationResult } from '../server/automationTypes';

const ERC20_TRANSFER_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

describe('automation period', () => {
  it('uses the previous UTC calendar month', () => {
    const period = getPreviousMonthPeriod(
      new Date('2026-07-01T15:00:00.000Z')
    );

    expect(period.key).toBe('2026-06');
    expect(period.label).toBe('June 2026');
    expect(period.from.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(period.to.toISOString()).toBe('2026-06-30T23:59:59.000Z');
    expect(period.fromTimestamp).toBe(1780272000);
    expect(period.toTimestamp).toBe(1782863999);
  });
});

describe('curator payment decision', () => {
  it('blocks curator proposals when the report has warnings', () => {
    const decision = buildCuratorPaymentDecision({
      data: {
        fees: [
          {
            curatorId: '0xcurator',
            curatorName: 'Curator',
            paymentAddress: '0x0000000000000000000000000000000000000001',
            totalFees: 10,
            curationCount: 1,
            curations: [],
          },
        ],
      },
      warnings: ['unresolved receipts'],
    } satisfies Pick<CurationsReport, 'data' | 'warnings'>);

    expect(decision.status).toBe('blocked');
    expect(decision.totalMana).toBe(10);
    expect(decision.payments).toHaveLength(1);
  });

  it('skips curator proposals when no payments are due', () => {
    const decision = buildCuratorPaymentDecision({
      data: {
        fees: [
          {
            curatorId: '0xcurator',
            curatorName: 'Curator',
            paymentAddress: '0x0000000000000000000000000000000000000001',
            totalFees: 0,
            curationCount: 1,
            curations: [],
          },
        ],
      },
      warnings: [],
    });

    expect(decision.status).toBe('skipped');
    expect(decision.payments).toHaveLength(0);
  });
});

describe('council stipend payments', () => {
  it('calculates MANA from the stipend and MANA/USD price', () => {
    const plan = buildCouncilPayments({
      manaPrice: {
        usd: 0.25,
        source: 'Test',
        lastUpdatedAt: null,
      },
      stipendUsd: 1000,
      members: [
        {
          name: 'A',
          address: '0x0000000000000000000000000000000000000001',
        },
        {
          name: 'B',
          address: '0x0000000000000000000000000000000000000002',
        },
      ],
    });

    expect(plan.manaPerMember).toBe(4000);
    expect(plan.totalMana).toBe(8000);
    expect(plan.totalUsd).toBe(2000);
  });
});

describe('safe payment calldata', () => {
  it('uses Ethereum mainnet MANA transfer calldata', () => {
    const [transaction] = buildSafeTransactions([
      {
        name: 'Recipient',
        address: '0x0000000000000000000000000000000000000001',
        amountMana: 12.5,
      },
    ]);

    expect(transaction.to).toBe(MANA_TOKEN_ADDRESS);
    expect(transaction.value).toBe('0');

    const decoded = decodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      data: transaction.data as `0x${string}`,
    });

    expect(decoded.functionName).toBe('transfer');
    expect(decoded.args).toEqual([
      '0x0000000000000000000000000000000000000001',
      parseEther('12.5'),
    ]);
  });
});

describe('automation idempotency', () => {
  it('skips completed stored results unless forced', () => {
    const stored: StoredAutomationResult = {
      type: 'curators',
      status: 'created',
      periodKey: '2026-06',
      totalMana: 1,
      paymentCount: 1,
      completedAt: '2026-07-01T15:00:00.000Z',
    };

    expect(shouldSkipStoredResult(stored, false)).toBe(true);
    expect(shouldSkipStoredResult(stored, true)).toBe(false);
  });

  it('does not skip failed stored results', () => {
    const stored: StoredAutomationResult = {
      type: 'council',
      status: 'failed',
      periodKey: '2026-06',
      totalMana: 0,
      paymentCount: 0,
      completedAt: '2026-07-01T15:00:00.000Z',
    };

    expect(shouldSkipStoredResult(stored, false)).toBe(false);
  });
});

describe('discord payload', () => {
  it('disables broad mentions', () => {
    const period = getPreviousMonthPeriod(new Date('2026-07-01T15:00:00.000Z'));
    const payload = buildDiscordMessagePayload({
      period,
      dryRun: false,
      safeQueueUrl:
        'https://app.safe.global/transactions/queue?safe=eth:0x0000000000000000000000000000000000000001',
      curators: {
        type: 'curators',
        status: 'created',
        periodKey: period.key,
        totalMana: 100,
        paymentCount: 2,
        safeTxUrl: 'https://safe.example/curators',
      },
      council: {
        type: 'council',
        status: 'skipped',
        periodKey: period.key,
        reason: 'No payments',
        totalMana: 0,
        paymentCount: 0,
      },
    } satisfies MonthlyAutomationResult);

    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(payload.content).toContain('June 2026');
    expect(payload.content).toContain('Curators: created');
  });
});
