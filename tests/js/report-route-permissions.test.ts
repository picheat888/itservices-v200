// Each report page opens for exactly the permissions its ReportCatalogue entry requires, so a page never opens to a 403.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const catalogue = readFileSync(new URL('../../app/Support/ReportCatalogue.php', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../../resources/js/modules/report/routes.tsx', import.meta.url), 'utf8');

const list = (body: string) => [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();

/** report key → permissions the server requires */
function serverGates(): Map<string, string[]> {
    const keys = new Map([...catalogue.matchAll(/public const ([A-Z_]+) = '([a-z_.]+)';/g)].map((m) => [m[1], m[2]]));
    const gates = new Map<string, string[]>();
    for (const m of catalogue.matchAll(/self::([A-Z_]+) => \[[\s\S]*?'requires' => \[([^\]]*)\]/g)) {
        const key = keys.get(m[1]);
        if (key) gates.set(key, list(m[2]));
    }
    return gates;
}

/** page path → permissions the page asks for */
function pageGates(): Map<string, string[]> {
    return new Map([...routes.matchAll(/\{\s*path: '([a-z-]+)',\s*allOf: \[([^\]]*)\]/g)].map((m) => [m[1], list(m[2])]));
}

test('every report page asks for every permission its report requires', () => {
    const pages = pageGates();
    const server = serverGates();
    assert.ok(server.size > 0 && pages.size > 0);

    for (const [key, required] of server) {
        const path = key.replace(/[._]/g, '-');
        assert.deepEqual(pages.get(path), required, `${path} should ask for ${required.join(' + ')}`);
    }
    assert.equal(pages.size, server.size);
});

test('the rentals report also needs assets.view', () => {
    assert.deepEqual(pageGates().get('contracts-rentals'), ['assets.view', 'contracts.view']);
});
