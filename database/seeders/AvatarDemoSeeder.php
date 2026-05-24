<?php

namespace Database\Seeders;

use App\Models\Employee;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;

/**
 * Generates three license-free gradient "initials" avatars (SVG) and assigns
 * them to the demo users that have login accounts, so the Sidebar / Profile
 * profile picture can be exercised. Idempotent: re-running rewrites the same
 * files and re-points the same employees.
 */
class AvatarDemoSeeder extends Seeder
{
    public function run(): void
    {
        // employee code => flat cartoon-person avatar config (hair style + palette)
        $avatars = [
            // Wichai (super) — short hair, blue
            'EMP-1617' => ['style' => 'short', 'from' => '#3b82f6', 'to' => '#1e3a8a', 'skin' => '#f1c9a5', 'hair' => '#2b2b2b', 'shirt' => '#1d4ed8'],
            // Kanya (it) — long hair, emerald
            'EMP-1718' => ['style' => 'long', 'from' => '#10b981', 'to' => '#065f46', 'skin' => '#f8d2b8', 'hair' => '#6b3f24', 'shirt' => '#047857'],
            // Ratana (hr) — hair bun, violet
            'EMP-1509' => ['style' => 'bun', 'from' => '#a78bfa', 'to' => '#4c1d95', 'skin' => '#e6b58a', 'hair' => '#1f2937', 'shirt' => '#6d28d9'],
        ];

        foreach ($avatars as $code => $a) {
            $employee = Employee::where('code', $code)->first();
            if (! $employee) {
                continue;
            }

            $path = "employees/avatar-{$code}.svg";
            Storage::disk('public')->put($path, $this->svg($a));
            $employee->update(['photo_path' => $path]);
        }

        $this->command?->info('Seeded ' . count($avatars) . ' demo avatars.');
    }

    /**
     * Builds a 256×256 flat cartoon-person avatar (gradient background, head,
     * hair, shoulders, simple face) from a palette + hair style.
     *
     * @param  array{style:string, from:string, to:string, skin:string, hair:string, shirt:string}  $a
     */
    private function svg(array $a): string
    {
        $eye = '#1f2937';

        // Long hair draped behind the shoulders (drawn first so the body covers its base).
        $longHair = $a['style'] === 'long'
            ? "<rect x=\"74\" y=\"72\" width=\"108\" height=\"150\" rx=\"54\" fill=\"{$a['hair']}\"/>"
            : '';

        // A bun sitting on top of the head.
        $bun = $a['style'] === 'bun'
            ? "<circle cx=\"128\" cy=\"54\" r=\"17\" fill=\"{$a['hair']}\"/>"
            : '';

        return <<<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{$a['from']}"/>
      <stop offset="1" stop-color="{$a['to']}"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" fill="url(#bg)"/>
  {$longHair}
  <!-- hair crown (behind face) -->
  <ellipse cx="128" cy="98" rx="50" ry="50" fill="{$a['hair']}"/>
  {$bun}
  <!-- shoulders / shirt -->
  <path d="M58 256 C58 200 92 174 128 174 C164 174 198 200 198 256 Z" fill="{$a['shirt']}"/>
  <!-- neck -->
  <rect x="115" y="148" width="26" height="26" rx="11" fill="{$a['skin']}"/>
  <!-- ears -->
  <circle cx="84" cy="116" r="9" fill="{$a['skin']}"/>
  <circle cx="172" cy="116" r="9" fill="{$a['skin']}"/>
  <!-- face -->
  <circle cx="128" cy="112" r="44" fill="{$a['skin']}"/>
  <!-- eyes -->
  <circle cx="112" cy="110" r="5" fill="{$eye}"/>
  <circle cx="144" cy="110" r="5" fill="{$eye}"/>
  <!-- smile -->
  <path d="M112 130 Q128 144 144 130" stroke="{$eye}" stroke-width="5" fill="none" stroke-linecap="round"/>
</svg>
SVG;
    }
}
