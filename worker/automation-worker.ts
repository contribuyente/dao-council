import {
  runMonthlyAutomation,
  type AutomationEnv,
  type RunMonthlyAutomationOptions,
} from '../server/automation';
import { postDiscordTestMessage } from '../server/discord';
import { runGasTankBalanceAlert } from '../server/gasTank';
import {
  getSafeNextNonce,
  proposeSafePaymentTransaction,
} from '../server/safeProposals';
import { getAddress, isAddress } from 'viem';

const MONTHLY_PAYMENTS_CRON = '0 15 1 * *';
const GAS_TANK_ALERT_CRON = '0 14 * * *';

type ManualRunRequest = {
  test?: boolean;
  gasTank?: boolean;
  now?: string;
  force?: boolean;
  dryRun?: boolean;
  notifyDiscord?: boolean;
};

export default {
  async fetch(request: Request, env: AutomationEnv): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({
        ok: true,
        service: 'dao-council-automation',
      });
    }

    if (request.method === 'POST' && url.pathname === '/run') {
      return handleManualRun(request, env);
    }

    return Response.json({ error: 'Not found.' }, { status: 404 });
  },

  async scheduled(
    controller: ScheduledController,
    env: AutomationEnv,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(runScheduled(controller.cron, env));
  },
};

async function handleManualRun(request: Request, env: AutomationEnv) {
  const authHeader = request.headers.get('authorization') ?? '';
  const expectedToken = env.AUTOMATION_ADMIN_TOKEN;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const body = await parseManualRunRequest(request);

  if (body.test === true) {
    try {
      return Response.json(await runManualSmokeTest(env));
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Manual smoke test failed.',
        },
        { status: 502 }
      );
    }
  }

  if (body.gasTank === true) {
    return Response.json(await runGasTankBalanceAlert(env));
  }

  const options: RunMonthlyAutomationOptions = {
    force: body.force === true,
  };

  if (typeof body.dryRun === 'boolean') {
    options.dryRun = body.dryRun;
  }

  if (typeof body.notifyDiscord === 'boolean') {
    options.notifyDiscord = body.notifyDiscord;
  }

  if (body.now) {
    const now = new Date(body.now);

    if (Number.isNaN(now.getTime())) {
      return Response.json({ error: 'Invalid now date.' }, { status: 400 });
    }

    options.now = now;
  }

  const result = await runMonthlyAutomation(env, options);
  return Response.json(result);
}

async function runScheduled(cron: string, env: AutomationEnv) {
  if (cron === GAS_TANK_ALERT_CRON) {
    const result = await runGasTankBalanceAlert(env);

    if (result.status === 'failed') {
      console.error('Gas tank alert failed', result);
    }

    return;
  }

  if (cron !== MONTHLY_PAYMENTS_CRON) {
    console.warn('Unknown scheduled automation cron', { cron });
    return;
  }

  const result = await runMonthlyAutomation(env);

  if (
    result.curators.status === 'failed' ||
    result.council.status === 'failed' ||
    result.discord?.status === 'failed'
  ) {
    console.error('Automation completed with failures', result);
  }
}

async function runManualSmokeTest(env: AutomationEnv) {
  const safeAddress = getSafeAddress(env);
  const proposal = await proposeSafePaymentTransaction({
    env,
    payments: [
      {
        name: 'Safe self-test',
        address: safeAddress,
        amountMana: 1,
      },
    ],
    nonce: await getSafeNextNonce(env),
    origin: `dao-council:auto:test:${new Date().toISOString()}`,
  });
  let discord:
    | Awaited<ReturnType<typeof postDiscordTestMessage>>
    | { status: 'failed'; reason: string };

  try {
    discord = await postDiscordTestMessage(env, proposal.safeTxUrl);
  } catch (error) {
    discord = {
      status: 'failed',
      reason:
        error instanceof Error ? error.message : 'Discord test message failed.',
    };
  }

  return {
    test: true,
    safeTx: proposal,
    discord,
  };
}

async function parseManualRunRequest(request: Request): Promise<ManualRunRequest> {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return {};
  }

  return (await request.json().catch(() => ({}))) as ManualRunRequest;
}

function getSafeAddress(env: AutomationEnv) {
  if (!env.SAFE_ADDRESS || !isAddress(env.SAFE_ADDRESS)) {
    throw new Error('SAFE_ADDRESS must be configured for the smoke test.');
  }

  return getAddress(env.SAFE_ADDRESS);
}
