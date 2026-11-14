const catalog = [
 ['bed','เตียง','🛏️',45,2,1,'bed','#70a99e'],
 ['chair','เก้าอี้','🪑',25,1,1,'chair','#bd8759'],
 ['sofa','โซฟา','🛋️',120,2,1,'seat','#819f89'],
 ['armchair','เก้าอี้นวม','🛋️',75,1,1,'seat','#9b7474'],
 ['stool','ม้านั่งเตี้ย','🪑',20,1,1,'table','#bd9365'],
 ['bench','ม้านั่งไม้','🪵',55,2,1,'table','#9c704d'],
 ['desk','โต๊ะเขียนหนังสือ','🖥️',65,2,1,'table','#a98062'],
 ['coffeeTable','โต๊ะกาแฟ','☕',45,2,1,'table','#8b664f'],
 ['diningTable','โต๊ะกินข้าว','🍽️',85,2,2,'table','#bf9669'],
 ['sideTable','โต๊ะข้างเตียง','🗄️',35,1,1,'table','#998679'],
 ['wardrobe','ตู้เสื้อผ้า','🚪',95,2,1,'cabinet','#ac7857'],
 ['bookshelf','ชั้นหนังสือ','📚',80,2,1,'books','#76543f'],
 ['dresser','ตู้ลิ้นชัก','🗄️',70,2,1,'cabinet','#a58670'],
 ['chest','หีบเก็บของ','📦',45,1,1,'cabinet','#9e643e'],
 ['clock','นาฬิกาตั้งพื้น','🕰️',75,1,1,'clock','#a57751'],
 ['mirror','กระจกตั้งพื้น','🪞',65,1,1,'mirror','#b39e82'],
 ['floorLamp','โคมไฟตั้งพื้น','💡',55,1,1,'lamp','#efce78'],
 ['tableLamp','โคมไฟเล็ก','🏮',32,1,1,'lamp','#ef9e89'],
 ['fern','กระถางเฟิร์น','🪴',28,1,1,'plant','#6f9f50'],
 ['cactus','กระบองเพชร','🌵',25,1,1,'plant','#4ba170'],
 ['flowers','แจกันดอกไม้','💐',30,1,1,'flowers','#ea9ba6'],
 ['rug','พรมทอ','🧶',50,2,2,'rug','#a97f88'],
 ['mat','พรมเช็ดเท้า','🟫',20,1,1,'rug','#c7ab79'],
 ['counter','เคาน์เตอร์ครัว','🍳',90,2,1,'counter','#9db1a9'],
 ['fridge','ตู้เย็น','🧊',125,1,1,'cabinet','#b1ccd5'],
 ['radio','วิทยุไม้','📻',42,1,1,'radio','#c08c60'],
 ['piano','เปียโน','🎹',180,2,1,'piano','#59515a']
];

export const FURNITURE_TYPES = Object.freeze(Object.fromEntries(catalog.map(
 ([type,label,emoji,price,width,height,model,color])=>[type,{label,emoji,price,width,height,model,color}]
)));

export function furniturePose(item) {
 if(item.type==='bed')return 'sleep';
 return ['chair','sofa','armchair','stool','bench'].includes(item.type)?'sit':null;
}
