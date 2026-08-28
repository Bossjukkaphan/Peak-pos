import Link from 'next/link';
import { getDb, todayStr, addDays } from '@/lib/db';
import { addContactLog, completeFollowup } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default function Crm() {
  const db = getDb();
  const today = todayStr();
  const month = today.slice(5, 7);

  // 1) งานตามต่อ lead ที่ครบกำหนด
  const dueFollowups = db.prepare(`
    SELECT f.id, f.round, f.due_date, l.contact_name, l.child_name, l.phone
    FROM followups f JOIN leads l ON l.id=f.lead_id
    WHERE f.done_at IS NULL AND f.due_date <= ? ORDER BY f.due_date`).all(today);

  // 2) คอร์สใกล้หมดอายุใน 14 วัน (ชวนต่อคอร์ส/เร่งใช้ครั้ง)
  const expiring = db.prepare(`
    SELECT e.id, e.member_id, e.expiry_date, m.nickname, c.name AS course,
      COALESCE((SELECT SUM(delta) FROM credit_ledger WHERE enrollment_id=e.id),0) AS remaining,
      (SELECT g.phone FROM guardians g JOIN member_guardians mg ON mg.guardian_id=g.id WHERE mg.member_id=m.id LIMIT 1) AS phone
    FROM enrollments e JOIN members m ON m.id=e.member_id JOIN courses c ON c.id=e.course_id
    WHERE e.status='active' AND e.expiry_date BETWEEN ? AND ?
    ORDER BY e.expiry_date`).all(today, addDays(today, 14));

  // 3) ลูกค้าเงียบหาย: Active + มีคอร์สค้าง แต่ไม่ได้เข้าเทรนเกิน 14 วัน (หรือไม่เคยมาเลย)
  const silent = db.prepare(`
    SELECT m.id, m.nickname,
      (SELECT MAX(b.date) FROM bookings b WHERE b.member_id=m.id AND b.status='attended') AS last_visit,
      (SELECT g.phone FROM guardians g JOIN member_guardians mg ON mg.guardian_id=g.id WHERE mg.member_id=m.id LIMIT 1) AS phone,
      (SELECT COALESCE(SUM(delta),0) FROM credit_ledger cl JOIN enrollments e ON e.id=cl.enrollment_id
        WHERE e.member_id=m.id AND e.status='active') AS remaining
    FROM members m
    WHERE m.status='Active'
      AND EXISTS (SELECT 1 FROM enrollments e WHERE e.member_id=m.id AND e.status='active')
      AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.member_id=m.id AND b.status IN ('attended','booked') AND b.date >= ?)
    ORDER BY last_visit`).all(addDays(today, -14));

  // 4) ถึงรอบวัดตัว: วัดครั้งล่าสุดเกิน 30 วัน
  const measureDue = db.prepare(`
    SELECT m.id, m.nickname, (SELECT MAX(date) FROM measurements ms WHERE ms.member_id=m.id) AS last_measure
    FROM members m
    WHERE m.status='Active'
      AND EXISTS (SELECT 1 FROM enrollments e WHERE e.member_id=m.id AND e.status='active')
      AND COALESCE((SELECT MAX(date) FROM measurements ms WHERE ms.member_id=m.id), '0000-00-00') <= ?
    ORDER BY last_measure`).all(addDays(today, -30));

  // 5) วันเกิดเดือนนี้
  const birthdays = db.prepare(`
    SELECT id, nickname, birthdate FROM members
    WHERE birthdate IS NOT NULL AND substr(birthdate,6,2)=? AND status='Active'
    ORDER BY substr(birthdate,9,2)`).all(month);

  const members = db.prepare("SELECT id, nickname FROM members WHERE status='Active' ORDER BY id").all();
  const logs = db.prepare(`
    SELECT cl.*, m.nickname, l.contact_name FROM contact_logs cl
    LEFT JOIN members m ON m.id=cl.member_id
    LEFT JOIN leads l ON l.id=cl.lead_id
    ORDER BY cl.created_at DESC, cl.id DESC LIMIT 30`).all();

  const taskCount = dueFollowups.length + expiring.length + silent.length + measureDue.length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>ดูแลลูกค้า (CRM)</h1>
          <div className="sub">งานที่ต้องดูแลวันนี้ {taskCount} รายการ · {today}</div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>ตามต่อ Lead ครบกำหนด ({dueFollowups.length})</h2>
          {dueFollowups.length === 0 ? <p className="muted">ไม่มีงานค้าง</p> : (
            <div className="tbl"><table>
              <thead><tr><th>ผู้ติดต่อ</th><th>รอบ</th><th>เบอร์</th><th>ผล</th></tr></thead>
              <tbody>
                {dueFollowups.map((f) => (
                  <tr key={f.id}>
                    <td>{f.contact_name} <span className="muted">{f.child_name ?? ''}</span></td>
                    <td><span className="pill red">ตามต่อ {f.round}</span></td>
                    <td>{f.phone ?? '-'}</td>
                    <td>
                      <form action={completeFollowup} className="inline-form" style={{ display: 'flex', gap: 4 }}>
                        <input type="hidden" name="followup_id" value={f.id} />
                        <select name="result" aria-label="ผลการติดต่อ">
                          <option>ยังไม่ซื้อ</option><option>ซื้อแล้ว</option><option>ขอเลิกติดตาม</option>
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

        <div className="card">
          <h2>คอร์สหมดอายุใน 14 วัน ({expiring.length})</h2>
          {expiring.length === 0 ? <p className="muted">ไม่มีคอร์สใกล้หมดอายุ</p> : (
            <div className="tbl"><table>
              <thead><tr><th>สมาชิก</th><th>คอร์ส</th><th className="num">เหลือ</th><th>หมดอายุ</th><th></th></tr></thead>
              <tbody>
                {expiring.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/members/${r.member_id}`}>{r.nickname}</Link><br /><span className="muted">{r.phone ?? '-'}</span></td>
                    <td>{r.course}</td>
                    <td className="num"><span className={`pill ${r.remaining > 0 ? 'amber' : 'grey'}`}>{r.remaining}</span></td>
                    <td className="danger-text">{r.expiry_date}</td>
                    <td><Link className="btn small ghost" href={`/pos?member=${r.member_id}`}>ต่อคอร์ส</Link></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      </div>

      <div className="grid cols-2 section">
        <div className="card">
          <h2>ลูกค้าเงียบหาย — ไม่เข้าเทรนเกิน 14 วัน ({silent.length})</h2>
          {silent.length === 0 ? <p className="muted">ทุกคนยังมาต่อเนื่อง 💪</p> : (
            <div className="tbl"><table>
              <thead><tr><th>สมาชิก</th><th>มาล่าสุด</th><th className="num">ครั้งค้าง</th><th>เบอร์</th></tr></thead>
              <tbody>
                {silent.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/members/${r.id}`}>{r.nickname}</Link> <span className="muted">{r.id}</span></td>
                    <td>{r.last_visit ?? <span className="danger-text">ยังไม่เคยมา</span>}</td>
                    <td className="num"><span className="pill amber">{r.remaining}</span></td>
                    <td>{r.phone ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>

        <div className="card">
          <h2>ถึงรอบวัดตัวประจำเดือน ({measureDue.length}) · วันเกิดเดือนนี้ ({birthdays.length})</h2>
          {measureDue.length === 0 ? <p className="muted">วัดตัวครบทุกคนแล้วในรอบ 30 วัน</p> : (
            <div className="tbl"><table>
              <thead><tr><th>สมาชิก</th><th>วัดล่าสุด</th></tr></thead>
              <tbody>
                {measureDue.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/members/${r.id}`}>{r.nickname}</Link> <span className="muted">{r.id}</span></td>
                    <td>{r.last_measure === '0000-00-00' || !r.last_measure ? 'ยังไม่เคยวัด' : r.last_measure}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          <h3 style={{ marginTop: 14 }}>🎂 วันเกิดเดือนนี้</h3>
          {birthdays.length === 0 ? <p className="muted">ไม่มีวันเกิดเดือนนี้</p> : (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {birthdays.map((b) => (
                <li key={b.id}><Link href={`/members/${b.id}`}>{b.nickname}</Link> — {b.birthdate.slice(8, 10)} {['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][Number(month)]}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card section">
        <h2>บันทึกการติดต่อล่าสุด</h2>
        <form action={addContactLog} className="inline-form" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <select name="member_id" required aria-label="เลือกสมาชิก">
            <option value="" disabled>— เลือกสมาชิก —</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.nickname} ({m.id})</option>)}
          </select>
          <select name="channel" aria-label="ช่องทางติดต่อ">
            <option>โทร</option><option>LINE</option><option>หน้าร้าน</option><option>อื่นๆ</option>
          </select>
          <input name="note" placeholder="คุยอะไร / ตกลงอะไรไว้" required style={{ flex: 1, minWidth: 220 }} />
          <button className="btn small">บันทึก</button>
        </form>
        {logs.length === 0 ? <p className="muted">ยังไม่มีบันทึก</p> : (
          <div className="tbl"><table>
            <thead><tr><th>เวลา</th><th>ลูกค้า</th><th>ช่องทาง</th><th>บันทึก</th></tr></thead>
            <tbody>
              {logs.map((c) => (
                <tr key={c.id}>
                  <td>{c.created_at}</td>
                  <td>{c.member_id ? <Link href={`/members/${c.member_id}`}>{c.nickname}</Link> : (c.contact_name ?? '-')}</td>
                  <td><span className="pill grey">{c.channel}</span></td>
                  <td>{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
