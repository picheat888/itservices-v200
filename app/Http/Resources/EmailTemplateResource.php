<?php

namespace App\Http\Resources;

use App\Models\EmailTemplate;
use App\Support\EmailTemplates;
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
            // Whether this key has a standard definition (drives the Reset action),
            // and whether the current row differs from it (drives the "modified" badge).
            'is_standard' => EmailTemplates::has($this->key),
            'is_modified' => $this->differsFromStandard(),
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
