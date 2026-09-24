import { describe, expect, it } from 'vitest';
import {
  applyPayment,
  minimumPayment,
  payoffAmount,
  projectSchedule,
  validatePayment,
} from './loan';

describe('minimumPayment', () => {
  it('is the interest accrued on the current balance', () => {
    expect(minimumPayment(100_000, 6)).toBe(500);
  });

  it('drops as the principal is reduced', () => {
    expect(minimumPayment(50_000, 6)).toBe(250);
  });
});

describe('applyPayment', () => {
  it('applies only interest when the minimum is paid', () => {
    const { record, balance } = applyPayment(100_000, 6, 500, 1);
    expect(record.interest).toBe(500);
    expect(record.principalPaid).toBe(0);
    expect(balance).toBe(100_000);
  });

  it('reduces principal with anything above the minimum', () => {
    const { record, balance } = applyPayment(100_000, 6, 1_500, 1);
    expect(record.interest).toBe(500);
    expect(record.principalPaid).toBe(1_000);
    expect(balance).toBe(99_000);
    expect(minimumPayment(balance, 6)).toBe(495);
  });

  it('caps the principal applied at the remaining balance', () => {
    const { record, balance } = applyPayment(
      1_000,
      12,
      payoffAmount(1_000, 12),
      1,
    );
    expect(record.principalPaid).toBe(1_000);
    expect(balance).toBe(0);
  });
});

describe('validatePayment', () => {
  it('rejects a payment below the minimum', () => {
    expect(validatePayment(100_000, 6, 499).ok).toBe(false);
  });

  it('accepts exactly the minimum', () => {
    expect(validatePayment(100_000, 6, 500).ok).toBe(true);
  });

  it('rejects more than the full payoff amount', () => {
    expect(validatePayment(100_000, 6, 200_000).ok).toBe(false);
  });

  it('rejects zero and non-numeric amounts', () => {
    expect(validatePayment(100_000, 6, 0).ok).toBe(false);
    expect(validatePayment(100_000, 6, Number.NaN).ok).toBe(false);
  });
});

describe('projectSchedule', () => {
  it('pays the loan off early when the payment exceeds interest', () => {
    const rows = projectSchedule(10_000, 6, 120, 1_000);
    const payoffRow = rows.find((row) => row.endingBalance === 0);
    expect(payoffRow).toBeDefined();
    expect(rows.at(-1)?.endingBalance).toBe(0);
    expect(payoffRow!.month).toBeLessThan(120);
  });

  it('ends in a balloon payment when only interest is paid', () => {
    const rows = projectSchedule(100_000, 6, 12, 500);
    expect(rows).toHaveLength(12);
    expect(rows.at(-1)?.isBalloon).toBe(true);
    expect(rows.at(-1)?.payment).toBe(100_500);
    expect(rows.at(-1)?.endingBalance).toBe(0);
  });
});
