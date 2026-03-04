import { createAuthHandlers } from "dero-auth/next";

const secret = process.env.JWT_SECRET || "demo-secret-not-for-production-use!";

const {
  challengeHandler,
  verifyHandler,
  signinHandler,
  callbackHandler,
  sessionHandler,
  signoutHandler,
} = createAuthHandlers({
  domain: "localhost",
  uri: "http://localhost:3002",
  jwtSecret: secret,
});

export async function GET(
  request: Request,
  context: { params: Promise<{ dero: string[] }> }
) {
  const { dero } = await context.params;
  const path = dero?.[0];

  if (path === "signin") return signinHandler(request);
  if (path === "callback") return callbackHandler(request);
  if (path === "session") return sessionHandler(request);

  return Response.json({ error: "Not found" }, { status: 404 });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ dero: string[] }> }
) {
  const { dero } = await context.params;
  const path = dero?.[0];

  if (path === "challenge") return challengeHandler(request);
  if (path === "verify") return verifyHandler(request);
  if (path === "signout") return signoutHandler(request);

  return Response.json({ error: "Not found" }, { status: 404 });
}
