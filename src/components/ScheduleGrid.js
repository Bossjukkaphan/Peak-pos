import { getDb, getSetting } from '@/lib/db';
import { checkIn, markNoShow, cancelBooking } from '@/lib/actions';

export const SLOTS = [];
for (let h = 9; h <= 18; h++) {
  SLOTS.push(`${String(h).padStart(2, '0')}:00`);
  if (h < 18) SLOTS.push(`${String(h).padStart(2, '0')}:30`);
}
// ตัวเลือกเวลาจบ: เลื่อนจากเวลาเริ่ม 30 นาที ไปจนถึง 19:00
export const END_SLOTS = [...SLOTS.slice(1), '18:30', '19:00'].filter((v, i, a) => a.indexOf(v) === i);

const TYPE_LABEL = { train: 'เทรน', trial: 'ทดลอง', consult: 'Consult', measure: 'วัดตัว' };

// ตารางเทรนรายวัน — admin=true แสดงครั้งคงเหลือ + ปุ่มเช็คอิน/ไม่มา/ยกเลิก
// admin=false (บอร์ดโค้ช) แสดงเฉพาะชื่อ เวลา ประเภท สถานะ ไม่มีข้อมูลคอร์ส/การเงิน
export default function ScheduleGrid({ date, admin = false }) {
  const db = getDb();
  const threshold = Number(getSetting('low_credit_threshold', '6'));
  const coaches = db.prepare('SELECT * FROM coaches WHERE active=1 ORDER BY id').all();

  const bookings = db.prepare(`
    SELECT b.*, m.nickname AS member_nick, l.contact_name, l.child_name,
      (SELECT COALESCE(SUM(delta),0) FROM credit_ledger cl JOIN enrollments e ON e.id=cl.enrollment_id
        WHERE e.member_id=b.member_id AND e.status IN ('active','finished')) AS remaining,
      (SELECT COALESCE(SUM(CASE WHEN delta>0 THEN delta ELSE 0 END),0) FROM credit_ledger cl JOIN enrollments e ON e.id=cl.enrollment_id
        WHERE e.member_id=b.member_id AND e.status IN ('active','finished')) AS total
    FROM bookings b
    LEFT JOIN members m ON m.id=b.member_id
    LEFT JOIN leads l ON l.id=b.lead_id
    WHERE b.date=? ORDER BY b.time, b.id`).all(date);

  const cell = new Map();
  for (const b of bookings) {
    const key = `${b.time}|${b.coach_id ?? 0}`;
    if (!cell.has(key)) cell.set(key, []);
    cell.get(key).push(b);
  }

  const cols = `90px repeat(${coaches.length || 1}, minmax(170px, 1fr))`;

  return (
    <div className="tbl">
      <div className="schedule" style={{ minWidth: 120 + coaches.length * 180 }}>
        <div className="schedule-row head" style={{ gridTemplateColumns: cols }}>
          <div className="slot-time">เวลา</div>
          {coaches.map((c) => <div key={c.id} className="slot-cell" style={{ justifyContent: 'center' }}>โค้ช{c.nickname}</div>)}
        </div>
        {SLOTS.map((t) => (
          <div key={t} className="schedule-row" style={{ gridTemplateColumns: cols }}>
            <div className="slot-time">{t}</div>
            {coaches.map((c) => {
              const items = cell.get(`${t}|${c.id}`) ?? [];
              return (
                <div key={c.id} className="slot-cell">
                  {items.map((b) => {
                    const low = admin && b.member_id && b.remaining <= threshold;
                    const who = b.member_id
                      ? (admin ? `${b.member_nick} (${b.member_id})` : b.member_nick)
                      : `${b.contact_name ?? ''} ${b.child_name ?? ''}`.trim() || 'ไม่ระบุ';
                    return (
                      <div key={b.id} className={`booking-chip ${b.status}${low ? ' low' : ''}`}>
                        <div className="who">{who}</div>
                        <div className="meta">
                          <span>{b.end_time ? `${b.time}–${b.end_time}` : b.time}</span>
                          <span className="pill grey">{TYPE_LABEL[b.type] ?? b.type}</span>
                          {admin && b.member_id && (
                            <span className={`count${low ? ' low' : ''}`}>ใช้ไป {b.total - b.remaining}/{b.total}</span>
                          )}
                          {b.status === 'attended' && <span className="pill green">มาแล้ว</span>}
                          {b.status === 'no_show' && <span className="pill red">ไม่มา</span>}
                          {b.status === 'cancelled' && <span className="pill grey">ยกเลิก</span>}
                        </div>
                        {admin && b.status === 'booked' && (
                          <div className="chip-actions">
                            <form action={checkIn} className="inline-form">
                              <input type="hidden" name="booking_id" value={b.id} />
                              <button className="btn small">เช็คอิน</button>
                            </form>
                            <form action={markNoShow} className="inline-form">
                              <input type="hidden" name="booking_id" value={b.id} />
                              <button className="btn small danger">ไม่มา</button>
                            </form>
                            <form action={cancelBooking} className="inline-form">
                              <input type="hidden" name="booking_id" value={b.id} />
                              <button className="btn small ghost">ยกเลิก</button>
                            </form>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
