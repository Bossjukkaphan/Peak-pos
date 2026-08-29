import Link from 'next/link';
import { getDb, getSetting, todayStr, addDays, nowSlotStr } from '@/lib/db';
import { checkIn, walkInCheckIn } from '@/lib/actions';
import { SLOTS } from '@/components/ScheduleGrid';

export const dynamic = 'force-dynamic';

// การ์ดเด็ก: ทุกอย่างที่แอดมินหน้าประตูต้องรู้/ทำ อยู่ในใบเดียว — เช็คอิน, ครั้งเหลือ,
// ข้อระวัง, เบอร์ผู้ปกครอง, ต่อคอร์ส · ค้นได้จากชื่อเด็ก/รหัส/ชื่อ-เบอร์ผู้ปกครอง/lead
export default async function Find({ searchParams }) {
  const sp = await searchParams;
  const q = (sp?.q ?? '').trim();
  const db = getDb();
  const today = todayStr();
  const threshold = Number(getSetting('low_credit_threshold', '6'));
  const like = `%${q}%`;

  const members = q
    ? db.prepare(`
        SELECT DISTINCT m.* FROM members m
        LEFT JOIN member_guardians mg ON mg.member_id = m.id
        LEFT JOIN guardians g ON g.id = mg.guardian_id
        WHERE m.id LIKE ? OR m.nickname LIKE ? OR m.full_name LIKE ?
           OR g.name LIKE ? OR g.phone LIKE ?
        ORDER BY m.status='Active' DESC, m.id LIMIT 12`).all(like, like, like, like, like)
    : [];

  const leads = q
    ? db.prepare(`SELECT * FROM leads
        WHERE member_id IS NULL AND (contact_name LIKE ? OR child_name LIKE ? OR phone LIKE ?)
        ORDER BY id DESC LIMIT 8`).all(like, like, like)
    : [];

  const coaches = db.prepare('SELECT * FROM coaches WHERE active=1 ORDER BY id').all();
  const offIds = new Set(db.prepare('SELECT coach_id FROM coach_days_off WHERE date=?').all(today).map((r) => r.coach_id));
  const availableCoaches = coaches.filter((c) => !offIds.has(c.id));

  const enrollStmt = db.prepare(`
    SELECT e.*, c.name AS course_name,
      (SELECT COALESCE(SUM(delta),0) FROM credit_ledger WHERE enrollment_id=e.id) AS remaining
    FROM enrollments e JOIN courses c ON c.id=e.course_id
    WHERE e.member_id=? AND e.status='active' ORDER BY e.start_date, e.id`);
  const guardianStmt = db.prepare(`
    SELECT g.* FROM guardians g JOIN member_guardians mg ON mg.guardian_id=g.id
    WHERE mg.member_id=? LIMIT 2`);
  const todayBookingStmt = db.prepare(`
    SELECT * FROM bookings WHERE member_id=? AND date=? AND status IN ('booked','waitlist','attended')
    ORDER BY time`);
  const nextBookingStmt = db.prepare(`
    SELECT * FROM bookings WHERE member_id=? AND date>? AND status='booked'
    ORDER BY date, time LIMIT 1`);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>ค้นหา</h1>
          <div className="sub">{q ? `ผลค้นหา "${q}"` : 'พิมพ์ชื่อเด็ก รหัส PL หรือชื่อ/เบอร์ผู้ปกครอง'}</div>
        </div>
      </div>

      <form action="/find" className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <div className="field" style={{ flex: 1 }}>
            <input type="search" name="q" defaultValue={q} autoFocus
              placeholder="เช่น ออม, PL001, 0906659230, คุณนุ่ม" aria-label="คำค้นหา" />
          </div>
          <div><button className="btn">ค้นหา</button></div>
        </div>
      </form>

      {sp?.err === 'nocredit' && (
        <div className="card notice danger">เช็คอินไม่สำเร็จ — ครั้งคงเหลือหมดหรือคอร์สหมดอายุ ชวนผู้ปกครองต่อคอร์สได้เลย</div>
      )}
      {sp?.msg === 'checked' && <div className="card notice">เช็คอินเรียบร้อย ✓</div>}

      {q && members.length === 0 && leads.length === 0 && (
        <div className="card">ไม่พบสมาชิกหรือ lead ที่ตรงกับ "{q}" — <Link href="/members/new">สมัครสมาชิกใหม่</Link> หรือ <Link href="/trials">บันทึก lead</Link></div>
      )}

      {members.map((m) => {
        const enrolls = enrollStmt.all(m.id);
        const remaining = enrolls.reduce((sum, e) => sum + e.remaining, 0);
        const nearestExpiry = enrolls.length ? enrolls.reduce((a, e) => (e.expiry_date < a ? e.expiry_date : a), enrolls[0].expiry_date) : null;
        const expiringSoon = nearestExpiry && nearestExpiry <= addDays(today, 30);
        const low = remaining <= threshold;
        const guardians = guardianStmt.all(m.id);
        const todayBookings = todayBookingStmt.all(m.id, today);
        const next = nextBookingStmt.get(m.id, today);
        const bookedNow = todayBookings.find((b) => b.status === 'booked');
        const attendedToday = todayBookings.find((b) => b.status === 'attended');

        return (
          <div key={m.id} className={`card kid-card${low || expiringSoon ? ' alert' : ''}`}>
            <div className="kid-head">
              <div>
                <Link href={`/members/${m.id}`} className="kid-name">{m.nickname} <span className="sub">({m.id})</span></Link>
                {m.status !== 'Active' && <span className="pill grey">Inactive</span>}
                {m.full_name && <div className="sub">{m.full_name}{m.school ? ` · ${m.school}` : ''}{m.grade ? ` ${m.grade}` : ''}</div>}
              </div>
              <div className="kid-badges">
                <span className={`pill ${low ? 'red' : 'green'}`}>เหลือ {remaining} ครั้ง</span>
                {nearestExpiry && <span className={`pill ${expiringSoon ? 'red' : 'grey'}`}>หมดอายุ {nearestExpiry}</span>}
                {enrolls.length === 0 && <span className="pill amber">ไม่มีคอร์ส active</span>}
              </div>
            </div>

            {(m.caution || m.medical) && (
              <div className="kid-caution">
                ⚠️ {[m.caution, m.medical].filter((x) => x && x !== 'ไม่มี').join(' · ') || '—'}
              </div>
            )}

            <div className="kid-meta">
              {guardians.map((g) => (
                <span key={g.id}>
                  {g.relationship ?? 'ผู้ปกครอง'} {g.name}
                  {g.phone && <> · <a href={`tel:${g.phone}`}>{g.phone}</a></>}
                </span>
              ))}
              {attendedToday && <span className="pill green">เช็คอินวันนี้แล้ว {attendedToday.time}</span>}
              {!attendedToday && next && !bookedNow && <span>นัดถัดไป {next.date} {next.time}</span>}
            </div>

            <div className="kid-actions">
              {bookedNow ? (
                <form action={checkIn} className="inline-form">
                  <input type="hidden" name="booking_id" value={bookedNow.id} />
                  <button className="btn">เช็คอินนัด {bookedNow.time}</button>
                </form>
              ) : !attendedToday && m.status === 'Active' && (
                <form action={walkInCheckIn} className="inline-form walkin">
                  <input type="hidden" name="member_id" value={m.id} />
                  <select name="coach_id" required aria-label="โค้ช">
                    {availableCoaches.map((c) => <option key={c.id} value={c.id}>โค้ช{c.nickname}</option>)}
                  </select>
                  <select name="time" defaultValue={nowSlotStr() <= '18:30' && nowSlotStr() >= '09:00' ? nowSlotStr() : '09:00'} aria-label="เวลา">
                    {SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button className="btn">เช็คอิน walk-in</button>
                </form>
              )}
              <Link className="btn ghost" href={`/pos?member=${m.id}`}>{enrolls.length ? 'ต่อคอร์ส' : 'ขายคอร์ส'}</Link>
              <Link className="btn ghost" href={`/members/${m.id}`}>โปรไฟล์เต็ม</Link>
            </div>
          </div>
        );
      })}

      {leads.length > 0 && (
        <div className="card">
          <h2>Lead ที่ตรงกับคำค้น</h2>
          {leads.map((l) => (
            <div key={l.id} className="kid-meta" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <strong>{l.contact_name}</strong>
              <span>{l.child_name ?? '-'}{l.child_age ? ` (${l.child_age} ขวบ)` : ''}</span>
              {l.phone && <a href={`tel:${l.phone}`}>{l.phone}</a>}
              <span className="pill grey">{l.status}</span>
              <Link href="/trials">ไปหน้า Trial →</Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
