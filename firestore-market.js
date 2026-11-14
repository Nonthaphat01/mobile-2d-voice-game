import {sanitizeState, starter} from './shared/rules.js?v=v5-neighbors-1';
import {trade} from './shared/market-trade.js';

export const MARKET_PATH = 'HOODGAME/market';
const validId = id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
const rejected = message => ({ok:false,message});

export function firestoreMarket(db, readLegacyProfile) {
  const market = db.doc(MARKET_PATH);
  const profiles = market.collection('profiles');
  const listings = market.collection('listings');

  async function load(uid, name) {
    const ref = profiles.doc(uid);
    const existing = await ref.get();
    if (existing.exists) return sanitizeState(existing.data());
    const legacy = await readLegacyProfile(uid);
    const initial = legacy ? sanitizeState(legacy) : starter(name);
    return db.runTransaction(async tx => {
      const current = await tx.get(ref);
      if (current.exists) return sanitizeState(current.data());
      tx.create(ref, initial);
      return initial;
    });
  }

  async function action(uid, apply) {
    const ref = profiles.doc(uid);
    return db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      if (!doc.exists) return rejected('ไม่พบเซฟผู้เล่น');
      const profile = sanitizeState(doc.data());
      const result = apply(profile);
      if (result.ok) tx.set(ref, profile);
      return {...result,profile};
    });
  }

  async function browse(uid, now) {
    const [items,profile] = await Promise.all([listings.get(), profiles.doc(uid).get()]);
    if (!profile.exists) return rejected('ไม่พบเซฟผู้เล่น');
    return {
      listings:items.docs.filter(doc => {
        const item = doc.data();
        return item.expiresAt>now||item.seller===uid;
      }).map(doc => {
        const {seller,name,key,quantity,unitPrice,expiresAt} = doc.data();
        return {id:doc.id,sellerKey:seller,own:seller===uid,name,key,quantity,unitPrice,expired:expiresAt<=now};
      }),
      profile:sanitizeState(profile.data())
    };
  }

  async function transact(uid, request, now) {
    if (!validId(request.id)) return rejected('รหัสรายการไม่ถูกต้อง');
    const listingRef = listings.doc(request.id);
    const userRef = profiles.doc(uid);
    return db.runTransaction(async tx => {
      const user = await tx.get(userRef);
      if (!user.exists) return rejected('ไม่พบเซฟผู้เล่น');
      const marketState = {profiles:Object.create(null),marketListings:Object.create(null)};
      marketState.profiles[uid] = user.data();
      let sellerRef;
      if (request.type==='list') {
        const rows = await tx.get(listings);
        for (const row of rows.docs) marketState.marketListings[row.id] = row.data();
      } else {
        const row = await tx.get(listingRef);
        if (row.exists) {
          const item = row.data();
          marketState.marketListings[row.id] = item;
          if (request.type==='buy' && item.seller!==uid && typeof item.seller==='string' && !item.seller.includes('/')) {
            sellerRef = profiles.doc(item.seller);
            const seller = await tx.get(sellerRef);
            if (seller.exists) marketState.profiles[item.seller] = seller.data();
          }
        }
      }
      const result = trade(marketState, uid, request, now);
      if (!result.ok) return result;
      const profile = marketState.profiles[uid];
      tx.set(userRef, profile);
      if (request.type==='list') tx.create(listingRef, marketState.marketListings[request.id]);
      else tx.delete(listingRef);
      if (request.type==='buy') tx.set(sellerRef,marketState.profiles[sellerRef.id]);
      return {...result,profile};
    });
  }

  return {load,action,browse,transact};
}
