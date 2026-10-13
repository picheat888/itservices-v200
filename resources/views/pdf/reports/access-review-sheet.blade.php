{{-- "ใบทบทวนสมาชิก": one email group, file share or social account with its owner and every active member, for the owner to tick and sign. Rendered by AccessResourceMembersController::sheet(). --}}
@php
    $types = ['email_group' => 'Email Group', 'file_share' => 'File Share', 'social_platform' => 'Social / Internet'];
    $address = ['email_group' => 'อีเมล', 'file_share' => 'Path', 'social_platform' => 'บัญชี'];
    $levels = ['Read' => 'Read', 'Write' => 'Read/Write', 'member' => 'สมาชิก'];
    $dept = fn ($d) => $d ? (($d['name_th'] ?? null) ?: $d['name']) : '—';
    $isFile = $sheet['type'] === 'file_share';
    $ownable = in_array($sheet['type'], ['email_group', 'file_share'], true);
@endphp
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>ใบทบทวนสมาชิก - {{ $sheet['code'] }} - {{ $company }}</title>
    <style>
        @font-face { font-family: 'Sarabun'; font-weight: normal; src: url("{{ storage_path('fonts/Sarabun-Regular.ttf') }}") format('truetype'); }
        @font-face { font-family: 'Sarabun'; font-weight: bold; src: url("{{ storage_path('fonts/Sarabun-Bold.ttf') }}") format('truetype'); }
        * { font-family: 'Sarabun', sans-serif; }
        body { margin: 0; color: #111; font-size: 11px; }
        .head { width: 100%; border-bottom: 1.5px solid #000; padding-bottom: 6px; margin-bottom: 10px; }
        .head td { vertical-align: top; }
        .logo { height: 34px; }
        h1 { font-size: 16px; margin: 0; }
        .muted { color: #555; }
        .code { font-weight: bold; text-align: right; font-size: 12px; }
        table.facts { width: 100%; margin-bottom: 8px; }
        table.facts td { padding: 2px 0; vertical-align: top; }
        table.facts td.k { width: 90px; color: #555; }
        .ask { background: #f3f4f6; padding: 6px 8px; margin: 0 0 8px; }
        table.data { width: 100%; border-collapse: collapse; }
        table.data th { background: #f0f0f0; border: 0.5px solid #999; padding: 4px 5px; text-align: left; font-size: 10px; }
        table.data td { border: 0.5px solid #bbb; padding: 4px 5px; font-size: 10px; vertical-align: top; }
        table.data td.r, table.data th.r { text-align: right; width: 22px; }
        table.data td.c, table.data th.c { text-align: center; width: 42px; }
        .box { display: inline-block; width: 10px; height: 10px; border: 1px solid #555; }
        tr.gone td { background: #fef2f2; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        .tot { text-align: right; margin-top: 6px; color: #333; }
        table.sign { width: 100%; margin-top: 34px; }
        table.sign td { width: 50%; text-align: center; padding: 0 20px; }
        .line { border-bottom: 1px dotted #111; height: 26px; margin-bottom: 4px; }
    </style>
</head>
<body>
    <table class="head">
        <tr>
            <td>
                @if ($logo)<img class="logo" src="{{ $logo }}" alt="">@endif
                <h1>ใบทบทวนสมาชิก</h1>
                <div class="muted">{{ $company }}, ข้อมูล ณ {{ $printedAt }}, พิมพ์โดย {{ $printedBy }}</div>
            </td>
            <td class="code">{{ $sheet['code'] }}</td>
        </tr>
    </table>

    <table class="facts">
        <tr><td class="k">Resource</td><td><b>{{ $sheet['name'] }}</b> ({{ $types[$sheet['type']] }})</td></tr>
        <tr><td class="k">{{ $address[$sheet['type']] }}</td><td>{{ $sheet['detail'] ?? '—' }}</td></tr>
        <tr><td class="k">แผนก</td><td>{{ $ownable ? $dept($sheet['department']) : 'ไม่ผูกแผนก' }}</td></tr>
        <tr><td class="k">เจ้าของ</td><td>
            @if (! $ownable)
                — (ไม่มีเจ้าของในทะเบียนนี้ IT เป็นผู้ทบทวน)
            @elseif ($sheet['owner'])
                <b>{{ $sheet['owner']['name'] }}</b> ({{ $sheet['owner']['code'] }}), {{ $dept($sheet['owner']['department']) }}{{ $sheet['owner_issue'] === 'gone' ? ', ลาออกแล้ว' : '' }}
            @else
                ยังไม่มี
            @endif
        </td></tr>
    </table>

    <p class="ask">โปรดตรวจรายชื่อด้านล่าง ทำเครื่องหมาย ✓ ในช่อง "ยังใช้" หรือในช่อง "ถอน" แล้วส่งกลับฝ่าย IT</p>

    <table class="data">
        <thead><tr>
            <th class="r">#</th><th>พนักงาน</th><th>แผนก</th>@if ($isFile)<th>ระดับ</th>@endif<th>วันที่ให้</th><th>หมายเหตุ</th><th class="c">ยังใช้</th><th class="c">ถอน</th>
        </tr></thead>
        <tbody>
        @forelse ($sheet['list'] as $i => $m)
            <tr class="{{ $m['kind'] === 'gone' ? 'gone' : '' }}">
                <td class="r">{{ $i + 1 }}</td>
                <td><b>{{ $m['name'] }}</b> <span class="muted">{{ $m['code'] }}</span></td>
                <td>{{ $dept($m['department']) }}</td>
                @if ($isFile)<td>{{ $levels[$m['level']] ?? $m['level'] }}</td>@endif
                <td>{{ \App\Support\DateDisplay::date($m['granted_at'], $dateConfig) }}</td>
                <td>{{ $m['kind'] === 'gone' ? 'ลาออก'.($m['last_day'] ? ' '.\App\Support\DateDisplay::date($m['last_day'], $dateConfig) : '') : ($m['kind'] === 'cross' ? 'ข้ามแผนก' : '') }}</td>
                <td class="c"><span class="box"></span></td>
                <td class="c"><span class="box"></span></td>
            </tr>
        @empty
            <tr><td colspan="{{ $isFile ? 8 : 7 }}" class="muted">ไม่มีสมาชิก</td></tr>
        @endforelse
        </tbody>
    </table>
    <div class="tot">รวม {{ count($sheet['list']) }} คน{{ $sheet['mix']['cross'] ? ', ข้ามแผนก '.$sheet['mix']['cross'] : '' }}{{ $sheet['mix']['gone'] ? ', ลาออก '.$sheet['mix']['gone'] : '' }}</div>

    <table class="sign">
        <tr>
            <td><div class="line"></div>ลงชื่อ{{ $ownable ? 'เจ้าของ' : 'ผู้ทบทวน' }}<div class="muted">วันที่ ........ / ........ / ........</div></td>
            <td><div class="line"></div>ลงชื่อผู้ดำเนินการ IT<div class="muted">วันที่ ........ / ........ / ........</div></td>
        </tr>
    </table>
</body>
</html>
