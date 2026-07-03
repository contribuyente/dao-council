import { useEffect, useMemo, useState } from 'react';
import { formatEther } from 'viem';
import {
  ETHEREUM_CHAIN_ID,
  MANA_TOKEN_ADDRESS,
} from '../payments';
import type { SafeConnection } from '../useSafeConnection';

const POLYGON_CHAIN_ID = 137;
const GAS_TANK_EOA = '0xd9030810ecb1db2d614fe0981369c87f41d4c419';
const NATIVE_POL_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const DEFAULT_REFILL_SAFE_ADDRESS = '0x184e4D9A26Add0aF1eAfC145550E890a421f16d7';
const DEFAULT_SELL_AMOUNT = '10000';
const GAS_TANK_POLYGONSCAN_URL = `https://polygonscan.com/address/${GAS_TANK_EOA}`;
const LOW_BALANCE_THRESHOLD_WEI = 100n * 10n ** 18n;

type BalanceStatus = 'loading' | 'ready' | 'error';

type JsonRpcResponse<Result> = {
  result?: Result;
  error?: {
    message?: string;
  };
};

export function GasTank({ safeInfo, safeAppStatus }: SafeConnection) {
  const [balanceWei, setBalanceWei] = useState<bigint | null>(null);
  const [balanceStatus, setBalanceStatus] =
    useState<BalanceStatus>('loading');
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const isSafeApp = safeAppStatus === 'connected' && Boolean(safeInfo);
  const refillSafeAddress = safeInfo?.safeAddress ?? DEFAULT_REFILL_SAFE_ADDRESS;
  const refillUrl = useMemo(
    () => buildRefillUrl(refillSafeAddress, isSafeApp),
    [isSafeApp, refillSafeAddress]
  );
  const balanceLabel =
    balanceWei === null
      ? balanceStatus === 'error'
        ? 'Unavailable'
        : 'Loading...'
      : formatPolAmount(balanceWei);
  const isLowBalance =
    balanceStatus === 'ready' &&
    balanceWei !== null &&
    balanceWei < LOW_BALANCE_THRESHOLD_WEI;

  useEffect(() => {
    let isMounted = true;

    fetchGasTankBalance()
      .then((nextBalanceWei) => {
        if (!isMounted) {
          return;
        }

        setBalanceWei(nextBalanceWei);
        setBalanceStatus('ready');
      })
      .catch((err) => {
        if (!isMounted) {
          return;
        }

        setBalanceWei(null);
        setBalanceStatus('error');
        setBalanceError(
          err instanceof Error
            ? err.message
            : 'Could not load gas tank balance.'
        );
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleRefill = () => {
    window.location.assign(refillUrl);
  };

  const isCheckingSafe = safeAppStatus === 'checking';

  return (
    <section className="gas-tank">
      <div className="council-panel gas-tank-panel">
        <div className="council-panel-header gas-tank-header">
          <div>
            <h2>Gas Tank</h2>
            <p>
              Monitor the Polygon Gas Tank used to pay for meta-transactions.
            </p>
          </div>

          <div
            className={`gas-balance-card ${balanceStatus} ${
              isLowBalance ? 'low-balance' : ''
            }`}
            aria-live="polite"
          >
            <strong className="gas-balance-value">{balanceLabel}</strong>
            <button
              type="button"
              className="copy-button"
              onClick={handleRefill}
              disabled={isCheckingSafe}
            >
              {isCheckingSafe ? 'Checking Safe...' : 'Refill'}
            </button>
          </div>
        </div>

        {balanceError && (
          <p className="safe-tx-message safe-tx-error gas-tank-error">
            {balanceError}
          </p>
        )}

        <div className="report-summary gas-tank-summary">
          <div className="summary-stats gas-tank-stats">
            <div className="stat">
              <span className="stat-label">Gas Tank Address:</span>
              <span className="address-with-link">
                <span className="stat-value mono-value">{GAS_TANK_EOA}</span>
                <a
                  href={GAS_TANK_POLYGONSCAN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="open-address-link"
                  aria-label="Open gas tank address on Polygonscan"
                  title="Open on Polygonscan"
                >
                  ↗
                </a>
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Refill Route:</span>
              <span className="stat-value">Ethereum MANA to Polygon POL</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function buildRefillUrl(safeAddress: string, isSafeApp: boolean) {
  const cowUrl =
    `https://swap.cow.fi/#/${ETHEREUM_CHAIN_ID}/swap/${MANA_TOKEN_ADDRESS}/${NATIVE_POL_ADDRESS}` +
    `?recipient=${GAS_TANK_EOA}&sellAmount=${DEFAULT_SELL_AMOUNT}&targetChainId=${POLYGON_CHAIN_ID}`;

  if (isSafeApp) {
    return cowUrl;
  }

  return `https://app.safe.global/apps/open?${new URLSearchParams({
    safe: `eth:${safeAddress}`,
    appUrl: cowUrl,
  }).toString()}`;
}

async function fetchGasTankBalance() {
  const response = await fetch('/api/polygon-rpc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'gas-tank-balance',
      method: 'eth_getBalance',
      params: [GAS_TANK_EOA, 'latest'],
    }),
  });
  const data = (await response.json()) as JsonRpcResponse<string>;

  if (!response.ok || data.error) {
    throw new Error(data.error?.message ?? 'Could not load gas tank balance.');
  }

  if (typeof data.result !== 'string' || !/^0x[0-9a-fA-F]+$/.test(data.result)) {
    throw new Error('Gas tank balance response was invalid.');
  }

  return BigInt(data.result);
}

function formatPolAmount(balanceWei: bigint) {
  const balance = Number(formatEther(balanceWei));

  return `${balance.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} POL`;
}
