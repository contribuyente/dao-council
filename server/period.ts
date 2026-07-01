export type AutomationPeriod = {
  key: string;
  label: string;
  from: Date;
  to: Date;
  fromTimestamp: number;
  toTimestamp: number;
};

export function getPreviousMonthPeriod(now = new Date()): AutomationPeriod {
  const currentMonthStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    1,
    0,
    0,
    0,
    0
  );
  const previousMonthStartDate = new Date(currentMonthStart);
  previousMonthStartDate.setUTCMonth(previousMonthStartDate.getUTCMonth() - 1);
  const from = new Date(
    Date.UTC(
      previousMonthStartDate.getUTCFullYear(),
      previousMonthStartDate.getUTCMonth(),
      1,
      0,
      0,
      0,
      0
    )
  );
  const to = new Date(currentMonthStart - 1000);
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + 1;

  return {
    key: `${year}-${String(month).padStart(2, '0')}`,
    label: from.toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
    from,
    to,
    fromTimestamp: Math.floor(from.getTime() / 1000),
    toTimestamp: Math.floor(to.getTime() / 1000),
  };
}
