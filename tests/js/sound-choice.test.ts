// Settings → Sound: how the saved choice reads from the settings payload and when Save turns on.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { soundChoiceChanged, soundChoiceOf } from '../../resources/js/modules/settings/lib/sound-choice.ts';

test('the saved choice reads the key and the on/off flag', () => {
    assert.deepEqual(soundChoiceOf({ notification_sound: 'pop', notification_sound_enabled: '1' }), { sound: 'pop', enabled: true });
    assert.deepEqual(soundChoiceOf({ notification_sound: 'pluck', notification_sound_enabled: '0' }), { sound: 'pluck', enabled: false });
});

test('Save stays off until the sound or the switch differs from what was saved', () => {
    const saved = { sound: 'pluck', enabled: true };
    assert.equal(soundChoiceChanged({ sound: 'pluck', enabled: true }, saved), false);
    assert.equal(soundChoiceChanged({ sound: 'pop', enabled: true }, saved), true);
    assert.equal(soundChoiceChanged({ sound: 'pluck', enabled: false }, saved), true);
});

test('picking a sound and picking the saved one back leaves nothing to save', () => {
    const saved = { sound: 'chime', enabled: false };
    const draft = { ...saved, sound: 'harp' };
    assert.equal(soundChoiceChanged({ ...draft, sound: 'chime' }, saved), false);
});
