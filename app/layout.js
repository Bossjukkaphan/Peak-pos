import './globals.css';

export const metadata = {
  title: 'Peak POS',
  description: 'ระบบบริหารยิมเพิ่มส่วนสูงเด็ก',
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Mitr:wght@500;600&family=Anuphan:wght@400;500;600;700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
