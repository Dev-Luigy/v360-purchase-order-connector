import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.tools/**',
      // Cliente gerado pelo Prisma: derivado do schema, não é código nosso.
      'src/infrastructure/database/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Regras com tipo só em `src`: é onde a regra de não usar ponto flutuante
    // para dinheiro precisa de apoio da ferramenta. Nos testes elas rendem
    // ruído do `node:test`, que devolve promessa em toda chamada de `test`
    // (REVIEW-02, 12).
    files: ['src/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        URL: 'readonly',
      },
    },
  },
);
