import Link from 'next/link';
import { getDb, todayStr, addDays } from '@/lib/db';
import { createBooking } from '@/lib/actions';
import MonthCalendar from '@/components/MonthCalendar';
import ScheduleGrid, { SLOTS, END_SLOTS } from '@/components/ScheduleGrid';

export const dynamic = 'force-dynamic';

export default async function Schedule({ searchParams }) {
  const sp = await searchParams;
  const db = getDb();
  const date = sp?.date ?? todayStr();
  const month = sp?.cal ?? date.slice(0, 7);

  const coaches = db.prepare('SELECT * FROM coaches WHERE active=1 ORDER BY id').all();
  const members = db.prepare("SELECT id, nickname FROM members WHERE status='Active' ORDER BY id").all();
  const leads = db.prepare("SELECT id, contact_name, child_name FROM leads WHERE status IN ('new','scheduled') ORDER BY id DESC").all();
  const dayStats = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='attended' THEN 1 ELSE 0 END) AS attended
    FROM bookings WHERE date=? AND status!='cancelled'`).get(date);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>ตารางเทรน</h1>
          <div className="sub">{date} · เทรนแล้ว {dayStats.attended ?? 0} คน จาก {dayStats.total} booking</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn ghost" href={`/schedule?date=${addDays(date, -1)}`}>← ก่อนหน้า</Link>
          <Link className="btn ghost" href={`/schedule?date=${todayStr()}`}>วันนี้</Link>
          <Link className="btn ghost" href={`/schedule?date=${addDays(date, 1)}`}>ถัดไป →</Link>
        </div>
      </div>

      <div className="with-cal">
        <MonthCalendar selected={date} month={month} basePath="/schedule" />
        <ScheduleGrid date={date} admin />
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
              <label htmlFor="bk-time">เวลาเริ่ม</label>
              <select id="bk-time" name="time" required>
                {SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="bk-end">เวลาจบ</label>
              <select id="bk-end" name="end_time" defaultValue="">
                <option value="">อัตโนมัติ (เริ่ม + 1 ชม.)</option>
                {END_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
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
