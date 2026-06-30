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
}: {
  fetcher: Fetcher;
  endpoint?: string;
  fromTimestamp: number;
  toTimestamp: number;
}): Promise<CurationsResponse> {
  let allCurations: Curation[] = [];
  let skip = 0;

  while (true) {
    const response = await fetchCurationsPage({
      fetcher,
      endpoint,
      fromTimestamp,
      toTimestamp,
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
  skip,
}: {
  fetcher: Fetcher;
  endpoint: string;
  fromTimestamp: number;
  toTimestamp: number;
  skip: number;
}): Promise<CurationsResponse> {
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: buildCurationsQuery({ fromTimestamp, toTimestamp, skip }),
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
  skip,
}: {
  fromTimestamp: number;
  toTimestamp: number;
  skip: number;
}) {
  return `
    {
      curations(
        orderBy: timestamp,
        orderDirection: asc,
        skip: ${skip},
        first: ${CURATIONS_PAGE_SIZE},
        where: {
          timestamp_gte: ${fromTimestamp},
          timestamp_lte: ${toTimestamp}
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
          items {
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
