<?php

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Services\Asset\AssetService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use ReflectionMethod;
use Tests\TestCase;

/**
 * The offboarding mail carries the leaver's devices as a table, and every cell in it is a
 * field somebody typed: a model name, a serial off a sticker, a tag written by hand.
 *
 * Two things went wrong the first time it was built. The cells were passed to EmailTable raw,
 * so an ampersand or a stray tag in a serial reached the message as markup — the class says in
 * its own docblock that the caller escapes. And a long serial has nowhere natural to break, so
 * it pushed the table wider than the message instead of wrapping.
 */
class AssetOffboardingTableTest extends TestCase
{
    use RefreshDatabase;

    /** @param  list<Asset>  $assets */
    private function renderTable(array $assets): string
    {
        $method = new ReflectionMethod(AssetService::class, 'assetTable');
        $method->setAccessible(true);

        return $method->invoke(app(AssetService::class), collect($assets));
    }

    public function test_a_serial_typed_with_markup_arrives_as_text_not_as_markup(): void
    {
        $asset = Asset::factory()->create([
            'serial' => 'AB&C <script>alert(1)</script>',
            'tag' => 'PC<b>02</b>',
        ]);

        $html = $this->renderTable([$asset]);

        $this->assertStringNotContainsString('<script>', $html);
        $this->assertStringNotContainsString('PC<b>02</b>', $html);
        $this->assertStringContainsString('&lt;script&gt;', $html);
        $this->assertStringContainsString('AB&amp;C', $html);
    }

    public function test_a_long_serial_wraps_inside_its_column_instead_of_widening_the_table(): void
    {
        $asset = Asset::factory()->create([
            'serial' => 'SNX-2026-INTL-0000000000000000000-REV-B-QC-PASSED-8891234',
        ]);

        $html = $this->renderTable([$asset]);

        // The serial column is allowed to break mid-token; without this the row runs off the
        // side of the message, because the value contains nothing to break at.
        $this->assertStringContainsString('overflow-wrap:anywhere;', $html);
        // And the device column must not inherit the digests' first-column nowrap, which was
        // written for short reference numbers rather than a full model name.
        $this->assertStringNotContainsString('vertical-align:top;white-space:nowrap;', $html);
    }

    public function test_an_absurd_value_is_clipped_rather_than_turning_a_row_into_a_paragraph(): void
    {
        $asset = Asset::factory()->create(['serial' => str_repeat('X', 200)]);

        $html = $this->renderTable([$asset]);

        $this->assertStringNotContainsString(str_repeat('X', 100), $html);
        $this->assertStringContainsString('…', $html);
    }

    public function test_every_column_is_present_and_a_missing_value_reads_as_a_dash(): void
    {
        $asset = Asset::factory()->create(['serial' => null, 'tag' => null]);

        $html = $this->renderTable([$asset]);

        foreach (['Device', 'Type', 'Serial', 'Tag'] as $header) {
            $this->assertStringContainsString($header, $html);
        }
        $this->assertStringContainsString('>-<', $html);
    }
}
