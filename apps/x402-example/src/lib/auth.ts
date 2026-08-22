import { createAuthHandlers } from "dero-auth/next";

const DEV_SECRET = "dev-only-dero-auth-secret-change-before-production-0123456789";

function authConfig() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002";
  const url = new URL(appUrl);
  const jwtSecret = process.env.DERO_AUTH_JWT_SECRET ?? DEV_SECRET;
  if (
    process.env.NODE_ENV === "production" &&
    (jwtSecret === DEV_SECRET || Buffer.byteLength(jwtSecret) < 32)
  ) {
    throw new Error(
      "DERO_AUTH_JWT_SECRET must be a non-default secret of at least 32 bytes in production",
    );
  }
  return {
    domain: url.host,
    uri: url.origin,
    jwtSecret,
    jwtExpirySeconds: 86_400,
    statement: "Sign in to the DeroPay prepaid API.",
  };
}

let handlers: ReturnType<typeof createAuthHandlers> | undefined;

function getHandlers() {
  return (handlers ??= createAuthHandlers(authConfig()));
}

export const challengeHandler = (request: Request) => getHandlers().challengeHandler(request);
export const verifyHandler = (request: Request) => getHandlers().verifyHandler(request);

export async function authenticatePrepaidRequest(request: Request): Promise<string | null> {
  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  try {
    const session = await getHandlers().sessionManager.verifySession(token);
    return session.address;
  } catch {
    return null;
  }
}
