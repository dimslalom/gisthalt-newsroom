/**
 * R0. Lives in config, not in code: this is the file edited after the first
 * incident, and that edit must be one line.
 */
export const blocklist: string[] = [
  'kecelakaan fatal', 'fatal crash', 'died', 'death', 'meninggal', 'passed away',
  'injury', 'cedera', 'hospitalised', 'hospitalized', 'airlifted',
  'under investigation by police', 'lawsuit', 'court', 'charged with',
  'arrested', 'allegation', 'assault', 'abuse',
  'minor', 'underage', 'di bawah umur',
  'provisional result', 'result under appeal', 'hasil sementara', 'protest lodged',
];

/** Hedged language never auto-publishes, whatever the tier. */
export const hedgeTerms: string[] = [
  'report', 'reports', 'reportedly', 'rumour', 'rumor', 'rumoured', 'exclusive',
  'understood to', 'sources say', 'according to sources', 'linked with',
  'expected to', 'set to', 'could', 'may join', 'kabarnya', 'dikabarkan', 'rumor',
];

/** Tier B allowlist. R2 only applies to domains on this list. */
export const tierBAllowlist: string[] = [
  'formula1.com', 'fia.com', 'mercedesamgf1.com', 'ferrari.com', 'redbullracing.com',
  'mclaren.com', 'astonmartinf1.com', 'alpinecars.com', 'williamsf1.com',
  'autosport.com', 'motorsport.com', 'racefans.net', 'the-race.com',
];

/** R1's field contract per claimType. A tier A claim missing any of these
 *  goes to review rather than out. */
export const requiredFields: Record<string, string[]> = {
  session_result: ['position', 'driver', 'session', 'meeting'],
  classification: ['rows', 'session', 'meeting'],
  standings: ['rows', 'round', 'season'],
  schedule: ['sessions', 'meeting'],
  penalty: ['driver', 'penalty', 'reason'],
  driver_line: ['driver', 'team'],
  quote: ['speaker', 'quote'],
};
