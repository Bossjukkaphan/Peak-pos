import Link from 'next/link';
import { getDb, getSetting } from '../../src/lib/db';

export const dynamic = 'force-dynamic';

export default async function Members({ searchParams }) {
  const sp = await searchParams;
  const db = getDb();
  const q = (sp?.q ?? '').trim();
  const threshold = Number(getSetting('low_credit_threshold', '6'));

  const rows = db.prepare(`
    SELECT m.*,
      (SELECT COALESCE(SUM(delta),0) FROM credit_ledger cl JOIN enrollments e ON e.id=cl.enrollment_id
        WHERE e.member_id=m.id AND e.status='active') AS remaining,
      (SELECT g.phone FROM guardians g JOIN member_guardians mg ON mg.guardian_id=g.id WHERE mg.member_id=m.id LIMIT 1) AS phone
    FROM members m
    WHERE (? = '' OR m.id LIKE '%'||?||'%' OR m.nickname LIKE '%'||?||'%' OR COALESCE(m.full_name,'') LIKE '%'||?||'%')
    ORDER BY m.id`).all(q, q, q, q);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>สมาชิก</h1>
          <div className="sub">{rows.length} คน</div>
        </div>
        <Link className="btn" href="/members/new">+ สมัครสมาชิกใหม่</Link>
      </div>

      <form className="card" style={{ marginBottom: 14 }}>
        <div className="form-row">
          <input name="q" defaultValue={q} placeholder="ค้นหาด้วยรหัส / ชื่อเล่น / ชื่อจริง" aria-label="ค้นหาสมาชิก" />
          <div><button className="btn">ค้นหา</button></div>
        </div>
      </form>

      <div className="card tbl">
        <table>
          <thead>
            <tr><th>รหัส</th><th>ชื่อเล่น</th><th>ชื่อ-นามสกุล</th><th>กลุ่ม</th><th className="num">ครั้งคงเหลือ</th><th>เบอร์ผู้ปกครอง</th><th>ช่องทาง</th><th>สถานะ</th></tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td><Link href={`/members/${m.id}`}>{m.id}</Link></td>
                <td><Link href={`/members/${m.id}`}>{m.nickname}</Link></td>
                <td>{m.full_name ?? <span className="muted">ยังไม่กรอก</span>}</td>
                <td><span className="pill grey">{m.segment}</span></td>
                <td className="num">
                  <span className={`pill ${m.remaining <= threshold ? 'red' : 'green'}`}>{m.remaining} ครั้ง</span>
                </td>
                <td>{m.phone ?? '-'}</td>
                <td>{m.channel ?? '-'}</td>
                <td><span className={`pill ${m.status === 'Active' ? 'green' : 'grey'}`}>{m.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
