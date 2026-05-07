import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**'],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    plugins: {
      import: importPlugin,
    },
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
      'import/no-unresolved': ['error', { commonjs: false }],
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
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.mjs'],
        },
      },
    },
  },
];
