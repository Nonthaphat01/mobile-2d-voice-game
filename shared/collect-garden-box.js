import {applyAction,sanitizeState} from './rules.js?v=town-1';

// Read and move both sides of the transfer in one conditional write.
export async function collectGardenBox(databaseURL,root,uid,token,fetcher=fetch){
  const url=new URL(databaseURL.replace(/\/$/,'')+'/'+root+'/profiles/'+encodeURIComponent(uid)+'.json');
  url.searchParams.set('auth',token);
  const headers={'X-Firebase-ETag':'true'};
  let response=await fetcher(url,{headers,cache:'no-store'});
  for(let attempt=0;attempt<6;attempt++){
    if(![200,412].includes(response.status))break;
    const etag=response.headers.get('etag'), saved=await response.json();
    if(!etag||!saved)break;
    const profile=sanitizeState(saved);
    const result=applyAction(profile,{type:'collectGardenBox'});
    if(!result.ok)return {...result,profile};
    const payload={...saved,inventory:{...saved.inventory,
      tomato:profile.inventory.tomato,tomatoGrades:profile.inventory.tomatoGrades,crops:profile.inventory.crops},
      home:{...saved.home,gardenBox:{...saved.home?.gardenBox,...profile.home.gardenBox}}};
    response=await fetcher(url,{method:'PUT',headers:{...headers,'If-Match':etag,'Content-Type':'application/json'},
      body:JSON.stringify(payload)});
    if(response.ok)return {...result,profile};
    if(response.status!==412)break;
  }
  return {ok:false,message:'รับผลผลิตยังไม่สำเร็จ กรุณาลองอีกครั้ง'};
}
