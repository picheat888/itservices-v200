# Org Demo Data — 11 Departments / 26 Sections / 14-Level Ladder — Design

> Status: approved 2026-06-10. Rebuilds the demo seed data to a realistic factory org and widens position levels to 14. Applied with `php artisan migrate:fresh --seed` (full data reset — intended, this is demo data).

## Goal

Replace the demo org data with the user's real structure: 11 departments, 26 sections, a 14-rung position ladder (1 = smallest, 14 = largest), and ~30 demo employees wired into a single reporting tree topped by one company-wide VP. The approval chain now simply climbs `manager_id` from any employee up to that VP (no position-level ceiling) — demonstrable across the full ladder. Also widen the position-level cap from 10 → 14 (a display attribute only).

## Decisions

| Topic | Decision |
|-------|----------|
| Approval chain logic | **Changed** — climb `manager_id` from the employee up to the root, collecting every manager. `position.level` is NOT used; missing intermediate ranks are simply skipped (whoever the actual manager is, is the next link). |
| Approval ceiling | **Removed entirely** — the `approval_ceiling_level` setting, its Settings UI card, its endpoints, and the level-based stop in `ApprovalChainService` are all deleted. The chain ends naturally at the root (VP, `manager_id` = null). |
| Position level | Kept as a **display/ordering attribute only** (1–14 on the node card); no longer drives the chain. Cap widened 10 → 14 (`StorePositionRequest` max + level-picker buttons). |
| VP affiliation | VP has **no department / no section** (`department_id` & `section_id` = null), `manager_id` = null — top of the tree |
| Employee demo | **Rich set (~30)**: one full L1→L14 ladder in Production + breadth across the other departments |
| Apply | `php artisan migrate:fresh --seed` (wipes + reseeds; demo data, reset is intended) |
| Department `code` | already renamed to `tag` (prior work) — seeders use `tag` |

## Data

### Departments (11) — `tag : name`
`Mn : Maintenance` · `Lg : Logistic` · `It : Information Technology` · `Sales : Sales` · `Acc : Accounting` · `PD : Production` · `SE : Safety` · `GA : General Affairs` · `HR : Human Resources` · `QC : Quality Control` · `PU : Purchasing`

### Sections (26) by department
- **It**: Network & Security · Support · System analyst
- **QC**: Quality Control · Quality Assurance · Research and Development
- **PD**: Machine Operation · Retrot · Packing · Filling · Raw material · Stock · Loading · Warehouse · Forklift
- **PU**: Purchasing
- **HR**: Payroll · Recruitment · Training
- **GA**: General Affairs
- **Acc**: Accounting
- **Sales**: Sales
- **Lg**: Logistic
- **Mn**: Maintenance
- **SE**: Environment · Occupational Safety & Health

### Positions (14) — level : title (1 smallest → 14 largest)
1 Subcontract · 2 Staff/Officer · 3 Head of Shift · 4 Head of Line · 5 Sub-Leader · 6 Leader · 7 Asst. Supervisor · 8 Supervisor · 9 Senior Supervisor · 10 Asst. Manager · 11 Manager · 12 Senior Manager · 13 Director · 14 Vice President

### Demo employees (~30) — reporting tree

The roster forms one tree rooted at the VP. Codes `EMP-0001…`, plausible TH/EN names, emails `@abcd.co.th`. Manager links shown as `← reports to`.

**Top + Production full ladder (demonstrates all 14 levels in one chain):**
| Code | Position (level) | Dept | Section | Reports to |
|------|------------------|------|---------|------------|
| EMP-0001 Vice President (14) | — | — | (none, top) |
| EMP-0002 Director (13) — Manufacturing | PD | Machine Operation | EMP-0001 |
| EMP-0003 Senior Manager (12) | PD | Machine Operation | EMP-0002 |
| EMP-0004 Manager (11) | PD | Machine Operation | EMP-0003 |
| EMP-0005 Asst. Manager (10) | PD | Packing | EMP-0004 |
| EMP-0006 Senior Supervisor (9) | PD | Packing | EMP-0005 |
| EMP-0007 Supervisor (8) | PD | Filling | EMP-0006 |
| EMP-0008 Asst. Supervisor (7) | PD | Filling | EMP-0007 |
| EMP-0009 Leader (6) | PD | Retrot | EMP-0008 |
| EMP-0010 Sub-Leader (5) | PD | Retrot | EMP-0009 |
| EMP-0011 Head of Line (4) | PD | Raw material | EMP-0010 |
| EMP-0012 Head of Shift (3) | PD | Stock | EMP-0011 |
| EMP-0013 Staff/Officer (2) | PD | Loading | EMP-0012 |
| EMP-0014 Subcontract (1) | PD | Warehouse | EMP-0013 |

**Corporate Director + department managers (breadth):**
| Code | Position (level) | Dept | Section | Reports to |
|------|------------------|------|---------|------------|
| EMP-0015 Director (13) — Corporate | — | — | EMP-0001 |
| EMP-0016 Manager (11) | It | Network & Security | EMP-0015 |
| EMP-0017 Manager (11) | QC | Quality Control | EMP-0015 |
| EMP-0018 Manager (11) | HR | Payroll | EMP-0015 |
| EMP-0019 Manager (11) | Acc | Accounting | EMP-0015 |
| EMP-0020 Manager (11) | Sales | Sales | EMP-0015 |
| EMP-0021 Manager (11) | Lg | Logistic | EMP-0015 |
| EMP-0022 Manager (11) | Mn | Maintenance | EMP-0015 |
| EMP-0023 Manager (11) | PU | Purchasing | EMP-0015 |
| EMP-0024 Manager (11) | GA | General Affairs | EMP-0015 |
| EMP-0025 Manager (11) | SE | Occupational Safety & Health | EMP-0015 |

**A few staff under managers (more chain depth/section coverage):**
| Code | Position (level) | Dept | Section | Reports to |
|------|------------------|------|---------|------------|
| EMP-0026 Supervisor (8) | It | Support | EMP-0016 |
| EMP-0027 Staff/Officer (2) | It | System analyst | EMP-0026 |
| EMP-0028 Leader (6) | QC | Quality Assurance | EMP-0017 |
| EMP-0029 Staff/Officer (2) | QC | Research and Development | EMP-0028 |
| EMP-0030 Officer (2) | HR | Recruitment | EMP-0018 |

Covers all 11 departments, most sections, and a complete 1→14 ladder (EMP-0014 → … → EMP-0001 is 14 steps). One demo employee (EMP-0001) is linked to the super-admin login (mirroring the current seeder's account-linking step).

## Architecture / files

**Approval chain logic (changed) + ceiling removal:**
- **`ApprovalChainService`**: simplify `chainFor()` to climb `manager_id` from the employee to the root, collecting each manager (keep the cycle/seen-set guard). Delete `ceilingLevel()` and all `position.level` / `approval_ceiling_level` references.
- **`SettingsController`**: remove `approval()` + `updateApproval()` (and the `approvalPayload()` helper).
- **`routes/api.php`**: remove `GET|PUT settings/approval`.
- **Settings UI** (`resources/js/pages/settings/index.tsx` + `resources/js/services/settingsApi.ts`): remove the "Approval ceiling" card, `getApproval`/`updateApproval`, the `ApprovalSettings` type, and its query.
- **i18n** (`resources/js/lib/i18n.ts`): remove `set_approval*` keys (the ceiling card's labels).
- **`AppSetting`**: no migration needed — `approval_ceiling_level` is a row in the existing key/value `app_settings` table; it simply stops being written/read (a stale row is harmless, and a fresh seed won't create it).

**Position level cap 10 → 14 (display attribute):**
- **`StorePositionRequest`**: `'level' => [..., 'max:14']` (was 10).
- **`position-modal.tsx`**: level buttons `Array.from({ length: 14 })` (was 10).

**Demo seeder rewrite:**
- **`OrgSeeder`** (rewrite): seed the 11 departments (by `tag`), 14 positions (`code` P-01…P-14 + `level` 1–14), 26 sections (per department), and the ~30 employees above with `department_id`/`section_id`/`position_id`/`manager_id` forming the VP-topped tree. A fresh seed is the supported path.
- **`ApprovalChainDemoSeeder`** (remove): manager tree + levels are wired directly in `OrgSeeder`; there is no ceiling to set. Delete the file and its call in `DatabaseSeeder`.
- **No change** to the org chart or the section/department features.

## Testing

- **`ApprovalChainTest` (rewrite):** delete the ceiling-based tests (`*_stops_at_the_ceiling`, `*_without_level_does_not_stop_the_climb`, `*_updates_approval_ceiling_level`, `*_approval_ceiling_requires_permission`, and any test hitting `/settings/approval`). Keep/adjust: chain climbs through every manager up to the root (e.g. staff → leader → supervisor → manager → VP returns all four, regardless of levels); empty chain when no manager; cycle-safe (no infinite loop). The endpoint `GET /employees/{id}/approval-chain` and its auth/permission tests stay.
- **Position level cap:** assert via the positions API (or `StorePositionRequest`) that level 14 is accepted and 15 rejected.
- **Cross-seeder smoke (important):** `php artisan migrate:fresh --seed` must complete cleanly — the other demo seeders (Avatar/Contract/MasterData/Stock/Asset/Ticket/Mail/EmailTemplate) must not depend on removed employee codes or old department tags. Verify and adjust any that reference specific old codes (`EMP-104x`) or old dept tags (`IT`, `PRD`, …).
- Frontend: `tsc --noEmit` + `npm run build`.

## Out of scope

- Org-chart visual changes (already done; works off `manager_id`).
- Real (non-demo) data migration — this replaces demo data only.
- Dropping the `positions.level` column — level stays as a display/ordering attribute, just unused by the chain.
