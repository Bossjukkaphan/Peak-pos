export default function PublicLayout({ children }) {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">Peak <span>ตารางเทรน</span></span>
        </div>
      </header>
      <main className="main">{children}</main>
    </>
  );
}
