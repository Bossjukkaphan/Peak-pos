'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb, nextReceiptNo, nextMemberId, addDays, todayStr, remainingOf, getSetting } from './db';

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
  db.prepare('INSERT INTO bookings (member_id, lead_id, coach_id, date, time, type, note) VALUES (?,?,?,?,?,?,?)')
    .run(s(formData,'member_id'), num(formData,'lead_id'), num(formData,'coach_id'),
      s(formData,'date'), s(formData,'time'), s(formData,'type') ?? 'train', s(formData,'note'));
  revalidatePath('/schedule');
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

export async function addCoach(formData) {
  const db = getDb();
  db.prepare('INSERT INTO coaches (name, nickname, rate) VALUES (?,?,?)')
    .run(s(formData,'name'), s(formData,'nickname'), num(formData,'rate') ?? 0);
  revalidatePath('/coaches');
}
