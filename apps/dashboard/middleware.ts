import { NextResponse, type NextRequest } from 'next/server';
export function middleware(req: NextRequest) {
  const origin=req.headers.get('origin');
  if(req.method==='POST' && origin && new URL(origin).host !== req.headers.get('host')) return NextResponse.json({error:'cross-origin mutation denied'},{status:403});
  return NextResponse.next();
}
export const config = {matcher:'/api/:path*'};
