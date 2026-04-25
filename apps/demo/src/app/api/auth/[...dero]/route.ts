const LEGACY_ROUTE_MESSAGE =
  "Legacy dero-auth endpoints are disabled. Use /api/auth/challenge and /api/auth/verify with dero-auth.";

function legacyRouteDisabled(): Response {
  return Response.json(
    {
      error: {
        code: "legacy_auth_route_disabled",
        message: LEGACY_ROUTE_MESSAGE,
      },
    },
    { status: 410 },
  );
}

export async function GET(): Promise<Response> {
  return legacyRouteDisabled();
}

export async function POST(): Promise<Response> {
  return legacyRouteDisabled();
}
