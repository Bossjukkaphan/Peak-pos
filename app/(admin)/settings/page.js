import { getDb, getSetting } from '@/lib/db';
import { updateSettings } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default function Settings() {
  getDb();
  const threshold = getSetting('low_credit_threshold', '6');
  const noShowDeducts = getSetting('no_show_deducts', '0');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>ตั้งค่านโยบาย</h1>
          <div className="sub">กฎที่ระบบบังคับอัตโนมัติ — เปลี่ยนแล้วมีผลทันทีทุกหน้าจอ</div>
        </div>
      </div>

      <form action={updateSettings} className="card stack" style={{ maxWidth: 560 }}>
        <div className="field">
          <label htmlFor="st-threshold">เตือน "คอร์สใกล้หมด" เมื่อครั้งคงเหลือน้อยกว่าหรือเท่ากับ</label>
          <input id="st-threshold" type="number" name="low_credit_threshold" min="1" max="50" defaultValue={threshold} required />
        </div>
        <div className="field">
          <label htmlFor="st-noshow">กรณีลูกค้าไม่มา (no-show)</label>
          <select id="st-noshow" name="no_show_deducts" defaultValue={noShowDeducts}>
            <option value="0">ไม่หักครั้ง (ค่าเริ่มต้น)</option>
            <option value="1">หัก 1 ครั้ง</option>
          </select>
        </div>
        <div><button className="btn">บันทึกการตั้งค่า</button></div>
      </form>
    </>
  );
}
