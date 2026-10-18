@php
    $item = $history['item'];
    $unit = $item['unit'] ?? '';
    $currency = $company['currency'];
    // Wall time kept as sent; English month names, like the rest of this document.
    $fmt = fn ($iso) => \App\Support\DateDisplay::dateTime($iso, $dateConfig, 'en');
    $date = fn ($iso) => \App\Support\DateDisplay::date($iso, $dateConfig, 'en');
    $n = fn ($v) => number_format((float) $v);
    $money = fn ($v) => number_format((float) $v, 2);
    $movesOf = fn (array $types) => array_values(array_filter($history['movements'], fn ($m) => in_array($m['type'], $types, true)));
    $serialsOf = function (array $m, string $event) use ($history) {
        $out = [];
        foreach ($history['serials'] as $s) {
            foreach ($s['events'] as $e) {
                if ($e['event'] === $event
                    && ((!empty($m['doc_no']) && $e['doc_no'] === $m['doc_no']) || (!empty($m['reference']) && $e['reference'] === $m['reference']))) {
                    $out[] = $s['serial'];
                    break;
                }
            }
        }
        return implode(', ', $out) ?: '—';
    };
    $by = fn (array $m) => ($m['recorded_by_th'] ?? null) ?: ($m['recorded_by'] ?? '—');
    $titles = [
        'summary' => 'Stock summary', 'issue' => 'Issue history', 'receive' => 'Receive history',
        'return' => 'Return history', 'adjust' => 'Counting & adjust', 'transfer' => 'Transfer history',
    ];
    $mvLabel = [
        'receive' => 'Receive', 'issue' => 'Issue', 'transfer' => 'Transfer',
        'adjust_up' => 'Adjust +', 'adjust_down' => 'Adjust −', 'return' => 'Return',
    ];
    $tone = [
        'receive' => 'in', 'return' => 'back', 'adjust_up' => 'adj', 'issue' => 'out', 'adjust_down' => 'adj', 'transfer' => 'move',
    ];
    $rec = $history['reconciliation'];
    $openLots = array_values(array_filter($history['lots'], fn ($l) => $l['qty_remaining'] > 0));
    $lines = [$item['sku'].'  '.$item['name'], 'Data as of '.$printedAt];
@endphp
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    {{-- dompdf embeds this as the PDF Title metadata → shown as the browser tab name. --}}
    <title>{{ $titles[$view] }} - {{ $item['sku'] }}{{ \App\Support\CompanyProfile::issuer($company) ? ' - '.\App\Support\CompanyProfile::issuer($company) : '' }}</title>
    <style>
        @font-face { font-family: 'Sarabun'; font-weight: normal; src: url("{{ storage_path('fonts/Sarabun-Regular.ttf') }}") format('truetype'); }
        @font-face { font-family: 'Sarabun'; font-weight: bold; src: url("{{ storage_path('fonts/Sarabun-Bold.ttf') }}") format('truetype'); }
        * { font-family: 'Sarabun', sans-serif; }
        @page { margin: 30px 34px 46px; }
        body { margin: 0; color: #0f172a; font-size: 10.5px; }
        @include('pdf.partials.letterhead-style')
        h2 { font-size: 12px; margin: 12px 0 5px; }
        h2 .count { font-weight: normal; color: #475569; }
        .dot { display: inline-block; width: 8px; height: 8px; margin-right: 5px; }
        table.data { width: 100%; border-collapse: collapse; }
        table.data th { background: #f1f5f9; border: 0.5px solid #cbd5e1; padding: 4px 5px; text-align: left; font-size: 9.5px; }
        table.data td { border: 0.5px solid #cbd5e1; padding: 4px 5px; font-size: 9.5px; vertical-align: top; }
        table.data th.r, table.data td.r { text-align: right; }
        table.data td.nw { white-space: nowrap; }
        table.data tr.total td { background: #f1f5f9; font-weight: bold; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        table.data th.serials, table.data td.serials { width: 130px; font-size: 8px; word-break: break-all; }
        .in { color: #059669; } .out { color: #dc2626; } .back { color: #0d9488; } .adj { color: #d97706; } .move { color: #2563eb; }
        .bg-in { background: #059669; } .bg-out { background: #dc2626; } .bg-back { background: #0d9488; } .bg-adj { background: #d97706; } .bg-move { background: #2563eb; }
        .muted { color: #475569; }
        .empty { text-align: center; padding: 16px; color: #475569; }
        table.facts { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
        table.facts td { border: 0.5px solid #cbd5e1; border-top: 3px solid {{ $company['accent'] }}; padding: 6px 9px; width: 33%; }
        table.facts td.ok { border-top-color: #059669; }
        table.facts td.bad { border-top-color: #dc2626; }
        table.facts b { display: block; font-size: 17px; }
        .ok-text { color: #059669; font-weight: bold; } .bad-text { color: #dc2626; font-weight: bold; }
    </style>
</head>
<body>
    @include('pdf.partials.letterhead', ['title' => $titles[$view], 'lines' => $lines, 'lang' => 'en'])

    @if ($view === 'summary')
        {{-- Headline facts --}}
        <table class="facts"><tr>
            <td><span class="muted">On hand</span><b>{{ $n($item['current_stock']) }} {{ $unit }}</b></td>
            <td><span class="muted">Stock value (FIFO, {{ $currency }})</span><b>{{ $money($item['stock_value']) }}</b></td>
            <td class="{{ $rec['difference'] === 0 ? 'ok' : 'bad' }}"><span class="muted">Movements against on hand</span>
                <b class="{{ $rec['difference'] === 0 ? 'ok-text' : 'bad-text' }}">{{ $rec['difference'] === 0 ? 'Reconciled' : 'Off by '.$n($rec['difference']) }}</b></td>
        </tr></table>

        {{-- Reconciliation --}}
        <h2>Reconciliation of all movements</h2>
        <table class="data">
            <thead><tr><th>Movement</th><th class="r">Entries</th><th class="r">Qty</th><th class="r">Effect on hand</th></tr></thead>
            <tbody>
            @foreach ($rec['lines'] as $line)
                <tr>
                    <td><span class="dot bg-{{ $tone[$line['type']] }}"></span>{{ $mvLabel[$line['type']] }}</td>
                    <td class="r">{{ $n($line['count']) }}</td>
                    <td class="r">{{ $n($line['qty']) }}</td>
                    <td class="r {{ $line['sign'] > 0 ? 'in' : ($line['sign'] < 0 ? 'out' : 'muted') }}">{{ $line['sign'] === 0 ? 'none (between warehouses)' : ($line['qty'] === 0 ? '0' : ($line['sign'] > 0 ? '+' : '−').$n($line['qty'])) }}</td>
                </tr>
            @endforeach
            <tr class="total"><td>Calculated on hand</td><td></td><td></td><td class="r">{{ $n($rec['computed']) }}</td></tr>
            <tr class="total"><td>Recorded on hand</td><td></td><td></td><td class="r">{{ $n($rec['current']) }}</td></tr>
            </tbody>
        </table>

        {{-- On hand by warehouse --}}
        <h2>On hand by warehouse</h2>
        <table class="data">
            <thead><tr><th>Warehouse</th><th class="r">Qty</th></tr></thead>
            <tbody>
            @forelse ($history['balances'] as $b)
                <tr><td>{{ $b['warehouse'] ?? '—' }}</td><td class="r">{{ $n($b['qty']) }}</td></tr>
            @empty
                <tr><td colspan="2" class="empty">No stock on hand</td></tr>
            @endforelse
            @if ($history['balances'])
                <tr class="total"><td>Total</td><td class="r">{{ $n(array_sum(array_column($history['balances'], 'qty'))) }}</td></tr>
            @endif
            </tbody>
        </table>

        {{-- Open FIFO lots --}}
        <h2>Open cost lots (FIFO) <span class="count">{{ count($openLots) }} lots</span></h2>
        <table class="data">
            <thead><tr><th>Lot from</th><th>Received</th><th class="r">Unit cost ({{ $currency }})</th><th class="r">Received qty</th><th class="r">Remaining</th><th class="r">Value ({{ $currency }})</th></tr></thead>
            <tbody>
            @forelse ($openLots as $l)
                <tr><td class="nw">{{ $l['doc_no'] ?? '—' }}</td><td class="nw">{{ $date($l['received_at']) }}</td><td class="r">{{ $money($l['unit_cost']) }}</td><td class="r">{{ $n($l['qty_received']) }}</td><td class="r">{{ $n($l['qty_remaining']) }}</td><td class="r">{{ $money($l['qty_remaining'] * $l['unit_cost']) }}</td></tr>
            @empty
                <tr><td colspan="6" class="empty">No open lots</td></tr>
            @endforelse
            @if ($openLots)
                <tr class="total"><td>Total</td><td></td><td></td><td></td><td class="r">{{ $n(array_sum(array_column($openLots, 'qty_remaining'))) }}</td><td class="r">{{ $money($item['stock_value']) }}</td></tr>
            @endif
            </tbody>
        </table>

        {{-- Serials (serial-tracked SKUs only) --}}
        @if ($item['track_serial'])
            <h2>Serials <span class="count">{{ count($history['serials']) }}</span></h2>
            <table class="data">
                <thead><tr><th>#</th><th>Serial</th><th>Status</th><th>Warehouse</th><th>Receive date</th><th>Receive no.</th></tr></thead>
                <tbody>
                @forelse ($history['serials'] as $i => $s)
                    @php $recv = collect($s['events'])->firstWhere('event', 'received'); @endphp
                    <tr><td class="r">{{ $i + 1 }}</td><td class="nw">{{ $s['serial'] }}</td><td>{{ ucfirst(str_replace('_', ' ', (string) $s['status'])) }}</td><td>{{ $s['warehouse'] ?? '—' }}</td><td class="nw">{{ $fmt($recv['occurred_at'] ?? null) }}</td><td class="nw">{{ $recv['doc_no'] ?? '—' }}</td></tr>
                @empty
                    <tr><td colspan="6" class="empty">No records</td></tr>
                @endforelse
                </tbody>
            </table>
        @endif
    @else
        @php
            $types = ['issue' => ['issue'], 'receive' => ['receive'], 'return' => ['return'], 'adjust' => ['adjust_up', 'adjust_down'], 'transfer' => ['transfer']][$view];
            $event = ['issue' => 'issued', 'receive' => 'received', 'return' => 'returned', 'adjust' => 'adjusted', 'transfer' => 'transferred'][$view];
            $moves = $movesOf($types);
            $signed = fn (array $m) => $m['type'] === 'adjust_down' ? -$m['qty'] : $m['qty'];
            $total = array_sum(array_map($signed, $moves));
            $columns = [
                'issue' => ['#', 'Doc no.', 'Date/time', 'Action', 'Warehouse', 'Issued by', 'Requested by', 'Request no.', 'Qty', 'Serials'],
                'receive' => ['#', 'Doc no.', 'Date/time', 'Action', 'Supplier', 'Reference doc', 'Warehouse', 'Unit cost ('.$currency.')', 'Serials', 'Qty', 'Note'],
                'return' => ['#', 'Doc no.', 'Date/time', 'Action', 'Warehouse', 'Received by', 'Serials', 'Qty', 'Note'],
                'adjust' => ['#', 'Doc no.', 'Date/time', 'Reference doc', 'Action', 'By', 'Serials', 'Qty', 'Note'],
                'transfer' => ['#', 'Doc no.', 'Date/time', 'Action', 'From', 'To', 'By', 'Serials', 'Qty', 'Note'],
            ][$view];
            $qtyIndex = array_search('Qty', $columns, true);
        @endphp
        <h2><span class="dot bg-{{ $tone[$types[0]] }}"></span>{{ $titles[$view] }} <span class="count">{{ count($moves) }} entries</span></h2>
        <table class="data">
            <thead><tr>
                @foreach ($columns as $c)
                    <th class="{{ in_array($c, ['#', 'Qty'], true) || str_starts_with($c, 'Unit cost') ? 'r' : '' }}{{ $c === 'Serials' ? ' serials' : '' }}">{{ $c }}</th>
                @endforeach
            </tr></thead>
            <tbody>
            @forelse ($moves as $i => $m)
                <tr>
                    <td class="r">{{ $i + 1 }}</td>
                    <td class="nw">{{ $m['doc_no'] ?? '—' }}</td>
                    <td class="nw">{{ $fmt($m['moved_at']) }}</td>
                    @if ($view === 'adjust')
                        <td>{{ $m['reference'] ?? '—' }}</td>
                    @endif
                    <td class="nw {{ $tone[$m['type']] }}">{{ $mvLabel[$m['type']] ?? $m['type'] }}</td>
                    @switch($view)
                        @case('issue')
                            <td>{{ $m['from_label'] ?? '—' }}</td><td>{{ $by($m) }}</td><td>{{ $m['to_label'] ?? '—' }}</td><td class="nw">{{ $m['reference'] ?? '—' }}</td>
                            @break
                        @case('receive')
                            <td>{{ $m['from_label'] ?? '—' }}</td><td class="nw">{{ $m['reference'] ?? '—' }}</td><td>{{ $m['to_label'] ?? '—' }}</td><td class="r">{{ isset($m['unit_cost']) ? $money($m['unit_cost']) : '—' }}</td>
                            @break
                        @case('return')
                            <td>{{ $m['to_label'] ?? '—' }}</td><td>{{ $by($m) }}</td>
                            @break
                        @case('adjust')
                            <td>{{ $by($m) }}</td>
                            @break
                        @default
                            <td>{{ $m['from_label'] ?? '—' }}</td><td>{{ $m['to_label'] ?? '—' }}</td><td>{{ $by($m) }}</td>
                    @endswitch
                    @php $qty = $view === 'adjust' ? ($signed($m) > 0 ? '+' : '−').$n(abs($signed($m))) : $n($m['qty']); @endphp
                    @if ($view === 'issue')
                        <td class="r">{{ $qty }}</td>
                        <td class="serials">{{ $serialsOf($m, $event) }}</td>
                    @else
                        <td class="serials">{{ $serialsOf($m, $event) }}</td>
                        <td class="r">{{ $qty }}</td>
                        <td>{{ $m['notes'] ?? '—' }}</td>
                    @endif
                </tr>
            @empty
                <tr><td colspan="{{ count($columns) }}" class="empty">No records</td></tr>
            @endforelse
            @if ($moves)
                <tr class="total">
                    <td colspan="{{ $qtyIndex }}">Total</td>
                    <td class="r">{{ $view === 'adjust' ? ($total >= 0 ? '+' : '−').$n(abs($total)) : $n($total) }}</td>
                    @if ($qtyIndex < count($columns) - 1)<td colspan="{{ count($columns) - $qtyIndex - 1 }}"></td>@endif
                </tr>
            @endif
            </tbody>
        </table>
    @endif
</body>
</html>
