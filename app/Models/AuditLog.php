<?php

namespace App\Models;

use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Employee\Section;
use App\Models\Permission\GroupRole;
use App\Models\Permission\Role;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\Brand;
use App\Models\Stock\StockItem;
use App\Models\Ticket\Ticket;
use App\Models\Workflow\Workflow;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\Facades\Auth;

class AuditLog extends Model
{
    protected $fillable = ['user_id', 'user_name', 'action', 'target', 'subject_type', 'subject_id', 'details'];

    protected $casts = ['details' => 'array'];

    /** Fields never worth recording in an audit diff. */
    private const DIFF_HIDDEN = ['updated_at', 'created_at', 'updated_by', 'password', 'remember_token'];

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
        'asset_id' => [Asset::class, 'asset_code'],
        'related_asset_id' => [Asset::class, 'asset_code'],
        'stock_item_id' => [StockItem::class, 'name'],
        'service_request_id' => [ServiceRequest::class, 'reference'],
        'workflow_id' => [Workflow::class, 'name'],
        'ticket_id' => [Ticket::class, 'ticket_no'],
        'approver_employee_id' => [Employee::class, 'name'],
        'written_off_by' => [User::class, 'name'],
        'cancelled_by' => [User::class, 'name'],
        'writeoff_reason_id' => [WriteoffReason::class, 'name'],
    ];

    /**
     * Record an audit entry for the current (or system) actor. `$subject` is the record it is about,
     * so that record's whole history reads back by subject_type / subject_id (see forSubject())
     * rather than by matching the free-text target.
     */
    public static function record(string $action, ?string $target = null, ?array $details = null, ?Model $subject = null): void
    {
        $user = Auth::user();
        static::create([
            'user_id' => $user?->id,
            'user_name' => $user?->name ?? 'System',
            'action' => $action,
            'target' => $target,
            'subject_type' => $subject !== null ? static::subjectType($subject) : null,
            'subject_id' => $subject?->getKey(),
            'details' => $details,
        ]);
    }

    /**
     * Record a delete with the row as it stood (details.snapshot). Deletes are hard, so this snapshot is
     * what is left of the record afterwards; passwords, tokens and the model's hidden fields are left out.
     * It reads the attributes still held in memory, so it works just before or just after the delete.
     *
     * @param  array<string, mixed>|null  $details
     */
    public static function recordDeleted(string $action, ?string $target, Model $model, ?array $details = null): void
    {
        $snapshot = collect($model->getAttributes())
            ->except(['password', 'remember_token', ...$model->getHidden()])
            ->all();

        static::record($action, $target, [...($details ?? []), 'snapshot' => $snapshot], $model);
    }

    /**
     * The stored subject_type: the morph-map alias when the model has one, else its class name. Not
     * getMorphClass() — the app enforces a morph map that lists only a few models, and that throws for
     * the rest.
     */
    public static function subjectType(Model $subject): string
    {
        return Relation::getMorphAlias($subject::class);
    }

    /**
     * Every entry about one record, oldest first.
     *
     * @return Builder<static>
     */
    public static function forSubject(Model $subject): Builder
    {
        return static::query()
            ->where('subject_type', static::subjectType($subject))
            ->where('subject_id', $subject->getKey())
            ->orderBy('id');
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

        // Load the record so computed accessors (e.g. Employee::$name, built from
        // first_name + last_name) resolve too — not just real columns.
        $label = $class::find($value)?->{$attr};

        return ($label === null || $label === '') ? "#{$value}" : $label;
    }
}
