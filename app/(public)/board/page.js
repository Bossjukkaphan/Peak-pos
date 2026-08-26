import Link from 'next/link';
import { getDb, todayStr, addDays } from '@/lib/db';
import MonthCalendar from '@/components/MonthCalendar';
import ScheduleGrid from '@/components/ScheduleGrid';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Peak · บอร์ดตารางเทรนโค้ช' };

// บอร์ดสำหรับโค้ช: ดูตารางสอนอย่างเดียว ไม่มีข้อมูลคอร์ส/ยอดขาย/รายได้
export default async function Board({ searchParams }) {
  const sp = await searchParams;
  const db = getDb();
  const date = sp?.date ?? todayStr();
  const month = sp?.cal ?? date.slice(0, 7);
  const total = db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE date=? AND status!='cancelled'").get(date).n;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>ตารางเทรนโค้ช</h1>
          <div className="sub">{date} · {total} booking (กดวันในปฏิทินเพื่อดูวันอื่น)</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn ghost" href={`/board?date=${addDays(date, -1)}`}>← ก่อนหน้า</Link>
          <Link className="btn ghost" href={`/board?date=${todayStr()}`}>วันนี้</Link>
          <Link className="btn ghost" href={`/board?date=${addDays(date, 1)}`}>ถัดไป →</Link>
        </div>
      </div>

      <div className="with-cal">
        <MonthCalendar selected={date} month={month} basePath="/board" />
        <ScheduleGrid date={date} />
      </div>
    </>
  );
}
