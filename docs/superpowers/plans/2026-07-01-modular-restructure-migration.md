# Modular Restructure Migration — Implementation Plan (Frontend + Backend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan phase-by-phase. Steps use checkbox (`- [ ]`) syntax.

**Goal:** ย้ายโครงสร้างจาก layer-based → **Frontend feature-first modular** (`app/ modules/ shared/ lang/ stores/`) และ **Backend domain sub-namespace** (`App\<Layer>\<Domain>\`) ตามที่ออกแบบไว้ใน `CLAUDE.md` โดยไม่ big-bang

**Architecture:** ทำเป็นเฟส แต่ละเฟส build/test เขียวก่อนไปต่อ. Frontend ก่อน (จบแล้วเสถียร) แล้วค่อย Backend. ทุกการย้ายใช้ `git mv` (คง history) + อัปเดต import/namespace. Frontend คง flat i18n key + API `t()` เดิม (ไม่แตะ ~1487 call site). Backend คง path มาตรฐาน Laravel เพียงเพิ่ม subfolder ตามโดเมน.

**Tech Stack:** Laravel 12 (PHP 8.2), React 19 + TS, Vite 6, Tailwind v4, PHPUnit 11. `@/*` → `resources/js/*` (subpath alias ใช้ได้ทันที). ไม่มี JS test runner.

## Global Constraints

- **ห้ามเปลี่ยน public behavior**: หลังแต่ละเฟส แอปทำงานเหมือนเดิมทุกอย่าง
- **ห้ามเพิ่ม/ลบ dependency** โดยไม่ได้รับอนุมัติ (ไม่ติดตั้ง vitest ฯลฯ) — verification ใช้ `npx tsc --noEmit` + `npm run build` (FE) และ `php artisan test --compact` (BE)
- **ใช้ `git mv`** ทุกการย้ายไฟล์ (คง git history)
- **Frontend**: คง flat i18n key เดิม + API `useT()`/`t('key')`/`translate()` เดิม — ห้ามแตะ call site
- **Backend**: `namespace` = `App\<Layer>\<Domain>\`; migrations/seeders รวมศูนย์เหมือนเดิม; `User` + `App\Support\*` เป็น cross-domain (ไม่เข้าโดเมน)
- **Gate ต่อเฟส**: FE เฟส → `npx tsc --noEmit` + `npm run build` เขียว · BE เฟส → `php artisan test --compact` เขียว + `vendor/bin/pint --dirty --format agent`
- **1 เฟส = 1 commit (หรือมากกว่า)** — ไม่ค้างครึ่ง ๆ กลาง ๆ ข้ามเฟส
- **CLAUDE.md เป็นสัญญาโครงสร้าง** — ทำตามที่เขียนไว้ทุกจุด (`app/ modules/ shared/ lang/`, barrel, dependency rule)

---

## Phase 0 — Infra check (ไม่ย้ายไฟล์)

**Files:** none (verification only)

Alias `@/*` → `resources/js/*` มีอยู่แล้วใน `tsconfig.json:110-111` ดังนั้น `@/app`, `@/modules`, `@/shared`, `@/lang` เป็น subpath ที่ resolve ได้ทันที — **ไม่ต้องเพิ่ม alias**

- [ ] **Step 1: ยืนยัน alias + baseline เขียว**

Run: `npx tsc --noEmit` → Expected: exit 0
Run: `npm run build` → Expected: built สำเร็จ
Run: `php artisan test --compact` → Expected: all pass
(บันทึกจำนวนเทสต์ที่ผ่านไว้เป็น baseline สำหรับเทียบทุกเฟส BE)

- [ ] **Step 2: ยืนยัน vite resolve `@` ได้จริง** (Laravel Vite ใช้ tsconfig paths ผ่าน esbuild/rollup — ทดสอบด้วย build ใน Step 1 ที่ผ่านแล้วก็พอ)

ไม่มี commit (verification เท่านั้น)

---

# FRONTEND

## Phase F1 — i18n → `lang/` (⭐ pilot)

**เป้าหมาย:** หั่น `resources/js/lib/i18n.ts` (2164 บรรทัด, ~1077 key/locale) เป็น `resources/js/lang/<locale>/<module>.ts` + `lang/index.ts` (merge) โดย **merged dict ต้องเท่ากับของเดิมทุก key/ค่า** และ **API เดิมใช้ได้ผ่าน shim** (`lib/i18n.ts` re-export จาก `lang/`) → call site ไม่ต้องแก้

**Files:**
- Create: `resources/js/lang/types.ts`
- Create: `resources/js/lang/en/{common,employees,tickets,requests,assets,contracts,stock,permissions,access,settings,email,notifications,auth,dashboard}.ts`
- Create: `resources/js/lang/th/{...same...}.ts`
- Create: `resources/js/lang/index.ts`
- Rewrite (เป็น shim): `resources/js/lib/i18n.ts`
- Temp (ลบทิ้งท้ายเฟส): `scripts/i18n-split.mjs`, `scripts/i18n-parity.mjs`

**Interfaces (Produces):**
- `resources/js/lang/index.ts` exports: `translate(lang: Lang, key: string): string`, `useT(): (key: string) => string`, `dictionaries: Record<Lang, Record<string,string>>`
- `resources/js/lib/i18n.ts` ยัง export `translate`, `useT` (re-export) — call site เดิมใช้ได้

**Prefix → module map** (ใช้โดย codegen; ตัวที่ไม่แมตช์ → `common`):
| ไฟล์ | prefix ของ key |
|------|----------------|
| stock | `stock_` |
| assets | `asset_`, `assets_`, `transfer_` |
| tickets | `ticket_`, `tickets_`, `sla_` |
| employees | `emp_`, `employee`, `dept_`, `department`, `section_`, `org_`, `pos_`, `position`, `resign_`, `cred_`, `pwd_`, `reset_password`, `photo_`, `import_`, `kpi_`, `headcount`, `joined`, `recent_`, `approval_`, `tbl_emp` |
| contracts | `contract_`, `contracts_`, `expiring_`, `expired_`, `cd_` |
| stock/masterdata→settings | `md_`, `settings_`, `setting_`, `brand_`, `unit_`, `loc_`, `policy_`, `security_`, `set_` |
| permissions | `perm_`, `permission`, `gr_`, `audit_`, `role_` |
| access | `access_`, `noaccess_` |
| email | `email_` |
| notifications | `notif_`, `notification` |
| auth | `login_`, `session_`, `profile_`, `pwd_change` |
| dashboard | `dash_`, `overall`, `kpi_` (ถ้าไม่ชน employees) |
| common | อื่น ๆ ทั้งหมด (nav_, search_, filters, all_, sub_, save, cancel, close, clear, view, order, status, select, loading, next, back, coming, active, got_, export, density, sidebar, dark, light, add, new_, confirm, delete, submit, actions, total, assigned, …) |

> **สำคัญ:** การแมตช์ผิดไฟล์ **ไม่กระทบความถูกต้อง** เพราะ parity-check ตรวจ *merged* dict = ของเดิม (key อยู่ไฟล์ไหนก็รวมกลับมาเท่าเดิม) แค่กระทบความเป็นระเบียบ — จัดย้าย key ข้ามไฟล์ทีหลังได้

- [ ] **Step 1: เขียน parity-check script (ตัวตัดสินความถูกต้อง)**

สร้าง `scripts/i18n-parity.mjs` — เทียบ merged `lang/` กับ snapshot ของเดิม:

```js
// อ่าน dict เดิมจาก i18n ORIGINAL (เก็บสำเนาไว้ก่อนแก้) เทียบกับ merged lang/
// ใช้ tsx/esbuild ไม่ได้ (ไม่มี) — จึงเทียบผ่าน build artifact หรือ import แบบ dynamic ผ่าน vite.
// วิธีที่ไม่พึ่ง runner: ให้ script นี้ import ทั้งสอง dict ที่ compile แล้ว แล้ว deep-equal
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

// snapshotEn/snapshotTh = JSON ที่ dump จาก i18n.ts เดิม (Step 2)
const snap = JSON.parse(readFileSync('scripts/i18n-snapshot.json', 'utf8'));
// merged = JSON ที่ dump จาก lang/ ใหม่ (Step 6)
const merged = JSON.parse(readFileSync('scripts/i18n-merged.json', 'utf8'));

for (const lang of ['en', 'th']) {
  const a = snap[lang], b = merged[lang];
  const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
  assert.deepStrictEqual(ak, bk, `[${lang}] key set ต่างกัน`);
  for (const k of ak) assert.strictEqual(b[k], a[k], `[${lang}] ค่าของ ${k} ต่างกัน`);
}
console.log('i18n parity OK — merged lang/ = i18n.ts เดิมทุก key/ค่า');
```

- [ ] **Step 2: dump snapshot ของ dict เดิม**

เพิ่มบล็อกชั่วคราวท้าย `resources/js/lib/i18n.ts` เดิม (หรือทำ script อ่าน AST) เพื่อเขียน `scripts/i18n-snapshot.json = { en: {...}, th: {...} }`. วิธีที่ง่ายสุด: เพราะ `en`/`th`/`dictionaries` เป็น object literal — สร้าง `scripts/i18n-snapshot.mjs` ที่ `import { dictionaries } from '../resources/js/lib/i18n.ts'` **ไม่ได้** (node อ่าน .ts ตรงไม่ได้) → ใช้ `node --experimental-strip-types` (Node ≥22) หรือ compile ผ่าน esbuild ที่ vite มีให้:

```bash
npx esbuild resources/js/lib/i18n.ts --bundle --format=esm --outfile=scripts/_i18n.mjs --external:@/* --alias:@=./resources/js
node -e "import('./scripts/_i18n.mjs').then(m=>require('fs').writeFileSync('scripts/i18n-snapshot.json', JSON.stringify(m.dictionaries)))"
```
(esbuild มากับ vite อยู่แล้ว — ไม่ใช่ dep ใหม่) ยืนยันไฟล์ `scripts/i18n-snapshot.json` มี en/th ครบ ~1077 key

- [ ] **Step 3: เขียน codegen script แยกไฟล์**

สร้าง `scripts/i18n-split.mjs` — อ่าน `i18n-snapshot.json` แล้วเขียน `resources/js/lang/<locale>/<module>.ts` ตาม prefix map:

```js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const dict = JSON.parse(readFileSync('scripts/i18n-snapshot.json', 'utf8'));

const RULES = [ // [regex, module] — ลำดับสำคัญ (แมตช์ตัวแรกชนะ)
  [/^stock_/, 'stock'],
  [/^(asset_|assets_|transfer_)/, 'assets'],
  [/^(ticket_|tickets_|sla_)/, 'tickets'],
  [/^(emp_|employee|dept_|department|section_|org_|pos_|position|resign_|cred_|pwd_|reset_password|photo_|import_|kpi_|headcount|joined|recent_|approval_|tbl_emp)/, 'employees'],
  [/^(contract_|contracts_|expiring_|expired_|cd_)/, 'contracts'],
  [/^(md_|settings_|setting_|brand_|unit_|loc_|policy_|security_|set_)/, 'settings'],
  [/^(perm_|permission|gr_|audit_|role_)/, 'permissions'],
  [/^(access_|noaccess_)/, 'access'],
  [/^email_/, 'email'],
  [/^(notif_|notification)/, 'notifications'],
  [/^(login_|session_|profile_)/, 'auth'],
  [/^(dash_|overall)/, 'dashboard'],
];
const MODULES = ['common','employees','tickets','requests','assets','contracts','stock','permissions','access','settings','email','notifications','auth','dashboard'];
const moduleOf = (k) => (RULES.find(([re]) => re.test(k)) ?? [null,'common'])[1];

for (const lang of ['en','th']) {
  const buckets = Object.fromEntries(MODULES.map(m => [m, {}]));
  for (const [k,v] of Object.entries(dict[lang])) buckets[moduleOf(k)][k] = v;
  mkdirSync(`resources/js/lang/${lang}`, { recursive: true });
  for (const m of MODULES) {
    const entries = Object.entries(buckets[m]);
    const body = entries.map(([k,v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n');
    writeFileSync(`resources/js/lang/${lang}/${m}.ts`,
      `import type { Dict } from '@/lang/types';\n\nexport const ${m}: Dict = {\n${body}\n};\n`);
  }
}
console.log('split done');
```

Run: `node scripts/i18n-split.mjs` → ได้ `resources/js/lang/en/*.ts` + `th/*.ts` ครบ 14 ไฟล์/locale

- [ ] **Step 4: สร้าง `lang/types.ts`**

```ts
import type { Lang } from '@/types';
export type { Lang };
export type Dict = Record<string, string>;
```

- [ ] **Step 5: สร้าง `lang/index.ts` (merge + API)**

```ts
import { useUiStore } from '@/stores/ui';
import type { Dict, Lang } from '@/lang/types';
import { common as enCommon } from '@/lang/en/common';
import { employees as enEmployees } from '@/lang/en/employees';
// … import ครบทั้ง 14 โมดูลของ en …
import { common as thCommon } from '@/lang/th/common';
// … import ครบทั้ง 14 โมดูลของ th …

const en: Dict = { ...enCommon, ...enEmployees, /* …14 โมดูล… */ };
const th: Dict = { ...thCommon, ...thEmployees, /* …14 โมดูล… */ };

export const dictionaries: Record<Lang, Dict> = { en, th };

export function translate(lang: Lang, key: string): string {
    return dictionaries[lang][key] ?? key;
}

export function useT() {
    const lang = useUiStore((s) => s.lang);
    return (key: string) => translate(lang, key);
}
```

- [ ] **Step 6: dump merged dict + รัน parity**

```bash
npx esbuild resources/js/lang/index.ts --bundle --format=esm --outfile=scripts/_merged.mjs --alias:@=./resources/js
node -e "import('./scripts/_merged.mjs').then(m=>require('fs').writeFileSync('scripts/i18n-merged.json', JSON.stringify(m.dictionaries)))"
node scripts/i18n-parity.mjs
```
Expected: `i18n parity OK …` — ถ้า assert fail แปลว่า key หาย/ค่าเพี้ยน → แก้ก่อนไปต่อ (ห้ามข้าม)

- [ ] **Step 7: เปลี่ยน `lib/i18n.ts` เป็น shim**

แทนเนื้อหาทั้งไฟล์ `resources/js/lib/i18n.ts` ด้วย:
```ts
// i18n ถูกหั่นไป resources/js/lang/ แล้ว — ไฟล์นี้คง path เดิมไว้เพื่อ backward-compat
export { translate, useT, dictionaries } from '@/lang';
```

- [ ] **Step 8: verify (gate)**

Run: `npx tsc --noEmit` → exit 0
Run: `npm run build` → สำเร็จ
(สุ่มเปิดแอปเช็ค 2-3 หน้าว่าข้อความ th/en ครบ — ผ่าน get-absolute-url ถ้าต้องการ)

- [ ] **Step 9: ลบ temp + commit**

```bash
rm scripts/_i18n.mjs scripts/_merged.mjs scripts/i18n-snapshot.json scripts/i18n-merged.json scripts/i18n-split.mjs scripts/i18n-parity.mjs
git add resources/js/lang resources/js/lib/i18n.ts
git commit -m "refactor(i18n): split i18n.ts into lang/<locale>/<module> (parity-verified, API unchanged)"
```

---

## Phase F2 — `shared/` + `app/`

**เป้าหมาย:** ย้ายของกลาง/เชลล์เข้าที่ ตาม CLAUDE.md — โดยยังไม่แตะโมดูลฟีเจอร์

**การย้าย (ใช้ `git mv`):**
| จาก | ไป |
|-----|----|
| `components/ui/*` | `shared/ui/` |
| `components/shared/*` | `shared/components/` |
| `hooks/{use-mobile,use-mobile-navigation,use-document-title,use-initials,use-apply-theme}.ts*` | `shared/hooks/` |
| `lib/{utils,currency,query-client,locale-data,brand-color}.ts` | `shared/lib/` |
| `types/*` | `shared/types/` |
| `components/shell/*` | `app/layout/` |
| `app.tsx` | `app/App.tsx` |
| `lib/nav.ts` | `app/nav.ts` |
| `stores/*` | คงที่ `stores/` (app-wide) |

- [ ] **Step 1: ย้าย `shared/ui` + `shared/components`**

```bash
mkdir -p resources/js/shared/ui resources/js/shared/components
git mv resources/js/components/ui/* resources/js/shared/ui/
git mv resources/js/components/shared/* resources/js/shared/components/
```

- [ ] **Step 2: อัปเดต import ทั่วโปรเจกต์ (2 pattern)**

ใช้หา-แทนทั่ว `resources/js`:
- `@/components/ui/` → `@/shared/ui/`
- `@/components/shared/` → `@/shared/components/`

(ใช้ Grep หา `@/components/ui` และ `@/components/shared` แล้วแก้ทุกไฟล์ที่พบ)

- [ ] **Step 3: ย้าย shared hooks/lib/types + แก้ import**

```bash
mkdir -p resources/js/shared/hooks resources/js/shared/lib resources/js/shared/types
git mv resources/js/hooks/use-mobile.tsx resources/js/hooks/use-mobile-navigation.ts resources/js/hooks/use-document-title.ts resources/js/hooks/use-initials.tsx resources/js/hooks/use-apply-theme.ts resources/js/shared/hooks/
git mv resources/js/lib/utils.ts resources/js/lib/currency.ts resources/js/lib/query-client.ts resources/js/lib/locale-data.ts resources/js/lib/brand-color.ts resources/js/shared/lib/
git mv resources/js/types/* resources/js/shared/types/
```
แก้ import: `@/hooks/use-mobile` → `@/shared/hooks/use-mobile` (ทำเฉพาะ 5 ตัวที่ย้าย), `@/lib/utils`→`@/shared/lib/utils` (+ currency/query-client/locale-data/brand-color), `@/types`→`@/shared/types`

> ⚠️ `@/types` ถูก import กว้างมาก — ใช้ Grep นับก่อน แล้วแก้ทีละ pattern; `tsc` จะเป็นตาข่ายจับ import ที่ตกหล่น

- [ ] **Step 4: ย้าย shell → `app/layout` + `app.tsx`/`nav.ts`**

```bash
mkdir -p resources/js/app/layout
git mv resources/js/components/shell/* resources/js/app/layout/
git mv resources/js/app.tsx resources/js/app/App.tsx
git mv resources/js/lib/nav.ts resources/js/app/nav.ts
```
แก้ import: `@/components/shell/` → `@/app/layout/`, `@/lib/nav` → `@/app/nav`

- [ ] **Step 5: อัปเดต Vite entry**

`resources/views/app.blade.php` — เปลี่ยน `@vite([... 'resources/js/app.tsx'])` → `resources/js/app/App.tsx`
ตรวจ `vite.config.ts` ถ้ามีการอ้าง `resources/js/app.tsx` ให้แก้เป็น `resources/js/app/App.tsx`

- [ ] **Step 6: verify + commit**

Run: `npx tsc --noEmit` → exit 0 · `npm run build` → สำเร็จ
```bash
git add -A resources/js resources/views/app.blade.php vite.config.ts
git commit -m "refactor(fe): move shared/ + app/ (ui, components, hooks, lib, types, shell, entry)"
```

---

## Phase F3…F14 — ย้ายทีละโมดูล (repeatable procedure)

ทำ **ทีละโมดูล** ตามลำดับความเสี่ยงต่ำ→สูง:
`dashboard → auth → notifications → email-templates → access → permissions → tickets → requests → contracts → assets → stock → employees`
(employees/stock ท้ายสุดเพราะใหญ่/พึ่งพากันเยอะ)

### Procedure ต่อ 1 โมดูล `<m>` (ใช้ซ้ำทุกเฟส)

- [ ] **Step 1: สร้างโครงโมดูล + ย้ายไฟล์ด้วย `git mv`**
```bash
mkdir -p resources/js/modules/<m>/{components,pages,hooks,api}
git mv resources/js/pages/<m>/* resources/js/modules/<m>/pages/       # ถ้ามี
git mv resources/js/components/<m>/* resources/js/modules/<m>/components/  # ถ้ามี
git mv resources/js/hooks/use-<m>.ts resources/js/modules/<m>/hooks/  # ตาม hook จริงของโมดูล
git mv resources/js/services/<m>Api.ts resources/js/modules/<m>/api/  # ตาม service จริง
```
> map ชื่อจริง: employees→`use-org.ts`/`orgApi.ts`; permissions→`use-permissions.ts`/`permissionApi.ts`; ฯลฯ (ดู `hooks/` + `services/` เดิม)

- [ ] **Step 2: สร้าง barrel `modules/<m>/index.ts`**
export เฉพาะสิ่งที่ข้างนอกใช้ (หน้า page + hook ที่โมดูลอื่น/แอปเรียก) เช่น:
```ts
export { default as EmployeesPage } from './pages';
export { useEmployeeDirectory, useDepartments } from './hooks/use-org';
```

- [ ] **Step 3: ย้าย type ของโมดูลออกจาก `shared/types` (ถ้าแยกได้ชัด)** — optional; ถ้ายังปนกันมาก ปล่อยไว้ที่ `shared/types` ก่อน

- [ ] **Step 4: อัปเดต import ทั้งแอป**
- ภายในโมดูล: import ญาติกันใช้ relative หรือ `@/modules/<m>/...`
- แอป/โมดูลอื่นที่เคย `@/pages/<m>`, `@/components/<m>/`, `@/hooks/use-<m>`, `@/services/<m>Api` → ชี้มา `@/modules/<m>` (ผ่าน barrel ถ้าเป็นการใช้ข้ามโมดูล)
- `app/router` / `app/nav` ที่ lazy-import หน้า `<m>` → ชี้ path ใหม่

- [ ] **Step 5: verify + commit**
Run: `npx tsc --noEmit` → exit 0 · `npm run build` → สำเร็จ
```bash
git add -A resources/js
git commit -m "refactor(fe): move <m> into modules/<m>/"
```

### Worked example — โมดูล `employees`
```bash
mkdir -p resources/js/modules/employees/{components,pages,hooks,api}
git mv resources/js/pages/employees/* resources/js/modules/employees/pages/
git mv resources/js/components/employees/* resources/js/modules/employees/components/
git mv resources/js/hooks/use-org.ts resources/js/modules/employees/hooks/
git mv resources/js/services/orgApi.ts resources/js/modules/employees/api/
# lib/org-tree.ts ใช้เฉพาะ org chart → ย้ายเข้าโมดูลด้วย
git mv resources/js/lib/org-tree.ts resources/js/modules/employees/lib/  # mkdir lib ก่อน
```
barrel `modules/employees/index.ts`:
```ts
export { default as EmployeesPage } from './pages';
export { useEmployeeDirectory, useEmployee, useEmployeeSummary, useDepartments, usePositions } from './hooks/use-org';
```
แก้ import ทั่วแอป: `@/components/employees/*`→`@/modules/employees/components/*`, `@/hooks/use-org`→`@/modules/employees/hooks/use-org` (หรือผ่าน barrel), `@/services/orgApi`→`@/modules/employees/api/orgApi`, `@/lib/org-tree`→`@/modules/employees/lib/org-tree`
> หมายเหตุ: `use-org`/`orgApi` ถูกใช้ข้ามโมดูล (audit tab ใน permissions, pickers) — import ผ่าน barrel `@/modules/employees`

---

## Phase F15 — เก็บกวาด frontend

- [ ] **Step 1:** ลบโฟลเดอร์เก่าที่ว่างแล้ว: `components/` (เหลือแต่ที่ย้ายหมด), `pages/`, `services/`, `hooks/` (ตัวที่เหลือ→shared/module), `lib/` (ตัวที่เหลือ→shared)
- [ ] **Step 2:** ย้าย hook/lib ที่ยังค้างใน `hooks/`,`lib/` ไป `shared/` หรือโมดูลที่เกี่ยวข้อง (เช่น `use-master-data`→settings, `use-notifications`→notifications, `use-auth`→auth)
- [ ] **Step 3:** ย้ายข้อความ inline ที่ hardcode (เช่น "Master · gates…" ใน stock/employee permission tree) เข้า `lang/` ใช้ `useT()`
- [ ] **Step 4:** verify `tsc` + `build` + commit `refactor(fe): cleanup empty layer folders + fold stragglers into shared/modules`

---

# BACKEND

## Phase B1…B10 — ย้ายทีละโดเมน (repeatable procedure)

ทำ **ทีละโดเมน** ลำดับเล็ก→ใหญ่:
`Auth → Access → Notification → Permission → Settings → Ticket → Contract → Asset → Employee → Stock`

### Procedure ต่อ 1 โดเมน `<D>` (ใช้ซ้ำ)

- [ ] **Step 1: ย้ายไฟล์ด้วย `git mv` เข้า subfolder โดเมน**
```bash
mkdir -p app/Http/Controllers/Api/<D> app/Models/<D> app/Services/<D> app/Http/Requests/<D> app/Http/Resources/<D> app/Enums/<D>
git mv app/Http/Controllers/Api/<Ctrl>.php app/Http/Controllers/Api/<D>/
git mv app/Models/<Model>.php app/Models/<D>/
git mv app/Services/<Svc>.php app/Services/<D>/
git mv app/Http/Requests/<Req>.php app/Http/Requests/<D>/     # ถ้ามี
git mv app/Http/Resources/<Res>.php app/Http/Resources/<D>/   # ถ้ามี
git mv app/Enums/<Enum>.php app/Enums/<D>/                    # ถ้ามี
```

- [ ] **Step 2: แก้ `namespace` + `use` ในไฟล์ที่ย้าย**
- Controllers: `namespace App\Http\Controllers\Api\<D>;` + `use App\Http\Controllers\Controller;`
- Models: `namespace App\Models\<D>;`
- Services: `namespace App\Services\<D>;`
- Requests/Resources/Enums: `namespace App\Http\Requests\<D>;` / `App\Http\Resources\<D>;` / `App\Enums\<D>;`
- เพิ่ม `use` ให้คลาสของโดเมนเดียวกันที่อ้างถึงกัน (Model/Resource/Service)

- [ ] **Step 3: อัปเดตผู้อ้างอิงทั่ว codebase**
หา `use App\Models\<Model>;`, `use App\Services\<Svc>;`, `App\Http\Controllers\Api\<Ctrl>` ทุกที่ (controllers อื่น, services, tests, `routes/api.php`, seeders, factories, notifications, migrations ที่อ้าง Model) แล้วแก้ namespace ใหม่
- `routes/api.php`: แก้ `use App\Http\Controllers\Api\<Ctrl>;` → `use App\Http\Controllers\Api\<D>\<Ctrl>;`
- factories: `database/factories/<Model>Factory.php` — `protected $model` + `use`

- [ ] **Step 4: verify + Pint + commit**
Run: `php artisan test --compact` → เท่ากับ baseline (all pass)
Run: `vendor/bin/pint --dirty --format agent`
```bash
git add -A app routes tests database
git commit -m "refactor(be): move <D> domain into App\\<Layer>\\<D> sub-namespace"
```

### Worked example — โดเมน `Stock`
```bash
mkdir -p app/Http/Controllers/Api/Stock app/Models/Stock app/Services/Stock app/Enums/Stock
git mv app/Http/Controllers/Api/StockItemController.php app/Http/Controllers/Api/StockMovementController.php app/Http/Controllers/Api/StockRequestController.php app/Http/Controllers/Api/StockCountController.php app/Http/Controllers/Api/Stock/
git mv app/Models/StockItem.php app/Models/StockBalance.php app/Models/StockLot.php app/Models/StockMovement.php app/Models/StockRequest.php app/Models/StockCount.php app/Models/StockCountLine.php app/Models/StockItemSerial.php app/Models/StockItemSerialEvent.php app/Models/StockAlertLog.php app/Models/Stock/
git mv app/Services/StockBalanceService.php app/Services/StockCountService.php app/Services/StockLotService.php app/Services/StockSerialService.php app/Services/StockNotificationService.php app/Services/Stock/
git mv app/Enums/StockCountAdjustMode.php app/Enums/StockCountStatus.php app/Enums/Stock/
```
- แก้ namespace ในทุกไฟล์ที่ย้าย (เช่น `namespace App\Models\Stock;`)
- ผู้อ้างอิงหลัก: `routes/api.php` (4 controllers), `StockNotificationService`/`StockBalanceService` อ้าง Model กันเอง, `App\Support\Permissions` (ไม่อ้าง Model), tests `Stock*Test.php`, factories `StockItemFactory` ฯลฯ — แก้ `use` ให้ครบ (tsc เทียบไม่ได้ฝั่ง PHP → พึ่ง `php artisan test` + `composer dump-autoload` เป็นตาข่าย)
- Run `composer dump-autoload` ถ้า autoload งง

> ⚠️ **Stock เป็นโดเมนใหญ่สุด + เพิ่งแก้ permission tree ไป** — ทำเป็นโดเมนท้าย ๆ และรัน `Stock*Test` + `EmployeePermissionGatingTest` ให้เขียวหลังย้าย

---

## Phase B11 — เก็บกวาด backend + อัปเดตเอกสาร

- [ ] **Step 1:** ตรวจ `app/Models/` เหลือแค่ `User.php`; `app/Support/` คง cross-domain; ไม่มีไฟล์โดเมนตกค้างที่ root ของแต่ละ layer
- [ ] **Step 2:** `php artisan test --compact` เต็ม suite = baseline · `vendor/bin/pint --dirty`
- [ ] **Step 3:** อัปเดต README (สรุป migration ทั้ง FE+BE ตาม README cadence)
- [ ] **Step 4:** commit `docs: modular restructure migration summary`

---

## Verification Gates (สรุป)

| ชนิดเฟส | Gate ก่อนไปเฟสถัดไป |
|---------|---------------------|
| Frontend | `npx tsc --noEmit` (exit 0) + `npm run build` (สำเร็จ) |
| i18n (F1) | + parity script ผ่าน (merged = เดิม) |
| Backend | `php artisan test --compact` = baseline (all pass) + `vendor/bin/pint --dirty --format agent` |

## Rollback

แต่ละเฟส = commit เดียว (หรือกลุ่ม) → ถ้าเฟสไหนพัง `git revert <commit>` ได้ทันทีโดยไม่กระทบเฟสก่อนหน้า. ไม่มีการแก้ DB/migration ในแผนนี้ (โครงสร้างโค้ดล้วน) → rollback ปลอดภัย

## Self-Review Notes

- **Spec coverage:** โครงสร้างใน CLAUDE.md ครบ — `lang/`→F1; `shared/`+`app/`→F2; `modules/<m>/`→F3-14; backend `<Domain>/`→B1-10; barrel/i18n-central/dependency-rule อยู่ใน procedure
- **Invariant กันพัง:** F1 มี parity-check (พิสูจน์ dict ไม่เปลี่ยน); ทุกเฟสมี gate build/test; ใช้ `git mv` คง history; ไม่แตะ DB
- **ไม่มี dependency ใหม่:** ใช้ esbuild (มากับ vite) + node สำหรับ codegen ชั่วคราว แล้วลบทิ้ง
- **ความเสี่ยงหลัก:** import churn ตอนย้าย (F2, per-module) → ตาข่ายคือ `tsc`; PHP namespace churn (B*) → ตาข่ายคือ `php artisan test` + autoload
