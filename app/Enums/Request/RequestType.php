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
    case Computer = 'computer';
    case Hardware = 'hardware';
    case Mobile = 'mobile';
    case Email = 'email';
    case Social = 'social';
    case Fileshare = 'fileshare';
    case Mailgroup = 'mailgroup';
    case Software = 'software';
    case Recovery = 'recovery';
    case Telephone = 'telephone';
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
            self::Other => 'Other request',
        };
    }

    /** Ticket category used when the workflow opens an IT ticket on final approval. */
    public function ticketCategory(): TicketCategory
    {
        return match ($this) {
            self::Computer, self::Hardware, self::Mobile, self::Telephone => TicketCategory::Hardware,
            self::Software, self::Email, self::Mailgroup, self::Recovery => TicketCategory::Software,
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
