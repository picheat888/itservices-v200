<?php

namespace App\Http\Requests\Request;

use App\Enums\Request\StepActorType;
use App\Enums\Request\WorkflowStepKind;
use App\Models\Workflow\Workflow;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Validation for the workflow editor: flags plus a full replacement list of
 * steps. Cross-rules keep every chain sane — at least one approval, at most
 * one fulfillment (and only last, by IT Staff), and owner steps only on types
 * whose resources actually carry an owner (mail groups / file shares).
 */
class UpdateWorkflowRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('workflows.manage');
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'min:3', 'max:120'],
            'active' => ['sometimes', 'boolean'],
            'auto_ticket' => ['sometimes', 'boolean'],
            'steps' => ['required', 'array', 'min:1', 'max:10'],
            'steps.*.actor_type' => ['required', Rule::enum(StepActorType::class)],
            'steps.*.label' => ['required', 'string', 'min:2', 'max:120'],
            'steps.*.kind' => ['required', Rule::enum(WorkflowStepKind::class)],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $steps = collect($this->input('steps', []));

            if ($steps->where('kind', WorkflowStepKind::Approval->value)->isEmpty()) {
                $v->errors()->add('steps', 'A workflow needs at least one approval step.');
            }

            $fulfillments = $steps->values()->filter(fn ($s) => ($s['kind'] ?? null) === WorkflowStepKind::Fulfillment->value);
            if ($fulfillments->count() > 1) {
                $v->errors()->add('steps', 'Only one fulfillment step is allowed.');
            }
            if ($fulfillments->isNotEmpty()) {
                if ($fulfillments->keys()->first() !== $steps->count() - 1) {
                    $v->errors()->add('steps', 'The fulfillment step must be the last step.');
                }
                if ($fulfillments->first()['actor_type'] !== StepActorType::ItStaff->value) {
                    $v->errors()->add('steps', 'Fulfillment is performed by IT Staff.');
                }
            }

            /** @var Workflow|null $workflow */
            $workflow = $this->route('workflow');
            $hasOwnerStep = $steps->contains(fn ($s) => ($s['actor_type'] ?? null) === StepActorType::Owner->value);
            if ($hasOwnerStep && $workflow !== null && $workflow->request_type->ownerSource() === null) {
                $v->errors()->add('steps', 'This request type has no resource owner — an Owner step can never resolve.');
            }
        });
    }
}
