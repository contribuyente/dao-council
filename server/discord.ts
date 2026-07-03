import { formatManaAmount } from '../src/payments';
import type {
  AutomationPaymentResult,
  MonthlyAutomationResult,
} from './automationTypes';

export type DiscordEnv = {
  DISCORD_BOT_TOKEN?: string;
  DISCORD_CHANNEL_ID?: string;
};

export type DiscordMessagePayload = {
  content: string;
  allowed_mentions: {
    parse: string[];
  };
};

export type DiscordPostResult =
  | {
      status: 'sent';
    }
  | {
      status: 'skipped';
      reason: string;
    };

export async function postDiscordAutomationMessage(
  env: DiscordEnv,
  result: MonthlyAutomationResult
): Promise<DiscordPostResult> {
  return postDiscordMessagePayload(env, buildDiscordMessagePayload(result));
}

export async function postDiscordTestMessage(
  env: DiscordEnv,
  safeTxUrl: string
): Promise<DiscordPostResult> {
  return postDiscordMessagePayload(env, {
    content: `Test\n${safeTxUrl}`,
    allowed_mentions: {
      parse: [],
    },
  });
}

export async function postDiscordGasTankAlertMessage(
  env: DiscordEnv,
  alert: {
    level: 'low' | 'urgent';
    balancePol: number;
    lowThresholdPol: number;
    urgentThresholdPol: number;
    refillUrl: string;
  }
): Promise<DiscordPostResult> {
  return postDiscordMessagePayload(env, buildDiscordGasTankAlertPayload(alert));
}

async function postDiscordMessagePayload(
  env: DiscordEnv,
  payload: DiscordMessagePayload
): Promise<DiscordPostResult> {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_CHANNEL_ID) {
    return {
      status: 'skipped',
      reason: 'DISCORD_BOT_TOKEN or DISCORD_CHANNEL_ID is not configured.',
    };
  }

  const response = await fetch(
    `https://discord.com/api/v10/channels/${env.DISCORD_CHANNEL_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Discord message failed: ${response.status} ${response.statusText} ${body}`.trim()
    );
  }

  return {
    status: 'sent',
  };
}

export function buildDiscordGasTankAlertPayload({
  level,
  balancePol,
  lowThresholdPol,
  urgentThresholdPol,
  refillUrl,
}: {
  level: 'low' | 'urgent';
  balancePol: number;
  lowThresholdPol: number;
  urgentThresholdPol: number;
  refillUrl: string;
}): DiscordMessagePayload {
  const thresholdPol =
    level === 'urgent' ? urgentThresholdPol : lowThresholdPol;
  const headline =
    level === 'urgent'
      ? `URGENT: Polygon Gas Tank balance is below ${formatPolAmount(thresholdPol)}. Refill cannot wait until the next monthly sync.`
      : `Polygon Gas Tank balance is below ${formatPolAmount(thresholdPol)}. Refill it on the next monthly sync.`;

  return {
    content: [
      headline,
      `Current balance: ${formatPolAmount(balancePol)}.`,
      `Refill from the Council Safe: ${refillUrl}`,
    ].join('\n'),
    allowed_mentions: {
      parse: [],
    },
  };
}

export function buildDiscordMessagePayload(
  result: MonthlyAutomationResult
): DiscordMessagePayload {
  const lines = [
    `${result.dryRun ? '[DRY RUN] ' : ''}DCL DAO Council multisig ops for ${result.period.label}`,
    '',
    formatPaymentResult('Curators', result.curators),
    formatPaymentResult('Council', result.council),
    '',
    `Safe queue: ${result.safeQueueUrl ?? 'not configured'}`,
  ];

  return {
    content: lines.join('\n').slice(0, 2000),
    allowed_mentions: {
      parse: [],
    },
  };
}

function formatPaymentResult(label: string, result: AutomationPaymentResult) {
  const total = formatManaAmount(result.totalMana, 4);

  if (result.status === 'created') {
    return `${label}: created ${total} proposal ${result.safeTxUrl}`;
  }

  if (result.status === 'already-completed') {
    return `${label}: already completed${result.safeTxUrl ? ` ${result.safeTxUrl}` : ''}`;
  }

  if (result.status === 'dry-run') {
    return `${label}: dry run would create ${total} (${result.paymentCount} payment(s))`;
  }

  if (result.status === 'skipped') {
    return `${label}: skipped - ${result.reason}`;
  }

  if (result.status === 'blocked') {
    return `${label}: blocked - ${result.reason}`;
  }

  return `${label}: failed - ${result.reason}`;
}

function formatPolAmount(amount: number) {
  return `${Number(amount.toFixed(4)).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  })} POL`;
}
