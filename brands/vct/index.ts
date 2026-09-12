import { makeBrand } from '../generic.ts';
export default makeBrand({ key: 'vct', name: 'Titik Match', mark: 'V',
  allowlist: ['valorantesports.com','riotgames.com','vlr.gg','sheepesports.com','dotesports.com'],
  archetypes: [
    { key: 'match_result', types: ['match_result'], label: 'Hasil pertandingan', required: ['team1','team2','score1','score2','eventId'] },
    { key: 'map_breakdown', types: ['map_breakdown'], label: 'Hasil map', required: ['rows','eventId'] },
    { key: 'player_stat', types: ['player_stat'], label: 'Statistik pemain', required: ['player','rows','eventId'] },
    { key: 'roster_move', types: ['roster_move'], label: 'Roster', required: ['player','team','season'] },
    { key: 'bracket', types: ['bracket'], label: 'Bagan turnamen', required: ['rows','eventId'] },
    { key: 'vct_schedule', types: ['schedule'], label: 'Jadwal', required: ['rows','eventId'] },
    { key: 'vct_quote', types: ['quote','article'], label: 'Kabar VCT', required: ['quote','speaker'] },
  ],
});
