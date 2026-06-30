import {
  getUniqueCurationTxHashes,
  processCurations,
} from '../../src/curationProcessor';
import { fetchAllCurationsFromSubgraph } from '../../src/curationQueries';
import { extractItemIdsFromTxs } from '../../src/transactionLogParser';
import {
  fetchTransactionReceipt,
  type PolygonRpcEnv,
} from '../_lib/polygonRpc';

export const onRequestGet: PagesFunction<PolygonRpcEnv> = async ({
  request,
  env,
}) => {
  const url = new URL(request.url);
  const fromTimestamp = parseTimestamp(url.searchParams.get('from'));
  const toTimestamp = parseTimestamp(url.searchParams.get('to'));

  if (!fromTimestamp || !toTimestamp) {
    return Response.json(
      { error: 'Expected numeric from and to UNIX timestamp query params.' },
      { status: 400 }
    );
  }

  if (fromTimestamp > toTimestamp) {
    return Response.json(
      { error: 'The from timestamp must be before or equal to the to timestamp.' },
      { status: 400 }
    );
  }

  try {
    const response = await fetchAllCurationsFromSubgraph({
      fetcher: fetch,
      fromTimestamp,
      toTimestamp,
    });
    const curations = response.data.curations;
    const txHashes = getUniqueCurationTxHashes(curations);
    const itemIdMap = await extractItemIdsFromTxs(txHashes, async (txHash) => {
      const receipt = await fetchTransactionReceipt(txHash, env);
      return receipt.logs;
    });
    const fees = processCurations(curations, itemIdMap);

    return Response.json(
      {
        data: {
          fees,
        },
        meta: {
          fromTimestamp,
          toTimestamp,
          rawCurations: curations.length,
          transactions: txHashes.length,
        },
      },
      {
        headers: {
          'Cache-Control': 's-maxage=300, stale-while-revalidate=3600',
        },
      }
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch processed curation data.',
      },
      { status: 502 }
    );
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: 'GET, OPTIONS',
    },
  });
};

function parseTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = Number(value);

  if (!Number.isInteger(timestamp) || timestamp <= 0) {
    return null;
  }

  return timestamp;
}
