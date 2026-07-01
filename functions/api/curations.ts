import {
  CURATION_COLLECTION_CREATED_AT_CUTOFF,
  getCurationCollectionKey,
  getUniqueCurationTxHashes,
  processCurations,
} from '../../src/curationProcessor';
import { fetchAllCurationsFromSubgraph } from '../../src/curationQueries';
import {
  extractItemIdsFromTxs,
  type TransactionReceiptFetchFailure,
} from '../../src/transactionLogParser';
import type { Curation } from '../../src/types';
import {
  fetchTransactionReceiptLogs,
  type PolygonRpcEnv,
} from '../_lib/polygonRpc';

export const onRequestGet: PagesFunction<PolygonRpcEnv> = async ({
  request,
  env,
}) => {
  const startedAt = Date.now();
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
    const reportResponse = await fetchAllCurationsFromSubgraph({
      fetcher: fetch,
      fromTimestamp,
      toTimestamp,
    });
    const reportCurations = reportResponse.data.curations;
    const reportCollectionIds = getUniqueCollectionIds(reportCurations);

    if (reportCurations.length === 0) {
      return Response.json(
        {
          data: {
            fees: [],
          },
          warnings: [],
          meta: {
            fromTimestamp,
            toTimestamp,
            historyFromTimestamp: CURATION_COLLECTION_CREATED_AT_CUTOFF,
            historyCurations: 0,
            reportCurations: 0,
            reportCollections: 0,
            transactions: 0,
            unresolvedTransactions: 0,
            unresolvedTransactionSamples: [],
            blockedCurationKeys: 0,
            rpcBatchSize: 0,
            rpcBatchDelayMs: 0,
            durationMs: {
              graph: Date.now() - startedAt,
              rpc: 0,
              processing: 0,
              total: Date.now() - startedAt,
            },
          },
        },
        {
          headers: {
            'Cache-Control': 's-maxage=300, stale-while-revalidate=3600',
          },
        }
      );
    }

    const response = await fetchAllCurationsFromSubgraph({
      fetcher: fetch,
      fromTimestamp: CURATION_COLLECTION_CREATED_AT_CUTOFF,
      toTimestamp,
      collectionIds: reportCollectionIds,
    });
    const graphDurationMs = Date.now() - startedAt;
    const curations = response.data.curations;
    const txHashes = getUniqueCurationTxHashes(curations);
    const rpcStartedAt = Date.now();
    const rpcBatchSize = parsePositiveInteger(env.POLYGON_RPC_BATCH_SIZE, 10);
    const rpcBatchDelayMs = parsePositiveInteger(
      env.POLYGON_RPC_BATCH_DELAY_MS,
      0
    );
    const { itemIdMap, failures } = await extractItemIdsFromTxs(
      txHashes,
      (batch) => fetchTransactionReceiptLogs(batch, env),
      {
        batchSize: rpcBatchSize,
        batchDelayMs: rpcBatchDelayMs,
      }
    );
    const rpcDurationMs = Date.now() - rpcStartedAt;
    const processingStartedAt = Date.now();
    const unresolvedCurationKeys = getUnresolvedCurationKeys(
      curations,
      failures
    );
    const fees = processCurations(curations, itemIdMap, {
      reportFromTimestamp: fromTimestamp,
      reportToTimestamp: toTimestamp,
      unresolvedCurationKeys,
    });
    const warnings = getWarnings(failures);
    const processingDurationMs = Date.now() - processingStartedAt;

    return Response.json(
      {
        data: {
          fees,
        },
        warnings,
        meta: {
          fromTimestamp,
          toTimestamp,
          historyFromTimestamp: CURATION_COLLECTION_CREATED_AT_CUTOFF,
          historyCurations: curations.length,
          reportCurations: reportCurations.length,
          reportCollections: reportCollectionIds.length,
          transactions: txHashes.length,
          unresolvedTransactions: failures.length,
          unresolvedTransactionSamples: failures
            .slice(0, 5)
            .map((failure) => failure.txHash),
          blockedCurationKeys: unresolvedCurationKeys.size,
          rpcBatchSize,
          rpcBatchDelayMs,
          durationMs: {
            graph: graphDurationMs,
            rpc: rpcDurationMs,
            processing: processingDurationMs,
            total: Date.now() - startedAt,
          },
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

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function getUniqueCollectionIds(curations: Curation[]) {
  return Array.from(
    new Set(curations.map((curation) => curation.collection.id.toLowerCase()))
  );
}

function getUnresolvedCurationKeys(
  curations: Curation[],
  failures: TransactionReceiptFetchFailure[]
) {
  const failedTxHashes = new Set(
    failures.map((failure) => failure.txHash.toLowerCase())
  );
  const unresolvedCurationKeys = new Set<string>();

  curations.forEach((curation) => {
    if (failedTxHashes.has(curation.txHash.toLowerCase())) {
      unresolvedCurationKeys.add(getCurationCollectionKey(curation));
    }
  });

  return unresolvedCurationKeys;
}

function getWarnings(failures: TransactionReceiptFetchFailure[]) {
  if (failures.length === 0) {
    return [];
  }

  return [
    `${failures.length} Polygon transaction receipt(s) could not be loaded after retrying failed batches. Curations after unresolved receipts in the same collection were excluded from payable totals to avoid overpaying.`,
  ];
}
