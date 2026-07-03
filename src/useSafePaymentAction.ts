import { useEffect, useMemo, useRef, useState } from 'react';
import SafeAppsSDK from '@safe-global/safe-apps-sdk';
import {
  ETHEREUM_CHAIN_ID,
  buildSafeTransactions,
  generateMultisigCSV,
  type PaymentRecipient,
} from './payments';
import {
  getSafeInfoWithTimeout,
  isEmbedded,
  type SafeConnection,
} from './useSafeConnection';

export function useSafePaymentAction(
  payments: PaymentRecipient[],
  { safeInfo, safeAppStatus }: SafeConnection
) {
  const [isCreatingSafeTx, setIsCreatingSafeTx] = useState(false);
  const [safeTxHash, setSafeTxHash] = useState<string | null>(null);
  const [safeTxError, setSafeTxError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const copiedTimeoutRef = useRef<number | null>(null);

  const isSafeApp = safeAppStatus === 'connected';

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  const actionButtonLabel = useMemo(() => {
    if (isCopied) {
      return 'Copied!';
    }

    if (isCreatingSafeTx) {
      return 'Creating Transaction...';
    }

    if (safeAppStatus === 'checking') {
      return 'Checking Safe...';
    }

    return isSafeApp ? 'Create Transaction' : 'Copy CSV';
  }, [isCopied, isCreatingSafeTx, isSafeApp, safeAppStatus]);

  const createSafeTransaction = async () => {
    setSafeTxHash(null);
    setSafeTxError(null);
    setIsCopied(false);

    if (!isEmbedded()) {
      setSafeTxError('Open this app from Safe Apps to create a multisig transaction.');
      return;
    }

    setIsCreatingSafeTx(true);

    try {
      const sdk = new SafeAppsSDK();
      const currentSafeInfo = await getSafeInfoWithTimeout();

      if (currentSafeInfo.chainId !== ETHEREUM_CHAIN_ID) {
        throw new Error('Switch Safe to Ethereum mainnet to create MANA payments.');
      }

      if (currentSafeInfo.isReadOnly) {
        throw new Error('Connect to Safe as an owner to create this transaction.');
      }

      const response = await sdk.txs.send({
        txs: buildSafeTransactions(payments),
      });

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

    try {
      await navigator.clipboard.writeText(generateMultisigCSV(payments));
      setIsCopied(true);

      if (copiedTimeoutRef.current) {
        window.clearTimeout(copiedTimeoutRef.current);
      }

      copiedTimeoutRef.current = window.setTimeout(() => {
        setIsCopied(false);
        copiedTimeoutRef.current = null;
      }, 1000);
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
    isCreatingSafeTx,
    actionButtonLabel,
    handlePaymentAction,
    isSafeApp,
  };
}
