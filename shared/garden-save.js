import {applyAction,sanitizeState} from './rules.js?v=town-1';

export const GARDEN_ACTIONS=new Set(['collectGardenBox','harvest','hireGardener','gardenerStep','gardenerResume']);

// Preserve fields outside this action, including fields written by newer clients.
function mergeChanges(saved,before,after){
  const result={...saved};
  for(const key of new Set([...Object.keys(before),...Object.keys(after)])){
    if(JSON.stringify(before[key])===JSON.stringify(after[key]))continue;
    if(after[key]===undefined)delete result[key];
    else result[key]=after[key];
  }
  return result;
}

export async function saveGardenAction(databaseURL,root,uid,token,action,fetcher=fetch){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  try{
    return await writeGardenAction(databaseURL,root,uid,token,action,
      (url,options)=>fetcher(url,{...options,signal:controller.signal}));
  }finally{clearTimeout(timeout)}
}

async function writeGardenAction(databaseURL,root,uid,token,action,fetcher){
  const url=new URL(databaseURL.replace(/\/$/,'')+'/'+root+'/profiles/'+encodeURIComponent(uid)+'.json');
  url.searchParams.set('auth',token);
  const headers={'X-Firebase-ETag':'true'};
  let response=await fetcher(url,{headers,cache:'no-store'});
  for(let attempt=0;attempt<6;attempt++){
    if(![200,412].includes(response.status))break;
    const etag=response.headers.get('etag'), saved=await response.json();
    if(!etag&&response.status===412){
      response=await fetcher(url,{headers,cache:'no-store'});
      continue;
    }
    if(!etag||!saved)break;
    const profile=sanitizeState(saved);
    const before=JSON.parse(JSON.stringify(profile));
    const result=applyAction(profile,action);
    if(!result.ok)return {...result,profile};
    const payload=mergeChanges(saved,before,profile);
    payload.inventory=mergeChanges(saved.inventory,before.inventory,profile.inventory);
    payload.home=mergeChanges(saved.home,before.home,profile.home);
    payload.home.gardenBox=mergeChanges(saved.home?.gardenBox,before.home.gardenBox,profile.home.gardenBox);
    response=await fetcher(url,{method:'PUT',headers:{...headers,'If-Match':etag,'Content-Type':'application/json'},
      body:JSON.stringify(payload)});
    if(response.ok)return {...result,profile};
    if(response.status!==412)break;
  }
  return {ok:false,message:'บันทึกงานสวนยังไม่สำเร็จ กรุณาลองอีกครั้ง'};
}
