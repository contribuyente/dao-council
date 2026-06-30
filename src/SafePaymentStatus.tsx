import type { SafeInfoExtended } from '@safe-global/safe-apps-sdk';
import { shortAddress } from './payments';

type SafeAppStatus = 'checking' | 'connected' | 'unavailable';

export function SafePaymentStatus({
  safeInfo,
  safeAppStatus,
  safeTxHash,
  safeTxError,
  csvCopyMessage,
}: {
  safeInfo: SafeInfoExtended | null;
  safeAppStatus: SafeAppStatus;
  safeTxHash: string | null;
  safeTxError: string | null;
  csvCopyMessage: string | null;
}) {
  return (
    <>
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
    </>
  );
}
