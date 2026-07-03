import { generateCurationsReport, type CurationsReport } from './curations';
import { buildCouncilPayments, parseCouncilStipendUsd } from './councilPayments';
import { fetchManaPrice, type ManaPrice } from './manaPrice';
import { getPreviousMonthPeriod, type AutomationPeriod } from './period';
import { getSafeNextNonce, getSafeQueueUrl, proposeSafePaymentTransaction } from './safeProposals';
import { postDiscordAutomationMessage } from './discord';
import type { PolygonRpcEnv } from './polygonRpc';
import type { PaymentRecipient } from '../src/payments';
import type {
  AutomationPaymentResult,
  AutomationPaymentType,
  MonthlyAutomationResult,
  StoredAutomationResult,
} from './automationTypes';

export type AutomationEnv = PolygonRpcEnv & {
  AUTOMATION_RUNS_KV?: Pick<KVNamespace, 'get' | 'put' | 'delete'>;
  AUTOMATION_PROPOSER_PRIVATE_KEY?: string;
  AUTOMATION_ADMIN_TOKEN?: string;
  AUTOMATION_DRY_RUN?: string;
  SAFE_API_KEY?: string;
  ETHEREUM_RPC_URL?: string;
  SAFE_ADDRESS?: string;
  SAFE_CHAIN_ID?: string;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_CHANNEL_ID?: string;
  COUNCIL_STIPEND_USD?: string;
  GAS_TANK_LOW_POL_BALANCE?: string;
  GAS_TANK_URGENT_POL_BALANCE?: string;
};

export type RunMonthlyAutomationOptions = {
  now?: Date;
  force?: boolean;
  notifyDiscord?: boolean;
  dryRun?: boolean;
};

export async function runMonthlyAutomation(
  env: AutomationEnv,
  {
    now = new Date(),
    force = false,
    notifyDiscord = true,
    dryRun = isTruthy(env.AUTOMATION_DRY_RUN),
  }: RunMonthlyAutomationOptions = {}
): Promise<MonthlyAutomationResult> {
  const period = getPreviousMonthPeriod(now);
  let nextNonce: number | null = null;
  let usedNonces = 0;

  const getNonce = async () => {
    if (nextNonce === null) {
      nextNonce = await getSafeNextNonce(env);
    }

    const nonce = nextNonce + usedNonces;
    usedNonces += 1;
    return nonce;
  };

  const curators = await runCuratorsPayment({
    env,
    period,
    dryRun,
    force,
    getNonce,
  });
  const council = await runCouncilPayment({
    env,
    period,
    dryRun,
    force,
    getNonce,
  });
  const safeQueueUrl = env.SAFE_ADDRESS ? getSafeQueueUrl(env.SAFE_ADDRESS) : null;
  const result: MonthlyAutomationResult = {
    period,
    dryRun,
    curators,
    council,
    safeQueueUrl,
  };

  if (notifyDiscord) {
    try {
      const discord = await postDiscordAutomationMessage(env, result);
      result.discord = discord;
    } catch (error) {
      result.discord = {
        status: 'failed',
        reason: error instanceof Error ? error.message : 'Discord post failed.',
      };
    }
  }

  return result;
}

export function buildCuratorPaymentDecision(
  report: Pick<CurationsReport, 'data' | 'warnings'>
):
  | {
      status: 'blocked';
      reason: string;
      warnings: string[];
      payments: PaymentRecipient[];
      totalMana: number;
    }
  | {
      status: 'skipped';
      reason: string;
      warnings: string[];
      payments: PaymentRecipient[];
      totalMana: number;
    }
  | {
      status: 'ready';
      warnings: string[];
      payments: PaymentRecipient[];
      totalMana: number;
    } {
  const payments = report.data.fees
    .filter((curator) => curator.totalFees > 0)
    .map((curator) => ({
      name: curator.curatorName,
      address: curator.paymentAddress,
      amountMana: curator.totalFees,
    }));
  const totalMana = payments.reduce(
    (sum, payment) => sum + payment.amountMana,
    0
  );

  if (report.warnings.length > 0) {
    return {
      status: 'blocked',
      reason: report.warnings[0],
      warnings: report.warnings,
      payments,
      totalMana,
    };
  }

  if (payments.length === 0) {
    return {
      status: 'skipped',
      reason: 'No curator payments due for this period.',
      warnings: [],
      payments,
      totalMana: 0,
    };
  }

  return {
    status: 'ready',
    warnings: [],
    payments,
    totalMana,
  };
}

export function shouldSkipStoredResult(
  storedResult: StoredAutomationResult | null,
  force: boolean
) {
  return Boolean(
    storedResult &&
      !force &&
      ['created', 'skipped', 'blocked'].includes(storedResult.status)
  );
}

async function runCuratorsPayment({
  env,
  period,
  dryRun,
  force,
  getNonce,
}: {
  env: AutomationEnv;
  period: AutomationPeriod;
  dryRun: boolean;
  force: boolean;
  getNonce: () => Promise<number>;
}): Promise<AutomationPaymentResult> {
  const storedResult = await getStoredResult(env, period.key, 'curators');

  if (shouldSkipStoredResult(storedResult, force)) {
    return {
      ...storedResult!,
      status: 'already-completed',
    };
  }

  try {
    const report = await generateCurationsReport({
      env,
      fromTimestamp: period.fromTimestamp,
      toTimestamp: period.toTimestamp,
    });
    const decision = buildCuratorPaymentDecision(report);

    if (decision.status === 'blocked') {
      const result = buildPaymentResult({
        type: 'curators',
        status: 'blocked',
        periodKey: period.key,
        reason: decision.reason,
        totalMana: decision.totalMana,
        paymentCount: decision.payments.length,
        warnings: decision.warnings,
      });
      await putCompletedResult(env, result, dryRun);
      return result;
    }

    if (decision.status === 'skipped') {
      const result = buildPaymentResult({
        type: 'curators',
        status: 'skipped',
        periodKey: period.key,
        reason: decision.reason,
      });
      await putCompletedResult(env, result, dryRun);
      return result;
    }

    if (dryRun) {
      return buildPaymentResult({
        type: 'curators',
        status: 'dry-run',
        periodKey: period.key,
        totalMana: decision.totalMana,
        paymentCount: decision.payments.length,
        origin: getProposalOrigin('curators', period.key),
      });
    }

    const proposal = await proposeSafePaymentTransaction({
      env,
      payments: decision.payments,
      nonce: await getNonce(),
      origin: getProposalOrigin('curators', period.key),
    });
    const result = buildPaymentResult({
      type: 'curators',
      status: 'created',
      periodKey: period.key,
      totalMana: decision.totalMana,
      paymentCount: decision.payments.length,
      safeTxHash: proposal.safeTxHash,
      safeTxUrl: proposal.safeTxUrl,
      nonce: proposal.nonce,
      origin: proposal.origin,
    });
    await putCompletedResult(env, result, dryRun);
    return result;
  } catch (error) {
    const result = buildPaymentResult({
      type: 'curators',
      status: 'failed',
      periodKey: period.key,
      reason:
        error instanceof Error ? error.message : 'Curator automation failed.',
    });
    await putFailedResult(env, result);
    return result;
  }
}

async function runCouncilPayment({
  env,
  period,
  dryRun,
  force,
  getNonce,
}: {
  env: AutomationEnv;
  period: AutomationPeriod;
  dryRun: boolean;
  force: boolean;
  getNonce: () => Promise<number>;
}): Promise<AutomationPaymentResult> {
  const storedResult = await getStoredResult(env, period.key, 'council');

  if (shouldSkipStoredResult(storedResult, force)) {
    return {
      ...storedResult!,
      status: 'already-completed',
    };
  }

  try {
    const manaPrice = await fetchManaPrice();
    const stipendUsd = parseCouncilStipendUsd(env.COUNCIL_STIPEND_USD);
    const plan = buildCouncilPayments({ manaPrice, stipendUsd });

    if (dryRun) {
      return buildCouncilResult({
        periodKey: period.key,
        status: 'dry-run',
        plan,
        manaPrice,
        origin: getProposalOrigin('council', period.key),
      });
    }

    const proposal = await proposeSafePaymentTransaction({
      env,
      payments: plan.payments,
      nonce: await getNonce(),
      origin: getProposalOrigin('council', period.key),
    });
    const result = buildCouncilResult({
      periodKey: period.key,
      status: 'created',
      plan,
      manaPrice,
      safeTxHash: proposal.safeTxHash,
      safeTxUrl: proposal.safeTxUrl,
      nonce: proposal.nonce,
      origin: proposal.origin,
    });
    await putCompletedResult(env, result, dryRun);
    return result;
  } catch (error) {
    const result = buildPaymentResult({
      type: 'council',
      status: 'failed',
      periodKey: period.key,
      reason:
        error instanceof Error ? error.message : 'Council automation failed.',
    });
    await putFailedResult(env, result);
    return result;
  }
}

function buildCouncilResult({
  periodKey,
  status,
  plan,
  manaPrice,
  safeTxHash,
  safeTxUrl,
  nonce,
  origin,
}: {
  periodKey: string;
  status: 'created' | 'dry-run';
  plan: ReturnType<typeof buildCouncilPayments>;
  manaPrice: ManaPrice;
  safeTxHash?: string;
  safeTxUrl?: string;
  nonce?: number;
  origin?: string;
}) {
  return buildPaymentResult({
    type: 'council',
    status,
    periodKey,
    totalMana: plan.totalMana,
    totalUsd: plan.totalUsd,
    paymentCount: plan.payments.length,
    manaPriceUsd: manaPrice.usd,
    manaPriceSource: manaPrice.source,
    stipendUsd: plan.stipendUsd,
    safeTxHash,
    safeTxUrl,
    nonce,
    origin,
  });
}

function buildPaymentResult(
  result: Omit<AutomationPaymentResult, 'completedAt' | 'totalMana' | 'paymentCount'> &
    Partial<Pick<AutomationPaymentResult, 'totalMana' | 'paymentCount'>>
): AutomationPaymentResult {
  return {
    totalMana: 0,
    paymentCount: 0,
    completedAt: new Date().toISOString(),
    ...result,
  };
}

async function getStoredResult(
  env: AutomationEnv,
  periodKey: string,
  type: AutomationPaymentType
) {
  if (!env.AUTOMATION_RUNS_KV) {
    return null;
  }

  const raw = await env.AUTOMATION_RUNS_KV.get(getKvKey(periodKey, type));

  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as StoredAutomationResult;
}

async function putCompletedResult(
  env: AutomationEnv,
  result: AutomationPaymentResult,
  dryRun: boolean
) {
  if (!env.AUTOMATION_RUNS_KV || dryRun) {
    return;
  }

  await env.AUTOMATION_RUNS_KV.put(
    getKvKey(result.periodKey, result.type),
    JSON.stringify(result)
  );
}

async function putFailedResult(
  env: AutomationEnv,
  result: AutomationPaymentResult
) {
  if (!env.AUTOMATION_RUNS_KV) {
    return;
  }

  await env.AUTOMATION_RUNS_KV.put(
    getKvKey(result.periodKey, result.type),
    JSON.stringify(result)
  );
}

function getKvKey(periodKey: string, type: AutomationPaymentType) {
  return `${periodKey}:${type}`;
}

function getProposalOrigin(type: AutomationPaymentType, periodKey: string) {
  return `dao-council:auto:${type}:${periodKey}`;
}

function isTruthy(value: string | undefined) {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').toLowerCase());
}
