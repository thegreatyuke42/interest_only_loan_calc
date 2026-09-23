# Interest-Only Loan Tracker

A React + TypeScript app for modeling an interest-only loan whose minimum monthly
payment is recalculated every time the principal is reduced.

## How it works

1. Enter the **starting loan amount**, **annual interest rate**, and **loan term in years**.
2. The app shows the **minimum monthly payment** — the interest accrued on the current
   balance (`balance x rate / 12`) — along with the remaining balance.
3. Choose **Make a payment** and enter a total payment amount. The full minimum payment
   must be met.
   - Paying exactly the minimum covers interest only; the balance is unchanged.
   - Paying more reduces the principal, and the minimum monthly payment is recalculated
     against the new, lower balance.
   - Paying the full payoff amount (balance + this month's interest) closes the loan.
4. Every payment is recorded in the **payment history**, and a **projected payoff
   schedule** shows what happens if you keep paying the same amount each month.

The loan term determines how many monthly payments are available. Because an
interest-only loan never amortizes on its own, any balance still outstanding at the end
of the term is shown as a **balloon payment**.

## Persistence

Loan state is stored in **`loan-data.json`** in the project root.

- The file is created automatically the first time the server starts. If it already
  exists, it is read instead and the app resumes where you left off.
- The app reads it on page load and writes back after every change, so the loan and
  payment history survive refreshes and server restarts.
- The file is **gitignored** and never committed.
- A corrupted or hand-edited file is sanitized on read, falling back to an empty loan
  rather than crashing the app.
- If the file cannot be read or written, the app still runs and shows a warning that
  changes will not be saved.

This is backed by a small Vite plugin (`vite-plugin-loan-store.ts`) that serves
`GET /api/loan` and `PUT /api/loan` from both `npm run dev` and `npm run preview`. To
reset the loan, either use **Start a new loan** in the UI or delete `loan-data.json`.

## Getting started

```bash
npm install
npm run dev
```

## Scripts

| Script               | Description                         |
| -------------------- | ----------------------------------- |
| `npm run dev`        | Start the Vite dev server           |
| `npm run build`      | Type-check and build for production |
| `npm run preview`    | Preview the production build        |
| `npm test`           | Run the loan-math unit tests        |
| `npm run test:watch` | Run tests in watch mode             |
| `npm run lint`       | Lint with oxlint                    |

## Project structure

- `src/loan.ts` — all loan math and validation, framework-free and unit tested
- `src/storage.ts` — client for the `/api/loan` persistence endpoint
- `src/App.tsx` — UI for entering terms, making payments, and viewing schedules
- `vite-plugin-loan-store.ts` — Vite plugin that creates, reads, and writes `loan-data.json`
- `src/loan.test.ts` — unit tests for the loan math
- `src/App.test.tsx` — DOM tests for hydration, persistence, and payment rules