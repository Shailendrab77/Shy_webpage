import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      LLM_PROVIDER: 'heuristic',
      WHATSAPP_VERIFY_TOKEN: 'test-verify-token',
      ADMIN_API_KEY: 'test-admin-api-key-123',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
