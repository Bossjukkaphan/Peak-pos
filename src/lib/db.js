import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// บน serverless (Vercel/Netlify) เขียนไฟล์ได้เฉพาะ /tmp — โหมดเดโม่: ข้อมูล reset เมื่อ instance รีไซเคิล
const ON_SERVERLESS = process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME;
const DATA_DIR = ON_SERVERLESS ? '/tmp/peak-pos-data' : path.join(process.cwd(), 'data');

let db;

export function getDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(path.join(DATA_DIR, 'peak.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  seedIfEmpty(db);
  return db;
}

function migrate(db) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS coaches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    nickname TEXT NOT NULL,
    rate INTEGER NOT NULL DEFAULT 0,          -- ค่าเทรนต่อครั้ง (บาท)
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS coach_days_off (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coach_id INTEGER NOT NULL REFERENCES coaches(id),
    date TEXT NOT NULL,                       -- YYYY-MM-DD
    UNIQUE(coach_id, date)
  );

  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,                      -- PL001 ...
    status TEXT NOT NULL DEFAULT 'Active',    -- Active | Inactive
    full_name TEXT,
    nickname TEXT NOT NULL,
    gender TEXT,                              -- ชาย | หญิง
    birthdate TEXT,
    school TEXT,
    grade TEXT,
    height_cm REAL,                           -- ส่วนสูงเริ่มต้น
    weight_kg REAL,                           -- น้ำหนักเริ่มต้น
    goal TEXT,
    medical TEXT,                             -- โรคประจำตัว
    caution TEXT,                             -- ข้อระวัง
    segment TEXT NOT NULL DEFAULT 'Teen',     -- Teen | NP
    channel TEXT,                             -- ช่องทางที่รู้จัก
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS guardians (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    relationship TEXT,
    phone TEXT,
    line_id TEXT,
    email TEXT,
    address TEXT,
    province TEXT
  );

  CREATE TABLE IF NOT EXISTS member_guardians (
    member_id TEXT NOT NULL REFERENCES members(id),
    guardian_id INTEGER NOT NULL REFERENCES guardians(id),
    PRIMARY KEY (member_id, guardian_id)
  );

  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sessions INTEGER NOT NULL,
    price INTEGER NOT NULL,
    validity_days INTEGER NOT NULL,           -- อายุคอร์สนับจากวันเริ่ม
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id TEXT NOT NULL REFERENCES members(id),
    course_id INTEGER NOT NULL REFERENCES courses(id),
    coach_id INTEGER REFERENCES coaches(id),  -- โค้ชผู้ดูแลคอร์ส
    start_date TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    price_paid INTEGER NOT NULL,
    bonus_sessions INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',    -- active | finished | expired | cancelled
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    enrollment_id INTEGER NOT NULL REFERENCES enrollments(id),
    amount INTEGER NOT NULL,
    method TEXT NOT NULL,                     -- Cash | Card | QR
    receipt_no TEXT NOT NULL UNIQUE,
    paid_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    note TEXT
  );

  -- ครั้งคงเหลือ = SUM(delta) ของ ledger ต่อ enrollment (ห้ามแก้ตัวเลขตรงๆ)
  CREATE TABLE IF NOT EXISTS credit_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    enrollment_id INTEGER NOT NULL REFERENCES enrollments(id),
    delta INTEGER NOT NULL,                   -- + เพิ่มครั้ง / - ตัดครั้ง
    kind TEXT NOT NULL,                       -- purchase | bonus | checkin | refund | adjust
    booking_id INTEGER,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id TEXT REFERENCES members(id),    -- NULL ได้สำหรับนัด trial/consult ของ lead
    lead_id INTEGER,
    coach_id INTEGER REFERENCES coaches(id),
    date TEXT NOT NULL,                       -- YYYY-MM-DD
    time TEXT NOT NULL,                       -- HH:MM เวลาเริ่ม (slot 30 นาที)
    end_time TEXT,                            -- HH:MM เวลาจบ
    type TEXT NOT NULL DEFAULT 'train',       -- train | trial | consult | measure
    status TEXT NOT NULL DEFAULT 'booked',    -- booked | attended | no_show | cancelled
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_name TEXT NOT NULL,               -- เช่น คุณแม่เอ
    child_name TEXT,
    child_age INTEGER,
    child_gender TEXT,
    phone TEXT,
    channel TEXT,
    status TEXT NOT NULL DEFAULT 'new',       -- new | scheduled | attended | purchased | not_purchased | no_show
    reason TEXT,                              -- เหตุผลที่ยังไม่ซื้อ
    member_id TEXT REFERENCES members(id),    -- เมื่อปิดการขายแล้ว
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS followups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    round INTEGER NOT NULL,                   -- ตามต่อ 1 / 2 / 3
    due_date TEXT NOT NULL,
    done_at TEXT,
    result TEXT,
    note TEXT
  );

  CREATE TABLE IF NOT EXISTS measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id TEXT NOT NULL REFERENCES members(id),
    date TEXT NOT NULL,
    height_cm REAL,
    weight_kg REAL,
    note TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `);

  // ฐานข้อมูลเก่าที่สร้างก่อนมี end_time
  const bookingCols = db.prepare('PRAGMA table_info(bookings)').all();
  if (!bookingCols.some((c) => c.name === 'end_time')) {
    db.exec('ALTER TABLE bookings ADD COLUMN end_time TEXT');
  }
}

function seedIfEmpty(db) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM coaches').get().n;
  if (n > 0) return;

  const tx = db.transaction(() => {
    db.prepare("INSERT INTO settings(key,value) VALUES ('receipt_seq','0')").run();
    // นโยบายเริ่มต้น (ปรับได้): ไม่มา = ไม่หักครั้ง, เตือนเมื่อเหลือ <= 6 ครั้ง
    db.prepare("INSERT INTO settings(key,value) VALUES ('low_credit_threshold','6')").run();
    db.prepare("INSERT INTO settings(key,value) VALUES ('no_show_deducts','0')").run();

    // เรทค่าเทรนตาม protocol ทีม: 30 บาท/หัว/ครั้ง (แก้ได้ที่หน้าโค้ช)
    const coach = db.prepare('INSERT INTO coaches (name, nickname, rate) VALUES (?,?,?)');
    const cOam = coach.run('โค้ชออม', 'ออม', 30).lastInsertRowid;
    const cTai = coach.run('โค้ชต่าย', 'ต่าย', 30).lastInsertRowid;
    const cAun = coach.run('โค้ชอั๋น', 'อั๋น', 30).lastInsertRowid;

    const course = db.prepare('INSERT INTO courses (name, sessions, price, validity_days) VALUES (?,?,?,?)');
    const co1 = course.run('คอร์ส 1 เดือน (8 ครั้ง)', 8, 8000, 60).lastInsertRowid;
    const co3 = course.run('คอร์ส 3 เดือน (24 ครั้ง)', 24, 24000, 150).lastInsertRowid;
    const co12 = course.run('คอร์ส 12 เดือน (100 ครั้ง)', 100, 100000, 425).lastInsertRowid;

    const member = db.prepare(`INSERT INTO members
      (id, full_name, nickname, gender, birthdate, school, grade, height_cm, weight_kg, goal, medical, caution, segment, channel)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    member.run('PL001', 'ด.ช. ภาคิน เครือสุวรรณ', 'ออม', 'ชาย', '2011-12-20', 'เซนต์ดอมินิก', 'ม.5',
      170, 70, 'บุคลิกภาพที่ดี', 'ไม่มี', 'ผ่าเข่าขวา', 'Teen', 'Facebook');
    member.run('PL002', null, 'เอ', 'หญิง', null, null, null, null, null, null, null, null, 'Teen', 'Instagram');
    member.run('PL003', null, 'บี', 'ชาย', null, null, null, null, null, null, null, null, 'Teen', 'LINE');

    const ms = db.prepare('INSERT INTO measurements (member_id, date, height_cm, weight_kg, note) VALUES (?,?,?,?,?)');
    ms.run('PL001', addDays(todayStr(), -60), 168.8, 69.0, 'วัดแรกเข้า');
    ms.run('PL001', addDays(todayStr(), -30), 169.5, 69.5, 'วัดประจำเดือน');
    ms.run('PL001', todayStr(), 170, 70, 'วัดประจำเดือน');

    const guardian = db.prepare('INSERT INTO guardians (name, relationship, phone, line_id, email, address, province) VALUES (?,?,?,?,?,?,?)');
    const g1 = guardian.run('คุณนุ่ม', 'แม่', '0906659230', 'AomVIP', 'aomzter@gmail.com',
      'พฤกษาวิลล์ บางนา-อ่อนนุช บางพลี', 'สมุทรปราการ').lastInsertRowid;
    db.prepare('INSERT INTO member_guardians (member_id, guardian_id) VALUES (?,?)').run('PL001', g1);

    const today = todayStr();
    const enroll = db.prepare(`INSERT INTO enrollments
      (member_id, course_id, coach_id, start_date, expiry_date, price_paid, bonus_sessions)
      VALUES (?,?,?,?,?,?,?)`);
    const pay = db.prepare('INSERT INTO payments (enrollment_id, amount, method, receipt_no, paid_at) VALUES (?,?,?,?,?)');
    const ledger = db.prepare('INSERT INTO credit_ledger (enrollment_id, delta, kind, note) VALUES (?,?,?,?)');

    const seedEnroll = (memberId, courseId, coachId, sessions, price, bonus, method) => {
      const eid = enroll.run(memberId, courseId, coachId, today,
        addDays(today, courseId === co12 ? 425 : courseId === co3 ? 150 : 60), price, bonus).lastInsertRowid;
      pay.run(eid, price, method, nextReceiptNo(db), `${today} 10:00:00`);
      ledger.run(eid, sessions, 'purchase', 'ครั้งตามคอร์ส');
      if (bonus > 0) ledger.run(eid, bonus, 'bonus', 'ของแถม');
      return eid;
    };

    seedEnroll('PL001', co12, cOam, 100, 100000, 2, 'Card');
    seedEnroll('PL002', co1, cTai, 8, 8000, 0, 'Cash');
    seedEnroll('PL003', co3, cAun, 24, 24000, 0, 'QR');

    // ตัวอย่าง booking วันนี้ ให้ตาราง/ปฏิทินมีข้อมูลตั้งต้น
    const bk = db.prepare('INSERT INTO bookings (member_id, coach_id, date, time, end_time, type) VALUES (?,?,?,?,?,?)');
    bk.run('PL001', cOam, today, '17:00', '18:00', 'train');
    bk.run('PL002', cTai, today, '10:00', '11:00', 'train');
    bk.run('PL003', cAun, addDays(today, 1), '16:00', '17:00', 'train');

    // ตัวอย่าง lead จากตาราง Consult ของชีท
    const lead = db.prepare('INSERT INTO leads (contact_name, child_name, child_age, child_gender, phone, channel, status, reason) VALUES (?,?,?,?,?,?,?,?)');
    const l1 = lead.run('คุณน้าจี', 'น้องเอช', 16, 'ชาย', '0982233345', 'Facebook', 'not_purchased', 'ขอคิดดูก่อน ติดเรื่องเงิน').lastInsertRowid;
    lead.run('คุณแม่เอ', 'น้องบี', 8, 'หญิง', '0812223345', 'LINE', 'scheduled', null);
    db.prepare('INSERT INTO followups (lead_id, round, due_date) VALUES (?,?,?)').run(l1, 1, addDays(today, 3));
  });
  tx();
}

export function nextReceiptNo(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key='receipt_seq'").get();
  const next = parseInt(row.value, 10) + 1;
  db.prepare("UPDATE settings SET value=? WHERE key='receipt_seq'").run(String(next));
  const ym = todayStr().slice(0, 7).replace('-', '');
  return `RC${ym}-${String(next).padStart(4, '0')}`;
}

export function getSetting(key, fallback) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : fallback;
}

export function todayStr() {
  const d = new Date();
  const bkk = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const p = (x) => String(x).padStart(2, '0');
  return `${bkk.getFullYear()}-${p(bkk.getMonth() + 1)}-${p(bkk.getDate())}`;
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + minutes;
  const p = (x) => String(x).padStart(2, '0');
  return `${p(Math.floor(t / 60))}:${p(t % 60)}`;
}

export function nextMemberId(db) {
  const row = db.prepare("SELECT id FROM members WHERE id LIKE 'PL%' ORDER BY CAST(SUBSTR(id,3) AS INTEGER) DESC LIMIT 1").get();
  const n = row ? parseInt(row.id.slice(2), 10) + 1 : 1;
  return `PL${String(n).padStart(3, '0')}`;
}

// ครั้งคงเหลือของ enrollment
export function remainingOf(db, enrollmentId) {
  return db.prepare('SELECT COALESCE(SUM(delta),0) AS r FROM credit_ledger WHERE enrollment_id=?').get(enrollmentId).r;
}
