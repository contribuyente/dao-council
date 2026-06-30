type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown[];
};

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: string | number | null;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
  };
};

const POLYGON_RPC_URLS = [
  'https://polygon-bor-rpc.publicnode.com',
  'https://polygon.llamarpc.com',
];

const ALLOWED_METHODS = new Set([
  'eth_chainId',
  'eth_getTransactionReceipt',
]);

export const onRequestPost: PagesFunction = async ({ request }) => {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return Response.json(
      { error: 'Expected application/json request body' },
      { status: 415 }
    );
  }

  let body: string;
  let payload: JsonRpcRequest | JsonRpcRequest[];

  try {
    body = await request.text();
    payload = JSON.parse(body) as JsonRpcRequest | JsonRpcRequest[];
  } catch {
    return Response.json({ error: 'Invalid JSON-RPC body.' }, { status: 400 });
  }

  if (!isAllowedPayload(payload)) {
    return Response.json({ error: 'Unsupported JSON-RPC method.' }, { status: 400 });
  }

  let lastError: JsonRpcResponse | null = null;

  for (const rpcUrl of POLYGON_RPC_URLS) {
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
      const responsePayload = JSON.parse(text) as JsonRpcResponse | JsonRpcResponse[];

      if (upstreamResponse.ok && !hasJsonRpcError(responsePayload)) {
        return new Response(text, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 's-maxage=86400, stale-while-revalidate=604800',
          },
        });
      }

      lastError = Array.isArray(responsePayload) ? responsePayload[0] ?? null : responsePayload;
    } catch {
      // Try the next public RPC endpoint.
    }
  }

  return Response.json(
    {
      error: lastError?.error?.message ?? 'Could not fetch Polygon transaction receipt.',
    },
    { status: 502 }
  );
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: 'POST, OPTIONS',
    },
  });
};

function isAllowedPayload(payload: JsonRpcRequest | JsonRpcRequest[]) {
  const requests = Array.isArray(payload) ? payload : [payload];

  return (
    requests.length > 0 &&
    requests.every((request) => {
      if (!request.method || !ALLOWED_METHODS.has(request.method)) {
        return false;
      }

      if (request.method === 'eth_getTransactionReceipt') {
        const txHash = request.params?.[0];
        return typeof txHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(txHash);
      }

      return true;
    })
  );
}

function hasJsonRpcError(payload: JsonRpcResponse | JsonRpcResponse[]) {
  const responses = Array.isArray(payload) ? payload : [payload];
  return responses.some((response) => Boolean(response.error));
}
