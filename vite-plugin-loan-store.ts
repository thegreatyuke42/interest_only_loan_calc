import { existsSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Connect, Plugin } from 'vite';

export const LOAN_DATA_FILE = 'loan-data.json';

export interface PersistedState {
  terms: {
    principal: number;
    annualRatePercent: number;
    termYears: number;
  } | null;
  balance: number;
  history: Array<{
    month: number;
    startingBalance: number;
    payment: number;
    interest: number;
    principalPaid: number;
    endingBalance: number;
  }>;
}

const emptyState = (): PersistedState => ({
  terms: null,
  balance: 0,
  history: [],
});

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keeps a hand-edited or corrupted file from breaking the app. */
const sanitize = (value: unknown): PersistedState => {
  if (typeof value !== 'object' || value === null) return emptyState();
  const raw = value as Record<string, unknown>;

  let terms: PersistedState['terms'] = null;
  if (typeof raw.terms === 'object' && raw.terms !== null) {
    const t = raw.terms as Record<string, unknown>;
    if (
      isFiniteNumber(t.principal) &&
      isFiniteNumber(t.annualRatePercent) &&
      isFiniteNumber(t.termYears)
    ) {
      terms = {
        principal: t.principal,
        annualRatePercent: t.annualRatePercent,
        termYears: t.termYears,
      };
    }
  }

  const history = Array.isArray(raw.history)
    ? raw.history.flatMap((entry) => {
        if (typeof entry !== 'object' || entry === null) return [];
        const e = entry as Record<string, unknown>;
        const fields = [
          'month',
          'startingBalance',
          'payment',
          'interest',
          'principalPaid',
          'endingBalance',
        ] as const;
        if (!fields.every((field) => isFiniteNumber(e[field]))) return [];
        return [
          {
            month: e.month as number,
            startingBalance: e.startingBalance as number,
            payment: e.payment as number,
            interest: e.interest as number,
            principalPaid: e.principalPaid as number,
            endingBalance: e.endingBalance as number,
          },
        ];
      })
    : [];

  return {
    terms,
    balance: isFiniteNumber(raw.balance)
      ? raw.balance
      : (terms?.principal ?? 0),
    history: terms ? history : [],
  };
};

const readState = async (dataPath: string): Promise<PersistedState> => {
  try {
    return sanitize(JSON.parse(await readFile(dataPath, 'utf8')));
  } catch {
    return emptyState();
  }
};

const writeState = async (
  dataPath: string,
  state: PersistedState,
): Promise<void> => {
  const tempPath = `${dataPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(tempPath, dataPath);
};

const readBody = (req: Connect.IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const createMiddleware =
  (dataPath: string): Connect.NextHandleFunction =>
  (req, res, next) => {
    const url = req.url?.split('?')[0];
    if (url !== '/api/loan') {
      next();
      return;
    }

    void (async () => {
      try {
        if (req.method === 'GET') {
          const state = await readState(dataPath);
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(state));
          return;
        }

        if (req.method === 'PUT' || req.method === 'POST') {
          const body = await readBody(req);
          const state = sanitize(JSON.parse(body));
          await writeState(dataPath, state);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(state));
          return;
        }

        res.statusCode = 405;
        res.setHeader('Allow', 'GET, PUT, POST');
        res.end();
      } catch (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: (error as Error).message }));
      }
    })();
  };

/**
 * Persists loan state to a JSON file in the project root. The file is created on
 * first server start and read back on every page load.
 */
export const loanStorePlugin = (): Plugin => {
  let dataPath = '';

  const ensureFile = async () => {
    if (!existsSync(dataPath)) {
      await writeState(dataPath, emptyState());
      console.log(`[loan-store] created ${LOAN_DATA_FILE}`);
    } else {
      console.log(`[loan-store] using existing ${LOAN_DATA_FILE}`);
    }
  };

  return {
    name: 'loan-store',
    configResolved(config) {
      dataPath = path.resolve(config.root, LOAN_DATA_FILE);
    },
    async configureServer(server) {
      await ensureFile();
      server.middlewares.use(createMiddleware(dataPath));
    },
    async configurePreviewServer(server) {
      await ensureFile();
      server.middlewares.use(createMiddleware(dataPath));
    },
  };
};

export default loanStorePlugin;
