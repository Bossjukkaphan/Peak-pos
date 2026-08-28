import Logo from '@/components/Logo';

export default function PublicLayout({ children }) {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand"><Logo tag="ตารางเทรน" /></span>
        </div>
      </header>
      <main className="main">{children}</main>
    </>
  );
}
