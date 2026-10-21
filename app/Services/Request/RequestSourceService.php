<?php

namespace App\Services\Request;

use App\Enums\Request\RequestType;
use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Access\SocialPlatform;
use App\Models\Access\Software;
use App\Models\Settings\Location;
use App\Models\Settings\RequestOption;
use App\Support\RequestSchemas;

// The rows a New Request field chooses from: Access Directory sources and the managed lists, read fresh on every call.
class RequestSourceService
{
    /**
     * Rows of one source, as the form's dropdowns show them.
     *
     * @return list<array{id: int, label: string, detail: ?string}>
     */
    public function rows(string $source): array
    {
        return match ($source) {
            'email_groups' => EmailGroup::orderBy('name')->get(['id', 'name', 'email'])
                ->map(fn ($g) => ['id' => $g->id, 'label' => $g->email ?: $g->name, 'detail' => $g->name])->all(),
            'file_shares' => FileShare::orderBy('path')->get(['id', 'name', 'path'])
                ->map(fn ($s) => ['id' => $s->id, 'label' => $s->path, 'detail' => $s->name])->all(),
            'social_platforms' => SocialPlatform::orderBy('name')->get(['id', 'name'])
                ->map(fn ($p) => ['id' => $p->id, 'label' => $p->name, 'detail' => null])->all(),
            // Brand + name, straight from the Access Directory catalogue.
            'softwares' => Software::with('brand')->orderBy('name')->get()
                ->map(fn (Software $s) => [
                    'id' => $s->id,
                    'label' => trim(($s->brand?->name ? $s->brand->name.' ' : '').$s->name),
                    'detail' => $s->license_type?->value,
                ])->all(),
            'locations' => Location::orderBy('name')->get(['id', 'name'])
                ->map(fn ($l) => ['id' => $l->id, 'label' => $l->name, 'detail' => null])->all(),
            default => [],
        };
    }

    /**
     * The sources used by the fields of these request types, keyed by source name.
     *
     * @param  list<string>  $types  RequestType values
     * @return array<string, list<array{id: int, label: string, detail: ?string}>>
     */
    public function forTypes(array $types): array
    {
        $sources = collect($types)
            ->flatMap(fn (string $type) => RequestSchemas::for(RequestType::from($type)))
            ->where('input', 'source')
            ->pluck('source')
            ->unique();

        return $sources->mapWithKeys(fn (string $source) => [$source => $this->rows($source)])->all();
    }

    /**
     * The choices of one field of one type: source rows, or the active rows of a managed list.
     * Null when the type or field does not exist, or the field has no list of its own.
     *
     * @return list<array<string, mixed>>|null
     */
    public function field(string $type, string $field): ?array
    {
        $schema = collect(RequestSchemas::all()[$type] ?? [])->firstWhere('key', $field);

        if ($schema === null) {
            return null;
        }
        if ($schema['input'] === 'source') {
            return $this->rows((string) $schema['source']);
        }
        if ($schema['managed'] ?? false) {
            return RequestOption::forField($type, $field)->where('active', true)->get()
                ->map(fn (RequestOption $o) => [
                    'value' => (string) $o->id,
                    'label_en' => $o->label_en,
                    'label_th' => $o->label_th ?: $o->label_en,
                ])->values()->all();
        }

        return null;
    }
}
