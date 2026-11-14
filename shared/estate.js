export const EXPANSION_PRICES = [1500, 5000, 20000, 100000, 999999];
export const MAX_GARDENERS = 5;
export const CROPS = Object.freeze({
  tomato: {name:'มะเขือเทศ',icon:'🍅',seed:5,price:7,grow:60000},
  banana: {name:'กล้วย',icon:'🍌',seed:10,price:14,grow:90000},
  rice: {name:'ข้าว',icon:'🌾',seed:8,price:11,grow:75000},
  watermelon: {name:'แตงโม',icon:'🍉',seed:15,price:21,grow:120000}
});
export const cropType = key => Object.hasOwn(CROPS,key) ? key : null;
export const estateLevel = value => Number.isInteger(value) ? Math.max(0,Math.min(EXPANSION_PRICES.length,value)) : 0;
export const plotCount = level => 10 * 2 ** estateLevel(level);
export const emptyPlot = () => ({crop:null,plantedAt:0,watered:false});
export const roomSize = level => ({w:650+96*estateLevel(level),h:430+48*estateLevel(level)});
export const seedKey = crop => crop+'_seed';
export function cropStock(inventory,crop) {
  return crop==='tomato' ? inventory : (inventory.crops[crop] ??= {tomato:0,tomatoGrades:{}});
}
export const workersOf = home => [home?.gardener,...(Array.isArray(home?.extraGardeners)?home.extraGardeners:[])].filter(Boolean).slice(0,MAX_GARDENERS);
export function setWorkers(home,workers) {
  if(workers.length)home.gardener=workers[0];else delete home.gardener;
  home.extraGardeners=workers.slice(1);
}
