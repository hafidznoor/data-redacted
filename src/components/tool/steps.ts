export const STEP_ORDER = ['drop', 'sheets', 'header', 'columns', 'export'] as const
export type Step = (typeof STEP_ORDER)[number]
