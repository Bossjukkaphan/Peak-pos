// PIN สำหรับเข้าโซนแอดมิน — ตั้งค่าใหม่ได้ด้วย env ADMIN_PIN (Vercel: Settings → Environment Variables)
export const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
export const ADMIN_COOKIE = 'peak_admin';
