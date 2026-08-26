import { createMember } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default function NewMember() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>สมัครสมาชิกใหม่</h1>
          <div className="sub">ระบบออกรหัสสมาชิก (PLxxx) ให้อัตโนมัติ</div>
        </div>
      </div>

      <form action={createMember} className="stack">
        <div className="card">
          <h2>ข้อมูลเด็ก (ผู้ใช้บริการ)</h2>
          <div className="form-row">
            <div className="field"><label htmlFor="nickname">ชื่อเล่น *</label><input id="nickname" name="nickname" required /></div>
            <div className="field"><label htmlFor="full_name">ชื่อ-นามสกุล</label><input id="full_name" name="full_name" /></div>
            <div className="field"><label htmlFor="gender">เพศ</label>
              <select id="gender" name="gender"><option value="">-</option><option>ชาย</option><option>หญิง</option></select>
            </div>
            <div className="field"><label htmlFor="birthdate">วันเกิด</label><input id="birthdate" type="date" name="birthdate" /></div>
          </div>
          <div className="form-row" style={{ marginTop: 10 }}>
            <div className="field"><label htmlFor="school">โรงเรียน</label><input id="school" name="school" /></div>
            <div className="field"><label htmlFor="grade">ระดับชั้น</label><input id="grade" name="grade" placeholder="เช่น ป.4" /></div>
            <div className="field"><label htmlFor="segment">กลุ่ม</label>
              <select id="segment" name="segment"><option>Teen</option><option>NP</option></select>
            </div>
            <div className="field"><label htmlFor="channel">ช่องทางที่รู้จัก</label>
              <select id="channel" name="channel"><option value="">-</option><option>Facebook</option><option>Instagram</option><option>LINE</option><option>เพื่อนแนะนำ</option><option>Walk-in</option></select>
            </div>
          </div>
          <div className="form-row" style={{ marginTop: 10 }}>
            <div className="field"><label htmlFor="height_cm">ส่วนสูงเริ่มต้น (ซม.)</label><input id="height_cm" type="number" step="0.1" name="height_cm" /></div>
            <div className="field"><label htmlFor="weight_kg">น้ำหนักเริ่มต้น (กก.)</label><input id="weight_kg" type="number" step="0.1" name="weight_kg" /></div>
            <div className="field"><label htmlFor="goal">เป้าหมาย</label><input id="goal" name="goal" placeholder="เช่น เพิ่มส่วนสูง / บุคลิกภาพ" /></div>
          </div>
          <div className="form-row" style={{ marginTop: 10 }}>
            <div className="field"><label htmlFor="medical">โรคประจำตัว</label><input id="medical" name="medical" /></div>
            <div className="field"><label htmlFor="caution" className="danger-text">ข้อระวัง (โค้ชเห็นก่อนเทรนทุกครั้ง)</label><input id="caution" name="caution" placeholder="เช่น ผ่าเข่าขวา" /></div>
          </div>
        </div>

        <div className="card">
          <h2>ผู้ปกครอง (ผู้ซื้อ / ผู้ติดต่อ)</h2>
          <div className="form-row">
            <div className="field"><label htmlFor="guardian_name">ชื่อผู้ปกครอง</label><input id="guardian_name" name="guardian_name" /></div>
            <div className="field"><label htmlFor="guardian_relationship">ความสัมพันธ์</label><input id="guardian_relationship" name="guardian_relationship" placeholder="พ่อ / แม่ / น้า" /></div>
            <div className="field"><label htmlFor="guardian_phone">เบอร์โทร</label><input id="guardian_phone" name="guardian_phone" /></div>
            <div className="field"><label htmlFor="guardian_line">LINE ID</label><input id="guardian_line" name="guardian_line" /></div>
          </div>
          <div className="form-row" style={{ marginTop: 10 }}>
            <div className="field"><label htmlFor="guardian_email">Email</label><input id="guardian_email" type="email" name="guardian_email" /></div>
            <div className="field"><label htmlFor="guardian_address">ที่อยู่</label><input id="guardian_address" name="guardian_address" /></div>
            <div className="field"><label htmlFor="guardian_province">จังหวัด</label><input id="guardian_province" name="guardian_province" /></div>
          </div>
        </div>

        <div className="card">
          <div className="field"><label htmlFor="note">หมายเหตุ</label><textarea id="note" name="note" rows={2}></textarea></div>
          <p className="muted" style={{ fontSize: '.85rem' }}>
            * อย่าลืมให้ผู้ปกครองลงนามใบยินยอมเก็บข้อมูลสุขภาพผู้เยาว์ (PDPA) — เวอร์ชันดิจิทัลจะมาในเฟสถัดไป
          </p>
          <button className="btn">บันทึกสมาชิก</button>
        </div>
      </form>
    </>
  );
}
