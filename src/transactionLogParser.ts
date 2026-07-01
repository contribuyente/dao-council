export type TransactionReceiptLog = {
  address: string;
  topics: readonly string[];
  data?: string;
};

export type TransactionReceiptFetchFailure = {
  txHash: `0x${string}`;
  message: string;
};

export type ExtractItemIdsFromTxsResult = {
  itemIdMap: Map<string, Map<string, string[]>>;
  failures: TransactionReceiptFetchFailure[];
};

export type TransactionReceiptLogsBatch = {
  logsByTxHash: Map<`0x${string}`, TransactionReceiptLog[]>;
  failures?: TransactionReceiptFetchFailure[];
};

export type ExtractItemIdsFromTxsOptions = {
  batchSize?: number;
  batchDelayMs?: number;
};

const TRANSFER_EVENT_SIGNATURE =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const CURATION_EVENT_SIGNATURE =
  '0x87a972ab2db2d47a0bbefe72cefc4fe5a38b1b9d2bc4b9f366b59fdb6dbd9581';

export function extractItemIdsFromReceiptLogs(
  logs: TransactionReceiptLog[]
): Map<string, string[]> {
  const collectionItemMap = new Map<string, string[]>();

  for (const log of logs) {
    const firstTopic = log.topics[0]?.toLowerCase();
    const isTransferEvent = firstTopic === TRANSFER_EVENT_SIGNATURE;
    const isCurationEvent = firstTopic === CURATION_EVENT_SIGNATURE;

    if (isTransferEvent && log.topics.length >= 4 && log.topics[3]) {
      addItemId(collectionItemMap, log.address, BigInt(log.topics[3]).toString());
      continue;
    }

    if (!isCurationEvent) {
      continue;
    }

    const itemId = extractCurationEventItemId(log);
    if (itemId) {
      addItemId(collectionItemMap, log.address, itemId);
    }
  }

  return collectionItemMap;
}

export async function extractItemIdsFromTxs(
  txHashes: `0x${string}`[],
  fetchReceiptLogsBatch: (
    txHashes: `0x${string}`[]
  ) => Promise<TransactionReceiptLogsBatch>,
  { batchSize = 50, batchDelayMs = 0 }: ExtractItemIdsFromTxsOptions = {}
): Promise<ExtractItemIdsFromTxsResult> {
  const itemIdMap = new Map<string, Map<string, string[]>>();
  const failures: TransactionReceiptFetchFailure[] = [];

  for (let i = 0; i < txHashes.length; i += batchSize) {
    const batch = txHashes.slice(i, i + batchSize);
    const failedTxHashes = new Set<string>();

    try {
      const { logsByTxHash, failures: batchFailures = [] } =
        await fetchReceiptLogsBatch(batch);

      batchFailures.forEach((failure) => {
        failedTxHashes.add(failure.txHash.toLowerCase());
        failures.push(failure);
      });

      batch.forEach((txHash) => {
        const logs = logsByTxHash.get(txHash);

        if (!logs) {
          if (!failedTxHashes.has(txHash.toLowerCase())) {
            failures.push({
              txHash,
              message: `Polygon receipt not found for ${txHash}`,
            });
          }
          return;
        }

        itemIdMap.set(txHash, extractItemIdsFromReceiptLogs(logs));
      });
    } catch (error) {
      batch.forEach((txHash) => {
        failures.push({
          txHash,
          message: error instanceof Error ? error.message : 'Unknown RPC error',
        });
      });
    }

    if (batchDelayMs > 0 && i + batchSize < txHashes.length) {
      await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
    }
  }

  return {
    itemIdMap,
    failures,
  };
}

function extractCurationEventItemId(log: TransactionReceiptLog) {
  if (log.topics.length >= 3 && log.topics[2]) {
    return BigInt(log.topics[2]).toString();
  }

  if (log.topics.length >= 2 && log.topics[1]) {
    return BigInt(log.topics[1]).toString();
  }

  if (log.data && log.data !== '0x' && log.data.length >= 66) {
    return BigInt(`0x${log.data.slice(2, 66)}`).toString();
  }

  return null;
}

function addItemId(
  collectionItemMap: Map<string, string[]>,
  collectionAddress: string,
  itemId: string
) {
  const normalizedAddress = collectionAddress.toLowerCase();

  if (!collectionItemMap.has(normalizedAddress)) {
    collectionItemMap.set(normalizedAddress, []);
  }

  collectionItemMap.get(normalizedAddress)!.push(itemId);
}
