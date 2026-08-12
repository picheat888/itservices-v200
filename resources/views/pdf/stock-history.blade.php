@php
    $item = $history['item'];
    // Timestamps come from the API as naive UTC — render them in the system timezone.
    $fmt = fn ($iso) => $iso
        ? \App\Support\SystemTime::dateTime(\Illuminate\Support\Carbon::parse($iso, 'UTC'))
        : '—';
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
    $titles = [
        'summary' => 'Summary', 'issue' => 'Issue history', 'receive' => 'Receive history',
        'adjust' => 'Counting & adjust', 'transfer' => 'Transfer history',
    ];
    $mvLabel = [
        'receive' => 'Receive', 'issue' => 'Issue', 'transfer' => 'Transfer',
        'adjust_up' => 'Adjust +', 'adjust_down' => 'Adjust −', 'return' => 'Return',
    ];
@endphp
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    {{-- dompdf embeds this as the PDF Title metadata → shown as the browser tab name. --}}
    <title>{{ $titles[$view] }} · {{ $item['sku'] }} - {{ $company }}</title>
    <style>
        @font-face { font-family: 'Sarabun'; font-weight: normal; src: url("{{ storage_path('fonts/Sarabun-Regular.ttf') }}") format('truetype'); }
        @font-face { font-family: 'Sarabun'; font-weight: bold; src: url("{{ storage_path('fonts/Sarabun-Bold.ttf') }}") format('truetype'); }
        * { font-family: 'Sarabun', sans-serif; }
        body { margin: 0; color: #000; font-size: 11px; }
        .head { width: 100%; border-bottom: 1.5px solid #000; padding-bottom: 6px; margin-bottom: 10px; }
        .head td { vertical-align: top; }
        .logo { height: 38px; }
        .company { font-size: 13px; font-weight: bold; }
        .report { font-size: 12px; font-weight: bold; }
        .muted { color: #555; }
        table.data { width: 100%; border-collapse: collapse; }
        table.data th { background: #f0f0f0; border: 0.5px solid #999; padding: 4px 5px; text-align: left; font-size: 10px; }
        table.data td { border: 0.5px solid #ccc; padding: 4px 5px; font-size: 10px; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        .r { text-align: right; }
        /* Keep the serials column compact so most rows stay on one line. */
        table.data th.serials, table.data td.serials { width: 130px; font-size: 8px; word-break: break-all; }
    </style>
</head>
<body>
    {{-- Header --}}
    <table class="head">
        <tr>
            <td style="width:60%;">
                @if ($logo)<img src="{{ $logo }}" class="logo"><br>@endif
                <span class="company">{{ $company }}</span>
                @if ($legalName)<div class="muted">{{ $legalName }}</div>@endif
                @if ($address)<div class="muted">{{ $address }}</div>@endif
                @if ($taxId)<div class="muted">Tax ID: {{ $taxId }}</div>@endif
            </td>
            <td style="width:40%; text-align:right;">
                <div class="report">{{ $titles[$view] }}</div>
                <div>SKU : <strong>{{ $item['sku'] }}</strong></div>
                <div class="muted">{{ $item['name'] }}</div>
                @if ($view === 'summary')<div>Current : <strong>{{ $item['current_stock'] }}</strong></div>@endif
            </td>
        </tr>
    </table>

    {{-- Body table per view --}}
    @if ($view === 'summary')
        <table class="data">
            <thead><tr><th>#</th><th>Serial</th><th>Receive date</th><th>Receive no.</th></tr></thead>
            <tbody>
            @forelse ($history['serials'] as $i => $s)
                @php $recv = collect($s['events'])->firstWhere('event', 'received'); @endphp
                <tr><td>{{ $i + 1 }}</td><td>{{ $s['serial'] }}</td><td>{{ $fmt($recv['occurred_at'] ?? null) }}</td><td>{{ $recv['doc_no'] ?? '—' }}</td></tr>
            @empty
                <tr><td colspan="4" style="text-align:center; padding:18px;">No records</td></tr>
            @endforelse
            </tbody>
        </table>
    @elseif ($view === 'issue')
        <table class="data">
            <thead><tr><th>#</th><th>Doc no.</th><th>Date/time</th><th>Action</th><th>Warehouse</th><th>Issued by</th><th>Requested by</th><th>Request no.</th><th>Serials</th></tr></thead>
            <tbody>
            @forelse ($movesOf(['issue']) as $i => $m)
                <tr><td>{{ $i + 1 }}</td><td>{{ $m['doc_no'] ?? '—' }}</td><td>{{ $fmt($m['moved_at']) }}</td><td>{{ $mvLabel[$m['type']] ?? $m['type'] }}</td><td>{{ $m['from_label'] ?? '—' }}</td><td>{{ $m['recorded_by'] ?? '—' }}</td><td>{{ $m['to_label'] ?? '—' }}</td><td>{{ $m['reference'] ?? '—' }}</td><td>{{ $serialsOf($m, 'issued') }}</td></tr>
            @empty
                <tr><td colspan="9" style="text-align:center; padding:18px;">No records</td></tr>
            @endforelse
            </tbody>
        </table>
    @elseif ($view === 'receive')
        <table class="data">
            <thead><tr><th>#</th><th>Doc no.</th><th>Date/time</th><th>Action</th><th>Supplier</th><th>Reference doc</th><th>Warehouse</th><th class="r">Cost</th><th class="serials">Serials</th><th class="r">Qty</th><th>Note</th></tr></thead>
            <tbody>
            @forelse ($movesOf(['receive']) as $i => $m)
                <tr><td>{{ $i + 1 }}</td><td>{{ $m['doc_no'] ?? '—' }}</td><td>{{ $fmt($m['moved_at']) }}</td><td>{{ $mvLabel[$m['type']] ?? $m['type'] }}</td><td>{{ $m['from_label'] ?? '—' }}</td><td>{{ $m['reference'] ?? '—' }}</td><td>{{ $m['to_label'] ?? '—' }}</td><td class="r">{{ $m['unit_cost'] ?? '—' }}</td><td class="serials">{{ $serialsOf($m, 'received') }}</td><td class="r">{{ $m['qty'] }}</td><td>{{ $m['notes'] ?? '—' }}</td></tr>
            @empty
                <tr><td colspan="11" style="text-align:center; padding:18px;">No records</td></tr>
            @endforelse
            </tbody>
        </table>
    @elseif ($view === 'adjust')
        <table class="data">
            <thead><tr><th>#</th><th>Doc no.</th><th>Date/time</th><th>Reference doc</th><th>Action</th><th>By</th><th>Serials</th><th class="r">Qty</th><th>Note</th></tr></thead>
            <tbody>
            @forelse ($movesOf(['adjust_up', 'adjust_down']) as $i => $m)
                <tr><td>{{ $i + 1 }}</td><td>{{ $m['doc_no'] ?? '—' }}</td><td>{{ $fmt($m['moved_at']) }}</td><td>{{ $m['reference'] ?? '—' }}</td><td>{{ $mvLabel[$m['type']] ?? $m['type'] }}</td><td>{{ $m['recorded_by'] ?? '—' }}</td><td>{{ $serialsOf($m, 'adjusted') }}</td><td class="r">{{ $m['qty'] }}</td><td>{{ $m['notes'] ?? '—' }}</td></tr>
            @empty
                <tr><td colspan="9" style="text-align:center; padding:18px;">No records</td></tr>
            @endforelse
            </tbody>
        </table>
    @else
        <table class="data">
            <thead><tr><th>#</th><th>Doc no.</th><th>Date/time</th><th>Action</th><th>From</th><th>To</th><th>By</th><th>Serials</th><th class="r">Qty</th><th>Note</th></tr></thead>
            <tbody>
            @forelse ($movesOf(['transfer']) as $i => $m)
                <tr><td>{{ $i + 1 }}</td><td>{{ $m['doc_no'] ?? '—' }}</td><td>{{ $fmt($m['moved_at']) }}</td><td>{{ $mvLabel[$m['type']] ?? $m['type'] }}</td><td>{{ $m['from_label'] ?? '—' }}</td><td>{{ $m['to_label'] ?? '—' }}</td><td>{{ $m['recorded_by'] ?? '—' }}</td><td>{{ $serialsOf($m, 'transferred') }}</td><td class="r">{{ $m['qty'] }}</td><td>{{ $m['notes'] ?? '—' }}</td></tr>
            @empty
                <tr><td colspan="10" style="text-align:center; padding:18px;">No records</td></tr>
            @endforelse
            </tbody>
        </table>
    @endif

    {{-- Footer: printed-by/at (left) + page x/y (right) on every page --}}
    <script type="text/php">
        if (isset($pdf)) {
            $font = $fontMetrics->getFont('Sarabun');
            $w = $pdf->get_width();
            $h = $pdf->get_height();
            $pdf->page_text(36, $h - 28, "{{ $printedAt }}  ·  {{ $printedBy }}", $font, 8, [0.3, 0.3, 0.3]);
            $pdf->page_text($w - 110, $h - 28, "Page {PAGE_NUM}/{PAGE_COUNT}", $font, 8, [0.3, 0.3, 0.3]);
        }
    </script>
</body>
</html>
