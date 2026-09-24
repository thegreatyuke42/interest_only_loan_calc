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
const LOCAL_STORAGE_KEY = 'interest-only-loan-calc:state';

// The `/api/loan` endpoint only exists when a Vite dev/preview server (or an
// equivalent backend) is running. Static hosts like GitHub Pages have no
// server, so the first request 404s and we fall back to the browser's
// localStorage for the rest of the session.
let apiAvailable = true;

const readLocalStorage = (): PersistedState => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedState) : emptyState;
  } catch {
    return emptyState;
  }
};

const writeLocalStorage = (state: PersistedState): void => {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
};

export const loadState = async (): Promise<PersistedState> => {
  if (apiAvailable) {
    try {
      const response = await fetch(ENDPOINT, {
        headers: { Accept: 'application/json' },
      });
      if (response.status === 404) {
        apiAvailable = false;
      } else if (!response.ok) {
        throw new Error(`Failed to load saved loan (HTTP ${response.status}).`);
      } else {
        return (await response.json()) as PersistedState;
      }
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      // Network-level failure (e.g. no server at all) — fall back below.
      apiAvailable = false;
    }
  }

  return readLocalStorage();
};

export const saveState = async (state: PersistedState): Promise<void> => {
  if (apiAvailable) {
    try {
      const response = await fetch(ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
      if (response.status === 404) {
        apiAvailable = false;
      } else if (!response.ok) {
        throw new Error(`Failed to save loan (HTTP ${response.status}).`);
      } else {
        return;
      }
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      apiAvailable = false;
    }
  }

  writeLocalStorage(state);
};
