// Startup guard: ADMIN_SECRET must be set for admin routes to function.
// This warning is logged once when the module is first imported.
if (!process.env.ADMIN_SECRET) {
  console.error(
    '[auth] ADMIN_SECRET environment variable is not set. ' +
      'All admin endpoints will reject every request.'
  );
}

/**
 * Validates the admin secret provided in a request.
 *
 * The secret is read from two sources (either is sufficient):
 *   1. HTTP header  `x-admin-secret`
 *   2. Query param  `secret`
 *
 * Returns `false` if the ADMIN_SECRET environment variable is not configured,
 * or if neither source matches the configured value.
 *
 * Requirements: 1.9, 2.4, 3.5, 8.3, 8.4
 */
export function validateAdminSecret(request: Request): boolean {
  const configured = process.env.ADMIN_SECRET;

  // If the variable is not configured, refuse every request.
  if (!configured) return false;

  const headerSecret = request.headers.get('x-admin-secret');
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');

  return headerSecret === configured || querySecret === configured;
}
