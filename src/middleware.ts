import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request security headers.
 *
 * The static policy in next.config.ts had to allow 'unsafe-inline' for scripts,
 * because Next injects inline bootstrap. A per-request nonce removes that: only
 * scripts carrying this request's nonce execute, so an injected <script> does
 * nothing even if one ever reaches the page.
 *
 * Everything here is deliberately narrow. Itqān loads no third-party script, no
 * analytics, no font CDN — so the policy can say 'self' and mean it, and any
 * future dependency that needs an exception has to argue for it here in the open.
 */
export function middleware(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const csp = [
    "default-src 'self'",
    // 'self' covers Next's external chunks; the nonce covers its two inline
    // flight-data scripts. 'strict-dynamic' is deliberately NOT used: it would
    // make the browser ignore 'self', and every chunk would be refused.
    `script-src 'self' 'nonce-${nonce}'`,
    // Styles stay 'unsafe-inline': CSS Modules and the token layer emit inline
    // style attributes, and a style injection cannot execute. Scripts are where
    // the nonce matters.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // Audio is served from the CDN by signed URL; blob: covers a learner's own
    // recording before it is uploaded.
    `media-src 'self' blob:${process.env.CDN_BASE_URL ? ` ${process.env.CDN_BASE_URL}` : ""}`,
    `connect-src 'self'${process.env.CDN_BASE_URL ? ` ${process.env.CDN_BASE_URL}` : ""}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  // Next reads the nonce back out of the CSP on the REQUEST headers in order to
  // stamp it onto its own inline scripts. Without this line the policy is set
  // but nothing carries the nonce, and the page loads as a dead shell that
  // renders perfectly and does nothing — which a header check will not notice.
  headers.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    // The microphone is the only capability the product asks for, and only for
    // recitation. Everything else is refused outright rather than left open.
    "camera=(), geolocation=(), payment=(), usb=(), midi=(), magnetometer=(), microphone=(self)",
  );
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, which are immutable and carry no HTML.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:woff2?|png|jpg|svg|mp3|m4a|webm)$).*)",
  ],
};
