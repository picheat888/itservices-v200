# Form-control hover/focus consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every form control (input, textarea, select, searchable-select, checkbox, toggle) one shared hover/focus language matching the already-shipped `<Input>`.

**Architecture:** Fix the shared UI components once (they propagate app-wide), add a new shared `<Textarea>`, then replace hand-written `<textarea>`/`<input>` elements with the shared components. Buttons are out of scope.

**Tech Stack:** React 19 + TypeScript, Tailwind CSS v4, Radix UI primitives. Theme tokens live in `resources/css/app.css` (`--brand`, `--input`, `--primary` = `--brand`).

## Global Constraints

- **Canonical bordered-control classes** (input / textarea / select trigger / searchable-select trigger), copied verbatim:
  `transition-colors hover:border-brand/50 focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/15 focus-visible:outline-hidden`
  — and REMOVE any of: `ring-offset-background`, `focus-visible:ring-2`, `focus:ring-2`, `focus-visible:ring-ring`, `focus:ring-ring`, `focus-visible:ring-offset-2`, `focus:ring-offset-2`.
- **Canonical small-control focus** (checkbox / toggle): `focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-brand/15` (no offset, no `ring-ring`).
- Disabled bordered controls keep the resting border: add `disabled:hover:border-input`.
- Use the `brand` token (not `primary`/`ring`) for these states so naming is consistent; the resolved color is unchanged.
- No CSS unit tests exist. Per-task automated gate = `npx tsc --noEmit` and `npx eslint <files>` both clean. Final task adds a light+dark visual pass.
- Do NOT touch `resources/js/shared/ui/button.tsx`.
- Commit after each task. Work on `main` (project convention); stage only the task's files.

---

### Task 1: Shared `<Textarea>` component

**Files:**
- Create: `resources/js/shared/ui/textarea.tsx`

**Interfaces:**
- Produces: `export { Textarea }` — `React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>`, usable as `<Textarea value onChange rows placeholder className />`.

- [ ] **Step 1: Create the component**

```tsx
import * as React from 'react';

import { cn } from '@/shared/lib/utils';

/** Shared multi-line text field. Same rest/hover/focus language as <Input>. */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(({ className, ...props }, ref) => {
    return (
        <textarea
            ref={ref}
            className={cn(
                'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground hover:border-brand/50 focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/15 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input',
                className,
            )}
            {...props}
        />
    );
});

Textarea.displayName = 'Textarea';

export { Textarea };
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint resources/js/shared/ui/textarea.tsx`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add resources/js/shared/ui/textarea.tsx
git commit -m "feat(ui): shared Textarea with the canonical field states"
```

---

### Task 2: SelectTrigger — canonical focus/hover

**Files:**
- Modify: `resources/js/shared/ui/select.tsx` (SelectTrigger className, ~line 20)

- [ ] **Step 1: Replace the SelectTrigger className string**

Find:

```
'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
```

Replace with:

```
'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground hover:border-brand/50 focus:border-brand focus:ring-[3px] focus:ring-brand/15 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input [&>span]:line-clamp-1',
```

(Note: the Radix trigger already used `focus:` not `focus-visible:`; keep `focus:` here so the ring shows while the trigger holds focus with the panel open.)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint resources/js/shared/ui/select.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add resources/js/shared/ui/select.tsx
git commit -m "fix(ui): SelectTrigger uses the canonical field hover/focus"
```

---

### Task 3: SearchableSelect trigger — canonical focus/hover

**Files:**
- Modify: `resources/js/shared/components/searchable-select.tsx` (trigger className, ~line 212)

- [ ] **Step 1: Replace the trigger base className**

Find:

```
'ring-offset-background focus-visible:ring-ring flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden',
```

Replace with:

```
'flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border px-3 text-sm transition-colors focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/15 focus-visible:outline-hidden',
```

Leave the next line unchanged — it sets the rest/active border and (for the
inactive state) should gain the hover tint:

Find:

```
active ? 'border-brand/50 bg-brand/5 text-brand font-medium' : 'border-input bg-background',
```

Replace with:

```
active ? 'border-brand/50 bg-brand/5 text-brand font-medium' : 'border-input bg-background hover:border-brand/50',
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint resources/js/shared/components/searchable-select.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add resources/js/shared/components/searchable-select.tsx
git commit -m "fix(ui): SearchableSelect trigger uses the canonical field hover/focus"
```

---

### Task 4: Checkbox — canonical focus + brand hover

**Files:**
- Modify: `resources/js/shared/ui/checkbox.tsx` (className, ~line 12)

- [ ] **Step 1: Replace the Checkbox className string**

Find:

```
'peer size-5 shrink-0 rounded-sm border-2 border-muted-foreground/45 bg-background transition-colors ring-offset-background hover:border-primary/70 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary',
```

Replace with:

```
'peer size-5 shrink-0 rounded-sm border-2 border-muted-foreground/45 bg-background transition-colors hover:border-brand/50 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary',
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint resources/js/shared/ui/checkbox.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add resources/js/shared/ui/checkbox.tsx
git commit -m "fix(ui): Checkbox uses the canonical soft focus + brand hover"
```

---

### Task 5: Toggle — canonical focus

**Files:**
- Modify: `resources/js/shared/ui/toggle.tsx` (toggleVariants base, ~line 10)

- [ ] **Step 1: Replace the focus fragment in the cva base string**

Find (within the base string):

```
ring-offset-background transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
```

Replace with:

```
transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-brand/15
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint resources/js/shared/ui/toggle.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add resources/js/shared/ui/toggle.tsx
git commit -m "fix(ui): Toggle uses the canonical soft focus ring"
```

---

### Task 6: Replace raw `<textarea>` with `<Textarea>`

**Files (each has exactly one plain textarea at the listed line):**
- `resources/js/modules/asset/components/asset-form-drawer.tsx:447`
- `resources/js/modules/asset/components/asset-transfer-dialog.tsx:160`
- `resources/js/modules/contract/components/contract-cancel-dialog.tsx:55`
- `resources/js/modules/contract/components/contract-form-drawer.tsx:545`
- `resources/js/modules/email-templates/pages/index.tsx:553`
- `resources/js/modules/employee/components/resign-modal.tsx:74`
- `resources/js/modules/ticket/components/create-ticket-drawer.tsx:159`
- `resources/js/modules/ticket/components/edit-ticket-drawer.tsx:105`
- `resources/js/modules/ticket/components/resolve-ticket-modal.tsx:53`
- `resources/js/modules/ticket/components/take-case-modal.tsx:85`

**Interfaces:**
- Consumes: `Textarea` from Task 1 — `import { Textarea } from '@/shared/ui/textarea';`

**Transformation (identical per file):** keep every prop the raw element already
has (`value`, `onChange`, `rows`, `placeholder`, `disabled`, `id`, etc.). Drop the
inline layout/border/focus classes that the shared component now owns
(`border-input bg-background ... rounded-md border px-3 py-2 ... focus*`, any
`ring-*`, `hover:border-*`, `outline-none`). Keep only genuinely bespoke classes
(e.g. `font-mono`, a specific `min-h-[...]`, `resize-none`). Pass survivors via
`className`.

- [ ] **Step 1: Worked example — create-ticket-drawer.tsx:159**

Before:

```tsx
<textarea
    value={description}
    onChange={(e) => setDescription(e.target.value)}
    rows={5}
    className="border-input bg-background hover:border-brand/50 focus-visible:border-brand focus-visible:ring-brand/15 w-full rounded-md border px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-[3px]"
    placeholder={lang === 'th' ? 'เกิดอะไรขึ้น ลองทำอะไรไปแล้วบ้าง เห็นข้อความ error อย่างไร' : 'What happened, what did you try, what error did you see?'}
/>
```

After (add `import { Textarea } from '@/shared/ui/textarea';` to the imports):

```tsx
<Textarea
    value={description}
    onChange={(e) => setDescription(e.target.value)}
    rows={5}
    placeholder={lang === 'th' ? 'เกิดอะไรขึ้น ลองทำอะไรไปแล้วบ้าง เห็นข้อความ error อย่างไร' : 'What happened, what did you try, what error did you see?'}
/>
```

- [ ] **Step 2: Apply the same transformation to the other 9 files**

For each remaining file above: open it, add the `Textarea` import if absent,
replace `<textarea …>` (and its closing tag) with `<Textarea …>` carrying the
same runtime props, dropping the now-owned classes and keeping only bespoke ones.
If a textarea has a bespoke `min-h`/`resize`/`font-mono`, pass it as
`className="…"`. Read each element first — do not assume the class list.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint resources/js/modules/asset/components/asset-form-drawer.tsx resources/js/modules/asset/components/asset-transfer-dialog.tsx resources/js/modules/contract/components/contract-cancel-dialog.tsx resources/js/modules/contract/components/contract-form-drawer.tsx resources/js/modules/email-templates/pages/index.tsx resources/js/modules/employee/components/resign-modal.tsx resources/js/modules/ticket/components/create-ticket-drawer.tsx resources/js/modules/ticket/components/edit-ticket-drawer.tsx resources/js/modules/ticket/components/resolve-ticket-modal.tsx resources/js/modules/ticket/components/take-case-modal.tsx`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add resources/js/modules
git commit -m "refactor(ui): use shared Textarea for all multi-line fields"
```

---

### Task 7: Align raw `<input>` text fields with `<Input>`

**Candidate sites (verify each — convert only genuine single-line TEXT fields):**
- `resources/js/modules/access/components/resource-modal.tsx:528,593,676`
- `resources/js/modules/contract/components/contract-form-drawer.tsx:612`
- `resources/js/modules/employee/components/add-employee-drawer.tsx:299`
- `resources/js/modules/employee/components/org-chart/org-chart-toolbar.tsx:83` (search box)
- `resources/js/modules/stock/components/movement-drawer.tsx:582,762`
- `resources/js/modules/email-templates/pages/index.tsx:445`

**SKIP (leave as-is — not plain text fields):**
- Any `type="file"` / `type="range"` / `type="checkbox"` / `type="radio"` / `type="hidden"`.
- File pickers in `import-contract-dialog.tsx`, `import-employee-dialog.tsx`, `photo-crop-dialog.tsx`, and the hidden picker in `create-ticket-drawer.tsx:225`.

**Interfaces:**
- Consumes: `Input` from `@/shared/ui/input`.

- [ ] **Step 1: Convert plain text inputs to `<Input>`**

For each candidate: read the element. If it is a single-line text/number/search
input styled like a field (has `border`, `rounded-md`, `px-3`, focus classes),
replace `<input …>` with `<Input …>` (add `import { Input } from '@/shared/ui/input';`),
keeping runtime props and dropping the now-owned border/focus classes. Keep
bespoke classes (`font-mono`, width overrides) via `className`.

Worked example — a typical text field:

Before:

```tsx
<input
    type="text"
    value={name}
    onChange={(e) => setName(e.target.value)}
    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand"
    placeholder="…"
/>
```

After:

```tsx
<Input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="…" />
```

- [ ] **Step 2: For inputs you deliberately keep raw**

If an input can't cleanly become `<Input>` (e.g. a search box wired to a custom
container), do NOT swap it — instead align just its interactive classes to the
canonical bordered set: ensure it has `transition-colors hover:border-brand/50
focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/15
focus-visible:outline-hidden` and remove any `ring-offset-*` / `ring-2` /
`ring-ring`. Leave layout/size classes intact.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint resources/js/modules/access/components/resource-modal.tsx resources/js/modules/contract/components/contract-form-drawer.tsx resources/js/modules/employee/components/add-employee-drawer.tsx resources/js/modules/employee/components/org-chart/org-chart-toolbar.tsx resources/js/modules/stock/components/movement-drawer.tsx resources/js/modules/email-templates/pages/index.tsx`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add resources/js/modules
git commit -m "refactor(ui): align raw text inputs with the shared Input states"
```

---

### Task 8: Sweep the remaining old focus rings + final verification

**Files (any not covered above still using the old ring — from the earlier scan):**
- `resources/js/modules/access/components/resource-modal.tsx`
- `resources/js/modules/contract/components/contract-cancel-dialog.tsx`
- `resources/js/modules/email-templates/pages/index.tsx`
- `resources/js/modules/employee/components/resign-modal.tsx`
- `resources/js/modules/permission/components/role-modal.tsx`
- `resources/js/modules/settings/pages/index.tsx`
- `resources/js/modules/stock/components/movement-drawer.tsx`

- [ ] **Step 1: Find every remaining old ring on a form control**

Run: `grep -rn "focus-visible:ring-ring\|focus:ring-ring\|ring-offset-2" resources/js/modules resources/js/shared`
For each hit on a form CONTROL (input/textarea/select/checkbox/toggle-like) that
survived Tasks 6–7, replace the old fragment with the canonical control focus.
Skip hits on buttons and on `resources/js/shared/ui/{button,badge,dialog,sheet}.tsx` (out of scope).

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit && npx eslint resources/js`
Expected: clean (pre-existing unrelated warnings, if any, unchanged).

- [ ] **Step 3: Visual pass (manual, both themes)**

Open each and confirm rest → hover (brand/50 border) → focus (brand border + soft
`ring-brand/15`, no offset gap) reads identically, in light AND dark:
New Ticket, Edit Ticket, Employee add/edit, Asset form, Asset transfer,
Contract form, Contract cancel, Stock movement, Access resource modal,
Permission role modal, Settings, Email templates.

- [ ] **Step 4: Commit**

```bash
git add resources/js
git commit -m "fix(ui): finish form-control focus-ring sweep (drop legacy ring-offset)"
```

---

## Self-review notes

- **Spec coverage:** canonical states (Global Constraints) ✓; Textarea (T1) ✓;
  select/searchable/checkbox/toggle (T2–5) ✓; raw textarea (T6) ✓; raw input (T7) ✓;
  leftover legacy rings + visual verification (T8) ✓; buttons excluded ✓.
- **Type consistency:** `Textarea` export/name used identically in T1 and T6.
- **No placeholders:** every shared-control edit shows the exact before/after
  string; the raw-element tasks give a worked example + the concrete class rule
  and require reading each element first (bespoke class lists vary, so a single
  literal per site would be guesswork — the transformation rule is exact).
