/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](react|react-dom|react-router-dom)[\\/]/,
              priority: 30,
            },
            {
              name: 'wallet-kit',
              test: /node_modules[\\/]@creit\.tech[\\/]stellar-wallets-kit[\\/]/,
              priority: 25,
            },
            {
              name: 'stellar-sdk',
              test: /node_modules[\\/]@stellar[\\/]stellar-sdk[\\/]/,
              priority: 25,
            },
            {
              name: 'shared-app',
              minShareCount: 2,
              minSize: 10_000,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/test/**',
        'src/**/*.test.{ts,tsx}',
        'src/vite-env.d.ts',
        // The wallet kit is browser-only and cannot load under jsdom; it is
        // mocked at this boundary in every test, so measuring it is noise.
        'src/services/walletService.ts',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
