/**
 * Free-tier limits are per project, not per key, so the right mental model is
 * a token bucket per model with a fallback ladder — not a key manager.
 * Read from config and never hardcoded at a call site: these numbers have
 * moved at least once in the last twelve months.
 */
export interface ModelLimit { model: string; rpm: number; rpd: number; role: string; fallback: string | null }

export const MODEL_LADDER: ModelLimit[] = [
  { model: 'gemini-flash-lite-latest', rpm: 30, rpd: 1500, role: 'classify|extract', fallback: 'gemini-flash-latest' },
  { model: 'gemini-flash-latest',      rpm: 15, rpd: 1500, role: 'copy',             fallback: null },
  { model: 'gemini-pro-latest',        rpm: 5,  rpd: 50,   role: 'adjudicate',       fallback: null },
];

export function limitsFor(model: string): ModelLimit | undefined {
  return MODEL_LADDER.find((m) => m.model === model);
}

/** Env override, so a limit change is a config edit and not a deploy. */
export function loadLimits(): ModelLimit[] {
  const raw = process.env.MODEL_LIMITS_JSON;
  if (!raw) return MODEL_LADDER;
  const limits = JSON.parse(raw) as ModelLimit[];
  if (!Array.isArray(limits) || !limits.length || limits.some(l => !l.model || !l.role || !Number.isInteger(l.rpm) || !Number.isInteger(l.rpd) || l.rpm < 0 || l.rpd < 0)) throw new Error('MODEL_LIMITS_JSON must be a valid list of model budgets');
  for (const l of limits) { const seen=new Set<string>(); let current: ModelLimit | undefined=l; while(current) { if(seen.has(current.model))throw new Error('model fallback cycle');seen.add(current.model);current=limits.find(m=>m.model===current!.fallback); } }
  return limits;
}
