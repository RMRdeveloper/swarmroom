import { globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import importX from 'eslint-plugin-import-x';
import unicorn from 'eslint-plugin-unicorn';
import prettier from 'eslint-config-prettier';

const checkCommentsRules = {
  'unicorn/no-abusive-eslint-disable': 'off',
  'unicorn/prefer-switch': 'off',
  'unicorn/prefer-string-replace-all': 'off',
  'unicorn/prefer-string-raw': 'off',
  'unicorn/no-array-sort': 'off',
  'unicorn/explicit-length-check': 'off',
  'unicorn/no-lonely-if': 'off',
  'unicorn/no-for-loop': 'off',
  'unicorn/prefer-split-limit': 'off',
  '@typescript-eslint/no-unused-vars': 'off',
};

export default tseslint.config(
  globalIgnores(['dist/', 'node_modules/', '.swarmroom/']),
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ['src/**/*.{ts,js}', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
      parserOptions: {
        projectService: true,
      },
    },
    plugins: {
      'import-x': importX,
    },
    settings: {
      'import-x/resolver': {
        typescript: true,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-duplicates': 'error',
      /**
       * import-x/no-cycle with ignoreExternal:true avoids flagging external packages (e.g. picocolors)
       * and keeps maxDepth at default (Infinity) — only internal cycles matter; external cycles are not actionable.
       */
      'import-x/no-cycle': ['error', { ignoreExternal: true }],
    },
  },
  unicorn.configs['flat/recommended'],
  {
    rules: {
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/no-null': 'off',
      'unicorn/import-style': 'off',
      'unicorn/prefer-includes-over-repeated-comparisons': 'off',
      'unicorn/no-useless-undefined': 'off',
      'no-control-regex': 'off',
      'no-useless-escape': 'off',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.js'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'unicorn/consistent-function-scoping': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['scripts/check-comments.mjs'],
    rules: checkCommentsRules,
  },
  {
    files: ['src/assets/artifacts/**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: globals.node,
    },
    rules: checkCommentsRules,
  },
  {
    files: ['eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
