import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import type { PersistedState } from './storage';

const savedLoan: PersistedState = {
  terms: { principal: 100_000, annualRatePercent: 6, termYears: 10 },
  balance: 99_000,
  history: [
    {
      month: 1,
      startingBalance: 100_000,
      payment: 1_500,
      interest: 500,
      principalPaid: 1_000,
      endingBalance: 99_000,
    },
  ],
};

const emptyLoan: PersistedState = { terms: null, balance: 0, history: [] };

/** Stands in for the JSON file managed by the Vite plugin. */
const mockServer = (initial: PersistedState) => {
  let stored: PersistedState = structuredClone(initial);
  const writes: PersistedState[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        stored = JSON.parse(init.body as string) as PersistedState;
        writes.push(structuredClone(stored));
      }
      return { ok: true, status: 200, json: async () => stored } as Response;
    }),
  );

  return { writes, current: () => stored };
};

/** Reads a value out of the summary list, since currency repeats in the tables. */
const stat = (label: string): string =>
  screen.getByText(label).parentElement?.querySelector('dd')?.textContent ?? '';

const enterLoan = async (user: ReturnType<typeof userEvent.setup>) => {
  await screen.findByText('Loan details');
  await user.type(screen.getByLabelText(/Starting loan amount/), '100000');
  await user.type(screen.getByLabelText(/Annual interest rate/), '6');
  await user.type(screen.getByLabelText(/Loan term/), '10');
  await user.click(screen.getByRole('button', { name: 'Calculate schedule' }));
  await screen.findByText('Loan status');
};

const makePayment = async (
  user: ReturnType<typeof userEvent.setup>,
  amount: string,
) => {
  await user.click(screen.getByRole('button', { name: 'Make a payment' }));
  await user.type(screen.getByLabelText(/Total payment amount/), amount);
  await user.click(screen.getByRole('button', { name: 'Submit payment' }));
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('persistence', () => {
  it('hydrates the saved loan on load', async () => {
    mockServer(savedLoan);
    render(<App />);

    await screen.findByText('Loan status');
    expect(stat('Remaining balance')).toBe('$99,000.00');
    // 99,000 * 6% / 12 = 495
    expect(stat('Minimum monthly payment')).toBe('$495.00');
    expect(stat('Payments made')).toContain('1 of 120');
  });

  it('does not overwrite the saved file during the initial load', async () => {
    const server = mockServer(savedLoan);
    render(<App />);

    await screen.findByText('Loan status');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(server.writes).toHaveLength(0);
    expect(server.current().terms).not.toBeNull();
  });

  it('shows the entry form when nothing is saved yet', async () => {
    mockServer(emptyLoan);
    render(<App />);

    await screen.findByText('Loan details');
    expect(screen.queryByText('Loan status')).toBeNull();
  });

  it('persists a new loan and each payment', async () => {
    const server = mockServer(emptyLoan);
    const user = userEvent.setup();
    render(<App />);

    await enterLoan(user);
    await waitFor(() => expect(server.current().terms).not.toBeNull());
    expect(server.current().balance).toBe(100_000);

    await makePayment(user, '1500');
    await waitFor(() => expect(server.current().balance).toBe(99_000));
    expect(server.current().history).toHaveLength(1);
    expect(server.current().history[0].principalPaid).toBe(1_000);
  });

  it('clears the saved file when starting a new loan', async () => {
    const server = mockServer(savedLoan);
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText('Loan status');
    await user.click(screen.getByRole('button', { name: 'Start a new loan' }));

    await screen.findByText('Loan details');
    await waitFor(() => expect(server.current().terms).toBeNull());
    expect(server.current().history).toHaveLength(0);
  });

  it('warns the user when the loan cannot be saved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500 }) as Response),
    );
    render(<App />);

    await screen.findByText(/Changes will not be saved/);
  });
});

describe('payment behavior', () => {
  it('lowers the minimum payment after the principal is reduced', async () => {
    mockServer(emptyLoan);
    const user = userEvent.setup();
    render(<App />);

    await enterLoan(user);
    expect(stat('Minimum monthly payment')).toBe('$500.00');

    await makePayment(user, '10500');

    // 90,000 * 6% / 12 = 450
    await waitFor(() =>
      expect(stat('Minimum monthly payment')).toBe('$450.00'),
    );
    expect(stat('Remaining balance')).toBe('$90,000.00');
  });

  it('rejects a payment below the minimum and saves nothing', async () => {
    const server = mockServer(savedLoan);
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText('Loan status');
    await makePayment(user, '100');

    await screen.findByText(
      /Payment must be at least the minimum of \$495\.00/,
    );
    expect(server.current().history).toHaveLength(1);
    expect(stat('Remaining balance')).toBe('$99,000.00');
  });

  it('closes the loan when the full payoff amount is paid', async () => {
    mockServer(emptyLoan);
    const user = userEvent.setup();
    render(<App />);

    await enterLoan(user);
    // 100,000 balance + 500 interest
    await makePayment(user, '100500');

    await screen.findByText(/This loan is paid off/);
    expect(stat('Remaining balance')).toBe('$0.00');
    expect(screen.queryByRole('button', { name: 'Make a payment' })).toBeNull();
  });
});
