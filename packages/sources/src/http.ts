export const UA = 'newsroom/0.1 (+local research bot; contact: owner)';

export async function getJson<T>(url: string, fetchImpl: typeof fetch = fetch, timeoutMs = 12_000): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: ctl.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function getText(url: string, fetchImpl: typeof fetch = fetch, timeoutMs = 12_000): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers: { 'user-agent': UA }, signal: ctl.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export const domainOf = (url: string): string => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'unknown'; }
};
