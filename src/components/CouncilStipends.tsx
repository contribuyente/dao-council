import { useCallback, useEffect, useMemo, useState } from 'react';
import { isAddress } from 'viem';
import { councilMembers } from '../councilMembers';
import {
  formatManaAmount,
  type PaymentRecipient,
} from '../payments';
import { PaymentActionStatus } from '../PaymentActionStatus';
import { useSafePaymentAction } from '../useSafePaymentAction';
import type { SafeConnection } from '../useSafeConnection';

const DEFAULT_STIPEND_USD = '1000';

type ManaPrice = {
  usd: number;
  lastUpdatedAt: number | null;
  source: string;
};

type ManaPriceResponse = ManaPrice | { error: string };

type PriceStatus = 'loading' | 'ready' | 'error';

export function CouncilStipends({ safeInfo, safeAppStatus }: SafeConnection) {
  const [members, setMembers] = useState(councilMembers);
  const [stipendUsd, setStipendUsd] = useState(DEFAULT_STIPEND_USD);
  const [manaPrice, setManaPrice] = useState<ManaPrice | null>(null);
  const [priceStatus, setPriceStatus] = useState<PriceStatus>('loading');
  const [priceError, setPriceError] = useState<string | null>(null);

  const stipendUsdValue = Number(stipendUsd);
  const hasValidStipend = Number.isFinite(stipendUsdValue) && stipendUsdValue > 0;
  const manaPerMember =
    manaPrice && hasValidStipend ? stipendUsdValue / manaPrice.usd : 0;
  const totalMana = manaPerMember * members.length;
  const totalUsd = hasValidStipend ? stipendUsdValue * members.length : 0;
  const invalidAddressNames = members
    .filter((member) => !isAddress(member.address))
    .map((member) => member.name);

  const payments = useMemo<PaymentRecipient[]>(
    () =>
      members.map((member) => ({
        name: member.name,
        address: member.address,
        amountMana: manaPerMember,
      })),
    [manaPerMember, members]
  );

  const {
    safeTxHash,
    safeTxError,
    isCreatingSafeTx,
    actionButtonLabel,
    handlePaymentAction,
  } = useSafePaymentAction(payments, {
    safeInfo,
    safeAppStatus,
  });

  const loadManaPrice = useCallback(async () => {
    setPriceStatus('loading');
    setPriceError(null);

    try {
      const data = await fetchManaPrice();
      setManaPrice(data);
      setPriceStatus('ready');
    } catch (err) {
      setManaPrice(null);
      setPriceStatus('error');
      setPriceError(
        err instanceof Error ? err.message : 'Could not load MANA price.'
      );
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    fetchManaPrice()
      .then((data) => {
        if (!isMounted) {
          return;
        }

        setManaPrice(data);
        setPriceStatus('ready');
      })
      .catch((err) => {
        if (!isMounted) {
          return;
        }

        setManaPrice(null);
        setPriceStatus('error');
        setPriceError(
          err instanceof Error ? err.message : 'Could not load MANA price.'
        );
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const updateMemberAddress = (index: number, address: string) => {
    setMembers((currentMembers) =>
      currentMembers.map((member, memberIndex) =>
        memberIndex === index ? { ...member, address } : member
      )
    );
  };

  const hasInvalidPaymentDetails =
    priceStatus !== 'ready' ||
    !manaPrice ||
    !hasValidStipend ||
    invalidAddressNames.length > 0;

  const paymentButtonLabel = (() => {
    if (!hasValidStipend) {
      return 'Enter Stipend';
    }

    if (priceStatus === 'loading') {
      return 'Loading Price...';
    }

    if (priceStatus === 'error') {
      return 'Price Unavailable';
    }

    if (invalidAddressNames.length > 0) {
      return 'Fix Addresses';
    }

    return actionButtonLabel;
  })();

  return (
    <section className="council-stipends">
      <div className="council-panel">
        <div className="council-panel-header">
          <div>
            <h2>Council Stipends</h2>
            <p>
              Create monthly Ethereum MANA payments for DAO Council members.
            </p>
          </div>
        </div>

        <div className="council-controls">
          <label className="field-group">
            <span>Monthly stipend per member (USD)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={stipendUsd}
              onChange={(event) => setStipendUsd(event.target.value)}
            />
          </label>

          <div className="mana-price-card">
            <div>
              <span className="price-label">Current MANA price</span>
              <strong className="price-value">
                {manaPrice ? formatUsd(manaPrice.usd, 6) : 'Loading...'}
              </strong>
              <span className="price-meta">
                {manaPrice
                  ? `${manaPrice.source}${formatPriceTimestamp(manaPrice.lastUpdatedAt)}`
                  : priceError ?? 'Fetching price'}
              </span>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={loadManaPrice}
              disabled={priceStatus === 'loading'}
            >
              Refresh
            </button>
          </div>
        </div>

        {priceError && (
          <p className="safe-tx-message safe-tx-error council-error">
            {priceError}
          </p>
        )}

        <div className="report-summary council-summary">
          <div className="summary-stats">
            <div className="stat">
              <span className="stat-label">Council Members:</span>
              <span className="stat-value">{members.length}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Per Member:</span>
              <span className="stat-value">
                {manaPrice && hasValidStipend
                  ? formatManaAmount(manaPerMember, 4)
                  : 'Waiting for price'}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Total Payment:</span>
              <span className="stat-value">
                {manaPrice && hasValidStipend
                  ? formatManaAmount(totalMana, 4)
                  : 'Waiting for price'}
              </span>
            </div>
          </div>
          <div className="safe-action">
            <button
              onClick={handlePaymentAction}
              className="copy-button"
              disabled={
                hasInvalidPaymentDetails ||
                isCreatingSafeTx ||
                safeAppStatus === 'checking'
              }
            >
              {paymentButtonLabel}
            </button>
            <PaymentActionStatus
              safeTxHash={safeTxHash}
              safeTxError={safeTxError}
            />
          </div>
        </div>

        <div className="council-table">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Payment Address</th>
                <th>USD</th>
                <th>MANA</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member, index) => {
                const isValidAddress = isAddress(member.address);

                return (
                  <tr key={member.name}>
                    <td data-label="Member">{member.name}</td>
                    <td data-label="Payment Address">
                      <input
                        className={`address-input ${isValidAddress ? '' : 'input-error'}`}
                        value={member.address}
                        spellCheck={false}
                        onChange={(event) =>
                          updateMemberAddress(index, event.target.value)
                        }
                        aria-label={`${member.name} payment address`}
                      />
                      {!isValidAddress && (
                        <span className="field-error">Invalid address</span>
                      )}
                    </td>
                    <td data-label="USD">
                      {hasValidStipend ? formatUsd(stipendUsdValue) : 'Invalid'}
                    </td>
                    <td data-label="MANA">
                      {manaPrice && hasValidStipend
                        ? formatManaAmount(manaPerMember, 4)
                        : 'Waiting for price'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="council-total-note">
          Total stipend value: {formatUsd(totalUsd)} across {members.length} members.
        </p>
      </div>
    </section>
  );
}

function formatUsd(amount: number, maximumFractionDigits = 2) {
  return amount.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits,
  });
}

async function fetchManaPrice(): Promise<ManaPrice> {
  const response = await fetch('/api/mana-price');
  const data = (await response.json()) as ManaPriceResponse;

  if (!response.ok || 'error' in data) {
    throw new Error('error' in data ? data.error : 'Could not load MANA price.');
  }

  if (!Number.isFinite(data.usd) || data.usd <= 0) {
    throw new Error('MANA price response was invalid.');
  }

  return data;
}

function formatPriceTimestamp(timestamp: number | null) {
  if (!timestamp) {
    return '';
  }

  const updatedAt = new Date(timestamp * 1000);
  return ` updated ${updatedAt.toLocaleString()}`;
}
