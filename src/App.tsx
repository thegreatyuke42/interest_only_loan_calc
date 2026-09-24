import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import {
  applyPayment,
  formatCurrency,
  minimumPayment,
  payoffAmount,
  projectSchedule,
  totalMonths,
  validatePayment,
  type LoanTerms,
  type PaymentRecord,
} from './loan';
import { loadState, saveState } from './storage';

interface TermsFormState {
  principal: string;
  annualRatePercent: string;
  termYears: string;
}

const emptyTerms: TermsFormState = {
  principal: '',
  annualRatePercent: '',
  termYears: '',
};

function App() {
  const [form, setForm] = useState<TermsFormState>(emptyTerms);
  const [termsError, setTermsError] = useState('');
  const [terms, setTerms] = useState<LoanTerms | null>(null);
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState<PaymentRecord[]>([]);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentInput, setPaymentInput] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [storageError, setStorageError] = useState('');
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;

    loadState()
      .then((state) => {
        if (cancelled) return;
        setTerms(state.terms);
        setBalance(state.balance);
        setHistory(state.history);
      })
      .catch((error: Error) => {
        if (!cancelled)
          setStorageError(`${error.message} Changes will not be saved.`);
      })
      .finally(() => {
        if (!cancelled) setIsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Skip the write triggered by the initial load so we never clobber the file
    // with empty state before it has been read.
    if (!isLoaded) return;
    if (!hasLoadedOnce.current) {
      hasLoadedOnce.current = true;
      return;
    }

    saveState({ terms, balance, history })
      .then(() => setStorageError(''))
      .catch((error: Error) => setStorageError(error.message));
  }, [isLoaded, terms, balance, history]);

  const minimum = terms ? minimumPayment(balance, terms.annualRatePercent) : 0;
  const payoff = terms ? payoffAmount(balance, terms.annualRatePercent) : 0;
  const monthsRemaining = terms
    ? Math.max(totalMonths(terms.termYears) - history.length, 0)
    : 0;
  const isPaidOff = terms !== null && balance <= 0;
  const isTermExpired = terms !== null && monthsRemaining === 0 && !isPaidOff;

  const totals = useMemo(
    () =>
      history.reduce(
        (acc, record) => ({
          paid: acc.paid + record.payment,
          interest: acc.interest + record.interest,
          principal: acc.principal + record.principalPaid,
        }),
        { paid: 0, interest: 0, principal: 0 },
      ),
    [history],
  );

  const projection = useMemo(() => {
    if (!terms || isPaidOff || monthsRemaining === 0) return [];
    const lastPayment = history.at(-1)?.payment;
    const assumed =
      lastPayment && lastPayment > minimum ? lastPayment : minimum;
    return projectSchedule(
      balance,
      terms.annualRatePercent,
      monthsRemaining,
      assumed,
    );
  }, [terms, balance, monthsRemaining, history, minimum, isPaidOff]);

  const projectedPayoffMonth = projection.find(
    (row) => row.endingBalance <= 0,
  )?.month;

  const handleTermsSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const principal = Number(form.principal);
    const annualRatePercent = Number(form.annualRatePercent);
    const termYears = Number(form.termYears);

    if (!Number.isFinite(principal) || principal <= 0) {
      setTermsError('Enter a loan amount greater than zero.');
      return;
    }
    if (!Number.isFinite(annualRatePercent) || annualRatePercent <= 0) {
      setTermsError('Enter an interest rate greater than zero.');
      return;
    }
    if (!Number.isFinite(termYears) || termYears <= 0) {
      setTermsError('Enter a loan term of at least one year.');
      return;
    }

    setTermsError('');
    setTerms({ principal, annualRatePercent, termYears });
    setBalance(principal);
    setHistory([]);
  };

  const handlePaymentSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!terms) return;

    const amount = Number(paymentInput);
    const validation = validatePayment(
      balance,
      terms.annualRatePercent,
      amount,
    );
    if (!validation.ok) {
      setPaymentError(validation.message);
      return;
    }

    const { record, balance: nextBalance } = applyPayment(
      balance,
      terms.annualRatePercent,
      amount,
      history.length + 1,
    );

    setHistory((prev) => [...prev, record]);
    setBalance(nextBalance);
    setPaymentInput('');
    setPaymentError('');
    setIsPaying(false);
  };

  const handleExport = () => {
    if (!terms) return;

    const exportData = {
      exportedAt: new Date().toISOString(),
      terms,
      balance,
      history,
      projection,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `loan-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const startNewLoan = () => {
    setTerms(null);
    setForm(emptyTerms);
    setBalance(0);
    setHistory([]);
    setIsPaying(false);
    setPaymentInput('');
    setPaymentError('');
    setTermsError('');
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Interest-Only Loan Tracker</h1>
        <p>
          Track an interest-only loan where the minimum monthly payment is
          recalculated every time the principal is reduced.
        </p>
      </header>

      {storageError && <p className="banner warning">{storageError}</p>}

      {!isLoaded && <section className="card">Loading saved loan…</section>}

      {isLoaded && !terms && (
        <section className="card">
          <h2>Loan details</h2>
          <form className="form" onSubmit={handleTermsSubmit}>
            <label>
              Starting loan amount ($)
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="250000"
                value={form.principal}
                onChange={(e) =>
                  setForm({ ...form, principal: e.target.value })
                }
              />
            </label>
            <label>
              Annual interest rate (%)
              <input
                type="number"
                min="0"
                step="0.001"
                placeholder="6.5"
                value={form.annualRatePercent}
                onChange={(e) =>
                  setForm({ ...form, annualRatePercent: e.target.value })
                }
              />
            </label>
            <label>
              Loan term (years)
              <input
                type="number"
                min="1"
                step="1"
                placeholder="10"
                value={form.termYears}
                onChange={(e) =>
                  setForm({ ...form, termYears: e.target.value })
                }
              />
            </label>
            {termsError && <p className="error">{termsError}</p>}
            <button type="submit" className="primary">
              Calculate schedule
            </button>
          </form>
        </section>
      )}

      {isLoaded && terms && (
        <>
          <section className="card">
            <div className="card-heading">
              <h2>Loan status</h2>
              <button type="button" className="link" onClick={startNewLoan}>
                Start a new loan
              </button>
            </div>

            <dl className="stats">
              <div>
                <dt>Remaining balance</dt>
                <dd className="emphasis">{formatCurrency(balance)}</dd>
              </div>
              <div>
                <dt>Minimum monthly payment</dt>
                <dd className="emphasis">{formatCurrency(minimum)}</dd>
              </div>
              <div>
                <dt>Payoff amount today</dt>
                <dd>{formatCurrency(payoff)}</dd>
              </div>
              <div>
                <dt>Original loan</dt>
                <dd>{formatCurrency(terms.principal)}</dd>
              </div>
              <div>
                <dt>Interest rate</dt>
                <dd>{terms.annualRatePercent}% APR</dd>
              </div>
              <div>
                <dt>Payments made</dt>
                <dd>
                  {history.length} of {totalMonths(terms.termYears)} (
                  {monthsRemaining} remaining)
                </dd>
              </div>
            </dl>

            {isPaidOff && (
              <p className="banner success">
                This loan is paid off. Total paid {formatCurrency(totals.paid)}{' '}
                — {formatCurrency(totals.interest)} in interest.
              </p>
            )}

            {isTermExpired && (
              <p className="banner warning">
                The loan term has ended with a remaining balance. The full
                payoff amount of {formatCurrency(payoff)} is due as a balloon
                payment.
              </p>
            )}

            {!isPaidOff && !isPaying && (
              <button
                type="button"
                className="primary"
                onClick={() => setIsPaying(true)}
              >
                Make a payment
              </button>
            )}

            {!isPaidOff && isPaying && (
              <form
                className="form payment-form"
                onSubmit={handlePaymentSubmit}
              >
                <label>
                  Total payment amount ($)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    autoFocus
                    value={paymentInput}
                    onChange={(e) => setPaymentInput(e.target.value)}
                  />
                </label>
                <p className="note">
                  The full minimum payment of {formatCurrency(minimum)} must be
                  met. Anything above that amount reduces the principal and
                  lowers next month&apos;s minimum. Paying{' '}
                  {formatCurrency(payoff)} closes the loan.
                </p>
                {paymentError && <p className="error">{paymentError}</p>}
                <div className="actions">
                  <button type="submit" className="primary">
                    Submit payment
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setIsPaying(false);
                      setPaymentInput('');
                      setPaymentError('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </section>

          {history.length > 0 && (
            <section className="card">
              <h2>Payment history</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Starting balance</th>
                      <th>Payment</th>
                      <th>Interest</th>
                      <th>Principal</th>
                      <th>Ending balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((record) => (
                      <tr key={record.month}>
                        <td>{record.month}</td>
                        <td>{formatCurrency(record.startingBalance)}</td>
                        <td>{formatCurrency(record.payment)}</td>
                        <td>{formatCurrency(record.interest)}</td>
                        <td>{formatCurrency(record.principalPaid)}</td>
                        <td>{formatCurrency(record.endingBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Totals</td>
                      <td />
                      <td>{formatCurrency(totals.paid)}</td>
                      <td>{formatCurrency(totals.interest)}</td>
                      <td>{formatCurrency(totals.principal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}

          {projection.length > 0 && (
            <section className="card">
              <div className="card-heading">
                <h2>Projected payoff schedule</h2>
                <button type="button" className="link" onClick={handleExport}>
                  Export as JSON
                </button>
              </div>
              <p className="note">
                Assumes you keep paying{' '}
                {formatCurrency(projection[0]?.payment ?? minimum)} each month.{' '}
                {projectedPayoffMonth
                  ? `At that rate the loan is paid off in ${projectedPayoffMonth} more month${
                      projectedPayoffMonth === 1 ? '' : 's'
                    }.`
                  : 'At that rate a balloon payment is due at the end of the term.'}
              </p>
              <div className="table-wrap scroll">
                <table>
                  <thead>
                    <tr>
                      <th>In</th>
                      <th>Starting balance</th>
                      <th>Payment</th>
                      <th>Interest</th>
                      <th>Principal</th>
                      <th>Ending balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projection.map((row) => (
                      <tr
                        key={row.month}
                        className={row.isBalloon ? 'balloon' : undefined}
                      >
                        <td>
                          {row.month} mo{row.isBalloon ? ' (balloon)' : ''}
                        </td>
                        <td>{formatCurrency(row.startingBalance)}</td>
                        <td>{formatCurrency(row.payment)}</td>
                        <td>{formatCurrency(row.interest)}</td>
                        <td>{formatCurrency(row.principalPaid)}</td>
                        <td>{formatCurrency(row.endingBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default App;
