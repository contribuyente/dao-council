import {
  fetchPolygonRpc,
  type JsonRpcRequest,
  type PolygonRpcEnv,
} from '../_lib/polygonRpc';

const ALLOWED_METHODS = new Set([
  'eth_chainId',
  'eth_getTransactionReceipt',
]);

export const onRequestPost: PagesFunction<PolygonRpcEnv> = async ({
  request,
  env,
}) => {
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

  try {
    return await fetchPolygonRpc(body, env);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not fetch Polygon transaction receipt.',
      },
      { status: 502 }
    );
  }
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
