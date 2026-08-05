<?php

namespace Tests\Feature;

use App\Enums\Request\RequestType;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\RequestOption;
use App\Models\User;
use App\Services\Request\RequestService;
use App\Support\RequestSchemas;
use Database\Seeders\RequestOptionSeeder;
use Database\Seeders\WorkflowSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Validator;
use Tests\TestCase;

/**
 * Settings → Request data: the editable choice lists behind the
 * request form's managed selects, and the fact that the form and its validation
 * follow whatever is stored.
 */
class RequestOptionTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RequestOptionSeeder::class);
        RequestSchemas::flushManagedCache();

        $role = Role::firstOrCreate(['key' => 'mdadmin'], ['name' => 'MD Admin', 'color' => '#000', 'is_system' => false]);
        RolePermission::updateOrCreate(['role_id' => $role->id, 'permission' => 'settings.requestdata'], ['allowed' => true]);
        $this->admin = User::factory()->create(['role' => 'mdadmin']);
    }

    public function test_seeder_establishes_the_three_managed_lists(): void
    {
        $this->assertSame(
            [
                ['request_type' => 'hardware', 'field_key' => 'device_id'],
                ['request_type' => 'mobile', 'field_key' => 'device_id'],
                ['request_type' => 'telephone', 'field_key' => 'device_type_id'],
            ],
            collect(RequestSchemas::managedLists())->map(fn ($l) => ['request_type' => $l['request_type'], 'field_key' => $l['field_key']])->all(),
        );

        $this->assertSame(3, RequestOption::where('request_type', 'hardware')->count());
        $this->assertSame(2, RequestOption::where('request_type', 'telephone')->count());
    }

    public function test_endpoints_require_the_request_data_permission(): void
    {
        $plain = User::factory()->create(['role' => 'nobody']);

        $this->actingAs($plain)->getJson('/api/request-options')->assertForbidden();
        $this->actingAs($plain)->postJson('/api/request-options', [])->assertForbidden();

        $this->actingAs($this->admin)->getJson('/api/request-options')
            ->assertOk()
            ->assertJsonCount(3, 'data.lists')
            ->assertJsonCount(8, 'data.options');
    }

    public function test_a_label_cannot_be_used_twice_in_the_same_list(): void
    {
        $payload = ['request_type' => 'hardware', 'field_key' => 'device_id', 'label_en' => 'Docking station', 'label_th' => 'แท่นวางโน้ตบุ๊ก'];

        $this->actingAs($this->admin)->postJson('/api/request-options', $payload)->assertCreated();
        $this->actingAs($this->admin)->postJson('/api/request-options', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('label_en');

        // The same label in a different list is a different thing, and allowed.
        $this->actingAs($this->admin)->postJson('/api/request-options', [...$payload, 'request_type' => 'mobile'])
            ->assertCreated();
    }

    public function test_only_declared_lists_may_be_written_to(): void
    {
        // `computer.device` is not a managed list, so it cannot be extended here.
        $this->actingAs($this->admin)->postJson('/api/request-options', [
            'request_type' => 'computer',
            'field_key' => 'device_id',
            'label_en' => 'Tablet PC',
        ])->assertUnprocessable()->assertJsonValidationErrors('request_type');
    }

    public function test_the_form_offers_the_stored_rows_by_id_and_hiding_one_withdraws_it(): void
    {
        $scanner = $this->actingAs($this->admin)->postJson('/api/request-options', [
            'request_type' => 'hardware', 'field_key' => 'device_id', 'label_en' => 'Scanner', 'label_th' => 'เครื่องสแกน',
        ])->assertCreated()->json('data.id');

        RequestSchemas::flushManagedCache();
        $options = collect(RequestSchemas::for(RequestType::Hardware))->firstWhere('key', 'device_id')['options'];
        $this->assertContains((string) $scanner, collect($options)->pluck('value')->all(), 'the choice is offered as its id');

        // Hiding it withdraws it from the form and from validation.
        RequestOption::where('id', $scanner)->update(['active' => false]);
        RequestSchemas::flushManagedCache();
        $offered = collect(RequestSchemas::for(RequestType::Hardware))->firstWhere('key', 'device_id')['options'];
        $this->assertNotContains((string) $scanner, collect($offered)->pluck('value')->all());
    }

    public function test_the_chosen_option_is_a_foreign_key_the_database_enforces(): void
    {
        $option = RequestOption::forField('hardware', 'device_id')->firstOrFail();
        $request = $this->submitHardwareRequest($option->id);

        $this->assertSame($option->id, $request->request_option_id, 'the id lives in its own column');
        $this->assertArrayNotHasKey('device_id', $request->fields, 'and not in the json as well');
        $this->assertSame($option->id, $request->requestOption->id, 'joinable through the relation');
    }

    /**
     * A choice a request points at cannot be deleted — the same 409 every other
     * master-data table answers with. Hiding it is the way to retire one.
     */
    public function test_a_choice_a_request_uses_cannot_be_deleted(): void
    {
        $option = RequestOption::forField('hardware', 'device_id')->firstOrFail();
        $request = $this->submitHardwareRequest($option->id);

        $this->actingAs($this->admin)->deleteJson("/api/request-options/{$option->id}")
            ->assertStatus(409)
            ->assertJsonPath('message', 'in_use')
            ->assertJsonPath('count', 1);

        $this->assertDatabaseHas('request_options', ['id' => $option->id]);
        $this->assertSame($option->id, $request->fresh()->request_option_id, 'the request keeps what it asked for');

        // Hiding withdraws it from the form without touching the reference.
        $this->actingAs($this->admin)->putJson("/api/request-options/{$option->id}", [
            'label_en' => $option->label_en, 'label_th' => $option->label_th, 'active' => false,
        ])->assertOk();

        RequestSchemas::flushManagedCache();
        $offered = collect(RequestSchemas::for(RequestType::Hardware))->firstWhere('key', 'device_id')['options'];
        $this->assertNotContains((string) $option->id, collect($offered)->pluck('value')->all());
        $this->assertSame($option->id, $request->fresh()->request_option_id);
    }

    /** The database refuses too, so the controller's check is not the only guard. */
    public function test_the_database_refuses_to_delete_a_referenced_choice(): void
    {
        $option = RequestOption::forField('hardware', 'device_id')->firstOrFail();
        $this->submitHardwareRequest($option->id);

        $this->expectException(QueryException::class);
        $this->expectExceptionMessageMatches('/FOREIGN KEY constraint/i');

        $option->delete();
    }

    public function test_an_unused_choice_is_still_deletable(): void
    {
        $id = $this->actingAs($this->admin)->postJson('/api/request-options', [
            'request_type' => 'hardware', 'field_key' => 'device_id', 'label_en' => 'Scanner',
        ])->assertCreated()->json('data.id');

        $this->actingAs($this->admin)->deleteJson("/api/request-options/{$id}")->assertOk();
        $this->assertDatabaseMissing('request_options', ['id' => $id]);
    }

    /**
     * Going straight through the service skips the form request, which leaves the
     * constraint in the database as the last line of defence — and it holds. An id
     * in a json blob could never be caught here.
     */
    public function test_the_database_itself_refuses_a_reference_to_a_missing_option(): void
    {
        $this->expectException(QueryException::class);
        $this->expectExceptionMessageMatches('/FOREIGN KEY constraint/i');

        $this->submitHardwareRequest(RequestOption::max('id') + 100);
    }

    /**
     * The point of storing the id: validation can check the choice really belongs
     * to the field being filled. A slug shared across lists could never prove it.
     */
    public function test_a_choice_from_another_list_is_rejected(): void
    {
        $mobileChoice = RequestOption::forField('mobile', 'device_id')->firstOrFail();
        $hardwareRules = RequestSchemas::rules(RequestType::Hardware);

        $validator = Validator::make(
            ['fields' => ['device_id' => $mobileChoice->id]],
            ['fields.device_id' => $hardwareRules['fields.device_id']],
        );

        $this->assertTrue($validator->fails(), 'a Mobile choice must not pass as Hardware');
        $this->assertArrayHasKey('fields.device_id', $validator->errors()->toArray());

        // Its own list accepts it.
        $mobileRules = RequestSchemas::rules(RequestType::Mobile);
        $this->assertFalse(
            Validator::make(['fields' => ['device_id' => $mobileChoice->id]], ['fields.device_id' => $mobileRules['fields.device_id']])->fails(),
        );
    }

    public function test_labels_are_editable_in_both_languages_and_the_id_never_moves(): void
    {
        $option = RequestOption::where('request_type', 'telephone')->where('label_en', 'Analog phone')->firstOrFail();

        $this->actingAs($this->admin)->putJson("/api/request-options/{$option->id}", [
            'label_en' => 'Analogue handset',
            'label_th' => 'เครื่องอนาล็อก',
            'active' => true,
        ])->assertOk()->assertJsonPath('data.label_th', 'เครื่องอนาล็อก');

        // Renaming is safe precisely because the request points at the id.
        $this->assertSame($option->id, $option->fresh()->id);
        $this->assertSame('Analogue handset', $option->fresh()->label_en);
    }

    public function test_a_new_choice_lands_at_the_end_of_its_list(): void
    {
        $this->actingAs($this->admin)->postJson('/api/request-options', [
            'request_type' => 'hardware', 'field_key' => 'device_id', 'label_en' => 'Scanner',
        ])->assertCreated();

        $this->assertSame(
            ['จอภาพ', 'เครื่องพิมพ์', 'อุปกรณ์เสริม', 'Scanner'],
            $this->hardwareOrder(),
            'the person who added it should find it where they left it',
        );
    }

    public function test_dragging_a_row_rewrites_the_order_of_that_list_only(): void
    {
        $hardware = RequestOption::forField('hardware', 'device_id')->pluck('id')->all();
        $mobileBefore = RequestOption::forField('mobile', 'device_id')->pluck('label_en')->all();

        // Carry the last row to the top.
        $this->actingAs($this->admin)->postJson('/api/request-options/reorder', [
            'request_type' => 'hardware',
            'field_key' => 'device_id',
            'ids' => [$hardware[2], $hardware[0], $hardware[1]],
        ])->assertOk();

        $this->assertSame(['อุปกรณ์เสริม', 'จอภาพ', 'เครื่องพิมพ์'], $this->hardwareOrder());
        $this->assertSame($mobileBefore, RequestOption::forField('mobile', 'device_id')->pluck('label_en')->all());

        // And the request form offers them in that order, each as its own id.
        RequestSchemas::flushManagedCache();
        $offered = collect(RequestSchemas::for(RequestType::Hardware))->firstWhere('key', 'device_id')['options'];
        $this->assertSame(['Accessory', 'Monitor', 'Printer'], collect($offered)->pluck('label_en')->all());
        $this->assertSame(
            [(string) $hardware[2], (string) $hardware[0], (string) $hardware[1]],
            collect($offered)->pluck('value')->all(),
        );
    }

    public function test_a_partial_order_is_rejected_rather_than_half_applied(): void
    {
        $hardware = RequestOption::forField('hardware', 'device_id')->pluck('id')->all();

        $this->actingAs($this->admin)->postJson('/api/request-options/reorder', [
            'request_type' => 'hardware',
            'field_key' => 'device_id',
            'ids' => [$hardware[2], $hardware[0]],
        ])->assertUnprocessable()->assertJsonValidationErrors('ids');

        $this->assertSame(['จอภาพ', 'เครื่องพิมพ์', 'อุปกรณ์เสริม'], $this->hardwareOrder(), 'nothing may move');
    }

    public function test_reordering_needs_the_master_data_permission(): void
    {
        $plain = User::factory()->create(['role' => 'nobody']);

        $this->actingAs($plain)->postJson('/api/request-options/reorder', [
            'request_type' => 'hardware', 'field_key' => 'device_id', 'ids' => [1],
        ])->assertForbidden();
    }

    /**
     * Submit a hardware request choosing the given option, through the service so
     * the reference lands where a real submit puts it.
     */
    private function submitHardwareRequest(int $optionId): ServiceRequest
    {
        $this->seed(WorkflowSeeder::class);

        $employee = Employee::create(['first_name' => 'Requester']);
        $user = User::factory()->create(['role' => 'mdadmin', 'employee_id' => $employee->id]);

        return app(RequestService::class)->submit($user, [
            'type' => 'hardware',
            'title' => 'Second monitor for the QA desk',
            'reason' => 'Reviewing two builds side by side needs the extra screen.',
            'fields' => ['device_id' => (string) $optionId],
        ]);
    }

    /**
     * @return array<int, string>
     */
    private function hardwareOrder(): array
    {
        return RequestOption::forField('hardware', 'device_id')->get()
            ->map(fn (RequestOption $o) => $o->label_th ?: $o->label_en)->all();
    }
}
