import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import typescript from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
export default [
    js.configs.recommended,
    ...typescript.configs.recommended,
    {
        ...react.configs.flat.recommended,
        ...react.configs.flat['jsx-runtime'], // Required for React 17+
        languageOptions: {
            globals: {
                ...globals.browser,
            },
        },
        rules: {
            'react/react-in-jsx-scope': 'off',
            'react/prop-types': 'off',
            'react/no-unescaped-entities': 'off',
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
    },
    {
        plugins: {
            'react-hooks': reactHooks,
        },
        rules: {
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
        },
    },
    {
        files: ['resources/js/**/*.{ts,tsx}'],
        ignores: ['resources/js/shared/lib/datetime.ts'],
        rules: {
            // Phase 2 of the date-format work flips this to 'error'.
            'no-restricted-syntax': [
                'warn',
                {
                    selector: "NewExpression[callee.object.name='Intl'][callee.property.name='DateTimeFormat']",
                    message: 'Format dates with useDateFormat() from @/shared/hooks/use-date-format.',
                },
                {
                    selector: "CallExpression[callee.object.name='Intl'][callee.property.name='DateTimeFormat']",
                    message: 'Format dates with useDateFormat() from @/shared/hooks/use-date-format.',
                },
                {
                    selector: 'CallExpression[callee.property.name=/^toLocale(Date|Time)String$/]',
                    message: 'Format dates with useDateFormat() from @/shared/hooks/use-date-format.',
                },
            ],
        },
    },
    {
        ignores: ['vendor', 'node_modules', 'public', 'bootstrap/ssr', 'tailwind.config.js'],
    },
    prettier, // Turn off all rules that might conflict with Prettier
];
