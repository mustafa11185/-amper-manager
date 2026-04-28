// Auth-protect only the staff section. Public landing routes, the subscriber
// portal, gateway callback URLs, kiosk display, and printable statements are
// all intentionally outside the matcher.
//
// Excluded from `/staff/*` protection:
//   - /staff/login (next-auth signIn page)
//
// Public APIs handle their own auth (cookies, signed JWTs) so /api is not
// matched here either.

export { default } from 'next-auth/middleware'

export const config = {
  matcher: ['/staff/((?!login).*)'],
}
