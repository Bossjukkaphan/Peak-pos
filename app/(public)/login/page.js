import { loginAdmin } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function Login({ searchParams }) {
  const sp = await searchParams;
  return (
    <div className="card" style={{ maxWidth: 380, margin: '60px auto' }}>
      <h1>เข้าสู่ระบบพนักงาน</h1>
      <p className="muted">ใส่ PIN สำหรับหน้าร้าน/ผู้บริหาร — โค้ชดูตารางได้ที่ <a href="/board">บอร์ดโค้ช</a> โดยไม่ต้องใส่ PIN</p>
      {sp?.error && <p className="danger-text">PIN ไม่ถูกต้อง ลองอีกครั้ง</p>}
      <form action={loginAdmin} className="stack">
        <input type="hidden" name="next" value={sp?.next ?? '/'} />
        <div className="field">
          <label htmlFor="pin">PIN</label>
          <input id="pin" name="pin" type="password" inputMode="numeric" autoFocus required />
        </div>
        <div><button className="btn">เข้าสู่ระบบ</button></div>
      </form>
    </div>
  );
}
