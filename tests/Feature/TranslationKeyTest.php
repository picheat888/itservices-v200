<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * Guards the i18n dictionaries, which nothing else can.
 *
 * translate() falls back to returning the key when it finds no entry, and useT() is
 * typed as (key: string) => string — so a key that was never defined is not a compile
 * error and not a runtime error either. It just renders the key on the page, and the
 * only way anyone finds out is by looking at the screen. `pos_empty` reached production
 * that way, printing itself as the org chart's empty state.
 *
 * Static t('literal') calls are checked here; the ~120 computed ones
 * (t(`notif_${subtype}`), t(tab.label), t(nav.perm)) cannot be resolved without running
 * the app, so they stay uncovered.
 */
class TranslationKeyTest extends TestCase
{
    /** Locales that must each define every key. */
    private const LOCALES = ['en', 'th'];

    public function test_every_static_translation_key_exists_in_every_locale(): void
    {
        $used = $this->staticKeysUsed();
        $this->assertNotEmpty($used, 'the scan found no t() calls at all — it has stopped working');

        foreach (self::LOCALES as $locale) {
            $defined = $this->keysDefinedIn($locale);
            $missing = array_values(array_diff(array_keys($used), $defined));

            $this->assertSame([], $missing, sprintf(
                "these keys are used but not defined in lang/%s:\n%s",
                $locale,
                implode("\n", array_map(fn (string $k) => "  {$k}   first used in {$used[$k]}", $missing)),
            ));
        }
    }

    /** Neither locale may carry a key the other lacks, or the UI changes shape with language. */
    public function test_the_locales_define_exactly_the_same_keys(): void
    {
        $en = $this->keysDefinedIn('en');
        $th = $this->keysDefinedIn('th');

        $this->assertSame([], array_values(array_diff($en, $th)), 'defined in en but missing in th');
        $this->assertSame([], array_values(array_diff($th, $en)), 'defined in th but missing in en');
    }

    /**
     * Every t('literal') in the SPA, mapped to the file it first appears in.
     *
     * @return array<string, string>
     */
    private function staticKeysUsed(): array
    {
        $keys = [];

        foreach ($this->sourceFiles(resource_path('js')) as $file) {
            preg_match_all("/\bt\(\s*'([a-zA-Z0-9_]+)'\s*\)/", (string) file_get_contents($file), $matches);
            foreach ($matches[1] as $key) {
                $keys[$key] ??= str_replace(base_path().DIRECTORY_SEPARATOR, '', $file);
            }
        }

        return $keys;
    }

    /**
     * Every key declared across lang/<locale>/*.ts. They are plain object literals, so
     * the four-space-indented `key:` lines are the entries.
     *
     * @return list<string>
     */
    private function keysDefinedIn(string $locale): array
    {
        $keys = [];

        foreach (glob(resource_path("js/lang/{$locale}/*.ts")) as $file) {
            preg_match_all('/^ {4}([a-zA-Z0-9_]+)\s*:/m', (string) file_get_contents($file), $matches);
            $keys = array_merge($keys, $matches[1]);
        }

        sort($keys);

        return array_values(array_unique($keys));
    }

    /**
     * Every .ts/.tsx file under the SPA except the dictionaries themselves.
     *
     * @return list<string>
     */
    private function sourceFiles(string $root): array
    {
        $langDir = resource_path('js'.DIRECTORY_SEPARATOR.'lang');
        $files = [];

        $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS));
        foreach ($it as $entry) {
            /** @var \SplFileInfo $entry */
            if (! $entry->isFile() || ! in_array($entry->getExtension(), ['ts', 'tsx'], true)) {
                continue;
            }
            if (str_starts_with($entry->getPathname(), $langDir)) {
                continue;
            }
            $files[] = $entry->getPathname();
        }

        return $files;
    }
}
