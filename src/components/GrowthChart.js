// กราฟส่วนสูงตามช่วงเวลา (SVG ฝั่ง server) — ซีรีส์เดียว ใช้สีเขียวหลักของระบบ
export default function GrowthChart({ measurements }) {
  const pts = measurements
    .filter((m) => m.height_cm)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  if (pts.length < 2) {
    return <p className="muted">ต้องมีการวัดส่วนสูงอย่างน้อย 2 ครั้งจึงจะแสดงกราฟการเติบโต</p>;
  }

  const W = 560, H = 220, PAD = { t: 16, r: 46, b: 28, l: 40 };
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;

  const hs = pts.map((p) => p.height_cm);
  const minH = Math.floor(Math.min(...hs) - 1);
  const maxH = Math.ceil(Math.max(...hs) + 1);
  const x = (i) => PAD.l + (pts.length === 1 ? iw / 2 : (i / (pts.length - 1)) * iw);
  const y = (h) => PAD.t + ih - ((h - minH) / (maxH - minH)) * ih;

  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.height_cm).toFixed(1)}`).join(' ');
  const gridLines = 4;
  const gain = (pts[pts.length - 1].height_cm - pts[0].height_cm).toFixed(1);
  const last = pts[pts.length - 1];

  return (
    <div>
      <p style={{ margin: '0 0 6px' }}>
        เพิ่มขึ้นรวม <b className={gain > 0 ? '' : 'muted'} style={gain > 0 ? { color: 'var(--green)' } : undefined}>
        {gain > 0 ? '+' : ''}{gain} ซม.</b>
        <span className="muted"> · จากการวัด {pts.length} ครั้ง ({pts[0].date} → {last.date})</span>
      </p>
      <div className="tbl">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`กราฟส่วนสูงจาก ${pts[0].height_cm} ซม. เป็น ${last.height_cm} ซม.`}>
          {Array.from({ length: gridLines + 1 }, (_, i) => {
            const v = minH + ((maxH - minH) / gridLines) * i;
            const yy = y(v);
            return (
              <g key={i}>
                <line x1={PAD.l} x2={W - PAD.r} y1={yy} y2={yy} stroke="var(--line)" strokeWidth="1" />
                <text x={PAD.l - 6} y={yy + 4} textAnchor="end" fontSize="11" fill="var(--ink-2)">{v.toFixed(0)}</text>
              </g>
            );
          })}
          <path d={path} fill="none" stroke="var(--green)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {pts.map((p, i) => (
            <circle key={i} cx={x(i)} cy={y(p.height_cm)} r={i === pts.length - 1 ? 5 : 3.5}
              fill={i === pts.length - 1 ? 'var(--green)' : 'var(--surface)'}
              stroke="var(--green)" strokeWidth="2">
              <title>{p.date}: {p.height_cm} ซม.</title>
            </circle>
          ))}
          <text x={x(pts.length - 1) + 9} y={y(last.height_cm) + 4} fontSize="12" fontWeight="600" fill="var(--ink)">
            {last.height_cm}
          </text>
          <text x={PAD.l} y={H - 8} fontSize="11" fill="var(--ink-2)">{pts[0].date}</text>
          <text x={W - PAD.r} y={H - 8} textAnchor="end" fontSize="11" fill="var(--ink-2)">{last.date}</text>
        </svg>
      </div>
    </div>
  );
}
