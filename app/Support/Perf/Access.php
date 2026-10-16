<?php

namespace App\Support\Perf;

use App\Enums\Access\SoftwareLicenseType;

/** Perf step 6: software, social platforms, mail groups, file shares and who was granted what, and when. */
class Access implements PerfStep
{
    use FillsRows;

    private const SOFTWARE = [
        'Microsoft 365', 'Adobe Acrobat Pro', 'AutoCAD LT', 'Visual Studio Professional', 'Zoom Workplace', 'Slack Business', 'TeamViewer',
        'WinRAR', 'SPSS Statistics', 'MATLAB', 'Photoshop', 'Illustrator', 'Figma', 'Jira', 'Confluence', 'Power BI Pro', 'Tableau', 'SketchUp',
        'Revit', 'SolidWorks', 'ESET Endpoint', 'Kaspersky', 'Veeam Backup', 'VMware Workstation', 'Camtasia', 'SnagIt', 'Notion', 'Canva Pro',
        'Postman', 'JetBrains IDE', 'Oracle Database', 'SQL Server', 'Windows Server CAL', 'Remote Desktop CAL', 'Trello', 'Asana', 'Mural',
        'Miro', 'Lucidchart', 'Bitwarden',
    ];

    private const SOCIAL = [
        ['Facebook', 'https://facebook.com', '#1877f2'], ['Instagram', 'https://instagram.com', '#e1306c'], ['LINE Official Account', 'https://line.me', '#06c755'],
        ['TikTok', 'https://tiktok.com', '#111827'], ['YouTube', 'https://youtube.com', '#ff0000'], ['X', 'https://x.com', '#0f172a'],
        ['LinkedIn', 'https://linkedin.com', '#0a66c2'], ['Google Business', 'https://business.google.com', '#4285f4'],
    ];

    private const SHARE_NAMES = ['Documents', 'Projects', 'Reports', 'Templates', 'Archive', 'Contracts', 'Drawings', 'Photos', 'Backups', 'Forms'];

    private const PURPOSES = ['Daily work', 'Project support', 'Reporting', 'Cover for a colleague', 'Audit preparation', 'Customer follow-up'];

    private const COUNTS = ['softwares' => 40, 'email_groups' => 60, 'file_shares' => 40];

    /** @var list<array<string, mixed>> */
    private array $employees = [];

    public function run(PerfContext $ctx): void
    {
        $this->ctx = $ctx;
        $reg = $ctx->reg;
        $this->employees = $reg->get('employees');
        $owners = array_values(array_filter($this->employees, fn (array $e): bool => $e['status'] === 'active' && $e['user_id'] !== null && $e['kind'] !== 'vp'));
        $itUsers = array_values(array_filter($this->employees, fn (array $e): bool => $e['kind'] === 'it'));

        // Resources first, with their creation time, so grants can follow
        $resources = ['software' => [], 'social_platform' => [], 'email_group' => [], 'file_share' => []];
        $departments = $reg->get('department_ids');
        $names = $reg->get('department_names');

        for ($i = 0; $i < self::COUNTS['softwares']; $i++) {
            $resources['software'][] = ['id' => $reg->nextId('softwares'), 'name' => self::SOFTWARE[$i], 'created' => $ctx->clock->moment($ctx->rng), 'owner' => null];
        }
        foreach (self::SOCIAL as $s) {
            $resources['social_platform'][] = ['id' => $reg->nextId('social_platforms'), 'name' => $s[0], 'url' => $s[1], 'color' => $s[2], 'created' => $ctx->clock->moment($ctx->rng), 'owner' => null];
        }
        for ($i = 0; $i < self::COUNTS['email_groups']; $i++) {
            $dept = $departments[$i % count($departments)];
            $label = strtolower(preg_replace('/[^A-Za-z]+/', '-', $names[$dept])).'-'.(intdiv($i, count($departments)) + 1);
            $resources['email_group'][] = [
                'id' => $reg->nextId('email_groups'), 'name' => ucwords(str_replace('-', ' ', $label)), 'email' => $label.'@groups.perf.local', 'dept' => $dept,
                'created' => $ctx->clock->moment($ctx->rng), 'owner' => $ctx->rng->pick($owners)['id'],
            ];
        }
        for ($i = 0; $i < self::COUNTS['file_shares']; $i++) {
            $dept = $departments[$i % count($departments)];
            $name = $names[$dept].' '.self::SHARE_NAMES[intdiv($i, count($departments)) % count(self::SHARE_NAMES)];
            $resources['file_share'][] = [
                'id' => $reg->nextId('file_shares'), 'name' => $name, 'path' => '\\\\nas01\\'.str_replace(' ', '', $name), 'dept' => $dept,
                'created' => $ctx->clock->moment($ctx->rng), 'owner' => $ctx->rng->pick($owners)['id'],
            ];
        }

        $grants = $this->planGrants($resources);
        $perSoftware = [];
        foreach ($grants as $g) {
            if ($g['type'] === 'software') {
                $perSoftware[$g['resource']] = ($perSoftware[$g['resource']] ?? 0) + 1;
            }
        }

        $this->writeResources($resources, $perSoftware, $itUsers);
        $this->writeGrants($grants, $resources);
        $reg->remember('resources', $resources);
    }

    /**
     * @param  array<string, list<array<string, mixed>>>  $resources
     * @return list<array<string, mixed>>
     */
    private function planGrants(array $resources): array
    {
        $rng = $this->ctx->rng;
        $clock = $this->ctx->clock;
        $weights = ['software' => 35, 'email_group' => 25, 'file_share' => 30, 'social_platform' => 10];
        $byId = [];
        foreach ($resources as $type => $list) {
            foreach ($list as $r) {
                $byId[$type][$r['id']] = $r;
            }
        }

        $grants = [];
        $used = [];
        $target = $this->ctx->targets->of('access_memberships');
        for ($attempt = 0; count($grants) < $target && $attempt < $target * 6; $attempt++) {
            $type = $rng->weighted($weights);
            $resource = $rng->pick($resources[$type]);
            $at = $clock->moment($rng);
            if ($at < $resource['created']) {
                $at = $clock->after($resource['created'], $rng, 60, 20 * 1440);
            }
            $e = $rng->pick($this->employees);
            $key = $type.'|'.$resource['id'].'|'.$e['id'];
            if (isset($used[$key]) || $e['id'] === $resource['owner'] || $e['joined_at'] > $at || ($e['last_day'] !== null && $e['last_day'] <= $at)) {
                continue;
            }
            $used[$key] = true;

            $revokedAt = null;
            if ($e['last_day'] !== null) {
                $revokedAt = min($e['last_day']->addDays($rng->int(0, 7))->setTime(17, 30), $clock->end());
            } elseif ($rng->chance(0.25)) {
                $revokedAt = $clock->after($at, $rng, 1440, 400 * 1440);
                $revokedAt = $revokedAt < $clock->end() ? $revokedAt : null;
            }
            if ($revokedAt !== null && $revokedAt < $at) {
                $revokedAt = $at->addHour();
            }
            $grants[] = ['type' => $type, 'resource' => $resource['id'], 'employee' => $e, 'at' => $at, 'revoked_at' => $revokedAt, 'level' => $type === 'file_share' ? ($rng->chance(0.3) ? 'Write' : 'Read') : null];
        }
        usort($grants, fn (array $a, array $b): int => $a['at'] <=> $b['at']);

        return $grants;
    }

    /** @param array<string, list<array<string, mixed>>> $resources */
    private function writeResources(array $resources, array $perSoftware, array $itUsers): void
    {
        $rng = $this->ctx->rng;
        $reg = $this->ctx->reg;
        $sql = $this->ctx->sql;
        $by = fn (): array => [$itUsers[$rng->int(0, count($itUsers) - 1)]['user_id'], 0];

        foreach ($resources['software'] as $i => $s) {
            $type = $rng->weighted(['perpetual' => 25, 'subscription' => 55, 'free' => 8, 'open_source' => 12]);
            $limited = in_array($type, ['perpetual', 'subscription'], true);
            $creator = $by()[0];
            $sql->insert('softwares', $this->fill('softwares', [
                'id' => $s['id'], 'code' => sprintf('SW-%04d', $s['id']), 'name' => $s['name'], 'brand_id' => $rng->pick($reg->get('brand_ids')),
                'license_type' => SoftwareLicenseType::from($type)->value, 'seats' => $limited ? max($rng->int(5, 200), $perSoftware[$s['id']] ?? 0) : null,
                'product_key' => $limited ? strtoupper(substr(md5($s['name'].$i), 0, 20)) : null,
                'created_at' => $s['created'], 'updated_at' => $s['created'], 'created_by' => $creator, 'updated_by' => $creator,
            ]));
            $reg->event('access.resource_created', ['type' => 'software', 'id' => $s['id'], 'name' => $s['name'], 'at' => $s['created'], 'by_user_id' => $creator]);
        }
        foreach ($resources['social_platform'] as $s) {
            $creator = $by()[0];
            $sql->insert('social_platforms', $this->fill('social_platforms', [
                'id' => $s['id'], 'code' => sprintf('SM-%04d', $s['id']), 'name' => $s['name'], 'url' => $s['url'], 'color' => $s['color'],
                'policy' => 'Use for company business only.', 'created_at' => $s['created'], 'updated_at' => $s['created'], 'created_by' => $creator, 'updated_by' => $creator,
            ]));
            $reg->event('access.resource_created', ['type' => 'social_platform', 'id' => $s['id'], 'name' => $s['name'], 'at' => $s['created'], 'by_user_id' => $creator]);
        }
        foreach ($resources['email_group'] as $g) {
            $creator = $by()[0];
            $sql->insert('email_groups', $this->fill('email_groups', [
                'id' => $g['id'], 'code' => sprintf('MG-%04d', $g['id']), 'name' => $g['name'], 'email' => $g['email'], 'department_id' => $g['dept'],
                'description' => $g['name'].' mail group', 'owner_employee_id' => $g['owner'],
                'created_at' => $g['created'], 'updated_at' => $g['created'], 'created_by' => $creator, 'updated_by' => $creator,
            ]));
            $reg->event('access.resource_created', ['type' => 'email_group', 'id' => $g['id'], 'name' => $g['name'], 'at' => $g['created'], 'by_user_id' => $creator]);
        }
        foreach ($resources['file_share'] as $f) {
            $creator = $by()[0];
            $unit = $rng->chance(0.3) ? 'TB' : 'GB';
            $sql->insert('file_shares', $this->fill('file_shares', [
                'id' => $f['id'], 'code' => sprintf('FS-%04d', $f['id']), 'name' => $f['name'], 'path' => $f['path'], 'department_id' => $f['dept'],
                'size' => $unit === 'TB' ? $rng->int(1, 4) : $rng->int(50, 900), 'size_unit' => $unit, 'description' => $f['name'].' share',
                'owner_employee_id' => $f['owner'], 'created_at' => $f['created'], 'updated_at' => $f['created'], 'created_by' => $creator, 'updated_by' => $creator,
            ]));
            $reg->event('access.resource_created', ['type' => 'file_share', 'id' => $f['id'], 'name' => $f['name'], 'at' => $f['created'], 'by_user_id' => $creator]);
        }
    }

    /**
     * @param  list<array<string, mixed>>  $grants
     * @param  array<string, list<array<string, mixed>>>  $resources
     */
    private function writeGrants(array $grants, array $resources): void
    {
        $reg = $this->ctx->reg;
        $rng = $this->ctx->rng;
        $it = array_values(array_filter($this->employees, fn (array $e): bool => $e['kind'] === 'it'));
        $names = [];
        foreach ($resources as $type => $list) {
            foreach ($list as $r) {
                $names[$type.'|'.$r['id']] = $r['name'];
            }
        }

        foreach ($grants as $g) {
            $grantor = $rng->pick($it);
            $revoker = $rng->pick($it);
            $e = $g['employee'];
            $this->ctx->sql->insert('access_memberships', $this->fill('access_memberships', [
                'id' => $reg->nextId('access_memberships'), 'resource_type' => $g['type'], 'resource_id' => $g['resource'], 'employee_id' => $e['id'],
                'access_level' => $g['level'], 'purpose' => $rng->pick(self::PURPOSES), 'granted_at' => $g['at'], 'granted_by' => $grantor['user_id'],
                'revoked_at' => $g['revoked_at'], 'revoked_by' => $g['revoked_at'] ? $revoker['user_id'] : null,
                'created_at' => $g['at'], 'updated_at' => $g['revoked_at'] ?? $g['at'],
            ]));
            $base = ['type' => $g['type'], 'resource_id' => $g['resource'], 'resource_name' => $names[$g['type'].'|'.$g['resource']], 'employee_id' => $e['id'], 'employee_name' => $e['name']];
            $reg->event('access.granted', $base + ['at' => $g['at'], 'by_user_id' => $grantor['user_id'], 'by_name' => $grantor['name']]);
            if ($g['revoked_at']) {
                $reg->event('access.revoked', $base + ['at' => $g['revoked_at'], 'by_user_id' => $revoker['user_id'], 'by_name' => $revoker['name']]);
            }
        }
    }
}
