// SLA rate against its goal in three levels, shared by every KPI card, the Dashboard and the Tickets reports.

export type SlaLevel = 'met' | 'near' | 'miss';

/** Met, within 10 points of the goal, or further off. */
export const slaLevel = (rate: number, goal: number): SlaLevel => (rate >= goal ? 'met' : rate >= goal - 10 ? 'near' : 'miss');
