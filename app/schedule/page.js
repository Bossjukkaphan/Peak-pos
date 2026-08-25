import Link from 'next/link';
import { getDb, getSetting, todayStr, addDays } from '../../src/lib/db';
import { createBooking, checkIn, markNoShow, cancelBooking } from '../../src/lib/actions';

export const dynamic = 'force-dynamic';

const SLOTS = [];
for (let h = 9; h <= 18; h++) {
  SLOTS.push(`${String(h).padStart(2, '0')}:00`);
  if (h < 18) SLOTS.push(`${String(h).padStart(2, '0')}:30`);
}

const TYPE_LABEL = { train: 'เทรน', trial: 'ทดลอง', consult: 'Consult', measure: 'วัดตัว' };

export default async function Schedule({ searchParams }) {
  const sp = await searchParams;
  const db = getDb();
  const date = sp?.date ?? todayStr();
  const threshold = Number(getSetting('low_credit_threshold', '6'));

  const coaches = db.prepare('SELECT * FROM coaches WHERE active=1 ORDER BY id').all();
  const members = db.prepare("SELECT id, nickname FROM members WHERE status='Active' ORDER BY id").all();
  const leads = db.prepare("SELECT id, contact_name, child_name FROM leads WHERE status IN ('new','scheduled') ORDER BY id DESC").all();

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

  const attended = bookings.filter((b) => b.status === 'attended').length;
  const cols = `90px repeat(${coaches.length || 1}, minmax(170px, 1fr))`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>ตารางเทรน</h1>
          <div className="sub">{date} · เทรนแล้ว {attended} คน จาก {bookings.filter((b) => b.status !== 'cancelled').length} booking</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn ghost" href={`/schedule?date=${addDays(date, -1)}`}>← ก่อนหน้า</Link>
          <Link className="btn ghost" href={`/schedule?date=${todayStr()}`}>วันนี้</Link>
          <Link className="btn ghost" href={`/schedule?date=${addDays(date, 1)}`}>ถัดไป →</Link>
        </div>
      </div>

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
                      const low = b.member_id && b.remaining <= threshold;
                      const who = b.member_id
                        ? `${b.member_nick} (${b.member_id})`
                        : `${b.contact_name ?? ''} ${b.child_name ?? ''}`.trim() || 'ไม่ระบุ';
                      return (
                        <div key={b.id} className={`booking-chip ${b.status}${low ? ' low' : ''}`}>
                          <div className="who">{who}</div>
                          <div className="meta">
                            <span className="pill grey">{TYPE_LABEL[b.type] ?? b.type}</span>
                            {b.member_id && (
                              <span className={`count${low ? ' low' : ''}`}>ใช้ไป {b.total - b.remaining}/{b.total}</span>
                            )}
                            {b.status === 'attended' && <span className="pill green">มาแล้ว</span>}
                            {b.status === 'no_show' && <span className="pill red">ไม่มา</span>}
                            {b.status === 'cancelled' && <span className="pill grey">ยกเลิก</span>}
                          </div>
                          {b.status === 'booked' && (
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

      <div className="card section">
        <h2>เพิ่ม Booking</h2>
        <form action={createBooking} className="stack">
          <div className="form-row">
            <div className="field">
              <label htmlFor="bk-date">วันที่</label>
              <input id="bk-date" type="date" name="date" defaultValue={date} required />
            </div>
            <div className="field">
              <label htmlFor="bk-time">เวลา</label>
              <select id="bk-time" name="time" required>
                {SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="bk-coach">โค้ช</label>
              <select id="bk-coach" name="coach_id" required>
                {coaches.map((c) => <option key={c.id} value={c.id}>โค้ช{c.nickname}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="bk-type">ประเภท</label>
              <select id="bk-type" name="type">
                <option value="train">เทรนปกติ</option>
                <option value="trial">ทดลองเรียน</option>
                <option value="consult">Consult</option>
                <option value="measure">วัดตัว</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="bk-member">สมาชิก (สำหรับเทรน/วัดตัว)</label>
              <select id="bk-member" name="member_id" defaultValue="">
                <option value="">— ไม่ระบุ —</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.nickname} ({m.id})</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="bk-lead">Lead (สำหรับทดลอง/Consult)</label>
              <select id="bk-lead" name="lead_id" defaultValue="">
                <option value="">— ไม่ระบุ —</option>
                {leads.map((l) => <option key={l.id} value={l.id}>{l.contact_name} · {l.child_name ?? '-'}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="bk-note">หมายเหตุ</label>
              <input id="bk-note" name="note" placeholder="เช่น ขอโค้ชผู้หญิง" />
            </div>
          </div>
          <div><button className="btn">บันทึก Booking</button></div>
        </form>
      </div>
    </>
  );
}
