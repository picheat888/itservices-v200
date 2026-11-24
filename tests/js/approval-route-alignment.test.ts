// The approval route lines and markers line up: the vertical trail in the request detail and the horizontal strip.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const num = (source: string, pattern: RegExp, what: string): number => {
    const match = source.match(pattern);
    assert.ok(match, `${what} not found`);
    return Number(match[1]);
};

const trail = read('resources/js/modules/request/components/request-trail.tsx');
const strip = read('resources/js/modules/workflow/components/workflow-strip.tsx');

test('the trail connector leaves the same gap below a marker as above the next one', () => {
    const marker = num(trail, /flex h-\[(\d+)px\] w-\[\d+px\] items-center justify-center rounded-full/, 'marker size');
    const lineTop = num(trail, /absolute top-\[(\d+)px\] -bottom-\d+/, 'connector top');
    const lineOverhang = num(trail, /-bottom-(\d+)/, 'connector bottom') * 4;
    const rowGap = num(trail, /relative space-y-(\d+)/, 'row gap') * 4;

    assert.equal(lineTop - marker, rowGap - lineOverhang);
});

test('the trail connector runs through the middle of the markers', () => {
    const marker = num(trail, /flex h-\[(\d+)px\] w-\[\d+px\] items-center justify-center rounded-full/, 'marker size');
    const lineLeft = num(trail, /-bottom-\d+ left-\[(\d+)px\] w-px/, 'connector left');

    assert.equal(lineLeft + 0.5, marker / 2);
});

test('the step number sits by its cap height, not its Thai line box', () => {
    assert.match(trail, /<span className="[^"]*\[text-box:trim-both_cap_alphabetic\][^"]*">\{row\.position\}<\/span>/);
});

test('the strip connector runs through the middle of the markers', () => {
    assert.match(strip, /flex h-7 w-7 items-center justify-center rounded-full/);
    const lineTop = num(strip, /bg-border mt-\[(\d+)px\] h-0\.5/, 'connector top');

    assert.equal(lineTop + 1, 28 / 2);
});
