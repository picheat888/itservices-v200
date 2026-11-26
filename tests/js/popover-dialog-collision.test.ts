// A popover portaled into a dialog flips or shifts inside the dialog's edges, so the dialog never clips it (date fields near the bottom of a form).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const popover = readFileSync(join(import.meta.dirname, '../../resources/js/shared/ui/popover.tsx'), 'utf8');

test('a popover inside a dialog keeps to the dialog edges', () => {
    assert.match(popover, /collisionBoundary=\{collisionBoundary \?\? container \?\? undefined\}/);
    assert.match(popover, /collisionPadding=\{collisionPadding \?\? \(container \? 8 : undefined\)\}/);
});
