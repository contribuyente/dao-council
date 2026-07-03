import { formatEther, parseEther } from 'viem';
import {
  DEFAULT_GAS_TANK_LOW_POL_BALANCE,
  DEFAULT_GAS_TANK_URGENT_POL_BALANCE,
  GAS_TANK_EOA,
  buildSafeAppRefillUrl,
} from '../src/gasTank';
import { COUNCIL_SAFE_ADDRESS } from '../src/safeAppLinks';
import { postDiscordGasTankAlertMessage } from './discord';
import { fetchPolygonBalanceWei, type PolygonRpcEnv } from './polygonRpc';

export type GasTankAlertEnv = PolygonRpcEnv & {
  AUTOMATION_RUNS_KV?: Pick<KVNamespace, 'get' | 'put' | 'delete'>;
  SAFE_ADDRESS?: string;
  GAS_TANK_LOW_POL_BALANCE?: string;
  GAS_TANK_URGENT_POL_BALANCE?: string;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_CHANNEL_ID?: string;
};

export type GasTankAlertLevel = 'low' | 'urgent';

export type GasTankBalanceDecision = {
  level: GasTankAlertLevel | null;
  balanceWei: bigint;
  balancePol: number;
  lowThresholdPol: number;
  urgentThresholdPol: number;
};

export type GasTankAlertResult = {
  status: 'sent' | 'skipped' | 'failed';
  level?: GasTankAlertLevel;
  reason?: string;
  balancePol?: number;
  lowThresholdPol: number;
  urgentThresholdPol: number;
  refillUrl: string;
  discord?: {
    status: 'sent' | 'skipped';
    reason?: string;
  };
};

export async function runGasTankBalanceAlert(
  env: GasTankAlertEnv
): Promise<GasTankAlertResult> {
  let thresholds = getDefaultGasTankThresholds();
  const safeAddress = env.SAFE_ADDRESS ?? COUNCIL_SAFE_ADDRESS;
  const refillUrl = buildSafeAppRefillUrl(safeAddress);

  try {
    thresholds = parseGasTankThresholds(env);
    const balanceWei = await fetchPolygonBalanceWei(
      GAS_TANK_EOA as `0x${string}`,
      env
    );
    const decision = buildGasTankBalanceDecision(balanceWei, thresholds);

    if (!decision.level) {
      await clearGasTankLowAlertState(env);
      return {
        status: 'skipped',
        reason: 'Gas tank balance is above the configured low threshold.',
        balancePol: decision.balancePol,
        lowThresholdPol: decision.lowThresholdPol,
        urgentThresholdPol: decision.urgentThresholdPol,
        refillUrl,
      };
    }

    if (decision.level === 'low') {
      if (!env.AUTOMATION_RUNS_KV) {
        return {
          status: 'failed',
          level: 'low',
          reason:
            'AUTOMATION_RUNS_KV is required to send one-time low gas tank alerts.',
          balancePol: decision.balancePol,
          lowThresholdPol: decision.lowThresholdPol,
          urgentThresholdPol: decision.urgentThresholdPol,
          refillUrl,
        };
      }

      const lowState = await getGasTankLowAlertState(env);

      if (lowState?.active) {
        return {
          status: 'skipped',
          level: 'low',
          reason:
            'Low gas tank alert already sent. It will reset after the tank is refilled above the low threshold.',
          balancePol: decision.balancePol,
          lowThresholdPol: decision.lowThresholdPol,
          urgentThresholdPol: decision.urgentThresholdPol,
          refillUrl,
        };
      }
    }

    const discord = await postDiscordGasTankAlertMessage(env, {
      level: decision.level,
      balancePol: decision.balancePol,
      lowThresholdPol: decision.lowThresholdPol,
      urgentThresholdPol: decision.urgentThresholdPol,
      refillUrl,
    });

    if (discord.status === 'sent') {
      await putGasTankLowAlertState(env, decision);
    }

    return {
      status: discord.status,
      level: decision.level,
      reason: discord.status === 'skipped' ? discord.reason : undefined,
      balancePol: decision.balancePol,
      lowThresholdPol: decision.lowThresholdPol,
      urgentThresholdPol: decision.urgentThresholdPol,
      refillUrl,
      discord,
    };
  } catch (error) {
    return {
      status: 'failed',
      reason:
        error instanceof Error
          ? error.message
          : 'Gas tank balance alert failed.',
      lowThresholdPol: thresholds.lowThresholdPol,
      urgentThresholdPol: thresholds.urgentThresholdPol,
      refillUrl,
    };
  }
}

export function buildGasTankBalanceDecision(
  balanceWei: bigint,
  {
    lowThresholdPol = DEFAULT_GAS_TANK_LOW_POL_BALANCE,
    urgentThresholdPol = DEFAULT_GAS_TANK_URGENT_POL_BALANCE,
  }: Partial<GasTankThresholds> = {}
): GasTankBalanceDecision {
  validateGasTankThresholds({ lowThresholdPol, urgentThresholdPol });
  const lowThresholdWei = parseEther(formatPolTokenAmount(lowThresholdPol));
  const urgentThresholdWei = parseEther(
    formatPolTokenAmount(urgentThresholdPol)
  );
  const level =
    balanceWei < urgentThresholdWei
      ? 'urgent'
      : balanceWei < lowThresholdWei
        ? 'low'
        : null;

  return {
    level,
    balanceWei,
    balancePol: Number(formatEther(balanceWei)),
    lowThresholdPol,
    urgentThresholdPol,
  };
}

export type GasTankThresholds = {
  lowThresholdPol: number;
  urgentThresholdPol: number;
};

export function parseGasTankThresholds(
  env: Pick<
    GasTankAlertEnv,
    'GAS_TANK_LOW_POL_BALANCE' | 'GAS_TANK_URGENT_POL_BALANCE'
  >
): GasTankThresholds {
  const thresholds = {
    lowThresholdPol: parseGasTankPolBalanceEnv(
      env.GAS_TANK_LOW_POL_BALANCE,
      'GAS_TANK_LOW_POL_BALANCE',
      DEFAULT_GAS_TANK_LOW_POL_BALANCE
    ),
    urgentThresholdPol: parseGasTankPolBalanceEnv(
      env.GAS_TANK_URGENT_POL_BALANCE,
      'GAS_TANK_URGENT_POL_BALANCE',
      DEFAULT_GAS_TANK_URGENT_POL_BALANCE
    ),
  };
  validateGasTankThresholds(thresholds);
  return thresholds;
}

function parseGasTankPolBalanceEnv(
  value: string | undefined,
  name: string,
  defaultValue: number
) {
  if (!value) {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }

  return parsed;
}

function validateGasTankThresholds({
  lowThresholdPol,
  urgentThresholdPol,
}: GasTankThresholds) {
  if (urgentThresholdPol >= lowThresholdPol) {
    throw new Error(
      'GAS_TANK_URGENT_POL_BALANCE must be lower than GAS_TANK_LOW_POL_BALANCE.'
    );
  }
}

function getDefaultGasTankThresholds(): GasTankThresholds {
  return {
    lowThresholdPol: DEFAULT_GAS_TANK_LOW_POL_BALANCE,
    urgentThresholdPol: DEFAULT_GAS_TANK_URGENT_POL_BALANCE,
  };
}

type StoredGasTankLowAlertState = {
  active: boolean;
  level: GasTankAlertLevel;
  balancePol: number;
  lowThresholdPol: number;
  urgentThresholdPol: number;
  sentAt: string;
};

async function getGasTankLowAlertState(env: GasTankAlertEnv) {
  if (!env.AUTOMATION_RUNS_KV) {
    return null;
  }

  const raw = await env.AUTOMATION_RUNS_KV.get(getGasTankLowAlertStateKey());

  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as StoredGasTankLowAlertState;
}

async function putGasTankLowAlertState(
  env: GasTankAlertEnv,
  decision: GasTankBalanceDecision
) {
  if (!env.AUTOMATION_RUNS_KV || !decision.level) {
    return;
  }

  await env.AUTOMATION_RUNS_KV.put(
    getGasTankLowAlertStateKey(),
    JSON.stringify({
      active: true,
      level: decision.level,
      balancePol: decision.balancePol,
      lowThresholdPol: decision.lowThresholdPol,
      urgentThresholdPol: decision.urgentThresholdPol,
      sentAt: new Date().toISOString(),
    } satisfies StoredGasTankLowAlertState)
  );
}

async function clearGasTankLowAlertState(env: GasTankAlertEnv) {
  if (!env.AUTOMATION_RUNS_KV) {
    return;
  }

  await env.AUTOMATION_RUNS_KV.delete(getGasTankLowAlertStateKey());
}

function getGasTankLowAlertStateKey() {
  return 'gas-tank:low-alert';
}

function formatPolTokenAmount(amount: number): `${number}` {
  return amount.toFixed(18).replace(/\.?0+$/, '') as `${number}`;
}
