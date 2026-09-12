import { makeBrand } from '../generic.ts';
export default makeBrand({ key: 'film', name: 'Layar Kini', mark: 'L',
  allowlist: ['deadline.com','variety.com','hollywoodreporter.com','thewaltdisneycompany.com','netflix.com'],
  archetypes: [
    { key: 'release', types: ['release'], label: 'Tanggal rilis', required: ['title','releaseDate','tmdbId'] },
    { key: 'cast', types: ['cast'], label: 'Pemeran', required: ['title','rows','tmdbId'] },
    { key: 'trailer', types: ['trailer'], label: 'Trailer resmi', required: ['title','videoId','tmdbId'] },
    { key: 'box_office', types: ['box_office'], label: 'Box office', required: ['title','revenue','currency'] },
    { key: 'film_review', types: ['review'], label: 'Ulasan', required: ['title','quote','speaker'] },
    { key: 'film_schedule', types: ['schedule'], label: 'Jadwal tayang', required: ['rows'] },
    { key: 'film_quote', types: ['quote','article'], label: 'Kabar layar', required: ['quote','speaker'] },
  ],
});
