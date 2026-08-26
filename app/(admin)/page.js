import Link from 'next/link';
import { getDb, getSetting, todayStr } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default function Dashboard() {
  const db = getDb();
  const today = todayStr();
  const month = today.slice(0, 7);
  const threshold = Number(getSetting('low_credit_threshold', '6'));

  const totalMembers = db.prepare('SELECT COUNT(*) AS n FROM members').get().n;
  const activeMembers = db.prepare("SELECT COUNT(*) AS n FROM members WHERE status='Active'").get().n;
  const revenue = db.prepare("SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE substr(paid_at,1,7)=?").get(month).s;
  const bookingsToday = db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE date=? AND status IN ('booked','attended')").get(today).n;
  const trainedToday = db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE date=? AND status='attended'").get(today).n;

  const lowCredit = db.prepare(`
    SELECT * FROM (
      SELECT e.id, e.member_id, m.nickname, c.name AS course, e.expiry_date,
             COALESCE((SELECT SUM(delta) FROM credit_ledger WHERE enrollment_id=e.id),0) AS remaining
      FROM enrollments e
      JOIN members m ON m.id=e.member_id
      JOIN courses c ON c.id=e.course_id
      WHERE e.status='active'
    ) WHERE remaining <= ? ORDER BY remaining`).all(threshold);

  const dueFollowups = db.prepare(`
    SELECT f.id, f.round, f.due_date, l.contact_name, l.child_name, l.phone, l.reason
    FROM followups f JOIN leads l ON l.id=f.lead_id
    WHERE f.done_at IS NULL AND f.due_date <= ?
    ORDER BY f.due_date`).all(today);

  const coachToday = db.prepare(`
    SELECT co.nickname, co.rate,
           SUM(CASE WHEN b.status='attended' THEN 1 ELSE 0 END) AS attended,
           COUNT(*) AS total
    FROM bookings b JOIN coaches co ON co.id=b.coach_id
    WHERE b.date=? AND b.status IN ('booked','attended')
    GROUP BY co.id ORDER BY co.id`).all(today);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">ภาพรวมวันนี้ · {today}</div>
        </div>
        <Link className="btn" href="/pos">+ ขายคอร์ส</Link>
      </div>

      <div className="grid stats">
        <div className="card stat"><div className="label">สมาชิกทั้งหมด</div><div className="value">{totalMembers}</div><div className="hint">Active {activeMembers} คน</div></div>
        <div className="card stat"><div className="label">รายได้เดือนนี้</div><div className="value">{revenue.toLocaleString()}฿</div></div>
        <div className="card stat"><div className="label">Booking วันนี้</div><div className="value">{bookingsToday}</div><div className="hint">เทรนแล้ว {trainedToday} คน</div></div>
        <div className="card stat"><div className="label">คอร์สใกล้หมด</div><div className={`value${lowCredit.length ? ' warn' : ''}`}>{lowCredit.length}</div><div className="hint">เหลือ ≤ {threshold} ครั้ง</div></div>
        <div className="card stat"><div className="label">ต้องตามต่อ</div><div className={`value${dueFollowups.length ? ' warn' : ''}`}>{dueFollowups.length}</div><div className="hint">ครบกำหนดวันนี้/เลยกำหนด</div></div>
      </div>

      <div className="grid cols-2 section">
        <div className="card">
          <h2>คอร์สใกล้หมด — ชวนต่อคอร์สได้เลย</h2>
          {lowCredit.length === 0 ? <p className="muted">ยังไม่มีคอร์สที่เหลือ ≤ {threshold} ครั้ง</p> : (
            <div className="tbl"><table>
              <thead><tr><th>สมาชิก</th><th>คอร์ส</th><th className="num">คงเหลือ</th><th>หมดอายุ</th><th></th></tr></thead>
              <tbody>
                {lowCredit.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/members/${r.member_id}`}>{r.nickname}</Link> <span className="muted">{r.member_id}</span></td>
                    <td>{r.course}</td>
                    <td className="num"><span className="pill red">{r.remaining} ครั้ง</span></td>
                    <td>{r.expiry_date}</td>
                    <td><Link className="btn small ghost" href={`/pos?member=${r.member_id}`}>ต่อคอร์ส</Link></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>

        <div className="card">
          <h2>งานตามต่อวันนี้ (Trial follow-up)</h2>
          {dueFollowups.length === 0 ? <p className="muted">ไม่มีงานตามต่อค้าง</p> : (
            <div className="tbl"><table>
              <thead><tr><th>ผู้ติดต่อ</th><th>เด็ก</th><th>รอบ</th><th>กำหนด</th><th>เบอร์</th></tr></thead>
              <tbody>
                {dueFollowups.map((f) => (
                  <tr key={f.id}>
                    <td>{f.contact_name}</td>
                    <td>{f.child_name ?? '-'}</td>
                    <td><span className="pill amber">ตามต่อ {f.round}</span></td>
                    <td>{f.due_date}</td>
                    <td>{f.phone ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          <p style={{ marginTop: 10 }}><Link href="/trials">ไปหน้า Trial / ตามต่อ →</Link></p>
        </div>
      </div>

      <div className="card section">
        <h2>โค้ชวันนี้</h2>
        {coachToday.length === 0 ? <p className="muted">ยังไม่มี booking วันนี้ — เพิ่มได้ที่หน้า <Link href="/schedule">ตารางเทรน</Link></p> : (
          <div className="tbl"><table>
            <thead><tr><th>โค้ช</th><th className="num">เทรนแล้ว</th><th className="num">ทั้งหมดวันนี้</th><th className="num">ค่าเทรนสะสมวันนี้</th></tr></thead>
            <tbody>
              {coachToday.map((c) => (
                <tr key={c.nickname}>
                  <td>{c.nickname}</td>
                  <td className="num">{c.attended}</td>
                  <td className="num">{c.total}</td>
                  <td className="num">{(c.attended * c.rate).toLocaleString()}฿</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
