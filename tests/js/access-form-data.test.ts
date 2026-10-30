// Saving a software or social platform with a new logo goes multipart; a cleared field must still reach the server (PRM-5).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasFile, toFormData } from '../../resources/js/modules/access/lib/form-data.ts';

test('a cleared field goes as an empty value, not left out', () => {
    const fd = toFormData({ name: 'LINE', url: null, notes: null, logo: new File(['x'], 'line.png') });
    assert.equal(fd.get('url'), '');
    assert.equal(fd.get('notes'), '');
    assert.equal(fd.get('name'), 'LINE');
    assert.ok(fd.get('logo') instanceof File);
});

test('undefined stays out and booleans go as 1 or 0', () => {
    const fd = toFormData({ vendor: undefined, remove_logo: false, seats_unlimited: true });
    assert.equal(fd.has('vendor'), false);
    assert.equal(fd.get('remove_logo'), '0');
    assert.equal(fd.get('seats_unlimited'), '1');
});

test('only a payload with a file goes multipart', () => {
    assert.equal(hasFile({ name: 'LINE', url: null }), false);
    assert.equal(hasFile({ name: 'LINE', logo: new File(['x'], 'line.png') }), true);
});
