<?php

// DocSequence: per-year running numbers held in document_sequences, seeded from the numbers already issued.

namespace Tests\Feature;

use App\Enums\Request\RequestOrigin;
use App\Enums\Request\RequestStatus;
use App\Enums\Request\RequestType;
use App\Models\Request\ServiceRequest;
use App\Support\DocSequence;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use ReflectionMethod;
use Tests\TestCase;

class DocSequenceTest extends TestCase
{
    use RefreshDatabase;

    private function request(?string $reference = null): ServiceRequest
    {
        return ServiceRequest::create([
            'reference' => $reference,
            'type' => RequestType::Software->value,
            'origin' => RequestOrigin::Direct->value,
            'requester_name' => 'Somebody',
            'title' => 'Request: Software',
            'reason' => 'Needed for the job.',
            'status' => RequestStatus::Pending->value,
            'fields' => [],
        ]);
    }

    public function test_rq_sequence_seeds_from_existing_max_and_increments(): void
    {
        $year = now()->year;
        $this->request("RQ-{$year}-0007");
        $this->request("RQ-{$year}-0042");

        $this->assertSame("RQ-{$year}-0043", $this->request()->reference);
        $this->assertSame("RQ-{$year}-0044", $this->request()->reference);
        $this->assertSame(45, DocSequence::next('RQ', $year));
        $this->assertSame(1, DocSequence::next('RQ', $year - 1));

        $this->assertSame(1, DB::table('document_sequences')->where(['name' => 'RQ', 'year' => $year])->count());
        $this->assertSame(45, (int) DB::table('document_sequences')->where(['name' => 'RQ', 'year' => $year])->value('last'));

        // sqlite ignores the lock, so the source carries the proof
        $method = new ReflectionMethod(DocSequence::class, 'next');
        $source = implode('', array_slice((array) file((string) $method->getFileName()), $method->getStartLine() - 1));
        $this->assertStringContainsString('lockForUpdate()', $source);
    }

    public function test_sequence_survives_past_9999(): void
    {
        $year = now()->year;
        $this->request("RQ-{$year}-9999");
        $this->request("RQ-{$year}-10000");

        $this->assertSame("RQ-{$year}-10001", $this->request()->reference);
        $this->assertSame("RQ-{$year}-10002", $this->request()->reference);
    }
}
