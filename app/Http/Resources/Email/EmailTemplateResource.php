<?php

namespace App\Http\Resources\Email;

use App\Models\Email\EmailTemplate;
use App\Support\EmailTemplates;
use App\Support\SystemTime;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin EmailTemplate */
class EmailTemplateResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => sprintf('ET-%02d', $this->id), // display id matching the design
            'key' => $this->key,
            'name' => $this->name,
            'subject' => $this->subject,
            'body_html' => $this->body_html,
            'enabled' => (bool) $this->enabled,
            'cadence' => $this->cadence ?? 'realtime',
            'last_sent_at' => $this->last_sent_at?->toIso8601String(),
            // Who reworded it last (null while nobody has) — the name when the index loaded the updater.
            'updated_at' => SystemTime::date($this->updated_at),
            'updated_by_name' => $this->whenLoaded('updater', fn () => $this->updater?->name),
            // Whether this key has a standard definition (drives the Reset action),
            // and whether the current row differs from it (drives the "modified" badge).
            'is_standard' => EmailTemplates::has($this->key),
            'is_modified' => $this->differsFromStandard(),
            // The variables this template's mail is given (null for a custom template).
            'variables' => EmailTemplates::variablesFor($this->key),
        ];
    }

    /**
     * True when the row has a standard and any of its standard fields has been
     * edited away from it. Non-standard (custom) templates are never "modified".
     */
    private function differsFromStandard(): bool
    {
        $standard = EmailTemplates::find($this->key);
        if ($standard === null) {
            return false;
        }

        return $standard['name'] !== $this->name
            || $standard['subject'] !== $this->subject
            || $standard['body_html'] !== $this->body_html
            || $standard['enabled'] !== (bool) $this->enabled
            || $standard['cadence'] !== ($this->cadence ?? 'realtime');
    }
}
