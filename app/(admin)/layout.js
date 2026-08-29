import Link from 'next/link';
import Logo from '@/components/Logo';

const NAV = [
  ['/', 'Dashboard'],
  ['/schedule', 'ตารางเทรน'],
  ['/calls', 'วันนี้ต้องคุย'],
  ['/members', 'สมาชิก'],
  ['/pos', 'ขายคอร์ส'],
  ['/trials', 'Trial / ตามต่อ'],
  ['/crm', 'CRM'],
  ['/reports', 'รายงาน'],
  ['/coaches', 'โค้ช'],
  ['/settings', 'ตั้งค่า'],
  ['/board', 'บอร์ดโค้ช ↗'],
];

export default function AdminLayout({ children }) {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand"><Logo tag="POS" /></Link>
          <form action="/find" className="topbar-search" role="search">
            <input type="search" name="q" placeholder="ค้นหาเด็ก / เบอร์ผู้ปกครอง / PL…"
              aria-label="ค้นหาสมาชิกหรือ lead" enterKeyHint="search" />
          </form>
          <nav>
            {NAV.map(([href, label]) => (
              <Link key={href} href={href}>{label}</Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="main">{children}</main>
    </>
  );
}
