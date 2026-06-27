import { createPublicClient, http } from 'viem';
import { polygon } from 'viem/chains';

// Create a public client for Polygon
const publicClient = createPublicClient({
  chain: polygon,
  transport: http('https://polygon-rpc.com'),
});

// ERC721 Transfer event signature: Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
// Signature: keccak256("Transfer(address,address,uint256)")
const TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Curation event signature (appears to be the actual event emitted during curation)
// This signature appears frequently in curation transactions with collection addresses
const CURATION_EVENT_SIGNATURE = '0x87a972ab2db2d47a0bbefe72cefc4fe5a38b1b9d2bc4b9f366b59fdb6dbd9581';

/**
 * Fetches transaction receipt and extracts item IDs from Transfer events
 * Collection contracts are ERC721, so when items are curated, Transfer events are emitted
 * @param txHash Transaction hash to fetch logs for
 * @returns Map of collection address (lowercase) to array of item IDs found in the transaction
 */
export async function extractItemIdsFromTx(txHash: `0x${string}`): Promise<Map<string, string[]>> {
  try {
    console.log(`[extractItemIdsFromTx] Fetching receipt for tx: ${txHash}`);
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    console.log(`[extractItemIdsFromTx] Got receipt for ${txHash}, logs count: ${receipt.logs.length}`);
    console.log(`[extractItemIdsFromTx] Expected Transfer signature: ${TRANSFER_EVENT_SIGNATURE}`);
    
    // Map to store collection -> itemIds
    const collectionItemMap = new Map<string, string[]>();
    
    let transferEventCount = 0;
    const seenSignatures = new Set<string>();
    
    // Iterate through logs to find Transfer events
    for (let i = 0; i < receipt.logs.length; i++) {
      const log = receipt.logs[i];
      const firstTopic = log.topics[0]?.toLowerCase();
      
      // Track unique event signatures we see
      if (firstTopic && !seenSignatures.has(firstTopic)) {
        seenSignatures.add(firstTopic);
        console.log(`[extractItemIdsFromTx] Found event signature in log ${i}: ${firstTopic} (address: ${log.address})`);
      }
      
      const isTransferEvent = firstTopic === TRANSFER_EVENT_SIGNATURE.toLowerCase();
      const isCurationEvent = firstTopic === CURATION_EVENT_SIGNATURE.toLowerCase();
      
      if (isTransferEvent && log.topics.length >= 4 && log.topics[3]) {
        transferEventCount++;
        // Transfer event has 4 topics: [signature, from, to, tokenId]
        // Topics are 32 bytes each, so we need to extract the tokenId from topics[3]
        const tokenId = BigInt(log.topics[3]);
        const collectionAddress = log.address.toLowerCase();
        
        console.log(`[extractItemIdsFromTx] ✓ Found Transfer event in ${txHash}: collection=${collectionAddress}, itemId=${tokenId.toString()}`);
        
        // Add to map
        if (!collectionItemMap.has(collectionAddress)) {
          collectionItemMap.set(collectionAddress, []);
        }
        collectionItemMap.get(collectionAddress)!.push(tokenId.toString());
      } else if (isCurationEvent) {
        // Curation event - the collection address is the log address
        // The item ID might be in topics[1] or topics[2] depending on event structure
        // Common patterns: ItemCuration(address indexed collection, uint256 indexed itemId, ...)
        // or similar where itemId is indexed
        const collectionAddress = log.address.toLowerCase();
        let itemId: string | null = null;
        
        // Log full event structure for debugging
        console.log(`[extractItemIdsFromTx] Found Curation event in ${txHash}:`);
        console.log(`  Collection address: ${collectionAddress}`);
        console.log(`  Topics count: ${log.topics.length}`);
        console.log(`  Topics:`, log.topics.map((t, i) => `[${i}]: ${t}`));
        console.log(`  Data length: ${log.data?.length || 0}, data: ${log.data?.slice(0, 100)}...`);
        
        // Try to extract item ID from topics
        // If it's ItemCuration(collection, itemId, curator), itemId might be in topics[2]
        // If it's ItemCuration(itemId, ...), itemId might be in topics[1]
        if (log.topics.length >= 3 && log.topics[2]) {
          // Try topics[2] first (common pattern for indexed uint256 in position 2)
          itemId = BigInt(log.topics[2]).toString();
          console.log(`  Extracted itemId from topics[2]: ${itemId}`);
        } else if (log.topics.length >= 2 && log.topics[1]) {
          // Try topics[1] as fallback
          itemId = BigInt(log.topics[1]).toString();
          console.log(`  Extracted itemId from topics[1]: ${itemId}`);
        } else if (log.data && log.data !== '0x' && log.data.length >= 66) {
          // If itemId is not indexed, it might be in the data field
          // For a uint256, it would be the first 32 bytes (64 hex chars after 0x)
          const dataHex = log.data.slice(2, 66); // First 32 bytes
          if (dataHex) {
            itemId = BigInt('0x' + dataHex).toString();
            console.log(`  Extracted itemId from data field: ${itemId}`);
          }
        }
        
        if (itemId) {
          transferEventCount++; // Count as found event
          console.log(`[extractItemIdsFromTx] ✓ Successfully extracted from Curation event: collection=${collectionAddress}, itemId=${itemId}`);
          
          // Add to map
          if (!collectionItemMap.has(collectionAddress)) {
            collectionItemMap.set(collectionAddress, []);
          }
          collectionItemMap.get(collectionAddress)!.push(itemId);
        } else {
          console.log(`[extractItemIdsFromTx] ⚠ Found Curation event but couldn't extract itemId`);
        }
      } else if (log.topics.length >= 4 && firstTopic) {
        // Log if we see events with 4 topics that aren't Transfer
        console.log(`[extractItemIdsFromTx] Event with 4 topics but not Transfer: signature=${firstTopic}, address=${log.address}`);
      }
    }
    
    console.log(`[extractItemIdsFromTx] Total events found (Transfer + Curation) in ${txHash}: ${transferEventCount}`);
    console.log(`[extractItemIdsFromTx] Collection-item map for ${txHash}:`, 
      Array.from(collectionItemMap.entries()).map(([addr, ids]) => `${addr}: [${ids.join(', ')}]`));
    
    return collectionItemMap;
  } catch (error) {
    console.error(`[extractItemIdsFromTx] Error fetching transaction receipt for ${txHash}:`, error);
    return new Map();
  }
}

/**
 * Fetches item IDs for multiple transactions and returns a map
 * @param txHashes Array of transaction hashes
 * @returns Map of txHash -> (collection address -> itemIds[])
 */
export async function extractItemIdsFromTxs(
  txHashes: `0x${string}`[]
): Promise<Map<string, Map<string, string[]>>> {
  console.log(`[extractItemIdsFromTxs] Processing ${txHashes.length} unique transactions`);
  const result = new Map<string, Map<string, string[]>>();
  
  // Statistics for summary
  let totalTransferEvents = 0;
  let transactionsWithTransferEvents = 0;
  let transactionsWithNoLogs = 0;
  let transactionsWithErrors = 0;
  
  // Process in batches to avoid rate limiting
  const batchSize = 10;
  for (let i = 0; i < txHashes.length; i += batchSize) {
    const batch = txHashes.slice(i, i + batchSize);
    const promises = batch.map(async (txHash) => {
      try {
        const itemMap = await extractItemIdsFromTx(txHash);
        
        // Collect stats (we'll get detailed stats from the individual function logs)
        let txTransferCount = 0;
        let txHasLogs = false;
        itemMap.forEach((itemIds) => {
          txTransferCount += itemIds.length;
          txHasLogs = true;
        });
        
        if (txTransferCount > 0) {
          transactionsWithTransferEvents++;
          totalTransferEvents += txTransferCount;
        } else if (txHasLogs) {
          transactionsWithNoLogs++;
        }
        
        return { txHash, itemMap };
      } catch {
        transactionsWithErrors++;
        return { txHash, itemMap: new Map<string, string[]>() };
      }
    });
    
    const batchResults = await Promise.all(promises);
    batchResults.forEach(({ txHash, itemMap }) => {
      result.set(txHash, itemMap);
    });
    
    // Small delay between batches to avoid rate limiting
    if (i + batchSize < txHashes.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  console.log(`\n========== TRANSACTION LOGS EXTRACTION SUMMARY ==========`);
  console.log(`Total transactions processed: ${txHashes.length}`);
  console.log(`Transactions with Transfer events: ${transactionsWithTransferEvents}`);
  console.log(`Total Transfer events found: ${totalTransferEvents}`);
  console.log(`Transactions with logs but no Transfer events: ${transactionsWithNoLogs}`);
  console.log(`Transactions with errors: ${transactionsWithErrors}`);
  console.log(`Transactions with item ID data: ${result.size}`);
  console.log('==========================================================\n');
  
  return result;
}
