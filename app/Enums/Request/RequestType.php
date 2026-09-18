<?php

namespace App\Enums\Request;

use App\Enums\Ticket\TicketCategory;

/**
 * The ten IT service request types. Each type maps to exactly one workflow
 * (workflows.request_type) and, for the auto-ticket feature, to a ticket
 * category. ownerSource() names the submitted fields key that carries the
 * owner-bearing Access resource id for `owner` workflow steps.
 */
enum RequestType: string
{
    /*
     * Declaration order IS the display order — the type picker, the Requests filter and the
     * Workflows page all read it rather than sorting alphabetically, which would scatter
     * related types apart. Kit first (computer → hardware → mobile), then the accounts and
     * shares somebody is granted into, then the odds and ends, with `other` last because it
     * is the fallback. resources/js/shared/lib/request-meta.ts holds the same order for the
     * front end; the two are checked against each other by RequestTypeOrderTest.
     */
    case Computer = 'computer';
    case Hardware = 'hardware';
    case Mobile = 'mobile';
    case Email = 'email';
    case Social = 'social';
    case Fileshare = 'fileshare';
    case Software = 'software';
    case Recovery = 'recovery';
    case Mailgroup = 'mailgroup';
    case Telephone = 'telephone';
    case Network = 'network';
    case Cctv = 'cctv';
    case Other = 'other';

    public function label(): string
    {
        return match ($this) {
            self::Computer => 'Computer',
            self::Hardware => 'Hardware / peripheral',
            self::Mobile => 'Mobile device',
            self::Email => 'Email account',
            self::Social => 'Social media access',
            self::Fileshare => 'File share access',
            self::Mailgroup => 'Mail group',
            self::Software => 'Software install',
            self::Recovery => 'Data recovery',
            self::Telephone => 'Telephone',
            self::Network => 'Network',
            self::Cctv => 'CCTV',
            self::Other => 'Other request',
        };
    }

    /**
     * The same service name in Thai.
     *
     * The reader-facing copy lives in the SPA (`lang/<locale>/requests.ts`, keys `req_*`);
     * this pair exists because the SERVER also has to name a service without knowing who
     * will read it: it composes the stored title, and it matches a search term against
     * both languages so a Thai reader finds a row stored in English. Keep the wording in
     * step with those keys — RequestCanonicalTitleTest checks both sides are present.
     */
    public function labelTh(): string
    {
        return match ($this) {
            self::Computer => 'คอมพิวเตอร์',
            self::Hardware => 'ฮาร์ดแวร์ / อุปกรณ์ต่อพ่วง',
            self::Mobile => 'อุปกรณ์มือถือ',
            self::Email => 'บัญชีอีเมล',
            self::Social => 'ขอใช้โซเชียลมีเดีย',
            self::Fileshare => 'ขอเข้าถึงไฟล์แชร์',
            self::Mailgroup => 'กลุ่มเมล',
            self::Software => 'ติดตั้งซอฟต์แวร์',
            self::Recovery => 'กู้คืนข้อมูล',
            self::Telephone => 'โทรศัพท์',
            self::Network => 'ระบบเครือข่าย',
            self::Cctv => 'กล้องวงจรปิด',
            self::Other => 'คำขออื่น ๆ',
        };
    }

    /**
     * Every type whose name, in either language, contains the given term — what the search
     * box needs to look a request up by the service written on the row, rather than by the
     * one string that happens to be stored.
     *
     * @return array<int, string>
     */
    public static function matching(string $term): array
    {
        $needle = mb_strtolower(trim($term));
        if ($needle === '') {
            return [];
        }

        return array_values(array_map(
            fn (self $type) => $type->value,
            array_filter(
                self::cases(),
                fn (self $type) => str_contains(mb_strtolower($type->label()), $needle)
                    || str_contains(mb_strtolower($type->labelTh()), $needle),
            ),
        ));
    }

    /** Ticket category used when the workflow opens an IT ticket on final approval. */
    public function ticketCategory(): TicketCategory
    {
        return match ($this) {
            self::Computer, self::Hardware, self::Mobile => TicketCategory::Hardware,
            // A phone request opens a phone case, not a hardware one: the desk staffed for
            // handsets and extensions is not the desk staffed for laptops, and the level
            // permissions are what route it to them.
            self::Telephone => TicketCategory::Telephone,
            self::Software, self::Email, self::Mailgroup, self::Recovery => TicketCategory::Software,
            self::Network => TicketCategory::Network,
            self::Cctv => TicketCategory::Cctv,
            self::Fileshare => TicketCategory::Network,
            self::Social, self::Other => TicketCategory::Other,
        };
    }

    /**
     * The submitted fields key holding the resource id an `owner` step resolves
     * against, or null when the type has no owner-bearing resource.
     */
    public function ownerSource(): ?string
    {
        return match ($this) {
            self::Mailgroup => 'email_group_id',
            self::Fileshare, self::Recovery => 'file_share_id',
            default => null,
        };
    }
}
