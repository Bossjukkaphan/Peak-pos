// โลโก้ PEAK ตาม CI — ตัว E เป็นแท่งกราฟ 3 สี (ส้ม/เขียวมะนาว/ฟ้า)
export default function Logo({ tag }) {
  return (
    <span className="logo" aria-label={`PEAK${tag ? ` ${tag}` : ''}`}>
      P
      <span className="bars" aria-hidden="true"><i /><i /><i /></span>
      AK
      {tag && <span className="logo-tag">{tag}</span>}
    </span>
  );
}
