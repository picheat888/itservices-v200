{{-- PDF of the "Ticket & SLA overview" report (Report Center). Rendered by TicketOverviewExporter. --}}
@php
    $L = \App\Services\Report\TicketLabels::class;
    $num = fn ($n) => \App\Services\Report\Tabular\TileText::number($n);
    $pct = fn ($n) => $n === null ? '—' : $num($n).'%';
    $hrs = fn ($n) => $n === null ? '—' : number_format($n, 1).' ชม.';
    $date = fn ($d) => \App\Support\DateDisplay::date($d, $dateConfig);
    $k = $summary['kpi'];
    $prev = $summary['previous'] ?? null;
    $goal = $summary['sla_goal'];
    $backlog = $summary['backlog'];
    $categories = \App\Enums\Ticket\TicketCategory::cases();
    $slaTone = fn ($rate) => $rate === null ? '#0f172a' : ($rate >= $goal ? '#059669' : ($rate >= $goal - 10 ? '#d97706' : '#dc2626'));
    $slaLabel = ['met' => 'ทัน SLA', 'over_sla' => 'เกิน SLA'];
    $slaColor = ['met' => '#059669', 'over_sla' => '#dc2626'];
    $person = fn ($p) => $p ? (($p->name_th ?? null) ?: $p->name) : null;
    $lines = array_values(array_filter([
        $documentNo ? 'เลขที่เอกสาร '.$documentNo : null,
        'ช่วงวันที่ '.\App\Support\DateDisplay::range($summary['range']['from'], $summary['range']['to'], $dateConfig),
        'ข้อมูล ณ '.\App\Support\DateDisplay::dateTime($summary['generated_at'], $dateConfig),
        ...array_map(fn ($line) => $line[0].': '.$line[1], $scope),
    ]));
    $tiles = [
        ['Ticket ทั้งหมด', $num($k['total']), null, $prev ? 'ช่วงก่อนหน้า '.$num($prev['total']) : null, '#2563eb', false],
        ['ปิดสำเร็จ', $num($k['completed']), $k['total'] ? $pct(round($k['completed'] / $k['total'] * 100)) : null, 'ยกเลิก '.$num($k['canceled']), '#059669', false],
        ['ปิดทัน SLA', $pct($k['sla_rate']), 'เป้า '.$goal.'%', 'ทัน '.$num($k['sla_met']).' จาก '.$num($k['sla_measured']).' เคส'.($prev && $prev['sla_rate'] !== null ? ', ช่วงก่อนหน้า '.$pct($prev['sla_rate']) : ''), $slaTone($k['sla_rate']), $k['sla_rate'] !== null && $k['sla_rate'] < $goal],
        ['เวลาแก้ไขโดยเฉลี่ย', $hrs($k['avg_resolve_hours']), null, 'P90 '.$hrs($k['p90_resolve_hours']).($prev ? ', ช่วงก่อนหน้า '.$hrs($prev['avg_resolve_hours']) : ''), '#7c3aed', false],
        ['ค้างอยู่ตอนนี้', $num($backlog['open'] + $backlog['in_progress']), null, 'รอรับเคส '.$num($backlog['open']).', กำลังดำเนินการ '.$num($backlog['in_progress']).', เกิน SLA '.$num($backlog['over_sla']), '#dc2626', $backlog['over_sla'] > 0],
    ];
    $categoryTotal = max(1, array_sum(array_column($summary['by_category'], 'count')));
@endphp
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>รายงานภาพรวม Ticket & SLA - {{ \App\Support\CompanyProfile::issuer($company) }}</title>
    <style>
        @font-face { font-family: 'Sarabun'; font-weight: normal; src: url("{{ storage_path('fonts/Sarabun-Regular.ttf') }}") format('truetype'); }
        @font-face { font-family: 'Sarabun'; font-weight: bold; src: url("{{ storage_path('fonts/Sarabun-Bold.ttf') }}") format('truetype'); }
        * { font-family: 'Sarabun', sans-serif; }
        @page { margin: 28px 32px 46px; }
        body { margin: 0; color: #0f172a; font-size: 10.5px; }
        @include('pdf.partials.letterhead-style')
        .muted { color: #475569; }
        h2 { font-size: 12px; margin: 12px 0 4px; page-break-after: avoid; }
        h2 .count { font-weight: normal; color: #475569; font-size: 10.5px; }
        table.tiles { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 4px; }
        table.tiles td.cell { padding: 0 6px 0 0; vertical-align: top; }
        table.tiles td.cell.last { padding-right: 0; }
        .tile { border: 0.5px solid #cbd5e1; border-top: 3px solid #2563eb; padding: 5px 8px 6px; min-height: 50px; }
        .tile-label { color: #475569; font-size: 9.5px; }
        .tile-value { font-size: 17px; font-weight: bold; line-height: 1.25; }
        .tile-badge { font-size: 9.5px; font-weight: bold; margin-left: 4px; }
        .tile-line { color: #475569; font-size: 9px; line-height: 1.35; }
        table.grid { width: 100%; border-collapse: collapse; }
        table.grid td.col { vertical-align: top; padding-right: 10px; }
        table.grid td.col:last-child { padding-right: 0; }
        table.data { width: 100%; border-collapse: collapse; }
        table.data th { background: #f1f5f9; border: 0.5px solid #cbd5e1; padding: 4px 5px; text-align: left; font-size: 9.5px; }
        table.data td { border: 0.5px solid #cbd5e1; padding: 3px 5px; font-size: 9.5px; vertical-align: top; }
        table.data th.r, table.data td.r { text-align: right; }
        table.data td.nw { white-space: nowrap; }
        table.data tr.total td { background: #f1f5f9; font-weight: bold; }
        .bar { height: 6px; background: #e2e8f0; }
        .bar div { height: 6px; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        table.sign { width: 100%; margin-top: 26px; border-collapse: separate; border-spacing: 14px 0; page-break-inside: avoid; }
        table.sign td { width: 33%; text-align: center; vertical-align: bottom; padding-top: 26px; }
        .sign-line { border-bottom: 0.8px dotted #0f172a; height: 22px; margin-bottom: 4px; }
    </style>
</head>
<body>
@include('pdf.partials.letterhead', ['title' => 'รายงานภาพรวม Ticket & SLA', 'lines' => $lines, 'lang' => 'th'])

<table class="tiles"><tr>
    @foreach ($tiles as [$label, $value, $badge, $line, $tone, $alert])
        <td class="cell{{ $loop->last ? ' last' : '' }}"><div class="tile" style="border-top-color: {{ $tone }}">
            <div class="tile-label">{{ $label }}</div>
            <div class="tile-value" style="color: {{ $alert ? $tone : '#0f172a' }}">{{ $value }}@if ($badge)<span class="tile-badge" style="color: {{ $tone }}">{{ $badge }}</span>@endif</div>
            @if ($line)<div class="tile-line">{{ $line }}</div>@endif
        </div></td>
    @endforeach
</tr></table>

<table class="grid"><tr>
    <td class="col" style="width: 40%">
        <h2>เปิดใหม่ ปิดแล้ว และค้างสะสม รายสัปดาห์</h2>
        <table class="data"><thead><tr><th>สัปดาห์เริ่ม</th><th class="r">เปิดใหม่</th><th class="r">ปิดแล้ว</th><th class="r">ค้างสะสม</th></tr></thead><tbody>
        @forelse ($summary['weekly'] as $w)
            <tr><td class="nw">{{ $date($w['week_start']) }}</td><td class="r">{{ $num($w['opened']) }}</td><td class="r">{{ $num($w['closed']) }}</td><td class="r">{{ $w['backlog'] === null ? '—' : $num($w['backlog']) }}</td></tr>
        @empty
            <tr><td colspan="4" class="muted">ไม่มีข้อมูลในช่วงนี้</td></tr>
        @endforelse
        </tbody></table>
    </td>
    <td class="col" style="width: 30%">
        <h2>SLA ตามความสำคัญ <span class="count">เป้า {{ $goal }}%</span></h2>
        <table class="data"><thead><tr><th>ความสำคัญ</th><th class="r">วัดได้</th><th class="r">ทัน</th><th class="r">ทัน SLA</th></tr></thead><tbody>
        @foreach ($summary['sla_by_priority'] as $p)
            <tr><td>{{ $L::priority($p['priority']) }}</td><td class="r">{{ $num($p['measured']) }}</td><td class="r">{{ $num($p['met']) }}</td><td class="r" style="color: {{ $slaTone($p['rate']) }}">{{ $pct($p['rate']) }}</td></tr>
        @endforeach
        </tbody></table>
        <h2>Ticket ที่ค้าง ตามอายุ <span class="count">ณ ตอนพิมพ์</span></h2>
        <table class="data"><thead><tr><th>อายุ</th><th class="r">Ticket</th></tr></thead><tbody>
            @foreach (['d1' => 'ไม่เกิน 1 วัน', 'd3' => '1–3 วัน', 'd7' => '3–7 วัน', 'older' => 'เกิน 7 วัน'] as $bucket => $text)
                <tr><td>{{ $text }}</td><td class="r" @if ($bucket === 'older' && $backlog['aging'][$bucket] > 0) style="color: #dc2626" @endif>{{ $num($backlog['aging'][$bucket]) }}</td></tr>
            @endforeach
        </tbody></table>
    </td>
    <td class="col" style="width: 30%">
        <h2>แยกตามหมวด</h2>
        <table class="data"><thead><tr><th>หมวด</th><th class="r">Ticket</th><th class="r">สัดส่วน</th><th style="width: 70px"></th></tr></thead><tbody>
        @foreach ($summary['by_category'] as $c)
            @php $share = round($c['count'] / $categoryTotal * 100) @endphp
            <tr><td>{{ $L::category($c['category']) }}</td><td class="r">{{ $num($c['count']) }}</td><td class="r">{{ $share }}%</td><td><div class="bar"><div style="width: {{ $share }}%; background: {{ $company['accent'] }}"></div></div></td></tr>
        @endforeach
        <tr class="total"><td>รวม</td><td class="r">{{ $num(array_sum(array_column($summary['by_category'], 'count'))) }}</td><td class="r">100%</td><td></td></tr>
        </tbody></table>
    </td>
</tr></table>

<h2>แยกตามแผนก</h2>
<table class="data"><thead><tr><th>แผนก</th><th class="r">Ticket</th>@foreach ($categories as $cat)<th class="r">{{ $L::category($cat->value) }}</th>@endforeach<th class="r">ยังไม่ปิด</th><th class="r">ทัน SLA</th></tr></thead><tbody>
@foreach ($summary['by_department'] as $d)
    <tr><td>{{ $d['name_th'] ?: ($d['name'] ?? 'ไม่ระบุแผนก') }}</td><td class="r">{{ $num($d['count']) }}</td>@foreach ($categories as $cat)<td class="r">{{ $num($d['categories'][$cat->value] ?? 0) }}</td>@endforeach<td class="r">{{ $num($d['open']) }}</td><td class="r" style="color: {{ $slaTone($d['sla_rate']) }}">{{ $pct($d['sla_rate']) }}</td></tr>
@endforeach
</tbody></table>

<h2>ผลงานเจ้าหน้าที่ IT <span class="count">นับเคสที่ปิดในช่วงวันที่</span></h2>
<table class="data"><thead><tr><th>ผู้รับผิดชอบ</th><th class="r">ทั้งหมด</th><th class="r">ปิดสำเร็จ</th><th class="r">ยกเลิก</th><th class="r">เวลาแก้ไขโดยเฉลี่ย</th><th class="r">ทัน SLA</th></tr></thead><tbody>
@foreach ($summary['by_assignee'] as $a)
    <tr><td>{{ ($a['name_th'] ?? null) ?: ($a['name'] ?? '—') }}</td><td class="r">{{ $num($a['total']) }}</td><td class="r">{{ $num($a['completed']) }}</td><td class="r">{{ $num($a['canceled']) }}</td><td class="r">{{ $hrs($a['avg_resolve_hours']) }}</td><td class="r" style="color: {{ $slaTone($a['sla_rate']) }}">{{ $pct($a['sla_rate']) }}</td></tr>
@endforeach
</tbody></table>

<h2>รายการ Ticket <span class="count">{{ $truncated ? 'แสดง '.$num($rows->count()).' รายการล่าสุดจาก '.$num($k['total']).' รายการเต็มอยู่ในไฟล์ Excel' : $num($k['total']).' รายการ' }}</span></h2>
<table class="data">
    <thead><tr><th>เลขที่</th><th>เรื่อง</th><th>ผู้แจ้ง</th><th>แผนก</th><th>หมวด</th><th>ความสำคัญ</th><th>ที่มา</th><th>สถานะ</th><th>ผู้รับผิดชอบ</th><th>เปิดเมื่อ</th><th class="r">เวลาแก้ไข</th><th>SLA</th></tr></thead>
    <tbody>
    @forelse ($rows as $t)
        @php $sla = \App\Services\Report\TicketMetrics::slaState($t, now()); $hours = \App\Services\Report\TicketMetrics::resolveHours($t); @endphp
        <tr>
            <td class="nw">{{ $t->ticket_no }}</td>
            <td>{{ $t->subject }}</td>
            <td>{{ $person($t->requester) ?? '—' }}</td>
            <td>{{ ($t->requester?->department?->name_th ?: $t->requester?->department?->name) ?: '—' }}</td>
            <td>{{ $L::category($t->category?->value) }}</td>
            <td>{{ $L::priority($t->priority?->value) }}</td>
            <td>{{ $L::source($t->source?->value) ?? '—' }}</td>
            <td>{{ $L::status($t->status?->value) }}</td>
            <td>{{ $person($t->assignee) ?? '—' }}</td>
            <td class="nw">{{ \App\Support\DateDisplay::dateTime($t->created_at, $dateConfig) }}</td>
            <td class="r nw">{{ $hours === null ? '—' : number_format($hours, 1).' ชม.' }}</td>
            <td class="nw" @if (isset($slaColor[$sla])) style="color: {{ $slaColor[$sla] }}" @endif>{{ $slaLabel[$sla] ?? '—' }}</td>
        </tr>
    @empty
        <tr><td colspan="12" class="muted">ไม่มี Ticket ตามตัวกรองนี้</td></tr>
    @endforelse
    </tbody>
</table>

<table class="sign"><tr>
    <td><div class="sign-line"></div>ผู้จัดทำ<div class="muted">{{ $printedBy }}</div><div class="muted">วันที่ ........ / ........ / ........</div></td>
    <td><div class="sign-line"></div>ผู้ตรวจทาน<div class="muted">(.......................................................)</div><div class="muted">วันที่ ........ / ........ / ........</div></td>
    <td><div class="sign-line"></div>ผู้อนุมัติ<div class="muted">(.......................................................)</div><div class="muted">วันที่ ........ / ........ / ........</div></td>
</tr></table>
</body>
</html>
