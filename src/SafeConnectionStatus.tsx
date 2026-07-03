import { shortAddress } from './payments';
import { buildSafeAppOpenUrl } from './safeAppLinks';
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

  const safeAppUrl = buildSafeAppOpenUrl(window.location.href);

  return (
    <a
      href={safeAppUrl}
      className="safe-connection-status warning safe-connection-link"
      aria-live="polite"
    >
      <span className="safe-status-dot" />
      Open from Safe Apps to create txs directly
    </a>
  );
}
