import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CuratorFeesSummary, DateRange } from '../types';
import { formatManaAmount, type PaymentRecipient } from '../payments';
import { SafePaymentStatus } from '../SafePaymentStatus';
import { useSafePaymentAction } from '../useSafePaymentAction';

interface CuratorFeesReportProps {
  fees: CuratorFeesSummary[];
  dateRange: DateRange;
  isLoading: boolean;
}

export function CuratorFeesReport({ fees, isLoading }: CuratorFeesReportProps) {
  const [expandedCurator, setExpandedCurator] = useState<string | null>(null);
  
  const totalFees = fees.reduce((sum, curator) => sum + curator.totalFees, 0);
  const totalCurations = fees.reduce((sum, curator) => sum + curator.curationCount, 0);
  const payments = useMemo<PaymentRecipient[]>(
    () =>
      fees.map((curator) => ({
        name: curator.curatorName,
        address: curator.paymentAddress,
        amountMana: curator.totalFees,
      })),
    [fees]
  );
  const {
    safeInfo,
    safeAppStatus,
    safeTxHash,
    safeTxError,
    csvCopyMessage,
    isCreatingSafeTx,
    actionButtonLabel,
    handlePaymentAction,
  } = useSafePaymentAction(payments);

  const formatMANA = (amount: number) => {
    return formatManaAmount(amount);
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
          <SafePaymentStatus
            safeInfo={safeInfo}
            safeAppStatus={safeAppStatus}
            safeTxHash={safeTxHash}
            safeTxError={safeTxError}
            csvCopyMessage={csvCopyMessage}
          />
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
