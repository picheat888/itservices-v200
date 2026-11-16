// UAT AST-02-03: switching a rented asset to "purchased" starts the purchase fields empty, never with the contract's fee and lessor.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const form = readFileSync(join(import.meta.dirname, '../../resources/js/modules/asset/components/asset-form-drawer.tsx'), 'utf8');
const toForm = form.slice(form.indexOf('const toForm = '), form.indexOf('/** Small uppercase section heading'));

test('a rented asset seeds no purchase field from its contract', () => {
    assert.match(toForm, /const bought = a\.source !== 'rented';/);
    assert.match(toForm, /value: bought \? toMoneyText\(a\.value\) : '',/);
    assert.match(toForm, /vendor_id: bought && a\.vendor_id \? String\(a\.vendor_id\) : '',/);
    assert.match(toForm, /purchase_date: bought \? \(a\.purchase_date \?\? ''\) : '',/);
    assert.match(toForm, /warranty_end: bought \? \(a\.warranty_end \?\? ''\) : '',/);
    assert.match(toForm, /warranty_lifetime: bought \? \(a\.warranty_lifetime \?\? false\) : false,/);
});

test('the contract link and the shared fields still come from the asset', () => {
    assert.match(toForm, /contract_id: a\.contract_id \? String\(a\.contract_id\) : '',/);
    assert.match(toForm, /source: a\.source,/);
    assert.match(toForm, /serial: a\.serial \?\? '',/);
});

test('the opened copy, the live copy and the purchase checks all use it', () => {
    assert.match(form, /const next = editing \? toForm\(live \?\? editing\) : EMPTY;/);
    assert.match(form, /fresh: live \? toForm\(live\) : null,/);
    assert.match(form, /if \(!form\.value\.trim\(\)\) e\.value = required;\s*if \(!form\.vendor_id\) e\.supplier = required;/);
});
