import Link from 'next/link';
import { getDb, todayStr } from '@/lib/db';

const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ปฏิทินรายเดือน: กดวันเพื่อดูตารางเทรนวันนั้น ตัวเลขใต้วัน = จำนวน booking
export default function MonthCalendar({ selected, month, basePath }) {
  const db = getDb();
  const counts = new Map(db.prepare(`
    SELECT date, COUNT(*) AS n FROM bookings
    WHERE substr(date,1,7)=? AND status IN ('booked','attended') GROUP BY date`)
    .all(month).map((r) => [r.date, r.n]));

  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = new Date(y, m - 1, 1).getDay();
  const today = todayStr();

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);

  return (
    <div className="card cal">
      <div className="cal-head">
        <Link href={`${basePath}?date=${selected}&cal=${shiftMonth(month, -1)}`} aria-label="เดือนก่อนหน้า">‹</Link>
        <b>{TH_MONTHS[m - 1]} {y + 543}</b>
        <Link href={`${basePath}?date=${selected}&cal=${shiftMonth(month, 1)}`} aria-label="เดือนถัดไป">›</Link>
      </div>
      <div className="cal-grid">
        {TH_DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {cells.map((d, i) => d === null ? <div key={`e${i}`} /> : (
          <Link key={d} href={`${basePath}?date=${d}`}
            className={`cal-day${d === selected ? ' sel' : ''}${d === today ? ' today' : ''}`}>
            <span className="cal-num">{Number(d.slice(8))}</span>
            <span className="cal-n">{counts.get(d) ?? ''}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
