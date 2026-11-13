export async function requestSheetsMarket(url,token,request){
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url))
    throw Error('ลิงก์เชื่อมร้านค้าไม่ถูกต้อง');
  const response=await fetch(url,{
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=UTF-8'},
    body:JSON.stringify({token,request}),
    signal:AbortSignal.timeout(25_000)
  });
  if(!response.ok)throw Error('ติดต่อร้านออนไลน์ไม่สำเร็จ ลองใหม่อีกครั้ง');
  if(!response.headers.get('content-type')?.includes('application/json'))
    throw Error('ร้านออนไลน์ยังไม่เปิดให้ผู้เล่นเข้าใช้งาน');
  return response.json();
}
