import { getDb, todayStr, addDays } from '@/lib/db';

export const dynamic = 'force-dynamic';

const TH_M = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const fmtMonth = (ym) => `${TH_M[Number(ym.slice(5, 7))]} ${Number(ym.slice(0, 4)) + 543 - 2500}`;

// กราฟแท่งรายได้รายเดือน — ซีรีส์เดียว ใช้สีเขียวหลัก แท่งบาง ปลายมน label เฉพาะค่าบนแท่ง
function RevenueBars({ rows }) {
  if (rows.length === 0) return <p className="muted">ยังไม่มีข้อมูลการขาย</p>;
  const W = 560, H = 200, PAD = { t: 24, r: 10, b: 26, l: 10 };
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const max = Math.max(...rows.map((r) => r.total), 1);
  const bw = Math.min(48, (iw / rows.length) * 0.55);
  const x = (i) => PAD.l + (iw / rows.length) * (i + 0.5);
  return (
    <div className="tbl">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="รายได้รายเดือนย้อนหลัง">
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="var(--line)" />
        {rows.map((r, i) => {
          const h = Math.max(2, (r.total / max) * ih);
          return (
            <g key={r.ym}>
              <rect x={x(i) - bw / 2} y={H - PAD.b - h} width={bw} height={h} rx="4" fill="var(--green)">
                <title>{fmtMonth(r.ym)}: {r.total.toLocaleString()}฿</title>
              </rect>
              <text x={x(i)} y={H - PAD.b - h - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--ink)">
                {r.total >= 1000 ? `${Math.round(r.total / 1000)}k` : r.total}
              </text>
              <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--ink-2)">{fmtMonth(r.ym)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function Reports() {
  const db = getDb();
  const today = todayStr();
  const ym = today.slice(0, 7);

  // รายได้ 6 เดือนล่าสุด (รวมเดือนนี้)
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(`${ym}-01T00:00:00`);
    d.setMonth(d.getMonth() - i);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const revByMonth = new Map(db.prepare(`
    SELECT substr(paid_at,1,7) AS ym, SUM(amount) AS total FROM payments GROUP BY substr(paid_at,1,7)`).all()
    .map((r) => [r.ym, r.total]));
  const revRows = months.map((m) => ({ ym: m, total: revByMonth.get(m) ?? 0 }));
  const revThisMonth = revByMonth.get(ym) ?? 0;

  // แยกช่องทางชำระ + แยกคอร์ส (เดือนนี้)
  const byMethod = db.prepare(`
    SELECT method, COUNT(*) AS n, SUM(amount) AS total FROM payments
    WHERE substr(paid_at,1,7)=? GROUP BY method ORDER BY total DESC`).all(ym);
  const byCourse = db.prepare(`
    SELECT c.name, COUNT(*) AS n, SUM(p.amount) AS total
    FROM payments p JOIN enrollments e ON e.id=p.enrollment_id JOIN courses c ON c.id=e.course_id
    WHERE substr(p.paid_at,1,7)=? GROUP BY c.id ORDER BY total DESC`).all(ym);

  // Funnel การขายทั้งหมด
  const totalLeads = db.prepare('SELECT COUNT(*) AS n FROM leads').get().n;
  const attendedLeads = db.prepare("SELECT COUNT(*) AS n FROM leads WHERE status IN ('attended','purchased','not_purchased')").get().n;
  const purchasedLeads = db.prepare("SELECT COUNT(*) AS n FROM leads WHERE status='purchased'").get().n;
  const byChannel = db.prepare(`
    SELECT COALESCE(channel,'ไม่ระบุ') AS channel, COUNT(*) AS leads,
      SUM(CASE WHEN status='purchased' THEN 1 ELSE 0 END) AS purchased
    FROM leads GROUP BY channel ORDER BY leads DESC`).all();

  // อัตราต่อคอร์ส: สมาชิกที่ซื้อมากกว่า 1 คอร์ส / สมาชิกที่มีคอร์ส
  const buyers = db.prepare('SELECT COUNT(DISTINCT member_id) AS n FROM enrollments').get().n;
  const repeatBuyers = db.prepare('SELECT COUNT(*) AS n FROM (SELECT member_id FROM enrollments GROUP BY member_id HAVING COUNT(*) > 1)').get().n;
  const renewalRate = buyers ? Math.round((repeatBuyers / buyers) * 100) : 0;

  // ครั้งคงค้าง + มูลค่า (ภาระบริการที่ขายแล้วยังไม่ได้ให้)
  const liabilityRows = db.prepare(`
    SELECT e.id, e.price_paid,
      COALESCE((SELECT SUM(delta) FROM credit_ledger WHERE enrollment_id=e.id),0) AS remaining,
      COALESCE((SELECT SUM(CASE WHEN delta>0 THEN delta ELSE 0 END) FROM credit_ledger WHERE enrollment_id=e.id),0) AS total
    FROM enrollments e WHERE e.status='active'`).all();
  const outstandingSessions = liabilityRows.reduce((s, r) => s + r.remaining, 0);
  const outstandingValue = Math.round(liabilityRows.reduce((s, r) => s + (r.total ? (r.price_paid / r.total) * r.remaining : 0), 0));

  // ผลลัพธ์ความสูง: สมาชิกที่วัด >= 2 ครั้ง
  const gains = db.prepare(`
    SELECT m.id, m.nickname,
      (SELECT height_cm FROM measurements ms WHERE ms.member_id=m.id AND height_cm IS NOT NULL ORDER BY date ASC, id ASC LIMIT 1) AS first_h,
      (SELECT height_cm FROM measurements ms WHERE ms.member_id=m.id AND height_cm IS NOT NULL ORDER BY date DESC, id DESC LIMIT 1) AS last_h,
      (SELECT MIN(date) FROM measurements ms WHERE ms.member_id=m.id AND height_cm IS NOT NULL) AS first_d,
      (SELECT MAX(date) FROM measurements ms WHERE ms.member_id=m.id AND height_cm IS NOT NULL) AS last_d,
      (SELECT COUNT(*) FROM measurements ms WHERE ms.member_id=m.id AND height_cm IS NOT NULL) AS n
    FROM members m`).all().filter((r) => r.n >= 2 && r.first_d !== r.last_d);
  const avgGain = gains.length ? (gains.reduce((s, r) => s + (r.last_h - r.first_h), 0) / gains.length) : null;

  // Heatmap วัน×เวลา 30 วันล่าสุด
  const heat = db.prepare(`
    SELECT CAST(strftime('%w', date) AS INTEGER) AS dow, substr(time,1,2) AS hh, COUNT(*) AS n
    FROM bookings WHERE status IN ('booked','attended') AND date >= ?
    GROUP BY dow, hh`).all(addDays(today, -30));
  const heatMap = new Map(heat.map((r) => [`${r.dow}|${r.hh}`, r.n]));
  const heatMax = Math.max(...heat.map((r) => r.n), 1);
  const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const HOURS = Array.from({ length: 10 }, (_, i) => String(9 + i).padStart(2, '0'));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>รายงานผู้บริหาร</h1>
          <div className="sub">ข้อมูล ณ {today}</div>
        </div>
      </div>

      <div className="grid stats">
        <div className="card stat"><div className="label">รายได้เดือนนี้</div><div className="value">{revThisMonth.toLocaleString()}฿</div></div>
        <div className="card stat"><div className="label">อัตราต่อคอร์ส</div><div className="value">{renewalRate}%</div><div className="hint">{repeatBuyers} จาก {buyers} คนซื้อซ้ำ</div></div>
        <div className="card stat"><div className="label">ครั้งคงค้าง</div><div className="value">{outstandingSessions}</div><div className="hint">มูลค่าบริการค้างส่ง ≈ {outstandingValue.toLocaleString()}฿</div></div>
        <div className="card stat"><div className="label">ส่วนสูงเพิ่มเฉลี่ย</div><div className="value">{avgGain === null ? '–' : `+${avgGain.toFixed(1)}`}</div><div className="hint">{gains.length ? `ซม. จาก ${gains.length} คนที่วัด ≥ 2 ครั้ง` : 'ยังมีข้อมูลวัดตัวไม่พอ'}</div></div>
        <div className="card stat"><div className="label">Conversion ทดลอง→ซื้อ</div><div className="value">{attendedLeads ? Math.round((purchasedLeads / attendedLeads) * 100) : 0}%</div><div className="hint">{purchasedLeads} จาก {attendedLeads} คนที่มาทดลอง</div></div>
      </div>

      <div className="grid cols-2 section">
        <div className="card">
          <h2>รายได้ 6 เดือนล่าสุด</h2>
          <RevenueBars rows={revRows} />
        </div>
        <div className="card">
          <h2>เดือนนี้แยกช่องทางชำระ / คอร์ส</h2>
          <div className="tbl"><table>
            <thead><tr><th>ช่องทางชำระ</th><th className="num">รายการ</th><th className="num">ยอด</th></tr></thead>
            <tbody>
              {byMethod.length === 0 ? <tr><td colSpan={3} className="muted">ยังไม่มีการขายเดือนนี้</td></tr> :
                byMethod.map((r) => <tr key={r.method}><td>{r.method}</td><td className="num">{r.n}</td><td className="num">{r.total.toLocaleString()}฿</td></tr>)}
            </tbody>
          </table></div>
          <div className="tbl" style={{ marginTop: 12 }}><table>
            <thead><tr><th>คอร์ส</th><th className="num">ขายได้</th><th className="num">ยอด</th></tr></thead>
            <tbody>
              {byCourse.length === 0 ? <tr><td colSpan={3} className="muted">—</td></tr> :
                byCourse.map((r) => <tr key={r.name}><td>{r.name}</td><td className="num">{r.n}</td><td className="num">{r.total.toLocaleString()}฿</td></tr>)}
            </tbody>
          </table></div>
        </div>
      </div>

      <div className="grid cols-2 section">
        <div className="card">
          <h2>Funnel การขาย (Lead ทั้งหมด)</h2>
          <div className="tbl"><table>
            <thead><tr><th>ขั้น</th><th className="num">จำนวน</th><th className="num">% จากขั้นก่อน</th></tr></thead>
            <tbody>
              <tr><td>Lead ติดต่อเข้ามา</td><td className="num">{totalLeads}</td><td className="num">–</td></tr>
              <tr><td>มาทดลองเรียนจริง</td><td className="num">{attendedLeads}</td><td className="num">{totalLeads ? Math.round((attendedLeads / totalLeads) * 100) : 0}%</td></tr>
              <tr><td>ปิดการขาย</td><td className="num"><b>{purchasedLeads}</b></td><td className="num"><b>{attendedLeads ? Math.round((purchasedLeads / attendedLeads) * 100) : 0}%</b></td></tr>
            </tbody>
          </table></div>
          <h3 style={{ marginTop: 14 }}>แยกช่องทางการตลาด</h3>
          <div className="tbl"><table>
            <thead><tr><th>ช่องทาง</th><th className="num">Lead</th><th className="num">ปิดได้</th><th className="num">Conversion</th></tr></thead>
            <tbody>
              {byChannel.map((r) => (
                <tr key={r.channel}>
                  <td>{r.channel}</td><td className="num">{r.leads}</td><td className="num">{r.purchased}</td>
                  <td className="num">{r.leads ? Math.round((r.purchased / r.leads) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        <div className="card">
          <h2>ชั่วโมงเร่งด่วน (30 วันล่าสุด)</h2>
          <div className="tbl"><table>
            <thead><tr><th>วัน</th>{HOURS.map((h) => <th key={h} className="num">{h}</th>)}</tr></thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <tr key={d}>
                  <td><b>{DOW[d]}</b></td>
                  {HOURS.map((h) => {
                    const n = heatMap.get(`${d}|${h}`) ?? 0;
                    return (
                      <td key={h} className="num" title={`${DOW[d]} ${h}:00 — ${n} booking`}
                        style={n ? { background: `color-mix(in oklab, var(--green) ${Math.round((n / heatMax) * 55) + 10}%, var(--surface))` } : undefined}>
                        {n || ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="muted" style={{ fontSize: '.82rem', marginTop: 8 }}>สีเข้ม = booking แน่น ใช้วางแผนเวรโค้ชและช่วงเปิดรับจองเพิ่ม</p>
        </div>
      </div>
    </>
  );
}
