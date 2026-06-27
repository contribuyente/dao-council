const DECENTRALAND_COLLECTIONS_SUBGRAPH =
  "https://subgraph.decentraland.org/collections-matic-mainnet";

export const onRequest: PagesFunction = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        Allow: "POST, OPTIONS",
      },
    });
  }

  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      {
        status: 405,
        headers: {
          Allow: "POST, OPTIONS",
        },
      }
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return Response.json(
      { error: "Expected application/json request body" },
      { status: 415 }
    );
  }

  const upstreamResponse = await fetch(DECENTRALAND_COLLECTIONS_SUBGRAPH, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: await request.text(),
  });

  const headers = new Headers({
    "Cache-Control": "no-store",
  });
  const upstreamContentType = upstreamResponse.headers.get("content-type");
  if (upstreamContentType) {
    headers.set("Content-Type", upstreamContentType);
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
};
