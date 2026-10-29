// app.css is loaded once, by the Blade @vite tag — App.tsx must not import it again.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('App.tsx does not import app.css', () => {
    const app = readFileSync('resources/js/app/App.tsx', 'utf8');
    assert.doesNotMatch(app, /css\/app\.css/);
});

test('the Blade shell still loads app.css', () => {
    const blade = readFileSync('resources/views/app.blade.php', 'utf8');
    assert.match(blade, /@vite\(\['resources\/css\/app\.css'/);
});
