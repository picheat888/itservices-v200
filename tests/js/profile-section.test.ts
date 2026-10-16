// The profile drawer's `?section=` resolves to a section the user may see, else the profile itself.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { profileSectionFrom } from '../../resources/js/modules/profile/lib/profile-section.ts';

const all = ['profile', 'assets', 'tickets', 'requests', 'access'] as const;

test('a known, allowed section is returned', () => assert.equal(profileSectionFrom('assets', all), 'assets'));
test('unknown falls back to profile', () => assert.equal(profileSectionFrom('foo', all), 'profile'));
test('a section the user may not see falls back to profile', () => assert.equal(profileSectionFrom('assets', ['profile', 'tickets']), 'profile'));
test('absent falls back to profile', () => assert.equal(profileSectionFrom(null, all), 'profile'));
