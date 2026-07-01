import {
  runMonthlyAutomation,
  type AutomationEnv,
  type RunMonthlyAutomationOptions,
} from '../server/automation';

type ManualRunRequest = {
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
    _controller: ScheduledController,
    env: AutomationEnv,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(runScheduled(env));
  },
};

async function handleManualRun(request: Request, env: AutomationEnv) {
  const authHeader = request.headers.get('authorization') ?? '';
  const expectedToken = env.AUTOMATION_ADMIN_TOKEN;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const body = await parseManualRunRequest(request);
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

async function runScheduled(env: AutomationEnv) {
  const result = await runMonthlyAutomation(env);

  if (
    result.curators.status === 'failed' ||
    result.council.status === 'failed' ||
    result.discord?.status === 'failed'
  ) {
    console.error('Automation completed with failures', result);
  }
}

async function parseManualRunRequest(request: Request): Promise<ManualRunRequest> {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return {};
  }

  return (await request.json().catch(() => ({}))) as ManualRunRequest;
}
