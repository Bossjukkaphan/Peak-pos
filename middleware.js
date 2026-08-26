import { NextResponse } from 'next/server';
import { ADMIN_PIN, ADMIN_COOKIE } from './src/lib/auth';

// ทุกหน้า (ยกเว้น /board และ /login) ต้องใส่ PIN ก่อน — บอร์ดโค้ชเปิดดูได้เลย
export function middleware(request) {
  if (request.cookies.get(ADMIN_COOKIE)?.value === ADMIN_PIN) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!board|login|_next/static|_next/image|favicon.ico).*)'],
};
