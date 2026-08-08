<?php

namespace App\Support;

use App\Enums\Request\RequestType;
use App\Models\Settings\RequestOption;
use Illuminate\Validation\Rule;

/**
 * Single source of truth for the per-type dynamic fields of a service request.
 * Consumed by BOTH the options endpoint (drives the New Request dialog) and
 * StoreServiceRequestRequest (validation rules), so the UI schema and the
 * server rules can never drift apart.
 *
 * Kept deliberately short: a request only has to say WHICH resource or device is
 * wanted. The "why", the quantity and the timing belong in the free-text reason,
 * so approvers read one story instead of a form full of half-answers.
 *
 * Field shape:
 *  key         — fields JSON key
 *  label_en/th — display labels (rendered by the SPA per language)
 *  input       — text | textarea | email | number | date | select | source
 *  options     — static choices for `select`: [{value, label_en, label_th}]
 *  managed     — the choices are rows of `request_options`, editable in Settings
 *                → Master data → Request data. The field then behaves as a
 *                foreign key: its value is the option's id, the inline `options`
 *                below are seed data for RequestOptionSeeder, and the key is
 *                named *_id like every other reference.
 *  source      — options endpoint dataset for `source`: email_groups |
 *                file_shares | social_platforms | softwares | locations
 *  required    — enforced server-side (and starred in the UI)
 *  mono        — render with the mono font (codes, paths, emails)
 *  allow_other — on a `source` field: the sibling key that holds a typed-in
 *                value when the wanted item is not on the list. Exactly one of
 *                the two must be filled.
 *  internal    — the SPA does not render this field on its own; it is revealed
 *                by the `allow_other` partner above.
 */
class RequestSchemas
{
    /**
     * @return array<string, list<array<string, mixed>>>
     */
    public static function all(): array
    {
        return [
            // Computers and the things you plug into them are separate services now —
            // they follow different approval chains. The peripheral options moved
            // wholesale to Hardware rather than being invented there.
            RequestType::Computer->value => [
                // `managed` like Hardware below: the two choices started as fixed
                // slugs, which meant a new kind of machine needed a deploy. They are
                // rows now, so IT adds one in Settings → Request data.
                ['key' => 'device_id', 'label_en' => 'Device type', 'label_th' => 'อุปกรณ์ที่ต้องการ', 'input' => 'select', 'required' => true, 'managed' => true, 'options' => [
                    ['label_en' => 'Laptop', 'label_th' => 'โน้ตบุ๊ก'],
                    ['label_en' => 'Desktop PC', 'label_th' => 'คอมพิวเตอร์ตั้งโต๊ะ'],
                ]],
            ],
            RequestType::Hardware->value => [
                // `managed`: the choices live in request_options and are edited in
                // Settings → Master data → Request data. The list below is only the
                // seed for a fresh install.
                ['key' => 'device_id', 'label_en' => 'Hardware', 'label_th' => 'อุปกรณ์ที่ต้องการ', 'input' => 'select', 'required' => true, 'managed' => true, 'options' => [
                    ['label_en' => 'Monitor', 'label_th' => 'จอภาพ'],
                    ['label_en' => 'Printer', 'label_th' => 'เครื่องพิมพ์'],
                    ['label_en' => 'Accessory', 'label_th' => 'อุปกรณ์เสริม'],
                ]],
            ],
            RequestType::Mobile->value => [
                ['key' => 'device_id', 'label_en' => 'Device', 'label_th' => 'ประเภทอุปกรณ์', 'input' => 'select', 'required' => true, 'managed' => true, 'options' => [
                    ['label_en' => 'Smartphone', 'label_th' => 'สมาร์ตโฟน'],
                    ['label_en' => 'Tablet', 'label_th' => 'แท็บเล็ต'],
                    ['label_en' => 'Pocket Wi-Fi', 'label_th' => 'พ็อกเก็ตไวไฟ'],
                ]],
                // Required: left blank, IT has to go and ask, which is the one thing the
                // field exists to prevent. Two options, so answering costs a single click.
                ['key' => 'sim', 'label_en' => 'SIM & data plan', 'label_th' => 'ต้องการซิม / แพ็กเกจดาต้า', 'input' => 'select', 'required' => true, 'options' => [
                    ['value' => 'yes', 'label_en' => 'Yes', 'label_th' => 'ต้องการ'],
                    ['value' => 'no', 'label_en' => 'No', 'label_th' => 'ไม่ต้องการ'],
                ]],
            ],
            RequestType::Email->value => [
                ['key' => 'address', 'label_en' => 'Requested address', 'label_th' => 'อีเมลที่ต้องการ', 'input' => 'email', 'required' => true, 'mono' => true, 'placeholder' => 'john.doe@example.com'],
            ],
            RequestType::Social->value => [
                ['key' => 'social_platform_id', 'label_en' => 'Platform', 'label_th' => 'แพลตฟอร์ม', 'input' => 'source', 'source' => 'social_platforms', 'required' => true],
            ],
            RequestType::Fileshare->value => [
                ['key' => 'file_share_id', 'label_en' => 'Share path', 'label_th' => 'โฟลเดอร์ที่ต้องเข้าถึง', 'input' => 'source', 'source' => 'file_shares', 'required' => true, 'mono' => true],
                // Read / Read-write only — Access Directory grants no "full control".
                ['key' => 'access_level', 'label_en' => 'Access level', 'label_th' => 'ระดับสิทธิ์', 'input' => 'select', 'required' => true, 'options' => [
                    ['value' => 'read', 'label_en' => 'Read', 'label_th' => 'อ่านอย่างเดียว'],
                    ['value' => 'write', 'label_en' => 'Read/Write', 'label_th' => 'อ่าน-เขียน'],
                ]],
            ],
            RequestType::Mailgroup->value => [
                ['key' => 'email_group_id', 'label_en' => 'Mail group', 'label_th' => 'กลุ่มเมล', 'input' => 'source', 'source' => 'email_groups', 'required' => true, 'mono' => true],
            ],
            RequestType::Software->value => [
                // The catalogue comes from Access Directory (brand + name). Anything
                // not listed is typed into the sibling `software_other` field.
                ['key' => 'software_id', 'label_en' => 'Software', 'label_th' => 'ซอฟต์แวร์', 'input' => 'source', 'source' => 'softwares', 'allow_other' => 'software_other'],
                ['key' => 'software_other', 'label_en' => 'Other software', 'label_th' => 'ซอฟต์แวร์อื่น ๆ', 'input' => 'text', 'internal' => true, 'placeholder' => 'AutoCAD LT 2026'],
            ],
            RequestType::Recovery->value => [],
            RequestType::Telephone->value => [
                ['key' => 'device_type_id', 'label_en' => 'Device', 'label_th' => 'ประเภทเครื่อง', 'input' => 'select', 'required' => true, 'managed' => true, 'options' => [
                    ['label_en' => 'Analog phone', 'label_th' => 'โทรศัพท์อนาล็อก'],
                    ['label_en' => 'IP phone', 'label_th' => 'โทรศัพท์ IP'],
                ]],
                ['key' => 'location_id', 'label_en' => 'Install location', 'label_th' => 'สถานที่ติดตั้ง', 'input' => 'source', 'source' => 'locations', 'required' => true],
            ],
            RequestType::Other->value => [],
        ];
    }

    /**
     * How many columns step ② lays its fields out in, per service. Not derivable
     * from the field count — a mail group's single picker reads better under the
     * reason, while a social platform's sits beside it — so it is stated per type.
     *
     * @return array<string, int>
     */
    public static function layouts(): array
    {
        return [
            RequestType::Computer->value => 1,
            RequestType::Hardware->value => 1,
            RequestType::Mobile->value => 2,
            RequestType::Email->value => 1,
            RequestType::Social->value => 2,
            RequestType::Fileshare->value => 2,
            RequestType::Mailgroup->value => 1,
            RequestType::Software->value => 2,
            RequestType::Recovery->value => 1,
            RequestType::Telephone->value => 2,
            RequestType::Other->value => 1,
        ];
    }

    /** Column count for one type (1 or 2). */
    public static function columns(RequestType $type): int
    {
        return self::layouts()[$type->value] ?? 1;
    }

    /** Per-request cache so one page load hits request_options once, not per field. */
    private static ?array $managedCache = null;

    /**
     * Field definitions for one type, with every `managed` list's choices swapped
     * in from request_options (Settings → Master data → Request data). Inactive
     * choices drop out so nobody can pick a retired device, while requests that
     * already reference one still read fine — their labels were snapshotted at
     * submit time.
     *
     * @return list<array<string, mixed>>
     */
    public static function for(RequestType $type): array
    {
        $fields = self::all()[$type->value] ?? [];

        return array_map(function (array $field) use ($type) {
            if (! ($field['managed'] ?? false)) {
                return $field;
            }

            // A managed field offers exactly what the table holds — the inline list
            // below is seed data for RequestOptionSeeder, not a runtime fallback,
            // because its ids only exist once the rows do.
            return [...$field, 'options' => self::managedOptions()[$type->value.'.'.$field['key']] ?? []];
        }, $fields);
    }

    /**
     * Active managed choices keyed by "<request_type>.<field_key>". The option
     * value is the row id — a request references the choice it was given, not a
     * copy of its name.
     *
     * @return array<string, list<array{value:string,label_en:string,label_th:string}>>
     */
    private static function managedOptions(): array
    {
        if (self::$managedCache !== null) {
            return self::$managedCache;
        }

        self::$managedCache = RequestOption::query()
            ->where('active', true)
            ->orderBy('sort_order')->orderBy('label_en')
            ->get()
            ->groupBy(fn (RequestOption $o) => $o->request_type.'.'.$o->field_key)
            ->map(fn ($group) => $group->map(fn (RequestOption $o) => [
                'value' => (string) $o->id,
                'label_en' => $o->label_en,
                'label_th' => $o->label_th ?: $o->label_en,
            ])->values()->all())
            ->all();

        return self::$managedCache;
    }

    /** Drops the cache — for tests and for the admin screen's own writes. */
    public static function flushManagedCache(): void
    {
        self::$managedCache = null;
    }

    /**
     * The editable lists, for the Settings screen: request type + field key with
     * the field's own labels.
     *
     * @return list<array{request_type:string,field_key:string,label_en:string,label_th:string}>
     */
    public static function managedLists(): array
    {
        $lists = [];
        foreach (self::all() as $type => $fields) {
            foreach ($fields as $field) {
                if ($field['managed'] ?? false) {
                    $lists[] = [
                        'request_type' => $type,
                        'field_key' => $field['key'],
                        'label_en' => $field['label_en'],
                        'label_th' => $field['label_th'],
                    ];
                }
            }
        }

        return $lists;
    }

    /**
     * Laravel validation rules for one type's `fields` payload, derived from
     * the same definitions the UI renders. Unknown keys are not validated here;
     * StoreServiceRequestRequest strips them before persisting.
     *
     * @return array<string, list<mixed>>
     */
    public static function rules(RequestType $type): array
    {
        $rules = [];

        foreach (self::for($type) as $field) {
            $key = "fields.{$field['key']}";

            // An `allow_other` pair is an either/or: whichever side is empty makes
            // the other one mandatory, so the request can never arrive with neither.
            if (isset($field['allow_other'])) {
                $required = "required_without:fields.{$field['allow_other']}";
            } elseif (self::isOtherPartner($type, (string) $field['key'])) {
                $required = 'required_without:fields.'.self::otherOwner($type, (string) $field['key']);
            } else {
                $required = ($field['required'] ?? false) ? 'required' : 'nullable';
            }

            $rules[$key] = match (true) {
                // A managed choice is a foreign key, and it has to belong to THIS
                // field's list — an id borrowed from another list is rejected.
                ($field['managed'] ?? false) => [
                    $required, 'nullable', 'integer',
                    Rule::exists('request_options', 'id')->where(fn ($q) => $q
                        ->where('request_type', $type->value)
                        ->where('field_key', $field['key'])
                        ->where('active', true)),
                ],
                $field['input'] === 'number' => [$required, 'nullable', 'integer', 'min:'.($field['min'] ?? 0), 'max:'.($field['max'] ?? 1000)],
                $field['input'] === 'date' => [$required, 'nullable', 'date'],
                // The mailbox is the point of the request, so a typo in it is the
                // one thing worth refusing outright. Syntax only — the address does
                // not exist yet, so nothing can be resolved.
                $field['input'] === 'email' => [$required, 'nullable', 'string', 'email:rfc', 'max:255'],
                $field['input'] === 'select' => [$required, 'nullable', 'string', 'in:'.implode(',', array_column($field['options'] ?? [], 'value'))],
                $field['input'] === 'source' => [$required, 'nullable', 'integer', 'exists:'.self::sourceTable((string) $field['source']).',id'],
                default => [$required, 'nullable', 'string', 'max:500'],
            };
        }

        return $rules;
    }

    /**
     * Which `service_requests` column each of this type's reference fields is
     * stored in. Those columns carry real foreign keys, so a reference never
     * outlives what it points at; everything else stays in the `fields` json.
     *
     * A source field is named after its own column; the managed lists all land in
     * `request_option_id` because they are all rows of one table.
     *
     * @return array<string, string> field key → column
     */
    public static function referenceColumns(RequestType $type): array
    {
        $columns = [];

        foreach (self::for($type) as $field) {
            if ($field['managed'] ?? false) {
                $columns[$field['key']] = 'request_option_id';
            } elseif ($field['input'] === 'source') {
                $columns[$field['key']] = $field['key'];
            }
        }

        return $columns;
    }

    /** Known field keys for one type — anything else is stripped before saving. */
    public static function keys(RequestType $type): array
    {
        return array_column(self::for($type), 'key');
    }

    /** DB table backing each `source` dataset (for exists: validation). */
    private static function sourceTable(string $source): string
    {
        return match ($source) {
            'email_groups' => 'email_groups',
            'file_shares' => 'file_shares',
            'social_platforms' => 'social_platforms',
            'softwares' => 'softwares',
            'locations' => 'locations',
            default => $source,
        };
    }

    /** True when $key is the free-text half of an `allow_other` pair. */
    private static function isOtherPartner(RequestType $type, string $key): bool
    {
        return self::otherOwner($type, $key) !== null;
    }

    /** The `source` field whose `allow_other` points at $key, or null. */
    private static function otherOwner(RequestType $type, string $key): ?string
    {
        foreach (self::for($type) as $field) {
            if (($field['allow_other'] ?? null) === $key) {
                return $field['key'];
            }
        }

        return null;
    }
}
