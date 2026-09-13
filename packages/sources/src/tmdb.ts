import type { RawItem, SourceAdapter } from '@newsroom/core';
interface Movie { id:number; title:string; release_date?:string; poster_path?:string }
export const tmdb: SourceAdapter = { key:'tmdb', vertical:'film', tier:'A', cadence:()=>3600,
  async poll(ctx) {
    const key = process.env.TMDB_API_KEY;
    if (!key) { ctx.log('TMDB_API_KEY not configured; source idle'); return []; }
    async function get<T>(path:string):Promise<T> {
      const url = new URL(`https://api.themoviedb.org/3/${path}`); url.searchParams.set('language','id-ID');
      const headers: Record<string,string> = {accept:'application/json'};
      if (key!.includes('.')) headers.Authorization=`Bearer ${key}`; else url.searchParams.set('api_key',key!);
      const res=await ctx.fetch(url,{headers,signal:AbortSignal.timeout(15000)});
      if(!res.ok)throw new Error(`TMDB ${res.status}`); return await res.json() as T;
    }
    const movies=await get<{results:Movie[]}>('movie/upcoming?region=ID');
    if(!Array.isArray(movies.results))throw new Error('TMDB response missing results');
    const out:RawItem[]=[];
    for(const m of movies.results.slice(0,5)) {
      const base = {sourceKey:'tmdb',vertical:'film' as const,tier:'A' as const,sourceDomain:'themoviedb.org',rawUrl:`https://www.themoviedb.org/movie/${m.id}`,body:'',observedAt:ctx.now,imageUrl:m.poster_path?`https://image.tmdb.org/t/p/w780${m.poster_path}`:null};
      if(m.release_date)out.push({...base,externalId:`release:${m.id}:${m.release_date}`,title:`${m.title}: ${m.release_date}`,payload:{claimType:'release',title:m.title,releaseDate:m.release_date,tmdbId:m.id,region:'ID'}});
      const detail=await get<{credits?:{cast:{name:string;character:string}[]};videos?:{results:{key:string;site:string;official:boolean;type:string;name:string}[]}}>(`movie/${m.id}?append_to_response=credits,videos`);
      const cast=detail.credits?.cast?.slice(0,10)??[];
      if(cast.length)out.push({...base,externalId:`cast:${m.id}`,title:`Pemeran ${m.title}`,payload:{claimType:'cast',title:m.title,tmdbId:m.id,rows:cast.map((c,i)=>({position:i+1,name:c.name,value:c.character}))}});
      for(const v of detail.videos?.results?.filter(v=>v.official&&v.site==='YouTube'&&v.type==='Trailer').slice(0,1)??[])out.push({...base,externalId:`trailer:${v.key}`,title:`Trailer resmi ${m.title}`,payload:{claimType:'trailer',title:m.title,tmdbId:m.id,videoId:v.key,videoUrl:`https://www.youtube.com/watch?v=${v.key}`}});
    }
    return out;
  }
};
