import { useEffect, useMemo, useState } from 'react';
import SafeAppsSDK, { type SafeInfoExtended } from '@safe-global/safe-apps-sdk';
import {
  ETHEREUM_CHAIN_ID,
  buildSafeTransactions,
  generateMultisigCSV,
  type PaymentRecipient,
} from './payments';

const SAFE_APP_TIMEOUT_MS = 2000;

type SafeAppStatus = 'checking' | 'connected' | 'unavailable';

export function useSafePaymentAction(payments: PaymentRecipient[]) {
  const [safeInfo, setSafeInfo] = useState<SafeInfoExtended | null>(null);
  const [safeAppStatus, setSafeAppStatus] = useState<SafeAppStatus>('checking');
  const [isCreatingSafeTx, setIsCreatingSafeTx] = useState(false);
  const [safeTxHash, setSafeTxHash] = useState<string | null>(null);
  const [safeTxError, setSafeTxError] = useState<string | null>(null);
  const [csvCopyMessage, setCsvCopyMessage] = useState<string | null>(null);

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

  const actionButtonLabel = useMemo(() => {
    if (isCreatingSafeTx) {
      return 'Creating Transaction...';
    }

    if (safeAppStatus === 'checking') {
      return 'Checking Safe...';
    }

    return isSafeApp ? 'Create Transaction' : 'Copy Multisig CSV';
  }, [isCreatingSafeTx, isSafeApp, safeAppStatus]);

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

      if (currentSafeInfo.chainId !== ETHEREUM_CHAIN_ID) {
        throw new Error('Switch Safe to Ethereum mainnet to create MANA payments.');
      }

      if (currentSafeInfo.isReadOnly) {
        throw new Error('Connect to Safe as an owner to create this transaction.');
      }

      const txs = buildSafeTransactions(payments);
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
      await navigator.clipboard.writeText(generateMultisigCSV(payments));
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

  return {
    safeInfo,
    safeAppStatus,
    safeTxHash,
    safeTxError,
    csvCopyMessage,
    isCreatingSafeTx,
    actionButtonLabel,
    handlePaymentAction,
    isSafeApp,
  };
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
