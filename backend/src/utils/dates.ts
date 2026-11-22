/** Calendar-date helpers shared by validators, services and unit tests. */

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Rejects impossible dates such as 2026-02-31 as well as non-ISO strings. */
export function isCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export type HarvestDateInput = {
  sowingDate: string;
  expectedHarvestDate: string;
  actualHarvestDate?: string | null;
  status?: string;
};

/** Returns a stable machine-readable reason, or null when the dates are consistent. */
export function harvestDateProblem(input: HarvestDateInput): string | null {
  if (
    !isCalendarDate(input.sowingDate) ||
    !isCalendarDate(input.expectedHarvestDate) ||
    (input.actualHarvestDate && !isCalendarDate(input.actualHarvestDate))
  ) {
    return 'invalid-date';
  }
  if (input.sowingDate > input.expectedHarvestDate) return 'expected-before-sowing';
  if (input.actualHarvestDate && input.actualHarvestDate < input.sowingDate) {
    return 'actual-before-sowing';
  }
  if (input.status === 'harvested' && !input.actualHarvestDate) return 'harvested-without-date';
  return null;
}
