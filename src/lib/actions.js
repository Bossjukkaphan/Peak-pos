'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getDb, nextReceiptNo, nextMemberId, addDays, addMinutes, todayStr, remainingOf, getSetting } from './db';
import { ADMIN_PIN, ADMIN_COOKIE } from './auth';

const s = (fd, k) => {
  const v = fd.get(k);
  return v === null || String(v).trim() === '' ? null : String(v).trim();
};
const num = (fd, k) => {
  const v = s(fd, k);
  return v === null ? null : Number(v);
};

export async function createMember(formData) {
  const db = getDb();
  let id;
  db.transaction(() => {
    id = nextMemberId(db);
    db.prepare(`INSERT INTO members
      (id, full_name, nickname, gender, birthdate, school, grade, height_cm, weight_kg, goal, medical, caution, segment, channel, note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, s(formData,'full_name'), s(formData,'nickname') ?? '-', s(formData,'gender'), s(formData,'birthdate'),
        s(formData,'school'), s(formData,'grade'), num(formData,'height_cm'), num(formData,'weight_kg'),
        s(formData,'goal'), s(formData,'medical'), s(formData,'caution'), s(formData,'segment') ?? 'Teen',
        s(formData,'channel'), s(formData,'note'));
    if (num(formData,'height_cm') || num(formData,'weight_kg')) {
      db.prepare('INSERT INTO measurements (member_id, date, height_cm, weight_kg, note) VALUES (?,?,?,?,?)')
        .run(id, todayStr(), num(formData,'height_cm'), num(formData,'weight_kg'), 'วัดแรกเข้า');
    }
    const gname = s(formData,'guardian_name');
    if (gname) {
      const gid = db.prepare('INSERT INTO guardians (name, relationship, phone, line_id, email, address, province) VALUES (?,?,?,?,?,?,?)')
        .run(gname, s(formData,'guardian_relationship'), s(formData,'guardian_phone'), s(formData,'guardian_line'),
          s(formData,'guardian_email'), s(formData,'guardian_address'), s(formData,'guardian_province')).lastInsertRowid;
      db.prepare('INSERT INTO member_guardians (member_id, guardian_id) VALUES (?,?)').run(id, gid);
    }
  })();
  revalidatePath('/members');
  redirect(`/members/${id}`);
}

export async function sellCourse(formData) {
  const db = getDb();
  const memberId = s(formData,'member_id');
  const courseId = num(formData,'course_id');
  const coachId = num(formData,'coach_id');
  const method = s(formData,'method') ?? 'Cash';
  const bonus = num(formData,'bonus') ?? 0;
  const discount = num(formData,'discount') ?? 0;
  const startDate = s(formData,'start_date') ?? todayStr();

  const course = db.prepare('SELECT * FROM courses WHERE id=?').get(courseId);
  if (!course || !db.prepare('SELECT id FROM members WHERE id=?').get(memberId)) return;

  const price = course.price - discount;
  let receiptNo;
  db.transaction(() => {
    const eid = db.prepare(`INSERT INTO enrollments
      (member_id, course_id, coach_id, start_date, expiry_date, price_paid, bonus_sessions)
      VALUES (?,?,?,?,?,?,?)`)
      .run(memberId, courseId, coachId, startDate, addDays(startDate, course.validity_days), price, bonus).lastInsertRowid;
    receiptNo = nextReceiptNo(db);
    db.prepare('INSERT INTO payments (enrollment_id, amount, method, receipt_no, note) VALUES (?,?,?,?,?)')
      .run(eid, price, method, receiptNo, discount > 0 ? `ส่วนลด ${discount} บาท` : null);
    db.prepare('INSERT INTO credit_ledger (enrollment_id, delta, kind, note) VALUES (?,?,?,?)')
      .run(eid, course.sessions, 'purchase', 'ครั้งตามคอร์ส');
    if (bonus > 0) {
      db.prepare('INSERT INTO credit_ledger (enrollment_id, delta, kind, note) VALUES (?,?,?,?)')
        .run(eid, bonus, 'bonus', 'ของแถม');
    }
  })();
  revalidatePath('/');
  redirect(`/members/${memberId}?receipt=${receiptNo}`);
}

export async function createBooking(formData) {
  const db = getDb();
  const start = s(formData,'time');
  let end = s(formData,'end_time');
  if (!start) return;
  if (!end || end <= start) end = addMinutes(start, 60);
  db.prepare('INSERT INTO bookings (member_id, lead_id, coach_id, date, time, end_time, type, note) VALUES (?,?,?,?,?,?,?,?)')
    .run(s(formData,'member_id'), num(formData,'lead_id'), num(formData,'coach_id'),
      s(formData,'date'), start, end, s(formData,'type') ?? 'train', s(formData,'note'));
  revalidatePath('/schedule');
  revalidatePath('/board');
}

// เช็คอิน: ตัด 1 ครั้งจากคอร์ส active ที่เริ่มก่อน (FIFO) และยังไม่หมดอายุ
export async function checkIn(formData) {
  const db = getDb();
  const bookingId = Number(formData.get('booking_id'));
  const booking = db.prepare('SELECT * FROM bookings WHERE id=?').get(bookingId);
  if (!booking || booking.status !== 'booked') return;

  db.transaction(() => {
    if (booking.type === 'train' && booking.member_id) {
      const enrollments = db.prepare(`SELECT * FROM enrollments
        WHERE member_id=? AND status='active' AND expiry_date >= ? ORDER BY start_date, id`)
        .all(booking.member_id, booking.date);
      const target = enrollments.find((e) => remainingOf(db, e.id) > 0);
      if (!target) throw new Error('no-credit');
      db.prepare('INSERT INTO credit_ledger (enrollment_id, delta, kind, booking_id, note) VALUES (?,?,?,?,?)')
        .run(target.id, -1, 'checkin', bookingId, `เข้าเทรน ${booking.date} ${booking.time}`);
      if (remainingOf(db, target.id) === 0) {
        db.prepare("UPDATE enrollments SET status='finished' WHERE id=?").run(target.id);
      }
    }
    db.prepare("UPDATE bookings SET status='attended' WHERE id=?").run(bookingId);
    if (booking.lead_id) {
      db.prepare("UPDATE leads SET status='attended' WHERE id=? AND status IN ('new','scheduled')").run(booking.lead_id);
    }
  })();
  revalidatePath('/schedule');
  revalidatePath('/');
}

export async function markNoShow(formData) {
  const db = getDb();
  const bookingId = Number(formData.get('booking_id'));
  const booking = db.prepare('SELECT * FROM bookings WHERE id=?').get(bookingId);
  if (!booking || booking.status !== 'booked') return;
  db.transaction(() => {
    db.prepare("UPDATE bookings SET status='no_show' WHERE id=?").run(bookingId);
    // นโยบายเริ่มต้น: ไม่มา = ไม่หักครั้ง (ตั้งค่าได้ที่ settings.no_show_deducts)
    if (getSetting('no_show_deducts', '0') === '1' && booking.type === 'train' && booking.member_id) {
      const e = db.prepare(`SELECT * FROM enrollments WHERE member_id=? AND status='active' ORDER BY start_date, id`)
        .all(booking.member_id).find((en) => remainingOf(db, en.id) > 0);
      if (e) db.prepare('INSERT INTO credit_ledger (enrollment_id, delta, kind, booking_id, note) VALUES (?,?,?,?,?)')
        .run(e.id, -1, 'checkin', bookingId, 'หักครั้งกรณีไม่มา (no-show)');
    }
    if (booking.lead_id) db.prepare("UPDATE leads SET status='no_show' WHERE id=?").run(booking.lead_id);
  })();
  revalidatePath('/schedule');
}

export async function cancelBooking(formData) {
  const db = getDb();
  db.prepare("UPDATE bookings SET status='cancelled' WHERE id=? AND status='booked'").run(Number(formData.get('booking_id')));
  revalidatePath('/schedule');
}

export async function addMeasurement(formData) {
  const db = getDb();
  const memberId = s(formData,'member_id');
  db.prepare('INSERT INTO measurements (member_id, date, height_cm, weight_kg, note) VALUES (?,?,?,?,?)')
    .run(memberId, s(formData,'date') ?? todayStr(), num(formData,'height_cm'), num(formData,'weight_kg'), s(formData,'note'));
  revalidatePath(`/members/${memberId}`);
}

export async function createLead(formData) {
  const db = getDb();
  db.prepare('INSERT INTO leads (contact_name, child_name, child_age, child_gender, phone, channel) VALUES (?,?,?,?,?,?)')
    .run(s(formData,'contact_name'), s(formData,'child_name'), num(formData,'child_age'),
      s(formData,'child_gender'), s(formData,'phone'), s(formData,'channel'));
  revalidatePath('/trials');
}

// บันทึกผลหลังทดลองเรียน — ถ้ายังไม่ซื้อ สร้าง task ตามต่อรอบถัดไปอัตโนมัติ (+3 วัน)
export async function recordLeadResult(formData) {
  const db = getDb();
  const leadId = Number(formData.get('lead_id'));
  const status = s(formData,'status');
  const reason = s(formData,'reason');
  db.transaction(() => {
    db.prepare('UPDATE leads SET status=?, reason=? WHERE id=?').run(status, reason, leadId);
    if (status === 'not_purchased') {
      const last = db.prepare('SELECT MAX(round) AS r FROM followups WHERE lead_id=?').get(leadId).r ?? 0;
      if (last < 3) {
        db.prepare('INSERT INTO followups (lead_id, round, due_date) VALUES (?,?,?)')
          .run(leadId, last + 1, addDays(todayStr(), 3));
      }
    }
  })();
  revalidatePath('/trials');
}

export async function completeFollowup(formData) {
  const db = getDb();
  const id = Number(formData.get('followup_id'));
  const result = s(formData,'result') ?? 'ติดต่อแล้ว';
  db.transaction(() => {
    const fu = db.prepare('SELECT * FROM followups WHERE id=?').get(id);
    if (!fu || fu.done_at) return;
    db.prepare("UPDATE followups SET done_at=datetime('now','localtime'), result=? WHERE id=?").run(result, id);
    if (result === 'ยังไม่ซื้อ' && fu.round < 3) {
      db.prepare('INSERT INTO followups (lead_id, round, due_date) VALUES (?,?,?)')
        .run(fu.lead_id, fu.round + 1, addDays(todayStr(), 3));
    }
    if (result === 'ซื้อแล้ว') {
      db.prepare("UPDATE leads SET status='purchased' WHERE id=?").run(fu.lead_id);
    }
  })();
  revalidatePath('/trials');
}

export async function updateSettings(formData) {
  const db = getDb();
  const upsert = db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  const threshold = num(formData, 'low_credit_threshold');
  if (threshold !== null && threshold >= 1) upsert.run('low_credit_threshold', String(threshold));
  const noShow = s(formData, 'no_show_deducts');
  if (noShow === '0' || noShow === '1') upsert.run('no_show_deducts', noShow);
  revalidatePath('/');
  revalidatePath('/settings');
}

export async function updateCoachRate(formData) {
  const db = getDb();
  const id = num(formData, 'coach_id');
  const rate = num(formData, 'rate');
  if (id !== null && rate !== null && rate >= 0) {
    db.prepare('UPDATE coaches SET rate=? WHERE id=?').run(rate, id);
  }
  revalidatePath('/coaches');
  revalidatePath('/');
}

export async function updateMember(formData) {
  const db = getDb();
  const id = s(formData, 'id');
  if (!id || !db.prepare('SELECT id FROM members WHERE id=?').get(id)) return;
  db.transaction(() => {
    db.prepare(`UPDATE members SET
      full_name=?, nickname=?, gender=?, birthdate=?, school=?, grade=?, goal=?, medical=?, caution=?,
      segment=?, channel=?, note=?, status=? WHERE id=?`)
      .run(s(formData,'full_name'), s(formData,'nickname') ?? '-', s(formData,'gender'), s(formData,'birthdate'),
        s(formData,'school'), s(formData,'grade'), s(formData,'goal'), s(formData,'medical'), s(formData,'caution'),
        s(formData,'segment') ?? 'Teen', s(formData,'channel'), s(formData,'note'),
        s(formData,'status') === 'Inactive' ? 'Inactive' : 'Active', id);
    const gname = s(formData,'guardian_name');
    if (gname) {
      const existing = db.prepare('SELECT g.id FROM guardians g JOIN member_guardians mg ON mg.guardian_id=g.id WHERE mg.member_id=? LIMIT 1').get(id);
      if (existing) {
        db.prepare('UPDATE guardians SET name=?, relationship=?, phone=?, line_id=?, email=?, address=?, province=? WHERE id=?')
          .run(gname, s(formData,'guardian_relationship'), s(formData,'guardian_phone'), s(formData,'guardian_line'),
            s(formData,'guardian_email'), s(formData,'guardian_address'), s(formData,'guardian_province'), existing.id);
      } else {
        const gid = db.prepare('INSERT INTO guardians (name, relationship, phone, line_id, email, address, province) VALUES (?,?,?,?,?,?,?)')
          .run(gname, s(formData,'guardian_relationship'), s(formData,'guardian_phone'), s(formData,'guardian_line'),
            s(formData,'guardian_email'), s(formData,'guardian_address'), s(formData,'guardian_province')).lastInsertRowid;
        db.prepare('INSERT INTO member_guardians (member_id, guardian_id) VALUES (?,?)').run(id, gid);
      }
    }
  })();
  revalidatePath(`/members/${id}`);
  redirect(`/members/${id}`);
}

// พักคอร์ส: เลื่อนวันหมดอายุออกไปตามจำนวนวัน พร้อมบันทึกเหตุผลลง ledger (delta 0 = ไม่กระทบครั้ง)
export async function freezeEnrollment(formData) {
  const db = getDb();
  const eid = num(formData, 'enrollment_id');
  const days = num(formData, 'days');
  const note = s(formData, 'note');
  const e = db.prepare("SELECT * FROM enrollments WHERE id=? AND status='active'").get(eid);
  if (!e || !days || days < 1 || days > 365) return;
  db.transaction(() => {
    db.prepare('UPDATE enrollments SET expiry_date=? WHERE id=?').run(addDays(e.expiry_date, days), eid);
    db.prepare('INSERT INTO credit_ledger (enrollment_id, delta, kind, note) VALUES (?,0,?,?)')
      .run(eid, 'freeze', `พักคอร์ส ${days} วัน${note ? ` — ${note}` : ''} (หมดอายุใหม่ ${addDays(e.expiry_date, days)})`);
  })();
  revalidatePath(`/members/${e.member_id}`);
}

// คืนครั้ง/ปรับปรุงครั้ง ผ่าน ledger เท่านั้น — กันครั้งคงเหลือติดลบ
export async function adjustCredits(formData) {
  const db = getDb();
  const eid = num(formData, 'enrollment_id');
  const delta = num(formData, 'delta');
  const note = s(formData, 'note');
  const e = db.prepare('SELECT * FROM enrollments WHERE id=?').get(eid);
  if (!e || !delta || !Number.isInteger(delta) || Math.abs(delta) > 100 || !note) return;
  if (remainingOf(db, eid) + delta < 0) return;
  db.transaction(() => {
    db.prepare('INSERT INTO credit_ledger (enrollment_id, delta, kind, note) VALUES (?,?,?,?)')
      .run(eid, delta, delta > 0 ? 'refund' : 'adjust', note);
    const rem = remainingOf(db, eid);
    if (rem > 0 && e.status === 'finished') db.prepare("UPDATE enrollments SET status='active' WHERE id=?").run(eid);
    if (rem === 0 && e.status === 'active') db.prepare("UPDATE enrollments SET status='finished' WHERE id=?").run(eid);
  })();
  revalidatePath(`/members/${e.member_id}`);
}

export async function addDayOff(formData) {
  const db = getDb();
  const coachId = num(formData, 'coach_id');
  const date = s(formData, 'date');
  if (!coachId || !date) return;
  db.prepare('INSERT OR IGNORE INTO coach_days_off (coach_id, date) VALUES (?,?)').run(coachId, date);
  revalidatePath('/coaches');
  revalidatePath('/schedule');
  revalidatePath('/board');
}

export async function removeDayOff(formData) {
  const db = getDb();
  db.prepare('DELETE FROM coach_days_off WHERE id=?').run(Number(formData.get('dayoff_id')));
  revalidatePath('/coaches');
  revalidatePath('/schedule');
  revalidatePath('/board');
}

export async function addContactLog(formData) {
  const db = getDb();
  const note = s(formData, 'note');
  const memberId = s(formData, 'member_id');
  const leadId = num(formData, 'lead_id');
  if (!note || (!memberId && !leadId)) return;
  db.prepare('INSERT INTO contact_logs (member_id, lead_id, channel, note) VALUES (?,?,?,?)')
    .run(memberId, leadId, s(formData,'channel') ?? 'โทร', note);
  revalidatePath('/crm');
  if (memberId) revalidatePath(`/members/${memberId}`);
}

export async function loginAdmin(formData) {
  const pin = s(formData, 'pin');
  const next = s(formData, 'next') ?? '/';
  if (pin !== ADMIN_PIN) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, pin, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  redirect(next.startsWith('/') ? next : '/');
}

export async function addCoach(formData) {
  const db = getDb();
  db.prepare('INSERT INTO coaches (name, nickname, rate) VALUES (?,?,?)')
    .run(s(formData,'name'), s(formData,'nickname'), num(formData,'rate') ?? 0);
  revalidatePath('/coaches');
}
