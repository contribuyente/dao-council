import type {
  TransactionReceiptFetchFailure,
  TransactionReceiptLog,
} from '../../src/transactionLogParser';

export type PolygonRpcEnv = {
  POLYGON_RPC_URL?: string;
  POLYGON_RPC_ENDPOINT?: string;
  POLYGON_RPC_BATCH_SIZE?: string;
  POLYGON_RPC_BATCH_DELAY_MS?: string;
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

export type PolygonTransactionReceiptLogsBatch = {
  logsByTxHash: Map<`0x${string}`, TransactionReceiptLog[]>;
  failures: TransactionReceiptFetchFailure[];
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
  const { logsByTxHash, failures } = await fetchTransactionReceiptLogs(
    [txHash],
    env
  );
  const logs = logsByTxHash.get(txHash);

  if (!logs) {
    throw new Error(
      failures[0]?.message ?? `Polygon receipt not found for ${txHash}`
    );
  }

  return { logs };
}

export async function fetchTransactionReceiptLogs(
  txHashes: `0x${string}`[],
  env: PolygonRpcEnv = {}
): Promise<PolygonTransactionReceiptLogsBatch> {
  if (txHashes.length === 0) {
    return {
      logsByTxHash: new Map(),
      failures: [],
    };
  }

  return fetchTransactionReceiptLogsChunk(txHashes, env);
}

async function fetchTransactionReceiptLogsChunk(
  txHashes: `0x${string}`[],
  env: PolygonRpcEnv
): Promise<PolygonTransactionReceiptLogsBatch> {
  let parsed: PolygonTransactionReceiptLogsBatch;

  try {
    const response = await requestPolygonRpc(
      JSON.stringify(
        txHashes.map((txHash, index) => ({
          jsonrpc: '2.0',
          id: index,
          method: 'eth_getTransactionReceipt',
          params: [txHash],
        }))
      ),
      env,
      { allowJsonRpcErrors: true }
    );
    parsed = parseReceiptResponses(txHashes, response.payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown RPC error';

    if (txHashes.length > 1 && isRetryableRpcFailure(message)) {
      return fetchTransactionReceiptLogsInSmallerChunks(txHashes, env);
    }

    return {
      logsByTxHash: new Map(),
      failures: txHashes.map((txHash) => ({
        txHash,
        message,
      })),
    };
  }

  const shouldRetryAsSmallerChunks =
    txHashes.length > 1 &&
    parsed.failures.length > 0 &&
    parsed.logsByTxHash.size === 0 &&
    parsed.failures.every((failure) => isRetryableRpcFailure(failure.message));

  if (shouldRetryAsSmallerChunks) {
    return fetchTransactionReceiptLogsInSmallerChunks(txHashes, env);
  }

  return parsed;
}

async function fetchTransactionReceiptLogsInSmallerChunks(
  txHashes: `0x${string}`[],
  env: PolygonRpcEnv
): Promise<PolygonTransactionReceiptLogsBatch> {
  if (txHashes.length === 1) {
    return fetchTransactionReceiptLogsChunk(txHashes, env);
  }

  const mid = Math.ceil(txHashes.length / 2);
  const left = await fetchTransactionReceiptLogsChunk(
    txHashes.slice(0, mid),
    env
  );
  const right = await fetchTransactionReceiptLogsChunk(
    txHashes.slice(mid),
    env
  );

  return {
    logsByTxHash: new Map([...left.logsByTxHash, ...right.logsByTxHash]),
    failures: [...left.failures, ...right.failures],
  };
}

function parseReceiptResponses(
  txHashes: `0x${string}`[],
  payload: JsonRpcResponse | JsonRpcResponse[]
): PolygonTransactionReceiptLogsBatch {
  const responses = Array.isArray(payload)
    ? payload
    : [payload];
  const responsesById = new Map(
    responses.map((payload) => [String(payload.id), payload])
  );
  const logsByTxHash = new Map<`0x${string}`, TransactionReceiptLog[]>();
  const failures: TransactionReceiptFetchFailure[] = [];

  txHashes.forEach((txHash, index) => {
    const payload = responsesById.get(String(index)) as
      | JsonRpcResponse<PolygonTransactionReceipt>
      | undefined;
    const receipt = payload?.result;

    if (receipt && Array.isArray(receipt.logs)) {
      logsByTxHash.set(txHash, receipt.logs);
      return;
    }

    failures.push({
      txHash,
      message:
        payload?.error?.message ?? `Polygon receipt not found for ${txHash}`,
    });
  });

  return {
    logsByTxHash,
    failures,
  };
}

function isRetryableRpcFailure(message: string) {
  const normalizedMessage = message.toLowerCase();
  return (
    normalizedMessage.includes('internal error') ||
    normalizedMessage.includes('rate limit') ||
    normalizedMessage.includes('too many') ||
    normalizedMessage.includes('timeout') ||
    normalizedMessage.includes('temporarily')
  );
}

export function hasJsonRpcError(payload: JsonRpcResponse | JsonRpcResponse[]) {
  const responses = Array.isArray(payload) ? payload : [payload];
  return responses.some((response) => Boolean(response.error));
}

async function requestPolygonRpc(
  body: string,
  env: PolygonRpcEnv,
  { allowJsonRpcErrors = false }: { allowJsonRpcErrors?: boolean } = {}
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

      if (
        upstreamResponse.ok &&
        (allowJsonRpcErrors || !hasJsonRpcError(responsePayload))
      ) {
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
