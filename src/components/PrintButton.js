'use client';

export default function PrintButton({ label = 'พิมพ์ใบเสร็จ' }) {
  return (
    <button type="button" className="btn" onClick={() => window.print()}>
      {label}
    </button>
  );
}
