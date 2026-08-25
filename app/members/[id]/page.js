import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb, getSetting, todayStr } from '../../../src/lib/db';
import { addMeasurement } from '../../../src/lib/actions';

export const dynamic = 'force-dynamic';

const KIND_LABEL = { purchase: 'ซื้อคอร์ส', bonus: 'ของแถม', checkin: 'เข้าเทรน', refund: 'คืนครั้ง', adjust: 'ปรับปรุง' };

export default async function MemberDetail({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  const m = db.prepare('SELECT * FROM members WHERE id=?').get(id);
  if (!m) notFound();

  const threshold = Number(getSetting('low_credit_threshold', '6'));
  const guardians = db.prepare(`SELECT g.* FROM guardians g JOIN member_guardians mg ON mg.guardian_id=g.id WHERE mg.member_id=?`).all(id);
  const enrollments = db.prepare(`
    SELECT e.*, c.name AS course_name, c.sessions, co.nickname AS coach_nick,
      COALESCE((SELECT SUM(delta) FROM credit_ledger WHERE enrollment_id=e.id),0) AS remaining,
      COALESCE((SELECT SUM(CASE WHEN delta>0 THEN delta ELSE 0 END) FROM credit_ledger WHERE enrollment_id=e.id),0) AS total
    FROM enrollments e JOIN courses c ON c.id=e.course_id
    LEFT JOIN coaches co ON co.id=e.coach_id
    WHERE e.member_id=? ORDER BY e.start_date DESC, e.id DESC`).all(id);
  const payments = db.prepare(`
    SELECT p.*, c.name AS course_name FROM payments p
    JOIN enrollments e ON e.id=p.enrollment_id JOIN courses c ON c.id=e.course_id
    WHERE e.member_id=? ORDER BY p.paid_at DESC`).all(id);
  const ledger = db.prepare(`
    SELECT cl.*, c.name AS course_name FROM credit_ledger cl
    JOIN enrollments e ON e.id=cl.enrollment_id JOIN courses c ON c.id=e.course_id
    WHERE e.member_id=? ORDER BY cl.created_at DESC, cl.id DESC LIMIT 30`).all(id);
  const measurements = db.prepare('SELECT * FROM measurements WHERE member_id=? ORDER BY date DESC, id DESC').all(id);

  const activeRemaining = enrollments.filter((e) => e.status === 'active').reduce((sum, e) => sum + e.remaining, 0);

  return (
    <>
      {sp?.receipt && <div className="receipt-banner">บันทึกการขายเรียบร้อย — เลขใบเสร็จ {sp.receipt}</div>}

      <div className="page-head">
        <div>
          <h1>{m.nickname} <span className="muted" style={{ fontWeight: 400 }}>· {m.id}</span></h1>
          <div className="sub">{m.full_name ?? 'ยังไม่กรอกชื่อจริง'} · กลุ่ม {m.segment} · สมัคร {m.created_at?.slice(0, 10)}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn" href={`/pos?member=${m.id}`}>ขาย/ต่อคอร์ส</Link>
          <Link className="btn ghost" href="/members">← รายชื่อสมาชิก</Link>
        </div>
      </div>

      {m.caution && (
        <div className="card alert" style={{ marginBottom: 14 }}>
          <span className="danger-text">⚠ ข้อระวัง: {m.caution}</span>
          {m.medical && m.medical !== 'ไม่มี' && <span className="muted"> · โรคประจำตัว: {m.medical}</span>}
        </div>
      )}

      <div className="grid cols-2">
        <div className="card">
          <h2>ข้อมูลเด็ก</h2>
          <div className="tbl"><table><tbody>
            <tr><td className="muted">เพศ / วันเกิด</td><td>{m.gender ?? '-'} · {m.birthdate ?? '-'}</td></tr>
            <tr><td className="muted">โรงเรียน</td><td>{m.school ?? '-'} {m.grade ? `(${m.grade})` : ''}</td></tr>
            <tr><td className="muted">แรกเข้า</td><td>{m.height_cm ? `${m.height_cm} ซม.` : '-'} · {m.weight_kg ? `${m.weight_kg} กก.` : '-'}</td></tr>
            <tr><td className="muted">เป้าหมาย</td><td>{m.goal ?? '-'}</td></tr>
            <tr><td className="muted">โรคประจำตัว</td><td>{m.medical ?? '-'}</td></tr>
            <tr><td className="muted">ช่องทางที่รู้จัก</td><td>{m.channel ?? '-'}</td></tr>
          </tbody></table></div>
        </div>

        <div className="card">
          <h2>ผู้ปกครอง</h2>
          {guardians.length === 0 ? <p className="muted">ยังไม่มีข้อมูลผู้ปกครอง</p> :
            guardians.map((g) => (
              <div key={g.id} className="tbl"><table><tbody>
                <tr><td className="muted">ชื่อ</td><td>{g.name} {g.relationship ? `(${g.relationship})` : ''}</td></tr>
                <tr><td className="muted">ติดต่อ</td><td>{g.phone ?? '-'} · LINE: {g.line_id ?? '-'}</td></tr>
                <tr><td className="muted">Email</td><td>{g.email ?? '-'}</td></tr>
                <tr><td className="muted">ที่อยู่</td><td>{g.address ?? '-'} {g.province ?? ''}</td></tr>
              </tbody></table></div>
            ))}
        </div>
      </div>

      <div className="card section">
        <h2>คอร์ส — ครั้งคงเหลือรวม <span className={activeRemaining <= threshold ? 'danger-text' : ''}>{activeRemaining} ครั้ง</span></h2>
        <div className="tbl"><table>
          <thead><tr><th>คอร์ส</th><th>โค้ชดูแล</th><th>เริ่ม</th><th>หมดอายุ</th><th className="num">ใช้ไป</th><th className="num">คงเหลือ</th><th>สถานะ</th></tr></thead>
          <tbody>
            {enrollments.map((e) => (
              <tr key={e.id}>
                <td>{e.course_name}{e.bonus_sessions > 0 && <span className="pill amber" style={{ marginLeft: 6 }}>แถม {e.bonus_sessions}</span>}</td>
                <td>{e.coach_nick ?? '-'}</td>
                <td>{e.start_date}</td>
                <td>{e.expiry_date}</td>
                <td className="num">{e.total - e.remaining}/{e.total}</td>
                <td className="num"><span className={`pill ${e.remaining <= threshold ? 'red' : 'green'}`}>{e.remaining}</span></td>
                <td><span className={`pill ${e.status === 'active' ? 'green' : 'grey'}`}>{e.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <div className="grid cols-2 section">
        <div className="card">
          <h2>บันทึกการวัดตัว</h2>
          <form action={addMeasurement} className="stack" style={{ marginBottom: 12 }}>
            <input type="hidden" name="member_id" value={m.id} />
            <div className="form-row">
              <div className="field"><label htmlFor="ms-date">วันที่</label><input id="ms-date" type="date" name="date" defaultValue={todayStr()} /></div>
              <div className="field"><label htmlFor="ms-h">ส่วนสูง (ซม.)</label><input id="ms-h" type="number" step="0.1" name="height_cm" /></div>
              <div className="field"><label htmlFor="ms-w">น้ำหนัก (กก.)</label><input id="ms-w" type="number" step="0.1" name="weight_kg" /></div>
              <div className="field"><label htmlFor="ms-note">หมายเหตุ</label><input id="ms-note" name="note" /></div>
            </div>
            <div><button className="btn small">บันทึกการวัด</button></div>
          </form>
          <div className="tbl"><table>
            <thead><tr><th>วันที่</th><th className="num">ส่วนสูง</th><th className="num">Δ</th><th className="num">น้ำหนัก</th><th>หมายเหตุ</th></tr></thead>
            <tbody>
              {measurements.map((ms, i) => {
                const prev = measurements[i + 1];
                const delta = prev && ms.height_cm && prev.height_cm ? (ms.height_cm - prev.height_cm) : null;
                return (
                  <tr key={ms.id}>
                    <td>{ms.date}</td>
                    <td className="num">{ms.height_cm ? `${ms.height_cm}` : '-'}</td>
                    <td className="num">{delta !== null ? <span className={delta > 0 ? 'pill green' : 'pill grey'}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}</span> : '-'}</td>
                    <td className="num">{ms.weight_kg ?? '-'}</td>
                    <td>{ms.note ?? '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>

        <div className="card">
          <h2>การชำระเงิน</h2>
          <div className="tbl"><table>
            <thead><tr><th>วันที่</th><th>คอร์ส</th><th className="num">ยอด</th><th>ช่องทาง</th><th>ใบเสร็จ</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.paid_at.slice(0, 10)}</td>
                  <td>{p.course_name}</td>
                  <td className="num">{p.amount.toLocaleString()}฿</td>
                  <td>{p.method}</td>
                  <td>{p.receipt_no}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>

      <div className="card section">
        <h2>ประวัติครั้ง (Ledger ล่าสุด 30 รายการ)</h2>
        <div className="tbl"><table>
          <thead><tr><th>เวลา</th><th>คอร์ส</th><th>รายการ</th><th className="num">ครั้ง</th><th>หมายเหตุ</th></tr></thead>
          <tbody>
            {ledger.map((l) => (
              <tr key={l.id}>
                <td>{l.created_at}</td>
                <td>{l.course_name}</td>
                <td><span className={`pill ${l.delta < 0 ? 'grey' : 'green'}`}>{KIND_LABEL[l.kind] ?? l.kind}</span></td>
                <td className="num">{l.delta > 0 ? `+${l.delta}` : l.delta}</td>
                <td>{l.note ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </>
  );
}
