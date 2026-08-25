import './globals.css';
import Link from 'next/link';

export const metadata = {
  title: 'Peak POS',
  description: 'ระบบบริหารยิมเพิ่มส่วนสูงเด็ก',
};

const NAV = [
  ['/', 'Dashboard'],
  ['/schedule', 'ตารางเทรน'],
  ['/members', 'สมาชิก'],
  ['/pos', 'ขายคอร์ส'],
  ['/trials', 'Trial / ตามต่อ'],
  ['/coaches', 'โค้ช'],
];

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Mitr:wght@500;600&family=Anuphan:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand">Peak <span>POS</span></Link>
            <nav>
              {NAV.map(([href, label]) => (
                <Link key={href} href={href}>{label}</Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="main">{children}</main>
      </body>
    </html>
  );
}
