const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.browser,
        M3U: 'writable',
        Hls: 'readonly',
        electronAPI: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-throw-literal': 'error'
    }
  },
  {
    files: ['main.js', 'preload.js', 'src/main/**/*.js'],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ['src/renderer/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        M3U: 'writable',
        Hls: 'readonly',
        electronAPI: 'readonly'
      }
    }
  },
  {
    ignores: ['node_modules/**', 'dist/**', 'src/renderer/vendor/**']
  }
];
