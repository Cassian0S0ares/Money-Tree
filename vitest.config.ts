import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        // O tsconfig deixa o JSX para o Next ("preserve"); nos testes, o
        // esbuild precisa do runtime automático para renderizar componentes.
        esbuild: { jsx: 'automatic' },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          hookTimeout: 30_000,
          globalSetup: ['tests/integration/setup.ts'],
          setupFiles: ['tests/integration/env.ts'],
          // Um único banco para todos os arquivos: rodar em paralelo faria um
          // teste truncar as tabelas no meio de outro.
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],
  },
})
