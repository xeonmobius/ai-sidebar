import js from '@eslint/js';

export default [
  { ignores: ['dist/**'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        chrome: 'readonly',
        browser: 'readonly',
        DOMParser: 'readonly',
        DataTransfer: 'readonly',
        DataTransferItem: 'readonly',
        File: 'readonly',
        FileList: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Event: 'readonly',
        XMLHttpRequest: 'readonly',
      },
    },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
];
