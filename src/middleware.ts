import { type NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone()
  if (/\/ajustes(\.rsc)?$/.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/ajustes(\.rsc)?$/, '/configurar')
    return NextResponse.redirect(url, 308)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/campeonato/:id/ajustes', '/campeonato/:id/ajustes.rsc'],
}
