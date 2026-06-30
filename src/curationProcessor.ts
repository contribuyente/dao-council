import { curatorData } from './curatorData';
import type { Curation, CurationDetail, CuratorFeesSummary } from './types';

const CURATION_COLLECTION_CREATED_AT_CUTOFF = 1658153853;

export function getUniqueCurationTxHashes(curations: Curation[]): `0x${string}`[] {
  const txHashes = new Set<`0x${string}`>();

  getEligibleCurations(curations).forEach((curation) => {
    txHashes.add(curation.txHash.toLowerCase() as `0x${string}`);
  });

  return Array.from(txHashes);
}

export function processCurations(
  curations: Curation[],
  itemIdMap: Map<string, Map<string, string[]>>
): CuratorFeesSummary[] {
  const curatorFees = new Map<string, CuratorFeesSummary>();
  const sortedCurations = getEligibleCurations(curations);
  const itemIdQueues = buildItemIdQueues(itemIdMap);
  const curatedItems = new Set<string>();

  sortedCurations.forEach((curation) => {
    const curatorId = curation.curator.id.toLowerCase();
    const curatorInfo = curatorData[curatorId] || {
      name: 'Unknown',
      paymentAddress: curatorId,
    };

    let curationFee = 0;
    let creationFeeAmount = 0;

    if (curation.collection.items && curation.collection.items.length > 0) {
      const creationFee = curation.collection.items[0].creationFee;

      if (creationFee && creationFee !== '0') {
        creationFeeAmount = convertBigNumberToEther(creationFee);
        curationFee = creationFeeAmount / 3;
      }
    }

    const txHash = curation.txHash.toLowerCase();
    const collectionId = curation.collection.id.toLowerCase();
    const itemId = getNextItemId(itemIdQueues, txHash, collectionId);
    const itemName = getItemName(curation, itemId);
    const itemKey = itemId ? `${collectionId}-${itemId}` : null;
    const isFirstCuration = itemKey ? !curatedItems.has(itemKey) : true;

    if (!isFirstCuration && itemKey) {
      curationFee = 0;
      creationFeeAmount = 0;
    } else if (itemKey) {
      curatedItems.add(itemKey);
    }

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
        existing.curationCount += 1;
      }

      existing.curations.push(curationDetail);
    } else {
      curatorFees.set(curatorId, {
        curatorId,
        curatorName: curatorInfo.name,
        paymentAddress: curatorInfo.paymentAddress,
        totalFees: curationFee > 0 ? curationFee : 0,
        curationCount: curationFee > 0 ? 1 : 0,
        curations: [curationDetail],
      });
    }
  });

  return Array.from(curatorFees.values())
    .filter((summary) => summary.totalFees > 0)
    .sort((a, b) => b.totalFees - a.totalFees);
}

function getEligibleCurations(curations: Curation[]) {
  return [...curations]
    .sort((a, b) => +a.timestamp - +b.timestamp)
    .filter((curation) => {
      const createdAt = parseInt(curation.collection.createdAt);
      return createdAt > CURATION_COLLECTION_CREATED_AT_CUTOFF;
    });
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
  if (!itemId || !curation.collection.items) {
    return null;
  }

  const matchingItem = curation.collection.items.find(
    (item) => item.blockchainId === itemId
  );

  return (
    matchingItem?.metadata?.wearable?.name ||
    matchingItem?.metadata?.emote?.name ||
    null
  );
}

function convertBigNumberToEther(bigNumberString: string) {
  const bigNumber = BigInt(bigNumberString);
  const divisor = BigInt('1000000000000000000');
  return Number(bigNumber) / Number(divisor);
}
