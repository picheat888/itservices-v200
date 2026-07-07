# Contract Lifecycle Rework — Overdue / Manual Expired / Permissions

- **Date:** 2026-07-07
- **Module:** Contract & Rental (Module 5)
- **Status:** Approved design — ready for implementation plan

## 1. Problem & Goals

ปัจจุบันสถานะสัญญาถูก "คำนวณ" จากวันที่ล้วน ๆ (`Contract::status`): เมื่อ `end_date` ผ่านไป สัญญาจะกลายเป็น **expired** โดยอัตโนมัติ และมีเพียง action เดียวที่สั่งเองได้คือ **Cancel** (toggle `cancelled_at`).

ปัญหา/ความต้องการ:

1. การที่ `end_date` ผ่านไป **ไม่ควร** แปลว่าสัญญา "สิ้นสุด" — มันแค่ "เกินกำหนด" และรอให้ admin มาตัดสินใจ (ต่ออายุ หรือปิด). จึงต้องเปลี่ยนสถานะอัตโนมัตินี้จาก **Expired** → **Overdue**.
2. **Expired** ที่แท้จริงต้องเป็นการกระทำที่ **admin สั่งเอง** (ยืนยันว่าสัญญาสิ้นสุดจริง) และเป็น **ถาวร**.
3. **Cancel** คงความหมายเดิม — ยกเลิกสัญญาระหว่างทาง (เช่น คู่สัญญาทำผิดเงื่อนไข) และยัง **กดกลับได้ (reversible)**.
4. **Auto-renew** ไม่ได้ใช้งาน — ตัดออกทั้งระบบ.
5. Action ที่อันตราย (Cancel/Reactivate และ Expired) ต้องคุมด้วย permission แยก เพื่อกัน admin ทั่วไปกดผิด.

## 2. Status Model

```
active ──(end_date ผ่าน, อัตโนมัติ)──► overdue ──(admin กด Expired)──► expired  [ถาวร]
  │
  └─ expiring = ไม่ใช่ค่าสถานะแยก แต่เป็น flag (in_reminder) ซ้อนบน active เมื่อเข้า reminder window

active / overdue ──(admin กด Cancel)──► cancelled ⇄ (admin กด Reactivate) ──► active/overdue
```

| สถานะ | ที่มา | ย้อนได้ | สี (แนะนำ) |
|---|---|---|---|
| **active** | `end_date` ยังไม่ถึง | — | เขียว |
| *(expiring)* | active + `in_reminder` (flag) | — | เหลือง |
| **overdue** | `end_date` ผ่าน — อัตโนมัติ | อัตโนมัติตามวันที่ | แดง |
| **cancelled** | admin กด Cancel (`cancelled_at`) | ✅ toggle | เทา |
| **expired** | admin กด Expired (`expired_at`) | ❌ ถาวร | เทาเข้ม/ดำ |

**Precedence** ใน `Contract::status` (บนลงล่าง หยุดที่ตรงแรกที่ตรง):

1. `expired_at !== null` → `expired`
2. `cancelled_at !== null` → `cancelled`
3. `daysRemaining() > 0` → `active`
4. else → `overdue`

`in_reminder` ยังเป็น flag แยก (คำนวณจาก `isInReminder()`) ไม่รวมใน enum สถานะ — เหมือนโครงเดิม.

## 3. Database

**1 migration** (`convert_contract_lifecycle` หรือชื่อทำนองนี้):

- **เพิ่มคอลัมน์** `expired_at` TIMESTAMP nullable (หลัง `cancelled_at`). ตั้งค่าครั้งเดียวตอน admin กด Expired และ **ไม่เคยเคลียร์** = แทน "ถาวร".
- **ลบคอลัมน์** `auto_renew`.
- `down()`: เพิ่ม `auto_renew` (tinyint default 0) กลับ และ drop `expired_at`.

> หมายเหตุ: `cancelled_at` เดิม (nullable, reversible) คงไว้ไม่เปลี่ยน.

## 4. Backend Changes

### 4.1 `app/Models/Contract/Contract.php`
- `$fillable`: เพิ่ม `expired_at`; ลบ `auto_renew`.
- `casts()`: เพิ่ม `expired_at => 'datetime'`; ลบ `auto_renew => 'boolean'`.
- `status()` attribute: ปรับตาม precedence §2 (เพิ่ม `overdue`, `expired`).
- `isInReminder()`: เพิ่มการกัน `expired_at !== null` (สัญญาที่ปิดแล้วไม่อยู่ใน reminder) — เช่นเดียวกับที่กัน `cancelled_at` อยู่แล้ว.

### 4.2 `app/Services/Contract/ContractService.php`
- เปลี่ยน `assertCancellable(Contract)` → `assertNoPendingAssets(Contract)`:
  - **เอาเงื่อนไข "เฉพาะ Hardware" ออก** — ใช้กับ **สัญญาทุกประเภทที่มี asset ผูกอยู่**.
  - เงื่อนไข: asset ที่ผูกกับสัญญาทุกตัวต้องมีสถานะ `writeoff` ก่อน — ไม่งั้น throw `ValidationException` พร้อมจำนวนที่ค้าง.
- `toggleCancel(Contract)`: ก่อน active→cancelled เรียก `assertNoPendingAssets()` (เหมือนเดิม แต่ generalize แล้ว); reactivation ยังทำได้เสมอ.
- **เพิ่ม** `expire(Contract): Contract`:
  - ถ้า `expired_at !== null` อยู่แล้ว → throw ValidationException (กดซ้ำไม่ได้ / ถาวร).
  - เรียก `assertNoPendingAssets()`.
  - set `expired_at = now()`; return `fresh()`.
  - **ไม่มี** un-expire.
- `importRows()`: ลบการอ่าน/เขียน `auto_renew`.

### 4.3 `app/Http/Controllers/Api/Contract/ContractController.php`
- `cancel()`: เปลี่ยน permission check `contracts.edit` → **`contracts.cancel`**. Audit log เดิม (Cancelled/Reactivated).
- **เพิ่ม** `expire()`:
  - `abort_unless(hasPermission('contracts.expire'), 403)`.
  - เรียก `service->expire($contract)`; audit log `'Expired contract'`.
  - return `ContractResource` + `message: success`.
- `index()`/`summary()`: การนับ/จัดเรียง — สัญญา `expired_at` ควรถูกจัดกลุ่มเหมือน terminal (จมล่างเหมือน cancelled). ปรับ `orderByRaw` / filter ให้รวม `expired_at IS NOT NULL` ในกลุ่ม terminal; เพิ่มตัวนับ `overdue`/`expired` ใน summary ตามต้องการของ UI (อย่างน้อยแยก overdue ออกจาก expired).

### 4.4 `app/Http/Requests/Contract/StoreContractRequest.php`
- ลบ rule `auto_renew`.

### 4.5 `app/Http/Resources/Contract/ContractResource.php`
- เพิ่ม `'expired_at' => $this->expired_at?->toDateString()`.
- ลบ `'auto_renew'`.

### 4.6 `app/Services/Contract/ContractExpiryAlertService.php`
- `run()`: filter contracts เพิ่ม **`whereNull('expired_at')`** ควบคู่ `whereNull('cancelled_at')` — สัญญาที่ admin ปิดแล้วต้องหยุดเตือนทันที (ไม่งั้น bell เด้งทุกวันไม่จบ).
- Wording: สัญญาที่ `daysRemaining() <= 0` แต่ยังไม่ถูกปิด = **Overdue** — สื่อสารตามข้อ 4.7.

### 4.7 `app/Support/EmailTemplates.php`
- Template `contract.expired_alert`: **คง key เดิม** (กัน DB seed เดิมพัง) แต่ปรับ `name`/`subject`/`body_html` ให้สื่อว่า **"Overdue — เกินกำหนด รอปิดหรือต่ออายุ"** แทนคำว่า "expired". ใช้ตัวแปร `contract.days_overdue` ที่มีอยู่แล้ว.
- Template `contract.expiry_alert` (ก่อนหมด) คงเดิม.
- ไม่เพิ่ม template ใหม่ — ตามที่ตกลง (reuse + relabel).

### 4.8 `app/Support/Permissions.php`
- `catalog()['contracts']`: เพิ่ม `'cancel'`, `'expire'` → `['view', 'create', 'edit', 'import', 'renew', 'alerts', 'cancel', 'expire']`.
- `defaults()`: role `admin` **ไม่ได้รับ** `contracts.cancel` / `contracts.expire` โดยดีฟอลต์ (กันกดผิด). Super admin ผ่านทุกอย่างอยู่แล้ว.

### 4.9 `routes/api.php`
- เพิ่ม `Route::post('contracts/{contract}/expire', [ContractController::class, 'expire'])->name('api.contracts.expire');`
- route `cancel` เดิมคงไว้.

## 5. Frontend Changes

### 5.1 `resources/js/shared/types/index.ts`
- `ContractStatus = 'active' | 'overdue' | 'cancelled' | 'expired'`.
- interface `Contract`: เพิ่ม `expired_at: string | null`; ลบ `auto_renew`.

### 5.2 `modules/contract/api/contractApi.ts` + `hooks/use-contracts.ts`
- เพิ่ม `expire: (id) => mutate<Contract>('post', '/contracts/${id}/expire')` และ `expire` mutation (invalidate).
- ลบ `auto_renew` จาก `ContractPayload`.

### 5.3 `modules/contract/components/contract-detail-drawer.tsx`
- Gate ปุ่ม: `canCancel = isSuper || perms.includes('contracts.cancel')`; `canExpire = isSuper || perms.includes('contracts.expire')`.
- **ปุ่ม Expired** (แสดงเมื่อยังไม่ expired และ `canExpire`):
  - ถ้า `status !== 'overdue'` (ยังไม่เกินกำหนด) → confirm พิเศษ variant `warn`: "กำลังปิดสัญญาก่อนกำหนด (ยังไม่ถึง end_date) ยืนยันหรือไม่?"
  - ถ้า overdue อยู่แล้ว → confirm ปกติ variant `danger`.
  - ทั้งสองกรณี: ถ้ามี linked asset ที่ยังไม่ writeoff → เตือนให้ writeoff ครบก่อน (เหมือน flow cancel ปัจจุบัน แต่ใช้ทุกประเภท) แล้วหยุด.
  - ข้อความ confirm เน้นว่า **ถาวร กู้คืนไม่ได้**.
- **ปุ่ม Cancel** (แสดงเมื่อยังไม่ terminal และ `canCancel`): write-off guard ใช้ทุกประเภท (ไม่ใช่แค่ hardware).
- **ปุ่ม Renew**: ซ่อนเมื่อ `status === 'expired'`.
- Badge/label/สี: รองรับ `overdue` (แดง) และ `expired` (เทาเข้ม).
- ลบแถวแสดง `auto_renew` (`contract_auto_renew`).

### 5.4 `modules/contract/components/contract-form-drawer.tsx`
- ลบ toggle `auto_renew` (field, default, edit-hydrate, submit payload).

### 5.5 `modules/contract/pages/index.tsx`
- Badge/สีในตาราง: overdue (แดง), expired (เทาเข้ม), cancelled (เทา), active (เขียว).
- `DaysCell`: overdue = "เกินกำหนด N วัน"; expired = แสดง label "สิ้นสุดแล้ว".
- Filter/tab: แยก overdue กับ expired (ถ้ามี tab เดิม "expired" ให้แม็ปเป็น overdue + เพิ่ม/ปรับตามที่ UI ต้องการ).
- `canCancel`/`canExpire` (ถ้ามีปุ่มในหน้า list).

### 5.6 `resources/js/lang/{en,th}/contract.ts`
- เพิ่มคีย์: `contract_overdue`, `contract_expired` (สถานะ), `contract_expire` (ปุ่ม/หัวข้อ), `contract_expire_confirm`, `contract_expire_early_warn` (เตือนปิดก่อนกำหนด), `contract_expire_permanent_note`.
- ลบ/เลิกใช้ `contract_auto_renew` (ลบคีย์ถ้าไม่มีที่อื่นใช้).

### 5.7 Permission labels
- `modules/permission/lib/permission-labels.ts` + `lang/{en,th}/permission.ts`: เพิ่ม label สำหรับ `contracts.cancel`, `contracts.expire`.

## 6. Action Rules Summary

| Action | ใครทำได้ | เงื่อนไข | ผล |
|---|---|---|---|
| Cancel | `contracts.cancel` (+super) | linked asset ต้อง writeoff ครบ | set `cancelled_at`; reversible |
| Reactivate | `contracts.cancel` (+super) | — | clear `cancelled_at` |
| Expired | `contracts.expire` (+super) | linked asset ต้อง writeoff ครบ; confirm พิเศษถ้ายังไม่ overdue | set `expired_at`; **ถาวร** |
| Renew | `contracts.renew` (+super) | ไม่แสดงเมื่อ expired | เลื่อน end_date |

## 7. Testing Plan

Feature/Unit tests (PHPUnit):

1. **Status precedence** — สัญญา end_date อนาคต=active; end_date อดีต=overdue; `cancelled_at` set=cancelled; `expired_at` set=expired; expired ชนะ cancelled/overdue.
2. **Expire endpoint** — set `expired_at`, `assertOk`; กดซ้ำ → 422; ผู้ไม่มี `contracts.expire` → 403; มี linked asset ยังไม่ writeoff → 422 (guard); asset writeoff ครบ → ผ่าน.
3. **Cancel endpoint** — perm `contracts.cancel`; write-off guard ทำงานกับสัญญาที่ไม่ใช่ hardware ด้วย; reactivate ทำได้เสมอ.
4. **Alert service** — สัญญา `expired_at` set ถูกกรองออก (ไม่ bell/ไม่ email); สัญญา overdue (end_date ผ่าน, ยังไม่ปิด) ยังเตือน.
5. **Auto-renew removal** — create/update contract สำเร็จโดยไม่มี field `auto_renew`; resource ไม่มี key `auto_renew`.

## 8. Out of Scope

- ไม่เพิ่มการแจ้งเตือนแบบใหม่สำหรับ Overdue (reuse ของเดิม + relabel).
- ไม่แตะ flow attachment / asset linking นอกเหนือจาก write-off guard.
- ไม่เปลี่ยนความ reversible ของ Cancel.
