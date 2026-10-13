<?php

namespace App\Services\Report\Access;

use App\Models\Access\AccessMembership;
use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Access\SocialPlatform;
use App\Models\Access\Software;
use App\Models\Employee\Employee;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * What the access reports share: the four registries' names, who counts as having left,
 * and how a resource or a person is handed to the page.
 */
final class AccessFacts
{
    /** The registries in the Access page's order, keyed by their morph alias. */
    public const TYPES = ['email_group', 'file_share', 'social_platform', 'software'];

    public const TYPE_KEYS = [
        'email_group' => 'rep_ac_type_email_group', 'file_share' => 'rep_ac_type_file_share',
        'social_platform' => 'rep_ac_type_social_platform', 'software' => 'rep_ac_type_software',
    ];

    /** The same, short enough for a tile's one-line footer. */
    public const TYPE_SHORT_KEYS = [
        'email_group' => 'rep_ac_type_email_group_short', 'file_share' => 'rep_ac_type_file_share_short',
        'social_platform' => 'rep_ac_type_social_platform_short', 'software' => 'rep_ac_type_software',
    ];

    // Mirrors resources/js/lang/th/access.ts.
    public const TYPE_TH = [
        'email_group' => 'Email Groups', 'file_share' => 'File Shares',
        'social_platform' => 'Social / Internet', 'software' => 'Software',
    ];

    /** Each registry's chart tone (the Access module's own colours). */
    public const TYPE_TONES = [
        'email_group' => 'access-email', 'file_share' => 'access-file',
        'social_platform' => 'access-social', 'software' => 'access-software',
    ];

    public const MODELS = [
        'email_group' => EmailGroup::class, 'file_share' => FileShare::class,
        'social_platform' => SocialPlatform::class, 'software' => Software::class,
    ];

    /** Only email groups and file shares have an owner and a department. */
    public const OWNABLE = ['email_group', 'file_share'];

    public const LEVEL_KEYS = ['Read' => 'rep_ac_level_read', 'Write' => 'rep_ac_level_write', 'member' => 'rep_ac_level_member'];

    public const LEVEL_TH = ['Read' => 'Read', 'Write' => 'Read/Write', 'member' => 'สมาชิก'];

    /** The Access page tab each registry opens on. */
    public const TABS = [
        'email_group' => 'email-groups', 'file_share' => 'file-shares',
        'social_platform' => 'social-platforms', 'software' => 'software',
    ];

    /**
     * Resigned with the last day behind them (or none recorded) — Employee::hasLeft() in SQL,
     * on the `employees` table joined or queried.
     */
    public static function whereLeft(Builder $query, string $table = 'employees'): Builder
    {
        return $query->where("{$table}.status", 'resigned')
            ->where(fn (Builder $w) => $w->whereNull("{$table}.last_day")->orWhere("{$table}.last_day", '<', today()->toDateString()));
    }

    /** Memberships with the resource and what naming it needs (department, brand), and its owner when asked. */
    public static function withResource(Builder $query, bool $owners = false): Builder
    {
        $ownable = $owners ? ['department', 'owner'] : ['department'];

        return $query->with(['resource' => fn (MorphTo $morph) => $morph->morphWith([
            EmailGroup::class => $ownable,
            FileShare::class => $ownable,
            Software::class => ['brand'],
        ])]);
    }

    /** The address a resource is found by: an email, a path, a URL, or the software's brand. */
    public static function detail(?Model $resource): ?string
    {
        return match (true) {
            $resource instanceof EmailGroup => $resource->email,
            $resource instanceof FileShare => $resource->path,
            $resource instanceof SocialPlatform => $resource->url,
            $resource instanceof Software => $resource->brand?->name,
            default => null,
        };
    }

    /** @return array{name: string, name_th: ?string}|null */
    public static function department(?Model $owner): ?array
    {
        $department = $owner?->getRelationValue('department');

        return $department ? ['name' => $department->name, 'name_th' => $department->name_th] : null;
    }

    /** Whole days since a leaver's last day; null when none was recorded. */
    public static function daysOut(Employee $employee): ?int
    {
        return self::daysSince($employee->last_day);
    }

    /** Whole days from a last day to today; null without one. */
    public static function daysSince(?CarbonInterface $day): ?int
    {
        return $day ? (int) $day->copy()->startOfDay()->diffInDays(today()) : null;
    }

    /**
     * A resource as the cards list it.
     *
     * @return array{type: string, id: int, code: ?string, name: ?string, detail: ?string, department: array{name: string, name_th: ?string}|null}
     */
    public static function resource(Model $resource, string $type): array
    {
        return [
            'type' => $type,
            'id' => (int) $resource->getKey(),
            'code' => $resource->getAttribute('code'),
            'name' => $resource->getAttribute('name'),
            'detail' => self::detail($resource),
            'department' => in_array($type, self::OWNABLE, true) ? self::department($resource) : null,
        ];
    }

    /**
     * A person as the cards list them.
     *
     * @return array{employee_id: int, code: string, name: string, department: array{name: string, name_th: ?string}|null, last_day: ?string, days: ?int}
     */
    public static function person(Employee $employee): array
    {
        return [
            'employee_id' => (int) $employee->id,
            'code' => (string) $employee->code,
            'name' => $employee->name,
            'department' => self::department($employee),
            'last_day' => $employee->last_day?->toDateString(),
            'days' => $employee->hasLeft() ? self::daysOut($employee) : null,
        ];
    }

    /** A grant's level as the page and the file call it: Read, Read/Write, or a plain membership. */
    public static function level(AccessMembership $membership): string
    {
        return in_array($membership->access_level, ['Read', 'Write'], true) ? $membership->access_level : 'member';
    }
}
