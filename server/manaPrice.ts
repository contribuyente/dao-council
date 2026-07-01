export type CoinGeckoSimplePriceResponse = {
  decentraland?: {
    usd?: number;
    last_updated_at?: number;
  };
};

export type CoinbaseSpotPriceResponse = {
  data?: {
    amount?: string;
    base?: string;
    currency?: string;
  };
};

export type ManaPrice = {
  usd: number;
  lastUpdatedAt: number | null;
  source: string;
};

const COINBASE_PRICE_URL = 'https://api.coinbase.com/v2/prices/MANA-USD/spot';
const COINGECKO_PRICE_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=decentraland&vs_currencies=usd&include_last_updated_at=true';

export async function fetchManaPrice(): Promise<ManaPrice> {
  const providers = [fetchCoinbasePrice, fetchCoinGeckoPrice];

  for (const fetchProvider of providers) {
    try {
      return await fetchProvider();
    } catch {
      // Try the next provider. Some public price APIs block Cloudflare egress.
    }
  }

  throw new Error('Could not fetch MANA price.');
}

async function fetchCoinbasePrice(): Promise<ManaPrice> {
  const response = await fetch(COINBASE_PRICE_URL, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Coinbase price request failed.');
  }

  const data = (await response.json()) as CoinbaseSpotPriceResponse;
  const usd = Number(data.data?.amount);

  if (!Number.isFinite(usd) || usd <= 0) {
    throw new Error('Coinbase price response was invalid.');
  }

  return {
    usd,
    lastUpdatedAt: null,
    source: 'Coinbase',
  };
}

async function fetchCoinGeckoPrice(): Promise<ManaPrice> {
  const response = await fetch(COINGECKO_PRICE_URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'dao-council/1.0',
    },
  });

  if (!response.ok) {
    throw new Error('CoinGecko price request failed.');
  }

  const data = (await response.json()) as CoinGeckoSimplePriceResponse;
  const usd = data.decentraland?.usd;

  if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) {
    throw new Error('CoinGecko price response was invalid.');
  }

  return {
    usd,
    lastUpdatedAt: data.decentraland?.last_updated_at ?? null,
    source: 'CoinGecko',
  };
}
