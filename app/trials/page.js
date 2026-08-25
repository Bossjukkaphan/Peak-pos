import { getDb, todayStr } from '../../src/lib/db';
import { createLead, recordLeadResult, completeFollowup } from '../../src/lib/actions';

export const dynamic = 'force-dynamic';

const STATUS_LABEL = {
  new: ['ใหม่', 'grey'],
  scheduled: ['นัดแล้ว', 'amber'],
  attended: ['มาทดลองแล้ว', 'amber'],
  purchased: ['ซื้อแล้ว', 'green'],
  not_purchased: ['ยังไม่ซื้อ', 'red'],
  no_show: ['ไม่มา', 'red'],
};

export default function Trials() {
  const db = getDb();
  const today = todayStr();
  const leads = db.prepare('SELECT * FROM leads ORDER BY created_at DESC, id DESC').all();
  const followups = db.prepare(`
    SELECT f.*, l.contact_name, l.child_name, l.phone
    FROM followups f JOIN leads l ON l.id=f.lead_id
    WHERE f.done_at IS NULL ORDER BY f.due_date, f.id`).all();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Trial / ตามต่อ</h1>
          <div className="sub">บันทึกผู้สนใจ นัดทดลองเรียน และติดตามการขายรอบ 1-2-3</div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>เพิ่มผู้สนใจ (Lead)</h2>
          <form action={createLead} className="stack">
            <div className="form-row">
              <div className="field"><label htmlFor="ld-contact">ผู้ติดต่อ *</label><input id="ld-contact" name="contact_name" required placeholder="เช่น คุณแม่เอ" /></div>
              <div className="field"><label htmlFor="ld-child">ชื่อเด็ก</label><input id="ld-child" name="child_name" placeholder="เช่น น้องบี" /></div>
              <div className="field"><label htmlFor="ld-age">อายุ</label><input id="ld-age" type="number" name="child_age" min="1" max="20" /></div>
              <div className="field"><label htmlFor="ld-gender">เพศ</label>
                <select id="ld-gender" name="child_gender"><option value="">-</option><option>ชาย</option><option>หญิง</option></select>
              </div>
            </div>
            <div className="form-row">
              <div className="field"><label htmlFor="ld-phone">เบอร์โทร</label><input id="ld-phone" name="phone" /></div>
              <div className="field"><label htmlFor="ld-channel">ช่องทาง</label>
                <select id="ld-channel" name="channel"><option value="">-</option><option>Facebook</option><option>Instagram</option><option>LINE</option><option>เพื่อนแนะนำ</option><option>Walk-in</option></select>
              </div>
            </div>
            <div><button className="btn">บันทึก Lead</button></div>
          </form>
          <p className="muted" style={{ fontSize: '.85rem', marginTop: 10 }}>
            นัดทดลอง/Consult ให้ไปเพิ่ม Booking ที่หน้า ตารางเทรน แล้วเลือก Lead — เมื่อบันทึกผล "ยังไม่ซื้อ" ระบบจะสร้างงานตามต่อรอบถัดไปให้อัตโนมัติ (+3 วัน สูงสุด 3 รอบ)
          </p>
        </div>

        <div className="card">
          <h2>งานตามต่อค้าง ({followups.length})</h2>
          {followups.length === 0 ? <p className="muted">ไม่มีงานตามต่อค้าง</p> : (
            <div className="tbl"><table>
              <thead><tr><th>ผู้ติดต่อ</th><th>รอบ</th><th>กำหนด</th><th>ผลการติดต่อ</th></tr></thead>
              <tbody>
                {followups.map((f) => (
                  <tr key={f.id}>
                    <td>{f.contact_name} <span className="muted">{f.child_name ?? ''} · {f.phone ?? '-'}</span></td>
                    <td><span className={`pill ${f.due_date <= today ? 'red' : 'amber'}`}>ตามต่อ {f.round}</span></td>
                    <td>{f.due_date}</td>
                    <td>
                      <form action={completeFollowup} className="inline-form" style={{ display: 'flex', gap: 4 }}>
                        <input type="hidden" name="followup_id" value={f.id} />
                        <select name="result" aria-label="ผลการติดต่อ">
                          <option>ยังไม่ซื้อ</option>
                          <option>ซื้อแล้ว</option>
                          <option>ขอเลิกติดตาม</option>
                        </select>
                        <button className="btn small">บันทึก</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      </div>

      <div className="card section">
        <h2>Lead ทั้งหมด ({leads.length})</h2>
        <div className="tbl"><table>
          <thead><tr><th>ผู้ติดต่อ</th><th>เด็ก</th><th>เบอร์</th><th>ช่องทาง</th><th>สถานะ</th><th>เหตุผล/บันทึกผล</th></tr></thead>
          <tbody>
            {leads.map((l) => {
              const [label, tone] = STATUS_LABEL[l.status] ?? [l.status, 'grey'];
              return (
                <tr key={l.id}>
                  <td>{l.contact_name}</td>
                  <td>{l.child_name ?? '-'} {l.child_age ? `${l.child_age} ปี` : ''} {l.child_gender ?? ''}</td>
                  <td>{l.phone ?? '-'}</td>
                  <td>{l.channel ?? '-'}</td>
                  <td><span className={`pill ${tone}`}>{label}</span></td>
                  <td>
                    {['purchased'].includes(l.status) ? (l.reason ?? '-') : (
                      <form action={recordLeadResult} className="inline-form" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <input type="hidden" name="lead_id" value={l.id} />
                        <select name="status" defaultValue={l.status === 'not_purchased' ? 'not_purchased' : 'purchased'} aria-label="ผลการขาย">
                          <option value="purchased">ซื้อแล้ว</option>
                          <option value="not_purchased">ยังไม่ซื้อ</option>
                          <option value="no_show">ไม่มา</option>
                        </select>
                        <input name="reason" placeholder="เหตุผล เช่น ติดเรื่องเงิน" defaultValue={l.reason ?? ''} style={{ width: 160 }} />
                        <button className="btn small">บันทึกผล</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    </>
  );
}
