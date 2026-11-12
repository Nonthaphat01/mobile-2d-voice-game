# My Little Neighborhood V5 — ชุมชน 002

เกม 2D จำลองชีวิตแบบบ้านและชุมชน (MVP) สำหรับ **GitHub Pages + เซิร์ฟเวอร์ Node.js + Supabase**

## มีอะไรให้เล่นใน V5 นี้

- `index.html` เป็นหน้าเข้าเกมหลัก เปิดด้วย GitHub Pages ได้ทันที
- ทดลองเล่นคนเดียวได้โดยไม่ต้องใส่ค่าคอนฟิก (บันทึกด้วย `localStorage` ของเครื่อง)
- บ้านเริ่มต้นเล็ก ๆ ห้องโล่ง เงินเริ่มต้น **100 บาท** และอุปกรณ์: จอบ 1, บัวรดน้ำ 1, เมล็ดมะเขือเทศ 3
- รั้วรอบบ้าน ถนน และพื้นที่แปลงบ้าน **8 ช่องต่อเซิร์ฟเวอร์**
- สวน **10 แปลง** ปลูก/รดน้ำ/รอ/เก็บเกี่ยว ขายผลผลิต ซื้อเมล็ด และเลเวล
- เดิน WASD, ลูกศร, จอยสติ๊กบนมือถือ, E ใช้งาน, I ดูกระเป๋า; กดแปลงสวนเพื่อทำสวนได้
- บ้านโล่งในตอนเริ่มต้น ซื้อเตียง/เก้าอี้ไว้ในบ้านได้
- เอฟเฟกต์เสียงแบบสังเคราะห์ด้วย Web Audio (ต้องกดเปิดเสียงก่อน)
- **5 ประเภทบรรยากาศ/เหตุการณ์** และไม่มี NPC ในแมปเริ่มต้น
- โหมดออนไลน์จริงมีห้อง 001, 002, 003, รายชื่อเซิร์ฟเวอร์, สูงสุด 8 คนต่อห้อง, ซิงก์ตำแหน่ง/ข้อความ/บ้านและสวนที่โหลดมาจากฐานข้อมูล
- เมื่อเปลี่ยนเซิร์ฟเวอร์ บ้านเดิมถูกย้ายไปยังแปลงว่างของเซิร์ฟเวอร์ที่เลือก (บ้านเป็นของบัญชี ไม่ได้ผูกกับเลขแปลง)
- เซฟถาวรบน Supabase หลังการซื้อขาย ปลูก รดน้ำ และเก็บเกี่ยว

**ข้อจำกัดของ MVP:** ระบบเสียงพูดสด WebRTC, เหมืองเดิม, รถ, NPC เดิม และระบบแต่งบ้านแบบลากวาง **ยังไม่ได้ย้ายเข้ามาใน V5** เก็บโค้ด V4 ทั้งหมดไว้ใน `legacy/` สำหรับเปิดเกมเดิมที่ `legacy/index.html` และย้ายระบบเหล่านั้นเข้ามาในอนาคต เกมนี้ยังไม่ใช่เกม Production และไม่ได้ทดสอบการเล่นพร้อมกันหลายเครื่องจริง

## ทดลองเล่นบน GitHub Pages (ไม่ต้องมี backend)

1. อัปโหลด **ทุกไฟล์และโฟลเดอร์** ของโปรเจกต์นี้ไปไว้ที่ root ของ repo (`main`)
2. ที่ GitHub เลือก **Settings → Pages → Deploy from a branch → main → / (root)**
3. เปิด `https://USERNAME.github.io/REPO/`
4. กด **ทดลองเล่นคนเดียว** ข้อมูลบันทึกในเบราว์เซอร์เครื่องนั้นเท่านั้น; ปุ่มออนไลน์ยังไม่ทำงานจนกว่าจะตั้ง backend

> อย่าอัปโหลดเฉพาะ `index.html`: หน้าเกมต้องใช้ `client.js`, `style.css`, `shared/rules.js`, `config.js` ด้วย

## เปิดโหมดออนไลน์จริง

### 1) ตั้งค่า Supabase

1. เปิดโปรเจกต์ที่ https://supabase.com/dashboard
2. ไปที่ **Authentication → Providers** เปิด **Email** (สำหรับบัญชีถาวรข้ามเครื่อง) หรือ Anonymous (ทดลอง Guest)
3. เปิด **SQL Editor** แล้วรัน `db/schema.sql` เพื่อสร้างตาราง `game_profiles`
4. จาก **Project settings → API** นำ Project URL และ **publishable/anon key** มาใช้ใน `config.js`
5. **ห้ามวาง `service_role`/secret key ลงใน `config.js`, `index.html` หรือไฟล์ใด ๆ ที่อัปโหลด GitHub Pages**

### 2) Deploy เซิร์ฟเวอร์ Node.js (ต้องมีโฮสต์ Backend)

`server/` เป็น Node server ที่มี WebSocket และ HTTP `/api/rooms` ใช้แพ็กเกจ `ws` และ `@supabase/supabase-js` บริการโฮสต์ Node เช่น Render หรือ Railway ได้ (อาจมีค่าใช้จ่าย/การพักบริการตามแผน)

จากโฟลเดอร์หลักของ repo (เพื่อให้โฮสต์เข้าถึง `shared/rules.js` ได้):

```sh
npm --prefix server install
npm --prefix server start
```

ตั้งค่า environment variables ของบริการโฮสต์ (ตัวอย่างดู `server/.env.example`):

- `SUPABASE_URL` — URL ของ Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — **Secret เฉพาะบนโฮสต์เซิร์ฟเวอร์**
- `ALLOWED_ORIGIN` — เช่น `https://nonthaphat01.github.io`
- `PORT` — ให้ผู้ให้บริการโฮสต์กำหนด หรือค่าเริ่มต้น `8080`

> `npm start` ไม่อ่านไฟล์ `.env` เอง ให้ตั้งใน Dashboard ของโฮสต์ หรือ export environment variables ก่อนรัน สำหรับโฮสต์ที่ clone repo ให้ตั้ง **Root Directory เป็นรากของ repo** (เพราะ `server/index.js` import ไฟล์ `../shared/rules.js`) แล้วใช้ Build Command: `npm --prefix server install` และ Start Command: `npm --prefix server start`

### 3) ตั้งค่าหน้าเกม

แก้ `config.js` ใน GitHub:

```js
window.GAME_CONFIG = {
  apiUrl: 'https://YOUR-REAL-GAME-SERVER.example.com',
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabasePublishableKey: 'YOUR_PUBLISHABLE_OR_ANON_KEY'
};
```

Reload หน้าเกม → สมัคร/ล็อกอินด้วยอีเมล → เลือก **ชุมชน 002** → กด **เข้าชุมชนออนไลน์**

หน้าเกมออนไลน์จริงผ่าน GitHub Pages ต้องใช้ **HTTPS** และเซิร์ฟเวอร์ควรให้ **WSS** (WebSocket over HTTPS) ใช้โฮสต์ที่รองรับ WebSocket connections

## เรื่องการเซฟ

- **Demo**: `localStorage` ของเบราว์เซอร์เดียวกัน (`my_little_neighborhood_v5_demo`)
- **Online**: บันทึกเป็น row ใน `public.game_profiles` ระบุด้วย Supabase Auth `user.id`, ไม่ผูกกับเลขห้อง
- การเปลี่ยนห้องไม่ทำให้บ้าน/สวน/เงินหาย
- **Anonymous account**: ข้อมูลเก็บฝั่งเซิร์ฟเวอร์ แต่หากลบข้อมูลเบราว์เซอร์อาจเรียกคืนบัญชีไม่ได้; แนะนำสมัครบัญชีถาวร
- **เซฟ V4 เดิม** จาก `thai2d_life_v4` ยังไม่ถูกโยกเข้ารูปแบบ V5 อัตโนมัติ เพราะรูปแบบข้อมูลและกติกาเศรษฐกิจแตกต่างกัน หากจำเป็นต้องย้าย ให้ทำตัวแปลงพร้อมตรวจสอบบนเซิร์ฟเวอร์เพื่อป้องกันการนำเงินซ้ำ

## ข้อควรระวังหากจะเปิดให้คนทั่วไปเล่น

- เวอร์ชันนี้เป็น starter project (MVP) เท่านั้น สำหรับกลุ่มทดลองเล็ก ๆ
- กติกาเกี่ยวกับเงินและสวนคำนวณฝั่งเซิร์ฟเวอร์แล้ว แต่ยังควรเพิ่ม rate limit, input validation, transaction/atomic updates, authoritative collision checks, chat moderation, anti-spam, abuse prevention, reconnect handling และ load testing
- `game_profiles` เปิด RLS และไม่มีนโยบายอ่าน/แก้จากเบราว์เซอร์โดยตรง; backend เท่านั้นที่ใช้ service role หลังตรวจ JWT จาก Supabase
- เซิร์ฟเวอร์ห้องใช้หน่วยความจำใน instance เดียว หาก deploy หลาย instance ต้องเพิ่มระบบ shared presence/room allocation (เช่น Redis)

## โครงสร้างไฟล์

```text
index.html                 หน้าเกม V5
style.css                  สไตล์ responsive
client.js                  เกม 2D แผนที่ จอย ภาพ การเชื่อมต่อเซิร์ฟเวอร์
config.js                  public URL/key สำหรับเว็บ (ต้องแก้)
shared/rules.js            กติกากลาง เริ่มต้น/ทำสวน/เซฟ (ใช้ร่วมกัน)
server/index.js            WebSocket API เซิร์ฟเวอร์ออนไลน์
server/package.json        Dependencies + start command
server/.env.example        ตัวอย่าง Environment Variables
 db/schema.sql             Supabase database setup
legacy/index.html          เกม V4 เดิม (ยังอยู่ครบพร้อมไฟล์ข้างเคียง)
```
