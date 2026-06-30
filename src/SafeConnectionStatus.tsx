import { shortAddress } from './payments';
import type { SafeConnection } from './useSafeConnection';

export function SafeConnectionStatus({
  safeInfo,
  safeAppStatus,
}: SafeConnection) {
  if (safeAppStatus === 'connected' && safeInfo) {
    return (
      <div className="safe-connection-status connected" aria-live="polite">
        <span className="safe-status-dot" />
        Connected to {shortAddress(safeInfo.safeAddress)}
      </div>
    );
  }

  if (safeAppStatus === 'checking') {
    return (
      <div className="safe-connection-status checking" aria-live="polite">
        <span className="safe-status-dot" />
        Checking Safe...
      </div>
    );
  }

  return (
    <div className="safe-connection-status warning" aria-live="polite">
      <span className="safe-status-dot" />
      Open from Safe Apps to create txs directly
    </div>
  );
}
