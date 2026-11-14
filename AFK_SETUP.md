# ตั้งค่าระบบ AFK 30 นาที และเคลียร์ชุมชน 001

## ที่อัปเดตบน GitHub Pages แล้ว
- เมื่อผู้เล่นไม่กดปุ่มหรือขยับเมาส์/จอยครบ 29 นาที 30 วินาที จะแจ้งเตือนอีก 30 วินาที
- เมื่อ AFK ครบ 30 นาที เกมพาออกจากห้องและคืนช่องผู้เล่น
- เมื่อลบ slot ผ่าน Firebase Console เกมรุ่นใหม่จะรับรู้และกลับไปหน้าเลือกชุมชน
- ไม่แก้เซฟ เงิน ไอเทม บ้าน หรือฟาร์มของผู้เล่น

## เปิดใช้งานตัวลบผู้เล่น AFK ฝั่งเซิร์ฟเวอร์
เพิ่ม Cloud Function evictIdlePlayers ไว้ใน market-functions.js แล้ว ตรวจทุก 1 นาที โดยใช้ Firebase Admin SDK และ session connection marker
ต้อง Deploy โดยผู้ดูแล Firebase (Cloud Functions / Cloud Scheduler อาจมีค่าใช้จ่ายและต้องใช้ Blaze plan)

ติดตั้ง Node.js และ Firebase CLI บนเครื่องที่มีสิทธิ์ deploy แล้วรันที่โฟลเดอร์โปรเจกต์:
```bash
npm install
npx firebase-tools login
npx firebase-tools deploy --project gamesurvival-58e92 --only database,functions:evictIdlePlayers
```

firebase.json ชี้กฎฐานข้อมูลไปที่ database.market.rules.json ซึ่งได้เพิ่มการกำหนดสิทธิ์ connections ของผู้เล่นแล้ว
อย่านำ Firebase Admin SDK credentials หรือ service account key ขึ้น GitHub

## เตะทุกคนออกจากชุมชน 001 ตอนนี้
1. เข้า https://console.firebase.google.com/project/gamesurvival-58e92/database
2. ไป Realtime Database > Data
3. เปิด little-neighborhood-v5 > rooms > 001
4. ลบเฉพาะ node slots และ node connections (ถ้ามี)
5. รีเฟรชหน้าเกมและตรวจนับผู้เล่นห้อง 001 เป็น 0/8

สำคัญ: อย่าลบ little-neighborhood-v5/profiles เพราะมีเงิน บ้าน และไอเทม; อย่าลบห้อง 002 หรือ 003
การเคลียร์เป็นเพียงการเตะชั่วคราว ผู้เล่นสามารถเข้าห้อง 001 อีกได้ทันที
ควรให้ผู้เล่นเปิดเกมรุ่นล่าสุดก่อน reset เพื่อลดความเสี่ยงจาก onDisconnect รุ่นเก่า

## หมายเหตุ
- ฟังก์ชัน evictIdlePlayers ต้อง deploy บน Firebase ก่อนจึงทำงานเมื่อหน้าเกมถูกพักหรือปิด
- ฟังก์ชันจัดการเฉพาะ slot ที่ระบุ presenceMode=session เพื่อไม่เสี่ยงลบช่องผู้เล่นจาก client รุ่นเก่า
- ไม่มีการลบ profiles ของผู้เล่น
