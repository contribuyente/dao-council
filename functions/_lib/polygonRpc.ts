import type { TransactionReceiptLog } from '../../src/transactionLogParser';

export type PolygonRpcEnv = {
  POLYGON_RPC_URL?: string;
  POLYGON_RPC_ENDPOINT?: string;
};

export type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown[];
};

export type JsonRpcResponse<Result = unknown> = {
  jsonrpc?: string;
  id?: string | number | null;
  result?: Result | null;
  error?: {
    code?: number;
    message?: string;
  };
};

export type PolygonTransactionReceipt = {
  logs: TransactionReceiptLog[];
};

const DEFAULT_POLYGON_RPC_URLS = [
  'https://polygon-bor-rpc.publicnode.com',
  'https://polygon.llamarpc.com',
];

export function getPolygonRpcUrls(env: PolygonRpcEnv = {}) {
  const configuredUrls = [
    env.POLYGON_RPC_URL,
    env.POLYGON_RPC_ENDPOINT,
  ].flatMap((value) => splitRpcUrls(value));

  return Array.from(new Set([...configuredUrls, ...DEFAULT_POLYGON_RPC_URLS]));
}

export async function fetchPolygonRpc(
  body: string,
  env: PolygonRpcEnv = {}
) {
  const upstreamResponse = await requestPolygonRpc(body, env);

  return new Response(upstreamResponse.text, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=86400, stale-while-revalidate=604800',
    },
  });
}

export async function fetchTransactionReceipt(
  txHash: `0x${string}`,
  env: PolygonRpcEnv = {}
): Promise<PolygonTransactionReceipt> {
  const response = await requestPolygonRpc(
    JSON.stringify({
      jsonrpc: '2.0',
      id: txHash,
      method: 'eth_getTransactionReceipt',
      params: [txHash],
    }),
    env
  );
  const payload = Array.isArray(response.payload)
    ? response.payload[0]
    : response.payload;
  const receipt = payload?.result as PolygonTransactionReceipt | null | undefined;

  if (!receipt || !Array.isArray(receipt.logs)) {
    throw new Error(`Polygon receipt not found for ${txHash}`);
  }

  return receipt;
}

export function hasJsonRpcError(payload: JsonRpcResponse | JsonRpcResponse[]) {
  const responses = Array.isArray(payload) ? payload : [payload];
  return responses.some((response) => Boolean(response.error));
}

async function requestPolygonRpc(
  body: string,
  env: PolygonRpcEnv
): Promise<{
  text: string;
  payload: JsonRpcResponse | JsonRpcResponse[];
}> {
  let lastError: JsonRpcResponse | null = null;

  for (const rpcUrl of getPolygonRpcUrls(env)) {
    try {
      const upstreamResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body,
      });
      const text = await upstreamResponse.text();
      const responsePayload = JSON.parse(text) as
        | JsonRpcResponse
        | JsonRpcResponse[];

      if (upstreamResponse.ok && !hasJsonRpcError(responsePayload)) {
        return {
          text,
          payload: responsePayload,
        };
      }

      lastError = Array.isArray(responsePayload)
        ? responsePayload[0] ?? null
        : responsePayload;
    } catch {
      // Try the next configured or public RPC endpoint.
    }
  }

  throw new Error(
    lastError?.error?.message ?? 'Could not fetch Polygon transaction receipt.'
  );
}

function splitRpcUrls(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
}
