<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

class AuditLog extends Model
{
    protected $fillable = ['user_id', 'user_name', 'action', 'target', 'details'];

    protected $casts = ['details' => 'array'];

    /** Fields never worth recording in an audit diff. */
    private const DIFF_HIDDEN = ['updated_at', 'created_at', 'password', 'remember_token'];

    /**
     * Foreign-key columns resolved to a human label in audit diffs, so a stored
     * `position_id` change reads as the position title rather than a raw id. The
     * label is captured at write time, which is point-in-time correct for an
     * audit trail (a later rename of the entity does not rewrite history).
     *
     * Each column name maps to one entity app-wide, so this is applied globally
     * to every model that records changes — no per-controller wiring needed.
     *
     * @var array<string, array{0: class-string<Model>, 1: string}>
     */
    private const FK_LABELS = [
        'position_id' => [Position::class, 'title'],
        'department_id' => [Department::class, 'name'],
        'section_id' => [Section::class, 'name'],
        'manager_id' => [Employee::class, 'name'],
        'employee_id' => [Employee::class, 'name'],
        'requester_id' => [Employee::class, 'name'],
        'assignee_id' => [User::class, 'name'],
        'user_id' => [User::class, 'name'],
        'role_id' => [Role::class, 'name'],
        'group_role_id' => [GroupRole::class, 'name'],
        'contract_id' => [Contract::class, 'name'],
        'brand_id' => [Brand::class, 'name'],
        'asset_id' => [Asset::class, 'tag'],
        'related_asset_id' => [Asset::class, 'tag'],
        'stock_item_id' => [StockItem::class, 'name'],
    ];

    /** Record an audit entry for the current (or system) actor. */
    public static function record(string $action, ?string $target = null, ?array $details = null): void
    {
        $user = Auth::user();
        static::create([
            'user_id' => $user?->id,
            'user_name' => $user?->name ?? 'System',
            'action' => $action,
            'target' => $target,
            'details' => $details,
        ]);
    }

    /**
     * Build a field-level before/after diff to attach as audit `details`.
     * Capture `$before = $model->getOriginal()` (or `->getAttributes()`) BEFORE the
     * update, then call this AFTER `$model->save()` — it reads the saved changes and
     * pairs each changed field with its prior value.
     *
     * Returns `['changes' => ['field' => ['from' => .., 'to' => ..], ...]]`,
     * or null when nothing meaningful changed (so `record()` stores no details).
     *
     * @param  array<string, mixed>  $before
     * @param  array<int, string>  $hidden  extra fields to omit (merged with defaults)
     * @return array<string, mixed>|null
     */
    public static function changes(array $before, Model $after, array $hidden = []): ?array
    {
        $skip = array_merge(self::DIFF_HIDDEN, $hidden);
        $diff = [];

        foreach ($after->getChanges() as $field => $to) {
            if (in_array($field, $skip, true)) {
                continue;
            }
            $from = $before[$field] ?? null;
            $diff[$field] = [
                'from' => self::resolveLabel($field, $from),
                'to' => self::resolveLabel($field, $to),
            ];
        }

        return $diff === [] ? null : ['changes' => $diff];
    }

    /**
     * Swap a foreign-key id for its entity label (e.g. position_id 12 → "Manager"),
     * falling back to "#<id>" when the record no longer exists. Non-FK values and
     * nulls pass through unchanged.
     */
    private static function resolveLabel(string $field, mixed $value): mixed
    {
        if ($value === null || ! isset(self::FK_LABELS[$field])) {
            return $value;
        }

        [$class, $attr] = self::FK_LABELS[$field];

        return $class::query()->whereKey($value)->value($attr) ?? "#{$value}";
    }
}
