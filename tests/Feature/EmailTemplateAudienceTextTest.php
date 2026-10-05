<?php

namespace Tests\Feature;

use App\Support\EmailTemplates;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Every standard email template says, in plain words, when it is sent and to whom — the
 * email_when_* / email_to_* keys the template list and editor show in place of the technical
 * trigger key. A template added to the catalogue without them would fall back to its key.
 */
class EmailTemplateAudienceTextTest extends TestCase
{
    /** @return array<string, array{string}> */
    public static function locales(): array
    {
        return ['thai' => ['th'], 'english' => ['en']];
    }

    #[DataProvider('locales')]
    public function test_every_standard_template_has_when_and_to_text(string $locale): void
    {
        $source = file_get_contents(base_path("resources/js/lang/{$locale}/email.ts"));

        foreach (EmailTemplates::keys() as $key) {
            $id = str_replace('.', '_', $key);
            foreach (["email_when_{$id}", "email_to_{$id}"] as $langKey) {
                $this->assertMatchesRegularExpression(
                    // Single quotes, or double when the text has an apostrophe (Prettier's choice).
                    "/^\s+{$langKey}: (['\"]).+\\1,$/m",
                    $source,
                    "{$locale}: {$key} has no {$langKey}.",
                );
            }
        }
    }

    #[DataProvider('locales')]
    public function test_no_text_is_left_for_a_template_that_no_longer_exists(string $locale): void
    {
        $source = file_get_contents(base_path("resources/js/lang/{$locale}/email.ts"));
        preg_match_all('/^\s+email_(?:when|to)_([a-z0-9_]+): /m', $source, $matches);

        $known = array_map(static fn (string $key): string => str_replace('.', '_', $key), EmailTemplates::keys());
        $stray = array_diff(array_unique($matches[1]), [...$known, 'label']);

        $this->assertSame([], array_values($stray), "{$locale}: text for unknown templates.");
    }
}
