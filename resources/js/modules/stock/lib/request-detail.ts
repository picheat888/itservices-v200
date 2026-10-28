// Request detail (board 12): the step bar of a stock request and the Lot pick preview of an approved one (pure, node tests).
import { greedyAlloc, type Balance } from './fulfil-alloc.ts';
import { pickLots, type LotPick, type PickableLot } from './lot-pick.ts';

export type RequestStepState = 'done' | 'now' | 'wait' | 'closed';
export type RequestStepKey = 'asked' | 'approve' | 'fulfil';

export type RequestStep = {
    key: RequestStepKey;
    state: RequestStepState;
    who: string | null;
    when: string | null;
    /** ISS number on the fulfil step once issued. */
    doc?: string | null;
    closedAs?: 'rejected' | 'cancelled';
};

export type RequestStepFacts = {
    status: 'pending' | 'approved' | 'fulfilled' | 'rejected' | 'cancelled';
    requester_name: string;
    requester_name_th?: string | null;
    created_at: string | null;
    approver_name: string | null;
    approver_name_th?: string | null;
    approved_at: string | null;
    rejected_at: string | null;
    fulfilled_by: string | null;
    fulfilled_by_th?: string | null;
    fulfilled_at: string | null;
    issue_doc_no?: string | null;
    cancelled_by: string | null;
    cancelled_at: string | null;
};

type NameOf = (name: string | null, nameTh?: string | null) => string | null;

/** ขอเบิก → อนุมัติ → จ่ายของ; a rejected or cancelled request closes on the step where it stopped. */
export function requestSteps(r: RequestStepFacts, nameOf: NameOf): RequestStep[] {
    const asked: RequestStep = { key: 'asked', state: 'done', who: nameOf(r.requester_name, r.requester_name_th), when: r.created_at };
    const cancelled = (key: RequestStepKey): RequestStep => ({
        key,
        state: 'closed',
        closedAs: 'cancelled',
        who: r.cancelled_by,
        when: r.cancelled_at,
    });
    const approvedStep: RequestStep = { key: 'approve', state: 'done', who: nameOf(r.approver_name, r.approver_name_th), when: r.approved_at };
    const wait = (key: RequestStepKey): RequestStep => ({ key, state: 'wait', who: null, when: null });

    switch (r.status) {
        case 'pending':
            return [asked, { key: 'approve', state: 'now', who: null, when: null }, wait('fulfil')];
        case 'approved':
            return [asked, approvedStep, { key: 'fulfil', state: 'now', who: null, when: null }];
        case 'fulfilled':
            return [
                asked,
                approvedStep,
                { key: 'fulfil', state: 'done', who: nameOf(r.fulfilled_by, r.fulfilled_by_th), when: r.fulfilled_at, doc: r.issue_doc_no ?? null },
            ];
        case 'rejected':
            return [
                asked,
                { key: 'approve', state: 'closed', closedAs: 'rejected', who: nameOf(r.approver_name, r.approver_name_th), when: r.rejected_at },
                wait('fulfil'),
            ];
        case 'cancelled':
            return r.approved_at ? [asked, approvedStep, cancelled('fulfil')] : [asked, cancelled('approve'), wait('fulfil')];
    }
}

export type PreviewPick = LotPick & { warehouse: string };

/** What the fulfil dialog seeds when nobody edits: the greedy warehouse fill, then each warehouse's oldest lots. */
export function previewLotPicks(balances: readonly Balance[], lots: PickableLot[], qty: number): PreviewPick[] {
    return Object.entries(greedyAlloc(balances, qty)).flatMap(([warehouse, take]) =>
        pickLots(lots, warehouse, take).map((pick) => ({ ...pick, warehouse })),
    );
}
