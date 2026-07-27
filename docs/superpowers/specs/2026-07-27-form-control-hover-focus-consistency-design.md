# Form-control hover/focus consistency — design

**Date:** 2026-07-27
**Status:** Approved (design), pending implementation plan

## Problem

While iterating on the ticket dialogs we refined the shared `<Input>` to a clean
three-state look (rest → hover → focus). The rest of the app never got that
treatment, so form controls drift:

- `<textarea>` is hand-written in ~10 files (no shared component), each styling
  focus differently.
- ~15 raw `<input>` elements bypass the shared `<Input>`.
- `select`, `searchable-select`, `checkbox`, `toggle` still use the older focus
  ring (`ring-ring` + `ring-offset-2`), which no longer matches `<Input>`.

Goal: every **form control** (not buttons) shares one hover/focus language,
theme-aware, matching the already-shipped `<Input>`.

## Canonical states (the single source of truth)

Bordered text/select controls — `Input` (done), `Textarea` (new), `SelectTrigger`,
`SearchableSelect` trigger:

- rest: `border-input`
- hover: `hover:border-brand/50`
- focus: `focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/15 focus-visible:outline-hidden` (no ring offset)
- disabled keeps the resting border (`disabled:hover:border-input`)

Small controls — `Checkbox`, `Toggle`:

- focus: `focus-visible:ring-[3px] focus-visible:ring-brand/15 focus-visible:outline-hidden` (drop `ring-offset-2`)
- checkbox hover: `hover:border-brand/50` (was `border-primary/70`)
- keep the existing checked/selected fills (`data-[state=checked]:bg-primary` etc.)

Notes:
- `--primary` resolves to `--brand` in `app.css`, so the color is unchanged;
  this only makes the token naming consistent.
- `focus-visible` (not `focus`) is intentional: text fields still show the ring
  on click (browser heuristic), while select/checkbox/toggle show it only on
  keyboard focus — the standard, non-intrusive a11y behavior. Their
  selected/checked state already signals mouse interaction.

## Changes

### Shared components (fix once, applies app-wide)
1. `shared/ui/input.tsx` — ✅ already the reference; no change.
2. `shared/ui/textarea.tsx` — **new** component mirroring `Input` (same classes,
   `min-h`, `field-sizing` optional). Export from the same barrel path callers
   expect (`@/shared/ui/textarea`).
3. `shared/ui/select.tsx` — `SelectTrigger`: replace old ring with the canonical
   bordered-control focus/hover.
4. `shared/components/searchable-select.tsx` — trigger (~line 212): replace old
   ring with canonical; keep the `active` state (`border-brand/50 bg-brand/5`).
5. `shared/ui/checkbox.tsx` — hover `primary/70` → `brand/50`; focus ring → canonical soft.
6. `shared/ui/toggle.tsx` — focus ring → canonical soft.

### Replace raw controls
7. Replace hand-written `<textarea>` with `<Textarea>` in the plain-field cases:
   asset-form-drawer, asset-transfer-dialog, contract-cancel-dialog,
   contract-form-drawer, employee/resign-modal, ticket/{create,edit,resolve,take}
   drawers, email-templates page. Preserve any bespoke sizing/behavior; only the
   focus/hover comes from the shared component.
8. Replace raw `<input>` with `<Input>` where the element is a plain text field.
   **Skip** non-text inputs (file pickers, hidden inputs, custom search boxes that
   already have their own treatment) — case by case, do not force.

### Out of scope
- `button.tsx` focus ring (button a11y is a separate concern; user scoped to form controls).
- SectionLabel / dialog shells (already unified in prior work).

## Testing / verification

- No CSS unit tests. Verify by inspection across representative forms in BOTH
  light and dark: New Ticket, Edit Ticket, Employee add/edit, Asset form,
  Contract form/cancel, Stock movement, Access resource modal, Settings, Permission role modal.
- Confirm each control's three states read consistently and the focus glow has no
  offset gap.
- `npx tsc --noEmit` and `eslint` pass on all touched files.
- Run the frontend-touching feature suites that render these controls only if
  they assert on markup (none expected); otherwise tsc/eslint + visual check.

## Risks

- A raw `<input>`/`<textarea>` may carry bespoke classes that conflict with the
  shared component's. Reconcile per file; when unsure, leave the raw element and
  only align its focus/hover classes rather than swapping the component.
- `field-sizing`/auto-grow textareas: keep their behavior; only unify focus/hover.
