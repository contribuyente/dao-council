import { curatorData } from './curatorData';
import type { Curation, CurationDetail, CuratorFeesSummary } from './types';

export const CURATION_COLLECTION_CREATED_AT_CUTOFF = 1658153853;

export type ProcessCurationsOptions = {
  reportFromTimestamp?: number;
  reportToTimestamp?: number;
  unresolvedCurationKeys?: ReadonlySet<string>;
};

export function getUniqueCurationTxHashes(curations: Curation[]): `0x${string}`[] {
  const txHashes = new Set<`0x${string}`>();

  getEligibleCurations(curations).forEach((curation) => {
    txHashes.add(curation.txHash.toLowerCase() as `0x${string}`);
  });

  return Array.from(txHashes);
}

export function processCurations(
  curations: Curation[],
  itemIdMap: Map<string, Map<string, string[]>>,
  options: ProcessCurationsOptions = {}
): CuratorFeesSummary[] {
  const curatorFees = new Map<string, CuratorFeesSummary>();
  const sortedCurations = getEligibleCurations(curations);
  const itemIdQueues = buildItemIdQueues(itemIdMap);
  const curatedItems = new Set<string>();
  const blockedCollections = new Set<string>();

  sortedCurations.forEach((curation) => {
    const curatorId = curation.curator.id.toLowerCase();
    const curatorInfo = curatorData[curatorId] || {
      name: 'Unknown',
      paymentAddress: curatorId,
    };

    const txHash = curation.txHash.toLowerCase();
    const collectionId = curation.collection.id.toLowerCase();
    const curationKey = getCurationCollectionKey(curation);

    if (options.unresolvedCurationKeys?.has(curationKey)) {
      blockedCollections.add(collectionId);
    }

    const itemId = getNextItemId(itemIdQueues, txHash, collectionId);
    const itemName = getItemName(curation, itemId);
    const itemKey = itemId ? `${collectionId}-${itemId}` : null;
    const isFirstPublicationCuration = itemKey
      ? !curatedItems.has(itemKey)
      : false;

    if (itemKey) {
      curatedItems.add(itemKey);
    }

    if (!isWithinReportRange(curation, options)) {
      return;
    }

    const canPayCuration =
      isFirstPublicationCuration && !blockedCollections.has(collectionId);
    const { creationFeeAmount, curationFee } = canPayCuration
      ? calculateCurationFee(curation, itemId)
      : { creationFeeAmount: 0, curationFee: 0 };

    const curationDetail: CurationDetail = {
      timestamp: curation.timestamp,
      txHash: curation.txHash,
      collectionId: curation.collection.id,
      collectionName: curation.collection.name,
      itemId,
      itemName,
      creationFee: creationFeeAmount,
      curatorFee: curationFee,
    };

    const existing = curatorFees.get(curatorId);
    if (existing) {
      if (curationFee > 0) {
        existing.totalFees += curationFee;
      }

      existing.curationCount += 1;
      existing.curations.push(curationDetail);
    } else {
      curatorFees.set(curatorId, {
        curatorId,
        curatorName: curatorInfo.name,
        paymentAddress: curatorInfo.paymentAddress,
        totalFees: curationFee > 0 ? curationFee : 0,
        curationCount: 1,
        curations: [curationDetail],
      });
    }
  });

  return Array.from(curatorFees.values())
    .sort((a, b) => {
      if (b.totalFees !== a.totalFees) {
        return b.totalFees - a.totalFees;
      }

      return b.curationCount - a.curationCount;
    });
}

export function getCurationCollectionKey(curation: Curation) {
  return `${curation.txHash.toLowerCase()}-${curation.collection.id.toLowerCase()}`;
}

function getEligibleCurations(curations: Curation[]) {
  return [...curations]
    .sort((a, b) => +a.timestamp - +b.timestamp)
    .filter((curation) => {
      const createdAt = parseInt(curation.collection.createdAt);
      return createdAt > CURATION_COLLECTION_CREATED_AT_CUTOFF;
    });
}

function isWithinReportRange(
  curation: Curation,
  { reportFromTimestamp, reportToTimestamp }: ProcessCurationsOptions
) {
  const timestamp = Number(curation.timestamp);

  if (reportFromTimestamp !== undefined && timestamp < reportFromTimestamp) {
    return false;
  }

  if (reportToTimestamp !== undefined && timestamp > reportToTimestamp) {
    return false;
  }

  return true;
}

function calculateCurationFee(curation: Curation, itemId: string | null) {
  let creationFeeAmount = 0;
  let curationFee = 0;
  const item = getCurationItem(curation, itemId);

  if (item) {
    const creationFee = item.creationFee;

    if (creationFee && creationFee !== '0') {
      creationFeeAmount = convertBigNumberToEther(creationFee);
      curationFee = creationFeeAmount / 3;
    }
  }

  return {
    creationFeeAmount,
    curationFee,
  };
}

function buildItemIdQueues(itemIdMap: Map<string, Map<string, string[]>>) {
  const itemIdQueues = new Map<string, string[]>();

  itemIdMap.forEach((txItemMap, txHash) => {
    txItemMap.forEach((itemIds, collectionId) => {
      itemIdQueues.set(`${txHash}-${collectionId}`, [...itemIds]);
    });
  });

  return itemIdQueues;
}

function getNextItemId(
  itemIdQueues: Map<string, string[]>,
  txHash: string,
  collectionId: string
) {
  const itemQueue = itemIdQueues.get(`${txHash}-${collectionId}`);
  return itemQueue && itemQueue.length > 0 ? itemQueue.shift() || null : null;
}

function getItemName(curation: Curation, itemId: string | null) {
  const matchingItem = getCurationItem(curation, itemId);

  return (
    matchingItem?.metadata?.wearable?.name ||
    matchingItem?.metadata?.emote?.name ||
    null
  );
}

function getCurationItem(curation: Curation, itemId: string | null) {
  if (!itemId || !curation.collection.items) {
    return null;
  }

  return (
    curation.collection.items.find((item) => item.blockchainId === itemId) ||
    null
  );
}

function convertBigNumberToEther(bigNumberString: string) {
  const bigNumber = BigInt(bigNumberString);
  const divisor = BigInt('1000000000000000000');
  return Number(bigNumber) / Number(divisor);
}
