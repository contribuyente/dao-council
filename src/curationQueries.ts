import type { Curation, CurationsResponse } from './types';

export const DECENTRALAND_COLLECTIONS_SUBGRAPH =
  'https://subgraph.decentraland.org/collections-matic-mainnet';

const CURATIONS_PAGE_SIZE = 1000;

type Fetcher = typeof fetch;

export async function fetchAllCurationsFromSubgraph({
  fetcher,
  endpoint = DECENTRALAND_COLLECTIONS_SUBGRAPH,
  fromTimestamp,
  toTimestamp,
  collectionIds,
}: {
  fetcher: Fetcher;
  endpoint?: string;
  fromTimestamp: number;
  toTimestamp: number;
  collectionIds?: string[];
}): Promise<CurationsResponse> {
  let allCurations: Curation[] = [];
  let skip = 0;

  while (true) {
    const response = await fetchCurationsPage({
      fetcher,
      endpoint,
      fromTimestamp,
      toTimestamp,
      collectionIds,
      skip,
    });
    const curations = response.data.curations;

    if (curations.length === 0) {
      break;
    }

    allCurations = [...allCurations, ...curations];

    if (curations.length < CURATIONS_PAGE_SIZE) {
      break;
    }

    skip += CURATIONS_PAGE_SIZE;
  }

  return {
    data: {
      curations: allCurations,
    },
  };
}

async function fetchCurationsPage({
  fetcher,
  endpoint,
  fromTimestamp,
  toTimestamp,
  collectionIds,
  skip,
}: {
  fetcher: Fetcher;
  endpoint: string;
  fromTimestamp: number;
  toTimestamp: number;
  collectionIds?: string[];
  skip: number;
}): Promise<CurationsResponse> {
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: buildCurationsQuery({
        fromTimestamp,
        toTimestamp,
        collectionIds,
        skip,
      }),
      variables: null,
    }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.statusText}`);
  }

  return response.json();
}

function buildCurationsQuery({
  fromTimestamp,
  toTimestamp,
  collectionIds,
  skip,
}: {
  fromTimestamp: number;
  toTimestamp: number;
  collectionIds?: string[];
  skip: number;
}) {
  const whereFilters = [
    `timestamp_gte: ${fromTimestamp}`,
    `timestamp_lte: ${toTimestamp}`,
  ];

  if (collectionIds && collectionIds.length > 0) {
    whereFilters.push(
      `collection_in: ${JSON.stringify(
        Array.from(new Set(collectionIds.map((id) => id.toLowerCase())))
      )}`
    );
  }

  return `
    {
      curations(
        orderBy: timestamp,
        orderDirection: asc,
        skip: ${skip},
        first: ${CURATIONS_PAGE_SIZE},
        where: {
          ${whereFilters.join(',\n          ')}
        }
      ) {
        timestamp
        txHash
        curator {
          id
        }
        collection {
          id
          createdAt
          itemsCount
          name
          items(first: 1000) {
            blockchainId
            creationFee
            metadata {
              wearable {
                name
              }
              emote {
                name
              }
            }
          }
          isApproved
        }
      }
    }
  `;
}
