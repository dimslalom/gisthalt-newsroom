/**
 * Machine facts arrive in English because the endpoints are English. Turning
 * "Practice 2" into "Latihan Bebas 2" is a label swap on a value that is
 * already confirmed — not a translation the model is allowed to attempt.
 */
const SESSIONS: Record<string, string> = {
  'practice 1': 'Latihan Bebas 1',
  'practice 2': 'Latihan Bebas 2',
  'practice 3': 'Latihan Bebas 3',
  'sprint qualifying': 'Kualifikasi Sprint',
  'sprint shootout': 'Sprint Shootout',
  sprint: 'Sprint',
  qualifying: 'Kualifikasi',
  race: 'Balapan',
};

/** GP names. Anything missing falls through unchanged rather than guessed at. */
const COUNTRIES: Record<string, string> = {
  spain: 'Spanyol', italy: 'Italia', japan: 'Jepang', netherlands: 'Belanda',
  'united states': 'Amerika Serikat', usa: 'Amerika Serikat', 'great britain': 'Inggris',
  britain: 'Inggris', belgium: 'Belgia', hungary: 'Hungaria', austria: 'Austria',
  singapore: 'Singapura', mexico: 'Meksiko', brazil: 'Brasil', 'saudi arabia': 'Arab Saudi',
  bahrain: 'Bahrain', australia: 'Australia', china: 'China', canada: 'Kanada',
  monaco: 'Monako', azerbaijan: 'Azerbaijan', qatar: 'Qatar', 'united arab emirates': 'Uni Emirat Arab',
  'abu dhabi': 'Abu Dhabi', germany: 'Jerman', france: 'Prancis', portugal: 'Portugal',
  turkey: 'Turki', russia: 'Rusia', 'south korea': 'Korea Selatan', korea: 'Korea Selatan',
};

export function sessionId(name: string | null | undefined): string {
  if (!name) return '';
  return SESSIONS[name.trim().toLowerCase()] ?? name;
}

export function meetingId(name: string | null | undefined): string {
  if (!name) return '';
  const m = name.trim().match(/^(.*?)\s*(grand prix|gp)$/i);
  const country = (m?.[1] ?? name).trim();
  const translated = COUNTRIES[country.toLowerCase()] ?? country;
  return m ? `GP ${translated}` : translated;
}
