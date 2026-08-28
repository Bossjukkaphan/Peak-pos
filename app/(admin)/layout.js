import Link from 'next/link';
import Logo from '@/components/Logo';

const NAV = [
  ['/', 'Dashboard'],
  ['/schedule', 'ตารางเทรน'],
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
