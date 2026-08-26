import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import PrintButton from '@/components/PrintButton';

export const dynamic = 'force-dynamic';

export default async function Receipt({ params }) {
  const { no } = await params;
  const db = getDb();
  const p = db.prepare(`
    SELECT p.*, e.member_id, e.start_date, e.expiry_date, e.bonus_sessions,
           c.name AS course_name, c.sessions,
           m.nickname, m.full_name,
           (SELECT g.name FROM guardians g JOIN member_guardians mg ON mg.guardian_id=g.id WHERE mg.member_id=m.id LIMIT 1) AS guardian_name
    FROM payments p
    JOIN enrollments e ON e.id=p.enrollment_id
    JOIN courses c ON c.id=e.course_id
    JOIN members m ON m.id=e.member_id
    WHERE p.receipt_no=?`).get(no);
  if (!p) notFound();

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <Link className="btn ghost" href={`/members/${p.member_id}`}>← โปรไฟล์สมาชิก</Link>
      </div>

      <div className="card" id="receipt">
        <div style={{ textAlign: 'center', borderBottom: '1px solid var(--line)', paddingBottom: 12, marginBottom: 12 }}>
          <h1 style={{ marginBottom: 0 }}>Peak Gym</h1>
          <div className="muted">ใบเสร็จรับเงิน / Receipt</div>
        </div>
        <div className="tbl"><table><tbody>
          <tr><td className="muted">เลขที่ใบเสร็จ</td><td><b>{p.receipt_no}</b></td></tr>
          <tr><td className="muted">วันที่</td><td>{p.paid_at}</td></tr>
          <tr><td className="muted">สมาชิก</td><td>{p.nickname} ({p.member_id}) {p.full_name ? `· ${p.full_name}` : ''}</td></tr>
          {p.guardian_name && <tr><td className="muted">ผู้ปกครอง</td><td>{p.guardian_name}</td></tr>}
          <tr><td className="muted">รายการ</td><td>{p.course_name}{p.bonus_sessions > 0 ? ` (แถม ${p.bonus_sessions} ครั้ง)` : ''}</td></tr>
          <tr><td className="muted">ระยะเวลาคอร์ส</td><td>{p.start_date} ถึง {p.expiry_date}</td></tr>
          <tr><td className="muted">ช่องทางชำระ</td><td>{p.method}</td></tr>
          {p.note && <tr><td className="muted">หมายเหตุ</td><td>{p.note}</td></tr>}
        </tbody></table></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '2px solid var(--ink)', marginTop: 12, paddingTop: 10 }}>
          <b>ยอดชำระรวม</b>
          <span style={{ fontFamily: 'Mitr, Anuphan, sans-serif', fontSize: '1.5rem', fontWeight: 600 }}>
            {p.amount.toLocaleString()} บาท
          </span>
        </div>
        <p className="muted" style={{ fontSize: '.8rem', marginTop: 14, textAlign: 'center' }}>
          ขอบคุณที่ไว้วางใจ Peak Gym · เอกสารนี้ออกโดยระบบ Peak POS
        </p>
      </div>

      <div className="no-print" style={{ marginTop: 14, textAlign: 'center' }}>
        <PrintButton />
      </div>
    </div>
  );
}
