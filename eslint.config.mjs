// ESLint flat config: recommended JS + type-aware TypeScript rules.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/', 'dist/', 'coverage/', '.forge/', 'static/**/build/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      // Unused args prefixed with _ are allowed (e.g. Forge handler context params).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
