import { shortAddress } from './payments';

export function PaymentActionStatus({
  safeTxHash,
  safeTxError,
}: {
  safeTxHash: string | null;
  safeTxError: string | null;
}) {
  return (
    <>
      {safeTxHash && (
        <p className="safe-tx-message safe-tx-success">
          Transaction created: {shortAddress(safeTxHash)}
        </p>
      )}
      {safeTxError && (
        <p className="safe-tx-message safe-tx-error">{safeTxError}</p>
      )}
    </>
  );
}
