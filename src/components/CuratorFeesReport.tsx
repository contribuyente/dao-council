import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import SafeAppsSDK, { type BaseTransaction, type SafeInfoExtended } from '@safe-global/safe-apps-sdk';
import { encodeFunctionData, isAddress, parseEther, type Address } from 'viem';
import { CuratorFeesSummary, DateRange } from '../types';

const MANA_TOKEN_ADDRESS = '0x0F5D2fB29fb7d3CFeE444a200298f468908cC942';
const SAFE_APP_TIMEOUT_MS = 2000;
const ERC20_TRANSFER_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

type SafeAppStatus = 'checking' | 'connected' | 'unavailable';

interface CuratorFeesReportProps {
  fees: CuratorFeesSummary[];
  dateRange: DateRange;
  isLoading: boolean;
}

export function CuratorFeesReport({ fees, isLoading }: CuratorFeesReportProps) {
  const [expandedCurator, setExpandedCurator] = useState<string | null>(null);
  const [safeInfo, setSafeInfo] = useState<SafeInfoExtended | null>(null);
  const [safeAppStatus, setSafeAppStatus] = useState<SafeAppStatus>('checking');
  const [isCreatingSafeTx, setIsCreatingSafeTx] = useState(false);
  const [safeTxHash, setSafeTxHash] = useState<string | null>(null);
  const [safeTxError, setSafeTxError] = useState<string | null>(null);
  const [csvCopyMessage, setCsvCopyMessage] = useState<string | null>(null);
  
  const totalFees = fees.reduce((sum, curator) => sum + curator.totalFees, 0);
  const totalCurations = fees.reduce((sum, curator) => sum + curator.curationCount, 0);
  const isSafeApp = safeAppStatus === 'connected';

  useEffect(() => {
    let isMounted = true;

    const loadSafeInfo = async () => {
      if (!isEmbedded()) {
        setSafeAppStatus('unavailable');
        return;
      }

      try {
        const sdk = new SafeAppsSDK();
        const info = await withTimeout(sdk.safe.getInfo(), SAFE_APP_TIMEOUT_MS);

        if (isMounted) {
          setSafeInfo(info);
          setSafeAppStatus('connected');
        }
      } catch {
        if (isMounted) {
          setSafeAppStatus('unavailable');
        }
      }
    };

    loadSafeInfo();

    return () => {
      isMounted = false;
    };
  }, []);

  const formatMANA = (amount: number) => {
    return `${Number(amount.toFixed(2)).toLocaleString()} MANA`;
  };

  const toggleCuratorExpansion = (curatorId: string) => {
    setExpandedCurator(expandedCurator === curatorId ? null : curatorId);
  };

  const getPolygonscanUrl = (txHash: string) => 
    `https://polygonscan.com/tx/${txHash}`;

  const getCollectionUrl = (collectionId: string) => 
    `https://decentraland.org/marketplace/collections/${collectionId}`;

  const getItemUrl = (collectionId: string, itemId: string | null) => {
    if (itemId) {
      return `https://decentraland.org/marketplace/contracts/${collectionId}/items/${itemId}`;
    }
    // Fallback to collection if itemId is not available
    return getCollectionUrl(collectionId);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(parseInt(timestamp) * 1000);
    return format(date, 'MMM dd, yyyy HH:mm');
  };

  const createSafeTransaction = async () => {
    setSafeTxHash(null);
    setSafeTxError(null);
    setCsvCopyMessage(null);

    if (!isEmbedded()) {
      setSafeTxError('Open this app from Safe Apps to create a multisig transaction.');
      return;
    }

    setIsCreatingSafeTx(true);

    try {
      const sdk = new SafeAppsSDK();
      const currentSafeInfo =
        safeInfo ?? (await withTimeout(sdk.safe.getInfo(), SAFE_APP_TIMEOUT_MS));

      if (currentSafeInfo.isReadOnly) {
        throw new Error('Connect to Safe as an owner to create this transaction.');
      }

      const txs = buildSafeTransactions(fees);
      const response = await sdk.txs.send({ txs });

      setSafeInfo(currentSafeInfo);
      setSafeAppStatus('connected');
      setSafeTxHash(response.safeTxHash);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create Safe transaction.';
      setSafeTxError(message);
    } finally {
      setIsCreatingSafeTx(false);
    }
  };

  const copyMultisigCSV = async () => {
    setSafeTxHash(null);
    setSafeTxError(null);
    setCsvCopyMessage(null);

    try {
      await navigator.clipboard.writeText(generateMultisigCSV(fees));
      setCsvCopyMessage('Multisig CSV copied to clipboard.');
    } catch {
      setSafeTxError('Could not copy CSV to clipboard.');
    }
  };

  const handlePaymentAction = () => {
    if (isSafeApp) {
      createSafeTransaction();
      return;
    }

    copyMultisigCSV();
  };

  const actionButtonLabel = (() => {
    if (isCreatingSafeTx) {
      return 'Creating Transaction...';
    }

    if (safeAppStatus === 'checking') {
      return 'Checking Safe...';
    }

    return isSafeApp ? 'Create Transaction' : 'Copy Multisig CSV';
  })();

  if (isLoading) {
    return (
      <div className="loading">
        <div className="loader"></div>
        <p>Loading curation data...</p>
      </div>
    );
  }

  if (fees.length === 0) {
    return (
      <div className="no-data">
        <p>No curator fees found for the selected date range.</p>
      </div>
    );
  }

  return (
    <div className="curator-fees-report">
      <div className="report-summary">
        <div className="summary-stats">
          <div className="stat">
            <span className="stat-label">Total Curators:</span>
            <span className="stat-value">{fees.length}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Total Curations:</span>
            <span className="stat-value">{totalCurations}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Total Fees:</span>
            <span className="stat-value">{formatMANA(totalFees)}</span>
          </div>
        </div>
        <div className="safe-action">
          <button
            onClick={handlePaymentAction}
            className="copy-button"
            disabled={isCreatingSafeTx || safeAppStatus === 'checking'}
          >
            {actionButtonLabel}
          </button>
          {safeAppStatus === 'unavailable' && (
            <p className="safe-tx-message safe-tx-hint">
              Open this app from Safe Apps to create the multisig transaction directly.
            </p>
          )}
          {safeInfo && (
            <p className="safe-tx-message">
              Safe connected: {shortAddress(safeInfo.safeAddress)}
            </p>
          )}
          {safeTxHash && (
            <p className="safe-tx-message safe-tx-success">
              Transaction created: {shortAddress(safeTxHash)}
            </p>
          )}
          {safeTxError && (
            <p className="safe-tx-message safe-tx-error">{safeTxError}</p>
          )}
          {csvCopyMessage && (
            <p className="safe-tx-message safe-tx-success">{csvCopyMessage}</p>
          )}
        </div>
      </div>

      <div className="fees-table">
        {/* Desktop/Tablet Table View */}
        <table>
          <thead>
            <tr>
              <th>Curator</th>
              <th>Payment Address</th>
              <th>Curations</th>
              <th>Total Fees</th>
            </tr>
          </thead>
          <tbody>
            {fees.map((curator) => (
              <React.Fragment key={curator.curatorId}>
                <tr 
                  className="curator-row" 
                  onClick={() => toggleCuratorExpansion(curator.curatorId)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="curator-name">
                    <span className="expand-icon">
                      {expandedCurator === curator.curatorId ? '▼' : '▶'}
                    </span>
                    {curator.curatorName}
                  </td>
                  <td className="payment-address">
                    <span className="address">{curator.paymentAddress}</span>
                  </td>
                  <td className="curation-count">{curator.curationCount}</td>
                  <td className="fees">{formatMANA(curator.totalFees)}</td>
                </tr>
                
                {expandedCurator === curator.curatorId && (
                  <tr>
                    <td colSpan={4} className="curator-details">
                      <div className="curations-list">
                        <h4>Curations ({curator.curationCount}) - Chronological Order</h4>
                        <div className="curations-table">
                          <div className="curation-header">
                            <span>Date</span>
                            <span>Collection</span>
                            <span>Creation Fee</span>
                            <span>Curator Fee</span>
                            <span>Transaction</span>
                          </div>
                          {curator.curations.map((curation, index) => (
                            <div 
                              key={`${curation.txHash}-${index}`} 
                              className={`curation-row ${curation.curatorFee === 0 ? 'curation-row-no-fee' : ''}`}
                            >
                              <span className="curation-date" data-label="Date: ">
                                {formatTimestamp(curation.timestamp)}
                              </span>
                              <span className="curation-collection" data-label="Collection: ">
                                <a 
                                  href={getItemUrl(curation.collectionId, curation.itemId)} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="collection-link"
                                >
                                  {curation.itemName || curation.collectionName}
                                </a>
                              </span>
                              <span className="curation-creation-fee" data-label="Creation Fee: ">
                                {formatMANA(curation.creationFee)}
                              </span>
                              <span className="curation-curator-fee" data-label="Curator Fee: ">
                                {formatMANA(curation.curatorFee)}
                              </span>
                              <span className="curation-tx" data-label="Transaction: ">
                                <a 
                                  href={getPolygonscanUrl(curation.txHash)} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="tx-link"
                                >
                                  View TX
                                </a>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {/* Mobile Card View */}
        <div className="mobile-curator-list">
          {fees.map((curator) => (
            <div key={`mobile-${curator.curatorId}`} className="mobile-curator-card">
              <div 
                className="mobile-curator-header"
                onClick={() => toggleCuratorExpansion(curator.curatorId)}
              >
                <div className="mobile-curator-info">
                  <div className="mobile-curator-name">
                    <span className="expand-icon">
                      {expandedCurator === curator.curatorId ? '▼' : '▶'}
                    </span>
                    {curator.curatorName}
                  </div>
                  <div className="mobile-curator-stats">
                    <span className="mobile-curator-address">{curator.paymentAddress}</span>
                    <span className="mobile-curator-fees">{formatMANA(curator.totalFees)}</span>
                  </div>
                  <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--secondary-text)' }}>
                    {curator.curationCount} curations
                  </div>
                </div>
              </div>
              
              {expandedCurator === curator.curatorId && (
                <div className="mobile-curator-details">
                  <h4 className="mobile-curations-header">
                    Curations ({curator.curationCount}) - Chronological Order
                  </h4>
                  {curator.curations.map((curation, index) => (
                    <div 
                      key={`mobile-${curation.txHash}-${index}`} 
                      className={`mobile-curation-item ${curation.curatorFee === 0 ? 'mobile-curation-item-no-fee' : ''}`}
                    >
                      <div className="mobile-curation-row">
                        <span className="mobile-curation-label">Date</span>
                        <span className="mobile-curation-value">
                          {formatTimestamp(curation.timestamp)}
                        </span>
                      </div>
                      <div className="mobile-curation-row">
                        <span className="mobile-curation-label">Collection</span>
                        <span className="mobile-curation-value">
                          <a 
                            href={getItemUrl(curation.collectionId, curation.itemId)} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="mobile-collection-link"
                          >
                            {curation.itemName || curation.collectionName}
                          </a>
                        </span>
                      </div>
                      <div className="mobile-curation-row">
                        <span className="mobile-curation-label">Creation Fee</span>
                        <span className="mobile-curation-value">
                          {formatMANA(curation.creationFee)}
                        </span>
                      </div>
                      <div className="mobile-curation-row">
                        <span className="mobile-curation-label">Curator Fee</span>
                        <span className="mobile-curation-value">
                          {formatMANA(curation.curatorFee)}
                        </span>
                      </div>
                      <div className="mobile-curation-row">
                        <span className="mobile-curation-label">Transaction</span>
                        <span className="mobile-curation-value">
                          <a 
                            href={getPolygonscanUrl(curation.txHash)} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="mobile-tx-link"
                          >
                            View TX
                          </a>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function generateMultisigCSV(fees: CuratorFeesSummary[]) {
  const rows = fees.map((curator) => {
    const totalAmountWei = parseEther(formatTokenAmount(curator.totalFees)).toString();
    return `erc20,${MANA_TOKEN_ADDRESS},${curator.paymentAddress},${totalAmountWei}`;
  });

  return ['token_type,token_address,receiver,amount', ...rows].join('\n');
}

function buildSafeTransactions(fees: CuratorFeesSummary[]): BaseTransaction[] {
  return fees.map((curator) => {
    if (!isAddress(curator.paymentAddress)) {
      throw new Error(`Invalid payment address for ${curator.curatorName}`);
    }

    return {
      to: MANA_TOKEN_ADDRESS,
      value: '0',
      data: encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [
          curator.paymentAddress as Address,
          parseEther(formatTokenAmount(curator.totalFees)),
        ],
      }),
    };
  });
}

function formatTokenAmount(amount: number): `${number}` {
  return amount.toFixed(18).replace(/\.?0+$/, '') as `${number}`;
}

function isEmbedded() {
  return window.parent !== window;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error('Safe did not respond. Open this app from Safe Apps and try again.'));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeout));
  });
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
