import {gradeOf, marketPrice, changeProduce, MAX_MONEY, MAX_PRODUCE} from './farming.js?v=v5-farm-1';
import {sanitizeState} from './rules.js?v=v5-gardener-1';

export const LISTING_DURATION = 86_400_000;
const MAX_LISTINGS = 80;
const MAX_PER_SELLER = 5;
const fail = message => ({ok:false,message});

// Called inside one transaction containing both players and the listing.
export function trade(root, uid, request, now) {
  if (!root?.profiles?.[uid]) return fail('ไม่พบเซฟผู้เล่น');
  const listings = root.marketListings || {};
  const buyer = sanitizeState(root.profiles[uid]);
  const id = request.id;
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) return fail('รหัสรายการไม่ถูกต้อง');
  const listing = Object.hasOwn(listings,id) ? listings[id] : null;

  if (request.type === 'list') {
    const {key, quantity} = request;
    if (listing || !gradeOf(key) || !Number.isInteger(quantity) || quantity < 1 || quantity > 999)
      return fail('จำนวนผลผลิตหรือรายการไม่ถูกต้อง');
    const records = Object.values(listings);
    if (records.length >= MAX_LISTINGS || records.filter(row=>row.seller===uid).length >= MAX_PER_SELLER)
      return fail('พื้นที่ลงขายเต็ม กรุณาเก็บรายการเก่าคืนก่อน');
    if (!changeProduce(buyer.inventory,key,-quantity)) return fail('ผลผลิตไม่พอ');
    const unitPrice = marketPrice(key,now);
    listings[id] = {seller:uid, name:buyer.displayName, key:Number(key), quantity, unitPrice, expiresAt:now+LISTING_DURATION};
    root.marketListings = listings;
    root.profiles[uid] = buyer;
    return {ok:true,message:'ลงขายแล้วที่ '+unitPrice+' บาท/ผล'};
  }
  if (!listing) return fail('รายการนี้ถูกซื้อหรือยกเลิกแล้ว');
  const {seller, key, quantity, unitPrice, expiresAt} = listing;
  if (!gradeOf(key)||!Number.isInteger(quantity)||quantity<1||quantity>999||!Number.isInteger(unitPrice)||unitPrice<1)
    return fail('ข้อมูลรายการไม่ถูกต้อง');
  if (request.type === 'cancel') {
    if (seller !== uid) return fail('ยกเลิกได้เฉพาะรายการของคุณ');
    if (!changeProduce(buyer.inventory,key,quantity)) return fail('กระเป๋าผลผลิตเต็ม');
    delete listings[id];
    root.profiles[uid] = buyer;
    return {ok:true,message:'เก็บผลผลิตคืนเข้ากระเป๋าแล้ว'};
  }
  if (request.type !== 'buy' || seller === uid || now >= expiresAt || !root.profiles[seller])
    return fail('รายการนี้ซื้อไม่ได้');
  const price = unitPrice*quantity;
  if (buyer.money < price) return fail('เงินไม่พอ');
  const sellerProfile = sanitizeState(root.profiles[seller]);
  if (sellerProfile.money+price > MAX_MONEY || buyer.inventory.tomato+quantity > MAX_PRODUCE)
    return fail('เงินหรือกระเป๋าผลผลิตจะเกินเพดาน');
  changeProduce(buyer.inventory,key,quantity);
  buyer.money -= price;
  sellerProfile.money += price;
  root.profiles[uid] = buyer;
  root.profiles[seller] = sellerProfile;
  delete listings[id];
  return {ok:true,message:'ซื้อผลผลิตแล้ว '+price+' บาท'};
}
