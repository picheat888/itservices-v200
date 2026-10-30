// Auth round (AUTH-2 AUTH-4 AUTH-5): an unlinked account edits only its English name, a sign-out reaches the other tabs, a password owed mid-session opens the wall.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '../../resources/js');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

test('an unlinked account sends only its English name and has no photo button', () => {
    const drawer = read('modules/profile/components/profile-drawer.tsx');
    assert.match(drawer, /\{canEdit && linked && \(\s*<button[\s\S]*?profile_change_photo/);
    assert.match(
        drawer,
        /if \(linked\) \{\s*form\.append\('first_name_th'[\s\S]*?form\.append\('phone', phone\);\s*if \(photo\) form\.append\('photo', photo\);\s*\}/,
    );
    assert.match(drawer, /linked=\{linked\}/);
});

test('the details tab greys the employee fields and says why', () => {
    const tab = read('modules/profile/components/profile-details-tab.tsx');
    assert.match(tab, /disabled=\{!canEdit \|\| \(!linked && !isName\(key\)\)\}/);
    assert.match(tab, /\{canEdit && !linked && <p[^>]*>\{t\('profile_unlinked_note'\)\}<\/p>\}/);
    for (const lang of ['en', 'th']) {
        assert.match(read(`lang/${lang}/profile.ts`), /profile_unlinked_note: '/);
    }
});

test('signing out announces it after the server ends the session, and tabs skip their own news', () => {
    assert.match(read('modules/auth/hooks/use-auth.ts'), /await authApi\.logout\(\);\s*announceSignOut\(\);/);
    assert.match(read('modules/auth/hooks/use-session-timeout.ts'), /message\.from !== SESSION_TAB_ID\) leaveForLogin\(false, message\.reason\)/);
});

test('a 403 password_expired reloads /me and words the form error', () => {
    const http = read('shared/lib/http.ts');
    assert.match(http, /passwordNewlyOwed\(status, error\.response\.data, queryClient\.getQueryData<User \| null>\(ME_KEY\)\)/);
    assert.match(http, /error\.response\.data\.message = translate\(useUiStore\.getState\(\)\.lang, 'pwd_expired_title'\)/);
});
