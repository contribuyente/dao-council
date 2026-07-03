import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeFunctionData, parseEther } from 'viem';
import {
  MANA_TOKEN_ADDRESS,
  buildSafeTransactions,
} from '../src/payments';
import { buildCuratorPaymentDecision, shouldSkipStoredResult } from '../server/automation';
import { buildCouncilPayments } from '../server/councilPayments';
import { buildDiscordGasTankAlertPayload, buildDiscordMessagePayload } from '../server/discord';
import { buildGasTankBalanceDecision, parseGasTankThresholds, runGasTankBalanceAlert } from '../server/gasTank';
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

afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe('gas tank alert', () => {
  it('uses low severity when the balance is below the low threshold', () => {
    const decision = buildGasTankBalanceDecision(parseEther('999.99'), {
      lowThresholdPol: 1000,
      urgentThresholdPol: 100,
    });

    expect(decision.level).toBe('low');
    expect(decision.lowThresholdPol).toBe(1000);
    expect(decision.urgentThresholdPol).toBe(100);
  });

  it('uses urgent severity when the balance is below the urgent threshold', () => {
    const decision = buildGasTankBalanceDecision(parseEther('99.99'), {
      lowThresholdPol: 1000,
      urgentThresholdPol: 100,
    });

    expect(decision.level).toBe('urgent');
  });

  it('skips when the balance is at the low threshold', () => {
    const decision = buildGasTankBalanceDecision(parseEther('1000'), {
      lowThresholdPol: 1000,
      urgentThresholdPol: 100,
    });

    expect(decision.level).toBe(null);
  });

  it('parses gas tank thresholds from env', () => {
    expect(parseGasTankThresholds({})).toEqual({
      lowThresholdPol: 1000,
      urgentThresholdPol: 100,
    });
    expect(
      parseGasTankThresholds({
        GAS_TANK_LOW_POL_BALANCE: '2500.5',
        GAS_TANK_URGENT_POL_BALANCE: '250',
      })
    ).toEqual({
      lowThresholdPol: 2500.5,
      urgentThresholdPol: 250,
    });
  });

  it('formats the low Discord refill alert without broad mentions', () => {
    const payload = buildDiscordGasTankAlertPayload({
      level: 'low',
      balancePol: 999.12345,
      lowThresholdPol: 1000,
      urgentThresholdPol: 100,
      refillUrl: 'https://app.safe.global/apps/open?safe=eth:0xsafe&appUrl=https%3A%2F%2Fswap.cow.fi',
    });

    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(payload.content).toContain(
      'Polygon Gas Tank balance is below 1,000 POL'
    );
    expect(payload.content).toContain('999.1235 POL');
    expect(payload.content).toContain('https://app.safe.global/apps/open');
  });

  it('formats the urgent Discord refill alert without broad mentions', () => {
    const payload = buildDiscordGasTankAlertPayload({
      level: 'urgent',
      balancePol: 99.5,
      lowThresholdPol: 1000,
      urgentThresholdPol: 100,
      refillUrl: 'https://app.safe.global/apps/open?safe=eth:0xsafe&appUrl=https%3A%2F%2Fswap.cow.fi',
    });

    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(payload.content).toContain('URGENT');
    expect(payload.content).toContain('below 100 POL');
    expect(payload.content).toContain('cannot wait');
  });

  it('sends the low alert once until the gas tank is refilled', async () => {
    const kv = createMemoryKv();
    const fetchStub = stubGasTankFetch('999');
    const env = createGasTankAlertEnv(kv);

    await expect(runGasTankBalanceAlert(env)).resolves.toMatchObject({
      status: 'sent',
      level: 'low',
    });
    expect(fetchStub.discordPosts()).toHaveLength(1);

    fetchStub.setBalancePol('998');
    await expect(runGasTankBalanceAlert(env)).resolves.toMatchObject({
      status: 'skipped',
      level: 'low',
    });
    expect(fetchStub.discordPosts()).toHaveLength(1);

    fetchStub.setBalancePol('1000');
    const refilledResult = await runGasTankBalanceAlert(env);
    expect(refilledResult.status).toBe('skipped');
    expect(refilledResult.level).toBeUndefined();

    fetchStub.setBalancePol('999');
    await expect(runGasTankBalanceAlert(env)).resolves.toMatchObject({
      status: 'sent',
      level: 'low',
    });
    expect(fetchStub.discordPosts()).toHaveLength(2);
  });

  it('sends urgent alerts on every run while still urgent', async () => {
    const kv = createMemoryKv();
    const fetchStub = stubGasTankFetch('99');
    const env = createGasTankAlertEnv(kv);

    await expect(runGasTankBalanceAlert(env)).resolves.toMatchObject({
      status: 'sent',
      level: 'urgent',
    });
    await expect(runGasTankBalanceAlert(env)).resolves.toMatchObject({
      status: 'sent',
      level: 'urgent',
    });

    expect(fetchStub.discordPosts()).toHaveLength(2);
  });
});

function createGasTankAlertEnv(
  kv: Pick<KVNamespace, 'get' | 'put' | 'delete'>
) {
  return {
    AUTOMATION_RUNS_KV: kv,
    POLYGON_RPC_URL: 'https://rpc.example',
    DISCORD_BOT_TOKEN: 'discord-token',
    DISCORD_CHANNEL_ID: 'discord-channel',
    SAFE_ADDRESS: '0x184e4D9A26Add0aF1eAfC145550E890a421f16d7',
    GAS_TANK_LOW_POL_BALANCE: '1000',
    GAS_TANK_URGENT_POL_BALANCE: '100',
  };
}

function createMemoryKv() {
  const values = new Map<string, string>();

  return {
    get: async (key: string) => values.get(key) ?? null,
    put: async (key: string, value: string) => {
      values.set(key, value);
    },
    delete: async (key: string) => {
      values.delete(key);
    },
  } as Pick<KVNamespace, 'get' | 'put' | 'delete'>;
}

function stubGasTankFetch(initialBalancePol: string) {
  let balancePol = initialBalancePol;
  const discordMessages: string[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);

      if (url === 'https://rpc.example') {
        return Response.json({
          jsonrpc: '2.0',
          id: 'gas-tank-balance',
          result: toHexWei(balancePol),
        });
      }

      if (url === 'https://discord.com/api/v10/channels/discord-channel/messages') {
        discordMessages.push(String(init?.body ?? ''));
        return Response.json({ id: 'discord-message' });
      }

      return Response.json({ error: 'Unexpected test fetch.' }, { status: 500 });
    })
  );

  return {
    setBalancePol(nextBalancePol: string) {
      balancePol = nextBalancePol;
    },
    discordPosts() {
      return discordMessages;
    },
  };
}

function toHexWei(amountPol: string) {
  return `0x${parseEther(amountPol).toString(16)}`;
}
