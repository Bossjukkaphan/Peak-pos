import { getDb, todayStr } from '@/lib/db';
import { addCoach, updateCoachRate, addDayOff, removeDayOff } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default function Coaches() {
  const db = getDb();
  const month = todayStr().slice(0, 7);
  const coaches = db.prepare(`
    SELECT co.*,
      (SELECT COUNT(*) FROM bookings b WHERE b.coach_id=co.id AND b.status='attended' AND substr(b.date,1,7)=?) AS month_sessions,
      (SELECT COUNT(*) FROM enrollments e WHERE e.coach_id=co.id AND e.status='active') AS active_students
    FROM coaches co WHERE co.active=1 ORDER BY co.id`).all(month);

  const daily = db.prepare(`
    SELECT b.date, co.nickname, COUNT(*) AS n
    FROM bookings b JOIN coaches co ON co.id=b.coach_id
    WHERE b.status='attended' AND substr(b.date,1,7)=?
    GROUP BY b.date, co.id ORDER BY b.date DESC`).all(month);

  const byDate = new Map();
  for (const row of daily) {
    if (!byDate.has(row.date)) byDate.set(row.date, {});
    byDate.get(row.date)[row.nickname] = row.n;
  }

  const totalCommission = coaches.reduce((s, c) => s + c.month_sessions * c.rate, 0);

  const daysOff = db.prepare(`
    SELECT d.*, co.nickname FROM coach_days_off d JOIN coaches co ON co.id=d.coach_id
    WHERE d.date >= ? ORDER BY d.date, co.id LIMIT 30`).all(todayStr());

  return (
    <>
      <div className="page-head">
        <div>
          <h1>โค้ช</h1>
          <div className="sub">สรุปจำนวนเทรนและค่าเทรนเดือน {month} · รวม {totalCommission.toLocaleString()}฿</div>
        </div>
      </div>

      <div className="card tbl">
        <table>
          <thead><tr><th>โค้ช</th><th>ชื่อเล่น</th><th className="num">เรทต่อครั้ง</th><th className="num">คอร์สที่ดูแล</th><th className="num">เทรนเดือนนี้</th><th className="num">ค่าเทรนเดือนนี้</th></tr></thead>
          <tbody>
            {coaches.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.nickname}</td>
                <td className="num">
                  <form action={updateCoachRate} className="inline-form" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    <input type="hidden" name="coach_id" value={c.id} />
                    <input type="number" name="rate" defaultValue={c.rate} min="0" style={{ width: 70, textAlign: 'right' }} aria-label={`เรทของโค้ช${c.nickname}`} />
                    <span>฿</span>
                    <button className="btn small ghost">บันทึก</button>
                  </form>
                </td>
                <td className="num">{c.active_students}</td>
                <td className="num">{c.month_sessions}</td>
                <td className="num"><b>{(c.month_sessions * c.rate).toLocaleString()}฿</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid cols-2 section">
        <div className="card">
          <h2>จำนวนเทรนรายวัน (เดือนนี้)</h2>
          {byDate.size === 0 ? <p className="muted">ยังไม่มีการเทรนที่เช็คอินในเดือนนี้</p> : (
            <div className="tbl"><table>
              <thead><tr><th>วันที่</th>{coaches.map((c) => <th key={c.id} className="num">{c.nickname}</th>)}<th className="num">รวม</th></tr></thead>
              <tbody>
                {[...byDate.entries()].map(([date, counts]) => {
                  const total = Object.values(counts).reduce((a, b) => a + b, 0);
                  return (
                    <tr key={date}>
                      <td>{date}</td>
                      {coaches.map((c) => <td key={c.id} className="num">{counts[c.nickname] ?? '-'}</td>)}
                      <td className="num"><b>{total}</b></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </div>

        <div className="card">
          <h2>วันหยุดโค้ช</h2>
          <form action={addDayOff} className="inline-form" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <select name="coach_id" required aria-label="เลือกโค้ช">
              {coaches.map((c) => <option key={c.id} value={c.id}>โค้ช{c.nickname}</option>)}
            </select>
            <input type="date" name="date" required min={todayStr()} aria-label="วันที่หยุด" />
            <button className="btn small">บันทึกวันหยุด</button>
          </form>
          {daysOff.length === 0 ? <p className="muted">ไม่มีวันหยุดที่แจ้งไว้</p> : (
            <div className="tbl"><table>
              <thead><tr><th>วันที่</th><th>โค้ช</th><th></th></tr></thead>
              <tbody>
                {daysOff.map((d) => (
                  <tr key={d.id}>
                    <td>{d.date}</td>
                    <td>โค้ช{d.nickname}</td>
                    <td>
                      <form action={removeDayOff} className="inline-form">
                        <input type="hidden" name="dayoff_id" value={d.id} />
                        <button className="btn small danger">ลบ</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          <p className="muted" style={{ fontSize: '.82rem', marginTop: 8 }}>วันหยุดจะขึ้นเตือนบนตารางเทรนและบอร์ดโค้ชอัตโนมัติ</p>
        </div>
      </div>

      <div className="grid cols-2 section">
        <div className="card">
          <h2>เพิ่มโค้ช</h2>
          <form action={addCoach} className="stack">
            <div className="form-row">
              <div className="field"><label htmlFor="co-name">ชื่อ *</label><input id="co-name" name="name" required placeholder="โค้ชสมชาย" /></div>
              <div className="field"><label htmlFor="co-nick">ชื่อเล่น *</label><input id="co-nick" name="nickname" required /></div>
              <div className="field"><label htmlFor="co-rate">เรทต่อครั้ง (บาท) *</label><input id="co-rate" type="number" name="rate" min="0" required /></div>
            </div>
            <div><button className="btn">เพิ่มโค้ช</button></div>
          </form>
          <p className="muted" style={{ fontSize: '.85rem', marginTop: 10 }}>
            ค่าเทรนคิดจาก booking ที่เช็คอินแล้วเท่านั้น (สถานะ "มาแล้ว") — จองแต่ไม่มาไม่นับ
          </p>
        </div>
      </div>
    </>
  );
}
