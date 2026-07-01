import { useEffect, useState } from 'react';
import type { CuratorFeesSummary, DateRange } from '../types';

interface CuratorFeesCalculatorProps {
  dateRange: DateRange;
  onFeesCalculated: (fees: CuratorFeesSummary[]) => void;
  onLoadingChange: (loading: boolean) => void;
}

type CurationsApiResponse = {
  data: {
    fees: CuratorFeesSummary[];
  };
  warnings?: string[];
};

export function CuratorFeesCalculator({
  dateRange,
  onFeesCalculated,
  onLoadingChange,
}: CuratorFeesCalculatorProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchAndCalculateFees = async () => {
      setLoading(true);
      onLoadingChange(true);
      setError(null);
      setWarnings([]);

      try {
        const params = new URLSearchParams({
          from: Math.floor(dateRange.from.getTime() / 1000).toString(),
          to: Math.floor(dateRange.to.getTime() / 1000).toString(),
        });
        const response = await fetch(`/api/curations?${params.toString()}`, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(
            payload?.error ?? `Failed to fetch curation data: ${response.status}`
          );
        }

        const payload = (await response.json()) as CurationsApiResponse;
        setWarnings(payload.warnings ?? []);
        onFeesCalculated(payload.data.fees);
      } catch (err) {
        if (abortController.signal.aborted) {
          return;
        }

        const errorMessage =
          err instanceof Error ? err.message : 'Failed to fetch curation data';
        setError(errorMessage);
        setWarnings([]);
        onFeesCalculated([]);
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
          onLoadingChange(false);
        }
      }
    };

    fetchAndCalculateFees();

    return () => {
      abortController.abort();
    };
  }, [dateRange, onFeesCalculated, onLoadingChange]);

  if (loading) {
    return (
      <div className="loading">
        <p>Loading curation data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error">
        <p>Error: {error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (warnings.length > 0) {
    return (
      <div className="curations-warning" role="status">
        {warnings.map((warning) => (
          <p key={warning}>{warning}</p>
        ))}
      </div>
    );
  }

  return null;
}
