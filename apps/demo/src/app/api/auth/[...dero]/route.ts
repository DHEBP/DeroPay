import { createAuthHandlers } from "dero-auth/next";

const secret = process.env.JWT_SECRET || "demo-secret-not-for-production-use!";

const { challengeHandler, verifyHandler } = createAuthHandlers({
  domain: "demo.deropay.com",
  uri: "https://demo.deropay.com",
  jwtSecret: secret,
});

export const GET = challengeHandler;
export const POST = verifyHandler;
