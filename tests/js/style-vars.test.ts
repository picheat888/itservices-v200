// styleVars: a ref callback that writes each CSS custom property onto the element, and ignores the null unmount call.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { styleVars } from '../../resources/js/shared/lib/style-vars.ts';

test('sets every variable on the element', () => {
    const set: Record<string, string> = {};
    const el = { style: { setProperty: (name: string, value: string) => (set[name] = value) } } as unknown as HTMLElement;
    styleVars({ '--x': '25%', '--y': '24px' })(el);
    assert.deepEqual(set, { '--x': '25%', '--y': '24px' });
});

test('the unmount call with null does nothing', () => {
    assert.doesNotThrow(() => styleVars({ '--w': '10%' })(null));
});
