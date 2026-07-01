import { fetchManaPrice } from '../../server/manaPrice';

export const onRequestGet: PagesFunction = async () => {
  try {
    const price = await fetchManaPrice();

    return Response.json(
      price,
      {
        headers: {
          'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch {
    return Response.json(
      { error: 'Could not fetch MANA price.' },
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
