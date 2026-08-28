import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { updateMember } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function EditMember({ params }) {
  const { id } = await params;
  const db = getDb();
  const m = db.prepare('SELECT * FROM members WHERE id=?').get(id);
  if (!m) notFound();
  const g = db.prepare('SELECT g.* FROM guardians g JOIN member_guardians mg ON mg.guardian_id=g.id WHERE mg.member_id=? LIMIT 1').get(id) ?? {};

  return (
    <>
      <div className="page-head">
        <div>
          <h1>แก้ไขข้อมูล {m.nickname} <span className="muted" style={{ fontWeight: 400 }}>· {m.id}</span></h1>
          <div className="sub">ส่วนสูง/น้ำหนักปัจจุบันให้บันทึกที่ "บันทึกการวัดตัว" ในหน้าโปรไฟล์ ไม่แก้ที่นี่</div>
        </div>
        <Link className="btn ghost" href={`/members/${m.id}`}>← กลับโปรไฟล์</Link>
      </div>

      <form action={updateMember} className="stack">
        <input type="hidden" name="id" value={m.id} />
        <div className="card">
          <h2>ข้อมูลเด็ก</h2>
          <div className="form-row">
            <div className="field"><label htmlFor="nickname">ชื่อเล่น *</label><input id="nickname" name="nickname" required defaultValue={m.nickname} /></div>
            <div className="field"><label htmlFor="full_name">ชื่อ-นามสกุล</label><input id="full_name" name="full_name" defaultValue={m.full_name ?? ''} /></div>
            <div className="field"><label htmlFor="gender">เพศ</label>
              <select id="gender" name="gender" defaultValue={m.gender ?? ''}><option value="">-</option><option>ชาย</option><option>หญิง</option></select>
            </div>
            <div className="field"><label htmlFor="birthdate">วันเกิด</label><input id="birthdate" type="date" name="birthdate" defaultValue={m.birthdate ?? ''} /></div>
          </div>
          <div className="form-row" style={{ marginTop: 10 }}>
            <div className="field"><label htmlFor="school">โรงเรียน</label><input id="school" name="school" defaultValue={m.school ?? ''} /></div>
            <div className="field"><label htmlFor="grade">ระดับชั้น</label><input id="grade" name="grade" defaultValue={m.grade ?? ''} /></div>
            <div className="field"><label htmlFor="segment">กลุ่ม</label>
              <select id="segment" name="segment" defaultValue={m.segment}><option>Teen</option><option>NP</option></select>
            </div>
            <div className="field"><label htmlFor="channel">ช่องทางที่รู้จัก</label>
              <select id="channel" name="channel" defaultValue={m.channel ?? ''}><option value="">-</option><option>Facebook</option><option>Instagram</option><option>LINE</option><option>เพื่อนแนะนำ</option><option>Walk-in</option></select>
            </div>
          </div>
          <div className="form-row" style={{ marginTop: 10 }}>
            <div className="field"><label htmlFor="goal">เป้าหมาย</label><input id="goal" name="goal" defaultValue={m.goal ?? ''} /></div>
            <div className="field"><label htmlFor="medical">โรคประจำตัว</label><input id="medical" name="medical" defaultValue={m.medical ?? ''} /></div>
            <div className="field"><label htmlFor="caution" className="danger-text">ข้อระวัง</label><input id="caution" name="caution" defaultValue={m.caution ?? ''} /></div>
            <div className="field"><label htmlFor="status">สถานะสมาชิก</label>
              <select id="status" name="status" defaultValue={m.status}><option>Active</option><option>Inactive</option></select>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>ผู้ปกครอง</h2>
          <div className="form-row">
            <div className="field"><label htmlFor="guardian_name">ชื่อผู้ปกครอง</label><input id="guardian_name" name="guardian_name" defaultValue={g.name ?? ''} /></div>
            <div className="field"><label htmlFor="guardian_relationship">ความสัมพันธ์</label><input id="guardian_relationship" name="guardian_relationship" defaultValue={g.relationship ?? ''} /></div>
            <div className="field"><label htmlFor="guardian_phone">เบอร์โทร</label><input id="guardian_phone" name="guardian_phone" defaultValue={g.phone ?? ''} /></div>
            <div className="field"><label htmlFor="guardian_line">LINE ID</label><input id="guardian_line" name="guardian_line" defaultValue={g.line_id ?? ''} /></div>
          </div>
          <div className="form-row" style={{ marginTop: 10 }}>
            <div className="field"><label htmlFor="guardian_email">Email</label><input id="guardian_email" type="email" name="guardian_email" defaultValue={g.email ?? ''} /></div>
            <div className="field"><label htmlFor="guardian_address">ที่อยู่</label><input id="guardian_address" name="guardian_address" defaultValue={g.address ?? ''} /></div>
            <div className="field"><label htmlFor="guardian_province">จังหวัด</label><input id="guardian_province" name="guardian_province" defaultValue={g.province ?? ''} /></div>
          </div>
        </div>

        <div className="card">
          <div className="field"><label htmlFor="note">หมายเหตุ</label><textarea id="note" name="note" rows={2} defaultValue={m.note ?? ''}></textarea></div>
          <button className="btn">บันทึกการแก้ไข</button>
        </div>
      </form>
    </>
  );
}
