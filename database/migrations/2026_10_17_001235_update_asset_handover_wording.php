<?php

// Moves the stored hand-over bell and email wording to the "รับมอบ / Accept in My Profile" standard.
// Only text still holding the old standard changes; an administrator's own wording stays.

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /** @var array<string, array<string, array{0: string, 1: string}>> bell key => column => [old, new] */
    private const WORDING = [
        'notif_asset_assigned' => [
            'message_en' => ['An asset was transferred to you. Check and accept it.', 'IT handed you an asset. Accept it in My Profile.'],
            'message_th' => ['โอนทรัพย์สินให้คุณแล้ว รอคุณตรวจรับ', 'IT โอนทรัพย์สินให้คุณแล้ว กดรับมอบในโปรไฟล์ของฉัน'],
        ],
    ];

    /** @var array{0: string, 1: string} */
    private const SUBJECT = ['Asset Management: Your new asset is ready: {{asset.code}}', 'Asset Management: {{asset.code}} is waiting for you to accept'];

    /** @var array{0: string, 1: string} */
    private const BODY_LINE = ['<p>Please confirm receipt in {{app.name}}.</p>', '<p>Open My Profile in {{app.name}} and press Accept.</p>'];

    public function up(): void
    {
        $this->swap(from: 0, to: 1);
    }

    public function down(): void
    {
        $this->swap(from: 1, to: 0);
    }

    private function swap(int $from, int $to): void
    {
        foreach (self::WORDING as $key => $columns) {
            foreach ($columns as $column => $pair) {
                DB::table('notification_templates')
                    ->where('key', $key)
                    ->where($column, $pair[$from])
                    ->update([$column => $pair[$to]]);
            }
        }

        DB::table('email_templates')
            ->where('key', 'asset.assigned')
            ->where('subject', self::SUBJECT[$from])
            ->update(['subject' => self::SUBJECT[$to]]);

        $template = DB::table('email_templates')->where('key', 'asset.assigned')->first();
        if ($template !== null && str_contains($template->body_html, self::BODY_LINE[$from])) {
            DB::table('email_templates')
                ->where('key', 'asset.assigned')
                ->update(['body_html' => str_replace(self::BODY_LINE[$from], self::BODY_LINE[$to], $template->body_html)]);
        }
    }
};
