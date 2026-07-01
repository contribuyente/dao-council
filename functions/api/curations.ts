import {
  generateCurationsReport,
  type CurationsReport,
} from '../../server/curations';
import type { PolygonRpcEnv } from '../../server/polygonRpc';

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
    const report = await generateCurationsReport({
      env,
      fromTimestamp,
      toTimestamp,
    });

    return Response.json(
      report satisfies CurationsReport,
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
