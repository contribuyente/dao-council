import { useEffect, useState } from 'react';
import SafeAppsSDK, { type SafeInfoExtended } from '@safe-global/safe-apps-sdk';

export const SAFE_APP_TIMEOUT_MS = 2000;

export type SafeAppStatus = 'checking' | 'connected' | 'unavailable';

export type SafeConnection = {
  safeInfo: SafeInfoExtended | null;
  safeAppStatus: SafeAppStatus;
};

export function useSafeConnection(): SafeConnection {
  const [safeInfo, setSafeInfo] = useState<SafeInfoExtended | null>(null);
  const [safeAppStatus, setSafeAppStatus] = useState<SafeAppStatus>('checking');

  useEffect(() => {
    let isMounted = true;

    const loadSafeInfo = async () => {
      if (!isEmbedded()) {
        setSafeAppStatus('unavailable');
        return;
      }

      try {
        const info = await getSafeInfoWithTimeout();

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

  return { safeInfo, safeAppStatus };
}

export function isEmbedded() {
  return window.parent !== window;
}

export function getSafeInfoWithTimeout() {
  const sdk = new SafeAppsSDK();
  return withTimeout(sdk.safe.getInfo(), SAFE_APP_TIMEOUT_MS);
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
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
