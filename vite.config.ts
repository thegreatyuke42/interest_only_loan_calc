import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { loanStorePlugin } from './vite-plugin-loan-store.js';

// https://vite.dev/config/
export default defineConfig({
  base: '/interest_only_loan_calc/',
  plugins: [react(), loanStorePlugin()],
});
