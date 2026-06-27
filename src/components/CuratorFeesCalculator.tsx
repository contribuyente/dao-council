import { useCallback, useState, useEffect } from "react";
import { DateRange, CuratorFeesSummary, Curation, CurationDetail } from "../types";
import { fetchAllCurations } from "../graphqlClient";
import { curatorData } from "../curatorData";
import { extractItemIdsFromTxs } from "../transactionLogs";

interface CuratorFeesCalculatorProps {
  dateRange: DateRange;
  onFeesCalculated: (fees: CuratorFeesSummary[]) => void;
  onLoadingChange: (loading: boolean) => void;
}

export function CuratorFeesCalculator({
  dateRange,
  onFeesCalculated,
  onLoadingChange,
}: CuratorFeesCalculatorProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const convertBigNumberToEther = useCallback((bigNumberString: string): number => {
    // Convert BigNumber string to regular number by dividing by 10^18
    const bigNumber = BigInt(bigNumberString);
    const divisor = BigInt("1000000000000000000"); // 10^18
    const result = Number(bigNumber) / Number(divisor);
    return result;
  }, []);


  const processCurations = useCallback(async (curations: Curation[]): Promise<CuratorFeesSummary[]> => {
    const curatorFees = new Map<string, CuratorFeesSummary>();

    // Sort by timestamp and apply the historical collection creation cutoff.
    const sortedCurations = curations
      .sort((a, b) => +a.timestamp - +b.timestamp)
      .filter((curation) => {
        const createdAt = parseInt(curation.collection.createdAt);
        return createdAt > 1658153853;
      });

    // Group curations by txHash to fetch item IDs efficiently
    const curationsByTx = new Map<string, Curation[]>();
    sortedCurations.forEach((curation) => {
      const txHash = curation.txHash.toLowerCase();
      if (!curationsByTx.has(txHash)) {
        curationsByTx.set(txHash, []);
      }
      curationsByTx.get(txHash)!.push(curation);
    });

    console.log(`[processCurations] Grouped ${sortedCurations.length} curations into ${curationsByTx.size} unique transactions`);
    
    // Log sample curations to see collection IDs
    if (sortedCurations.length > 0) {
      const sampleCuration = sortedCurations[0];
      console.log(`[processCurations] Sample curation - txHash: ${sampleCuration.txHash}, collectionId: ${sampleCuration.collection.id}, collectionId (lowercase): ${sampleCuration.collection.id.toLowerCase()}`);
      
      // Log all unique collection IDs we're looking for
      const uniqueCollections = new Set(sortedCurations.map(c => c.collection.id.toLowerCase()));
      console.log(`[processCurations] Unique collection IDs we need to match (${uniqueCollections.size}):`, Array.from(uniqueCollections).slice(0, 10));
    }

    // Fetch item IDs for all unique transactions
    const uniqueTxHashes = Array.from(curationsByTx.keys()) as `0x${string}`[];
    const itemIdMap = await extractItemIdsFromTxs(uniqueTxHashes);

    console.log(`[processCurations] Item ID map size: ${itemIdMap.size}`);
    // Log sample item ID mappings and all collection addresses found
    if (itemIdMap.size > 0) {
      const allFoundCollections = new Set<string>();
      itemIdMap.forEach((txItemMap) => {
        txItemMap.forEach((_, collectionId) => {
          allFoundCollections.add(collectionId);
        });
      });
      console.log(`[processCurations] Collection addresses found in transaction logs (${allFoundCollections.size}):`, Array.from(allFoundCollections).slice(0, 10));
      
      const firstTx = Array.from(itemIdMap.keys())[0];
      const firstTxMap = itemIdMap.get(firstTx);
      console.log(`[processCurations] Sample tx ${firstTx} item map:`, 
        firstTxMap ? Array.from(firstTxMap.entries()).map(([addr, ids]) => `${addr}: [${ids.join(', ')}]`) : 'empty');
    } else {
      console.warn(`[processCurations] No item ID maps found for any transactions!`);
    }

    // Create queues for item IDs per transaction+collection to match in order
    const itemIdQueues = new Map<string, string[]>();
    let totalItemIdsExtracted = 0;
    itemIdMap.forEach((txItemMap, txHash) => {
      txItemMap.forEach((itemIds, collectionId) => {
        const key = `${txHash}-${collectionId}`;
        itemIdQueues.set(key, [...itemIds]); // Create a copy array for queue
        totalItemIdsExtracted += itemIds.length;
      });
    });
    
    console.log(`[processCurations] Total item ID queues created: ${itemIdQueues.size}, total item IDs extracted: ${totalItemIdsExtracted}`);

    // Statistics for summary
    let curationsWithItemId = 0;
    let curationsWithoutItemId = 0;
    let curationsWithTxData = 0;
    let curationsWithoutTxData = 0;
    const collectionMismatches = new Map<string, { lookingFor: string; found: string[] }>();

    // Track items that have already been curated (only first curation pays)
    // Key: collectionId-itemId, Value: true if already curated
    const curatedItems = new Set<string>();

    // Process each curation individually (each represents one item being curated)
    sortedCurations.forEach((curation) => {
      const curatorId = curation.curator.id.toLowerCase();
      
      const curatorInfo = curatorData[curatorId] || {
        name: "Unknown",
        paymentAddress: curatorId,
      };

      // Calculate fee for THIS curation (one item): creationFee / 3
      let curationFee = 0;
      let creationFeeAmount = 0;
      
      if (curation.collection.items && curation.collection.items.length > 0) {
        // For this curation, we pay for one item (assuming first item represents this curation)
        const creationFee = curation.collection.items[0].creationFee;
        
        if (creationFee && creationFee !== "0") {
          creationFeeAmount = convertBigNumberToEther(creationFee);
          curationFee = creationFeeAmount / 3;
        }
      }

      // Extract item ID from transaction logs using queue-based matching
      let itemId: string | null = null;
      const txHash = curation.txHash.toLowerCase();
      const collectionId = curation.collection.id.toLowerCase();
      const queueKey = `${txHash}-${collectionId}`;
      const itemQueue = itemIdQueues.get(queueKey);
      
      if (itemQueue && itemQueue.length > 0) {
        // Pop the first item ID from the queue (FIFO matching)
        itemId = itemQueue.shift() || null;
        curationsWithItemId++;
      } else {
        curationsWithoutItemId++;
        // Debug: check if we have data for this tx at all
        const txItemMap = itemIdMap.get(txHash);
        if (txItemMap) {
          curationsWithTxData++;
          const foundCollections = Array.from(txItemMap.keys());
          
          // Track collection mismatches for summary
          if (!foundCollections.includes(collectionId)) {
            const existing = collectionMismatches.get(txHash) || { lookingFor: collectionId, found: [] };
            existing.found.push(...foundCollections.filter(c => !existing.found.includes(c)));
            collectionMismatches.set(txHash, existing);
          }
        } else {
          curationsWithoutTxData++;
        }
      }

      // Extract item name by matching itemId with blockchainId
      let itemName: string | null = null;
      if (itemId && curation.collection.items) {
        const matchingItem = curation.collection.items.find(
          item => item.blockchainId === itemId
        );
        
        if (matchingItem) {
          // Get name from metadata.wearable.name or metadata.emote.name
          itemName = matchingItem.metadata?.wearable?.name || 
                     matchingItem.metadata?.emote?.name || 
                     null;
        }
      }

      // Check if this item has already been curated (only first curation pays)
      const itemKey = itemId ? `${collectionId}-${itemId}` : null;
      const isFirstCuration = itemKey ? !curatedItems.has(itemKey) : true;
      
      // If this is a duplicate curation for the same item, set fees to 0
      if (!isFirstCuration && itemKey) {
        curationFee = 0;
        creationFeeAmount = 0;
      } else if (itemKey) {
        // Mark this item as curated
        curatedItems.add(itemKey);
      }

      // Always create the curation detail (even with 0 fees for duplicates)
      // But only add to totals if it has fees
      const curationDetail: CurationDetail = {
        timestamp: curation.timestamp,
        txHash: curation.txHash,
        collectionId: curation.collection.id,
        collectionName: curation.collection.name,
        itemId: itemId,
        itemName: itemName,
        creationFee: creationFeeAmount,
        curatorFee: curationFee
      };

      // Update curator totals - only count curations with fees
      const existing = curatorFees.get(curatorId);
      if (existing) {
        if (curationFee > 0) {
          existing.totalFees += curationFee;
          existing.curationCount += 1;
        }
        // Always add to curations list (even if 0 fee)
        existing.curations.push(curationDetail);
      } else {
        curatorFees.set(curatorId, {
          curatorId,
          curatorName: curatorInfo.name,
          paymentAddress: curatorInfo.paymentAddress,
          totalFees: curationFee > 0 ? curationFee : 0,
          curationCount: curationFee > 0 ? 1 : 0,
          curations: [curationDetail]
        });
      }
    });

    const finalSummaries = Array.from(curatorFees.values())
      .filter((summary) => summary.totalFees > 0)
      .sort((a, b) => b.totalFees - a.totalFees);

    // Log summary statistics
    console.log('\n========== ITEM ID EXTRACTION SUMMARY ==========');
    console.log(`Total curations processed: ${sortedCurations.length}`);
    console.log(`Unique transactions: ${curationsByTx.size}`);
    console.log(`Transactions with item ID data: ${itemIdMap.size}`);
    console.log(`Total item IDs extracted from logs: ${totalItemIdsExtracted}`);
    console.log(`Item ID queues created: ${itemIdQueues.size}`);
    console.log(`\nCuration matching results:`);
    console.log(`  ✓ Curations with item ID: ${curationsWithItemId} (${((curationsWithItemId / sortedCurations.length) * 100).toFixed(1)}%)`);
    console.log(`  ✗ Curations without item ID: ${curationsWithoutItemId} (${((curationsWithoutItemId / sortedCurations.length) * 100).toFixed(1)}%)`);
    console.log(`    - Curations where tx had data but collection didn't match: ${curationsWithTxData}`);
    console.log(`    - Curations where tx had no data: ${curationsWithoutTxData}`);
    
    if (collectionMismatches.size > 0) {
      console.log(`\nCollection address mismatches (sample of first 5):`);
      let count = 0;
      for (const [txHash, mismatch] of collectionMismatches.entries()) {
        if (count++ >= 5) break;
        console.log(`  Tx ${txHash}:`);
        console.log(`    Looking for: ${mismatch.lookingFor}`);
        console.log(`    Found in logs: ${mismatch.found.slice(0, 3).join(', ')}${mismatch.found.length > 3 ? '...' : ''}`);
      }
    }
    
    const uniqueCollectionsNeeded = new Set(sortedCurations.map(c => c.collection.id.toLowerCase()));
    const uniqueCollectionsFound = new Set<string>();
    itemIdMap.forEach((txItemMap) => {
      txItemMap.forEach((_, collectionId) => {
        uniqueCollectionsFound.add(collectionId);
      });
    });
    
    const matchingCollections = Array.from(uniqueCollectionsNeeded).filter(c => uniqueCollectionsFound.has(c));
    console.log(`\nCollection address matching:`);
    console.log(`  Collections needed: ${uniqueCollectionsNeeded.size}`);
    console.log(`  Collections found in logs: ${uniqueCollectionsFound.size}`);
    console.log(`  Matching collections: ${matchingCollections.length} (${((matchingCollections.length / uniqueCollectionsNeeded.size) * 100).toFixed(1)}%)`);
    
    console.log('================================================\n');

    return finalSummaries;
  }, [convertBigNumberToEther]);

  useEffect(() => {
    const fetchAndCalculateFees = async () => {
      setLoading(true);
      onLoadingChange(true);
      setError(null);

      try {
        console.log("Fetching curations for date range:", dateRange);
        const response = await fetchAllCurations(dateRange);
        console.log("GraphQL response:", response);
        const curatorSummaries = await processCurations(response.data.curations);
        console.log("Processed curator summaries:", curatorSummaries);
        onFeesCalculated(curatorSummaries);
      } catch (err) {
        console.error("Error fetching curations:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch curation data";
        setError(errorMessage);
        onFeesCalculated([]);
      } finally {
        setLoading(false);
        onLoadingChange(false);
      }
    };

    fetchAndCalculateFees();
  }, [dateRange, onFeesCalculated, onLoadingChange, processCurations]);

  if (loading) {
    return (
      <div className="loading">
        <p>Loading curation data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error">
        <p>Error: {error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return null;
}
