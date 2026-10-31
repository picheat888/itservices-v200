<?php

// Stock item create, update and delete with their audit rows; delete refuses a SKU that still holds stock or has ever moved.

namespace App\Services\Stock;

use App\Models\AuditLog;
use App\Models\Stock\StockCountLine;
use App\Models\Stock\StockItem;

class StockItemService
{
    /** @param  array<string, mixed>  $data */
    public function create(array $data): StockItem
    {
        $data['sku'] = StockItem::nextSku();
        $item = StockItem::create($data);
        AuditLog::record('Created stock item', "{$item->sku} - {$item->name}", subject: $item);

        return $item;
    }

    /** @param  array<string, mixed>  $data */
    public function update(StockItem $item, array $data): void
    {
        $before = $item->getOriginal();
        $item->update($data);
        AuditLog::record('Updated stock item', "{$item->sku} - {$item->name}", AuditLog::changes($before, $item), subject: $item);
    }

    /**
     * Deletes an empty SKU no movement, requisition or count names; otherwise the refusal (422): stock or value, history, then documents.
     *
     * @return array<string, mixed>|null
     */
    public function delete(StockItem $item): ?array
    {
        if ($item->current_stock !== 0 || $item->stockValue() > 0) {
            return ['message' => 'item_has_stock'];
        }

        // A SKU that ever moved carries a ledger the FK would refuse to drop; this names the reason
        $movements = $item->movements()->count();
        if ($movements > 0) {
            return ['message' => 'has_history', 'movements_count' => $movements];
        }

        // Requisitions and count lines cascade with the item, so any of them, open or closed, keeps it
        $documents = $item->requests()->count() + StockCountLine::where('stock_item_id', $item->id)->count();
        if ($documents > 0) {
            return ['message' => 'has_documents', 'documents_count' => $documents];
        }

        AuditLog::recordDeleted('Deleted stock item', "{$item->sku} - {$item->name}", $item);
        $item->delete();

        return null;
    }
}
