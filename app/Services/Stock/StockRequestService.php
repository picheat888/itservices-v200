<?php

// Stock request workflow: submit, approve, reject and cancel, each under a row lock,
// with the audit entry and the bell/mail fired after the commit.

namespace App\Services\Stock;

use App\Models\AuditLog;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockRequest;
use App\Models\User;
use App\Support\Refusal;
use Illuminate\Support\Facades\DB;

class StockRequestService
{
    public function __construct(
        private readonly StockNotificationService $notifications,
    ) {}

    /**
     * Submit a new request (status: pending) after checking the quantity is still free.
     *
     * @param  array{stock_item_id: int, qty: int, reason: string}  $data
     */
    public function create(User $actor, array $data): StockRequest
    {
        $available = StockItem::findOrFail($data['stock_item_id'])->availableToRequest();
        if ($data['qty'] > $available) {
            Refusal::fail('not_enough_stock', ['available' => $available], 'qty');
        }

        // Transaction holds the reference lock until the row is written; retried on deadlock
        $stockRequest = DB::transaction(fn (): StockRequest => StockRequest::create([
            'stock_item_id' => $data['stock_item_id'],
            'user_id' => $actor->id,
            'requester_name' => $actor->name,
            'qty' => $data['qty'],
            'reason' => $data['reason'],
            'status' => 'pending',
        ]), 3);

        AuditLog::record('Submitted stock request', "#{$stockRequest->id} ×{$data['qty']}", subject: $stockRequest);
        $this->notifications->requestCreated($stockRequest->load('item'));

        return $stockRequest;
    }

    /** Approve a pending request; approving claims the stock, so availability is checked again under lock. */
    public function approve(StockRequest $stockRequest, User $actor): StockRequest
    {
        $this->assertStatus($stockRequest, 'pending');

        DB::transaction(function () use ($stockRequest, $actor) {
            $this->lockInStatus($stockRequest, 'pending');
            $available = StockItem::lockForUpdate()->findOrFail($stockRequest->stock_item_id)->availableToRequest();
            if ($stockRequest->qty > $available) {
                Refusal::fail('not_enough_stock', ['available' => $available], 'qty');
            }

            $stockRequest->update([
                'status' => 'approved',
                'approver_name' => $actor->name,
                'approver_id' => $actor->id,
                'approved_at' => now(),
            ]);
        });
        AuditLog::record('Approved stock request', "#{$stockRequest->id}", subject: $stockRequest);
        $this->notifications->requestResponded($stockRequest->load('item'), 'approved');

        return $stockRequest;
    }

    /**
     * Reject a pending request.
     *
     * @param  ?string  $reason  no column holds it yet
     */
    public function reject(StockRequest $stockRequest, User $actor, ?string $reason = null): StockRequest
    {
        $this->assertStatus($stockRequest, 'pending');

        DB::transaction(function () use ($stockRequest, $actor) {
            $this->lockInStatus($stockRequest, 'pending');
            $stockRequest->update([
                'status' => 'rejected',
                'approver_name' => $actor->name,
                'approver_id' => $actor->id,
                'rejected_at' => now(),
            ]);
        });
        AuditLog::record('Rejected stock request', "#{$stockRequest->id}", subject: $stockRequest);
        $this->notifications->requestResponded($stockRequest->load('item'), 'rejected');

        return $stockRequest;
    }

    /**
     * Cancel a pending or approved request; the owner gets a bell only when someone else cancels it.
     *
     * @param  ?string  $reason  no column holds it yet
     */
    public function cancel(StockRequest $stockRequest, User $actor, ?string $reason = null): StockRequest
    {
        DB::transaction(function () use ($stockRequest, $actor) {
            $stockRequest->setRawAttributes(StockRequest::lockForUpdate()->findOrFail($stockRequest->id)->getAttributes(), true);
            $this->assertCancellable($stockRequest);
            // Approved meanwhile: the requester may no longer cancel
            if (! $stockRequest->canBeCancelledBy($actor)) {
                Refusal::fail('request_not_cancellable', ['current' => $stockRequest->status], 'status');
            }

            $stockRequest->update([
                'status' => 'cancelled',
                'cancelled_by' => $actor->name,
                'cancelled_at' => now(),
            ]);
        });
        AuditLog::record('Cancelled stock request', "#{$stockRequest->id}", subject: $stockRequest);
        if ((int) $stockRequest->user_id !== (int) $actor->id) {
            $this->notifications->requestCancelled($stockRequest->load('item'));
        }

        return $stockRequest;
    }

    /** Only a pending or approved request can still be cancelled. */
    public function assertCancellable(StockRequest $stockRequest): void
    {
        if (! in_array($stockRequest->status, ['pending', 'approved'], true)) {
            Refusal::fail('request_not_cancellable', ['current' => $stockRequest->status], 'status');
        }
    }

    /** Guard a workflow transition, refusing with 422 when the request isn't in the expected state. */
    public function assertStatus(StockRequest $stockRequest, string $expected): void
    {
        if ($stockRequest->status !== $expected) {
            Refusal::fail('request_wrong_status', ['expected' => $expected, 'current' => $stockRequest->status], 'status');
        }
    }

    /** Re-read the row under lock inside the transaction so concurrent decisions cannot both pass. */
    private function lockInStatus(StockRequest $stockRequest, string $expected): void
    {
        $stockRequest->setRawAttributes(StockRequest::lockForUpdate()->findOrFail($stockRequest->id)->getAttributes(), true);
        $this->assertStatus($stockRequest, $expected);
    }
}
