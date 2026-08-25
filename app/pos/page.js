import { getDb, todayStr } from '../../src/lib/db';
import { sellCourse } from '../../src/lib/actions';

export const dynamic = 'force-dynamic';

export default async function Pos({ searchParams }) {
  const sp = await searchParams;
  const db = getDb();
  const members = db.prepare("SELECT id, nickname, full_name FROM members WHERE status='Active' ORDER BY id").all();
  const courses = db.prepare('SELECT * FROM courses WHERE active=1 ORDER BY price').all();
  const coaches = db.prepare('SELECT * FROM coaches WHERE active=1 ORDER BY id').all();
  const preselect = sp?.member ?? '';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>ขายคอร์ส</h1>
          <div className="sub">ออกเลขใบเสร็จอัตโนมัติ · ครั้ง+ของแถมเข้าบัญชีสมาชิกทันที</div>
        </div>
      </div>

      <div className="grid cols-2">
        <form action={sellCourse} className="card stack">
          <div className="field">
            <label htmlFor="pos-member">สมาชิก *</label>
            <select id="pos-member" name="member_id" defaultValue={preselect} required>
              <option value="" disabled>— เลือกสมาชิก —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.nickname} ({m.id}) {m.full_name ? `· ${m.full_name}` : ''}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pos-course">คอร์ส *</label>
            <select id="pos-course" name="course_id" required>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name} — {c.price.toLocaleString()}฿</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="pos-coach">โค้ชผู้ดูแลคอร์ส</label>
              <select id="pos-coach" name="coach_id">
                {coaches.map((c) => <option key={c.id} value={c.id}>โค้ช{c.nickname}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor="pos-start">วันเริ่มคอร์ส</label><input id="pos-start" type="date" name="start_date" defaultValue={todayStr()} /></div>
          </div>
          <div className="form-row">
            <div className="field"><label htmlFor="pos-bonus">ของแถม (ครั้งฟรี)</label><input id="pos-bonus" type="number" name="bonus" min="0" defaultValue="0" /></div>
            <div className="field"><label htmlFor="pos-discount">ส่วนลด (บาท)</label><input id="pos-discount" type="number" name="discount" min="0" defaultValue="0" /></div>
            <div className="field">
              <label htmlFor="pos-method">ช่องทางชำระ</label>
              <select id="pos-method" name="method"><option>Cash</option><option>Card</option><option>QR</option></select>
            </div>
          </div>
          <div><button className="btn">บันทึกการขาย + ออกใบเสร็จ</button></div>
        </form>

        <div className="card">
          <h2>ราคาคอร์ส</h2>
          <div className="tbl"><table>
            <thead><tr><th>คอร์ส</th><th className="num">ครั้ง</th><th className="num">ราคา</th><th className="num">ต่อครั้ง</th><th className="num">อายุคอร์ส</th></tr></thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="num">{c.sessions}</td>
                  <td className="num">{c.price.toLocaleString()}฿</td>
                  <td className="num">{Math.round(c.price / c.sessions).toLocaleString()}฿</td>
                  <td className="num">{c.validity_days} วัน</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="muted" style={{ fontSize: '.85rem', marginTop: 10 }}>
            ทุกการขายสร้างรายการใน ledger (ครั้งตามคอร์ส + ของแถมแยกรายการ) — ครั้งคงเหลือคำนวณจาก ledger เสมอ แก้ตัวเลขตรงๆ ไม่ได้
          </p>
        </div>
      </div>
    </>
  );
}
