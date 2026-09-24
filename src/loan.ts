export interface LoanTerms {
  principal: number;
  annualRatePercent: number;
  termYears: number;
}

export interface PaymentRecord {
  month: number;
  startingBalance: number;
  payment: number;
  interest: number;
  principalPaid: number;
  endingBalance: number;
}

export interface ProjectedRow {
  month: number;
  startingBalance: number;
  payment: number;
  interest: number;
  principalPaid: number;
  endingBalance: number;
  isBalloon: boolean;
}

export const round2 = (value: number): number => Math.round(value * 100) / 100;

export const monthlyRate = (annualRatePercent: number): number =>
  annualRatePercent / 100 / 12;

export const totalMonths = (termYears: number): number =>
  Math.round(termYears * 12);

/** The interest-only minimum due on the current balance. */
export const minimumPayment = (
  balance: number,
  annualRatePercent: number,
): number => round2(balance * monthlyRate(annualRatePercent));

/** Amount required to close out the loan this month: balance plus this month's interest. */
export const payoffAmount = (
  balance: number,
  annualRatePercent: number,
): number => round2(balance + minimumPayment(balance, annualRatePercent));

export interface ApplyPaymentResult {
  record: PaymentRecord;
  balance: number;
}

export const applyPayment = (
  balance: number,
  annualRatePercent: number,
  paymentAmount: number,
  month: number,
): ApplyPaymentResult => {
  const interest = minimumPayment(balance, annualRatePercent);
  const principalPaid = round2(Math.min(paymentAmount - interest, balance));
  const endingBalance = round2(balance - principalPaid);

  return {
    record: {
      month,
      startingBalance: balance,
      payment: round2(interest + principalPaid),
      interest,
      principalPaid,
      endingBalance,
    },
    balance: endingBalance,
  };
};

export type PaymentValidation = { ok: true } | { ok: false; message: string };

export const validatePayment = (
  balance: number,
  annualRatePercent: number,
  paymentAmount: number,
): PaymentValidation => {
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    return { ok: false, message: 'Enter a payment amount.' };
  }

  const minimum = minimumPayment(balance, annualRatePercent);
  if (paymentAmount + 0.005 < minimum) {
    return {
      ok: false,
      message: `Payment must be at least the minimum of ${formatCurrency(minimum)}.`,
    };
  }

  const payoff = payoffAmount(balance, annualRatePercent);
  if (paymentAmount - 0.005 > payoff) {
    return {
      ok: false,
      message: `Payment cannot exceed the full payoff amount of ${formatCurrency(payoff)}.`,
    };
  }

  return { ok: true };
};

/**
 * Projects the rest of the loan assuming the borrower keeps paying `payment`
 * every month. The final row is a balloon payment when the term runs out
 * before the balance reaches zero.
 */
export const projectSchedule = (
  balance: number,
  annualRatePercent: number,
  monthsRemaining: number,
  payment: number,
): ProjectedRow[] => {
  const rows: ProjectedRow[] = [];
  let currentBalance = balance;

  for (let i = 0; i < monthsRemaining && currentBalance > 0; i += 1) {
    const interest = minimumPayment(currentBalance, annualRatePercent);
    const payoff = round2(currentBalance + interest);
    const isLastAllowedMonth = i === monthsRemaining - 1;
    const scheduled = Math.min(payment, payoff);
    const applied = isLastAllowedMonth ? payoff : scheduled;
    const principalPaid = round2(Math.min(applied - interest, currentBalance));
    const endingBalance = round2(currentBalance - principalPaid);

    rows.push({
      month: i + 1,
      startingBalance: currentBalance,
      payment: round2(interest + principalPaid),
      interest,
      principalPaid,
      endingBalance,
      isBalloon: isLastAllowedMonth && applied > scheduled,
    });

    currentBalance = endingBalance;

    // An interest-only payment never reduces the balance, so the projection
    // would otherwise run for the full term with no progress. Keep it, but it
    // will simply show a balloon at the end.
  }

  return rows;
};

export const formatCurrency = (value: number): string =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
