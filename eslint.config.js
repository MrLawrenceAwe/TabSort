import globals from 'globals';
import { IGNORED_CHECK_DIRECTORIES } from './scripts/check-scope.mjs';

export default [
  {
    ignores: [...IGNORED_CHECK_DIRECTORIES.map(directory => `**/${directory}/**`), 'dist/**'],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        chrome: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
];
