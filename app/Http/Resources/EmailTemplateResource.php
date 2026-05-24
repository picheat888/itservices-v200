<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\EmailTemplate */
class EmailTemplateResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id'           => $this->id,
            'code'         => sprintf('ET-%02d', $this->id), // display id matching the design
            'key'          => $this->key,
            'name'         => $this->name,
            'subject'      => $this->subject,
            'body_html'    => $this->body_html,
            'enabled'      => (bool) $this->enabled,
            'last_sent_at' => $this->last_sent_at?->toIso8601String(),
        ];
    }
}
