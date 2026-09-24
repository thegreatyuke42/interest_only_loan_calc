import type { LoanTerms, PaymentRecord } from './loan';

export interface PersistedState {
  terms: LoanTerms | null;
  balance: number;
  history: PaymentRecord[];
}

export const emptyState: PersistedState = {
  terms: null,
  balance: 0,
  history: [],
};

const ENDPOINT = '/api/loan';

export const loadState = async (): Promise<PersistedState> => {
  const response = await fetch(ENDPOINT, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to load saved loan (HTTP ${response.status}).`);
  }
  return (await response.json()) as PersistedState;
};

export const saveState = async (state: PersistedState): Promise<void> => {
  const response = await fetch(ENDPOINT, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
  if (!response.ok) {
    throw new Error(`Failed to save loan (HTTP ${response.status}).`);
  }
};
