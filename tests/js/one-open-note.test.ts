// InfoPopover notes open one at a time: a new note closes the one before it, on touch as well as mouse.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claimOpenNote, releaseOpenNote } from '../../resources/js/shared/lib/one-open-note.ts';

function note() {
    const closed: number[] = [];
    const close = () => closed.push(1);
    return { close, closedTimes: () => closed.length };
}

test('opening a second note closes the first', () => {
    const first = note();
    const second = note();
    claimOpenNote(first.close);
    claimOpenNote(second.close);
    assert.equal(first.closedTimes(), 1);
    assert.equal(second.closedTimes(), 0);
    releaseOpenNote(second.close);
});

test('tapping through many notes leaves only the last one open', () => {
    const notes = [note(), note(), note(), note()];
    notes.forEach((each) => claimOpenNote(each.close));
    assert.deepEqual(
        notes.map((each) => each.closedTimes()),
        [1, 1, 1, 0],
    );
    releaseOpenNote(notes[3].close);
});

test('the open note claiming again does not close itself', () => {
    const only = note();
    claimOpenNote(only.close);
    claimOpenNote(only.close);
    assert.equal(only.closedTimes(), 0);
    releaseOpenNote(only.close);
});

test('a closed note forgetting itself does not forget the note that replaced it', () => {
    const first = note();
    const second = note();
    const third = note();
    claimOpenNote(first.close);
    claimOpenNote(second.close);
    releaseOpenNote(first.close);
    claimOpenNote(third.close);
    assert.equal(second.closedTimes(), 1);
    releaseOpenNote(third.close);
});

test('after the open note shuts, the next note closes nothing', () => {
    const first = note();
    const second = note();
    claimOpenNote(first.close);
    releaseOpenNote(first.close);
    claimOpenNote(second.close);
    assert.equal(first.closedTimes(), 0);
    releaseOpenNote(second.close);
});
