<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\Email\EmailTemplateController;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use ReflectionMethod;
use Tests\TestCase;

/**
 * The sample values behind the preview live in TWO maps and both have to know every variable.
 *
 * EmailTemplateController::sampleVars() renders the message BODY (the API builds that HTML),
 * while the SPA's own SAMPLE_VARS renders the SUBJECT line above the preview frame and — more
 * importantly — is the entire variable-chip menu, the only place an author finds out a
 * variable exists.
 *
 * They drifted the moment the asset mails were added: the body named the device correctly
 * while the subject still read "Asset returned by {{asset.holder}}", and no asset variable
 * could be inserted from the editor at all.
 */
class EmailSampleVarParityTest extends TestCase
{
    use RefreshDatabase;

    /** @return list<string> */
    private function serverKeys(): array
    {
        $method = new ReflectionMethod(EmailTemplateController::class, 'sampleVars');
        $method->setAccessible(true);

        $request = Request::create('/');
        $request->setUserResolver(fn () => new User(['name' => 'Test User', 'email' => 'test@example.com']));

        $keys = array_keys($method->invoke(app(EmailTemplateController::class), $request));
        sort($keys);

        return $keys;
    }

    /** @return list<string> */
    private function clientKeys(): array
    {
        $source = file_get_contents(base_path('resources/js/modules/email-templates/pages/index.tsx'));
        $body = substr($source, strpos($source, 'const SAMPLE_VARS'));
        $body = substr($body, 0, strpos($body, "\n};"));

        // Top-level entries only — quoted ('asset.code') and bare (count) alike.
        preg_match_all("/^\s{4}'?([\w.]+)'?:/m", $body, $matches);
        $keys = $matches[1];
        sort($keys);

        return $keys;
    }

    public function test_the_editor_offers_a_sample_for_every_variable_the_preview_can_fill(): void
    {
        $this->assertNotEmpty($this->serverKeys(), 'sampleVars() could not be read.');
        $this->assertSame(
            $this->serverKeys(),
            $this->clientKeys(),
            'SAMPLE_VARS in email-templates/pages/index.tsx and EmailTemplateController::sampleVars() must list the same variables.',
        );
    }
}
