import Link from 'next/link';
import { getDb, getSetting, todayStr, addDays } from '@/lib/db';
import { completeFollowup, addContactLog } from '@/lib/actions';

export const dynamic = 'force-dynamic';

// "วันนี้ต้องคุยกับใคร" — รวมงานเชิงรุกที่เคยกระจายอยู่หลายหน้าเป็น to-do เดียว
// เรียงตามความเร่ง: ตามต่อ lead → ครั้งใกล้หมด → คอร์สใกล้หมดอายุ → เด็กหายไปนาน
export default async function Calls() {
  const db = getDb();
  const today = todayStr();
  const threshold = Number(getSetting('low_credit_threshold', '6'));

  const followups = db.prepare(`
    SELECT f.*, l.contact_name, l.child_name, l.phone, l.reason
    FROM followups f JOIN leads l ON l.id=f.lead_id
    WHERE f.done_at IS NULL AND f.due_date <= ?
    ORDER BY f.due_date, f.round`).all(today);

  // สรุปครั้งคงเหลือ/วันหมดอายุ ต่อสมาชิกที่ยังมีคอร์ส active + เบอร์ผู้ปกครองคนแรก
  const memberRows = db.prepare(`
    SELECT m.id, m.nickname, m.full_name,
      SUM(r.remaining) AS remaining,
      MIN(e.expiry_date) AS nearest_expiry,
      MIN(e.start_date) AS first_start,
      (SELECT g.phone FROM guardians g JOIN member_guardians mg ON mg.guardian_id=g.id
        WHERE mg.member_id=m.id AND g.phone IS NOT NULL LIMIT 1) AS phone,
      (SELECT g.name FROM guardians g JOIN member_guardians mg ON mg.guardian_id=g.id
        WHERE mg.member_id=m.id LIMIT 1) AS guardian_name,
      (SELECT MAX(b.date) FROM bookings b WHERE b.member_id=m.id AND b.status='attended') AS last_attended
    FROM members m
    JOIN enrollments e ON e.member_id=m.id AND e.status='active'
    JOIN (SELECT enrollment_id, COALESCE(SUM(delta),0) AS remaining FROM credit_ledger GROUP BY enrollment_id) r
      ON r.enrollment_id=e.id
    WHERE m.status='Active'
    GROUP BY m.id`).all();

  const lowCredit = memberRows.filter((m) => m.remaining > 0 && m.remaining <= threshold);
  const expiring = memberRows.filter((m) => m.remaining > 0 && m.nearest_expiry <= addDays(today, 30));
  // สมาชิกใหม่ที่เพิ่งซื้อคอร์สยังไม่นับว่า "หาย" — เริ่มนับ 14 วันจากวันเริ่มคอร์ส
  const cutoff = addDays(today, -14);
  const absent = memberRows.filter((m) => m.remaining > 0
    && (m.last_attended ? m.last_attended <= cutoff : m.first_start <= cutoff));

  const total = followups.length + lowCredit.length + expiring.length + absent.length;

  const MemberRow = ({ m, extra }) => (
    <div className="call-row">
      <div className="call-who">
        <Link href={`/members/${m.id}`}><strong>{m.nickname}</strong> ({m.id})</Link>
        <span className="sub">{m.guardian_name}{m.phone && <> · <a href={`tel:${m.phone}`}>{m.phone}</a></>}</span>
      </div>
      <div className="call-why">{extra}</div>
      <details className="chip-more">
        <summary>บันทึกผลคุย</summary>
        <form action={addContactLog} className="stack" style={{ marginTop: 6 }}>
          <input type="hidden" name="member_id" value={m.id} />
          <select name="channel"><option>โทร</option><option>LINE</option><option>หน้าร้าน</option></select>
          <input name="note" placeholder="คุยแล้วว่ายังไง" required />
          <button className="btn small">บันทึก</button>
        </form>
      </details>
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>วันนี้ต้องคุยกับใคร</h1>
          <div className="sub">{today} · รวม {total} รายการ</div>
        </div>
      </div>

      {total === 0 && <div className="card">วันนี้ไม่มีงานติดตามค้าง 🎉</div>}

      {followups.length > 0 && (
        <div className="card section">
          <h2>ตามต่อ lead ({followups.length})</h2>
          {followups.map((f) => (
            <div key={f.id} className="call-row">
              <div className="call-who">
                <strong>{f.contact_name}</strong>
                <span className="sub">{f.child_name ?? '-'}{f.phone && <> · <a href={`tel:${f.phone}`}>{f.phone}</a></>}</span>
              </div>
              <div className="call-why">
                <span className={`pill ${f.due_date < today ? 'red' : 'amber'}`}>
                  ตามต่อรอบ {f.round}{f.due_date < today ? ` · เลยกำหนด (${f.due_date})` : ''}
                </span>
                {f.reason && <span className="sub"> เหตุผลเดิม: {f.reason}</span>}
              </div>
              <details className="chip-more">
                <summary>บันทึกผล</summary>
                <form action={completeFollowup} className="stack" style={{ marginTop: 6 }}>
                  <input type="hidden" name="followup_id" value={f.id} />
                  <select name="result">
                    <option>ติดต่อแล้ว</option>
                    <option>ยังไม่ซื้อ</option>
                    <option>ซื้อแล้ว</option>
                    <option>ติดต่อไม่ได้</option>
                  </select>
                  <button className="btn small">บันทึก</button>
                </form>
              </details>
            </div>
          ))}
        </div>
      )}

      {lowCredit.length > 0 && (
        <div className="card section">
          <h2>ครั้งใกล้หมด — ชวนต่อคอร์ส ({lowCredit.length})</h2>
          {lowCredit.map((m) => (
            <MemberRow key={m.id} m={m}
              extra={<><span className="pill red">เหลือ {m.remaining} ครั้ง</span> <Link className="btn small ghost" href={`/pos?member=${m.id}`}>ต่อคอร์ส</Link></>} />
          ))}
        </div>
      )}

      {expiring.length > 0 && (
        <div className="card section">
          <h2>คอร์สหมดอายุใน 30 วัน ({expiring.length})</h2>
          {expiring.map((m) => (
            <MemberRow key={m.id} m={m}
              extra={<span className="pill amber">หมดอายุ {m.nearest_expiry} · เหลือ {m.remaining} ครั้ง</span>} />
          ))}
        </div>
      )}

      {absent.length > 0 && (
        <div className="card section">
          <h2>หายไปเกิน 14 วัน — ชวนกลับมาเทรน ({absent.length})</h2>
          {absent.map((m) => (
            <MemberRow key={m.id} m={m}
              extra={<span className="pill grey">{m.last_attended ? `มาล่าสุด ${m.last_attended}` : 'ยังไม่เคยเข้าเทรน'}</span>} />
          ))}
        </div>
      )}
    </>
  );
}
