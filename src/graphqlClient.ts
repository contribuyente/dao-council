import { Curation, CurationsResponse, DateRange } from "./types";

const GRAPHQL_ENDPOINT = "/api/graphql";

export async function fetchCurations(
  dateRange: DateRange,
  skip: number = 0
): Promise<CurationsResponse> {
  const fromTimestamp = Math.floor(dateRange.from.getTime() / 1000);
  const toTimestamp = Math.floor(dateRange.to.getTime() / 1000);

  const body = JSON.stringify({
    query: `
      {
        curations(
          orderBy: timestamp,
          orderDirection: asc,
          skip: ${skip},
          first: 1000,
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
    `,
    variables: null,
  });

  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: body,
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchAllCurations(
  dateRange: DateRange
): Promise<CurationsResponse> {
  let allCurations: Curation[] = [];
  let skip = 0;
  const batchSize = 1000;

  while (true) {
    const response = await fetchCurations(dateRange, skip);
    const curations = response.data.curations;

    if (curations.length === 0) {
      break;
    }

    allCurations = [...allCurations, ...curations];

    if (curations.length < batchSize) {
      break;
    }

    skip += batchSize;
  }

  return {
    data: {
      curations: allCurations,
    },
  };
}
