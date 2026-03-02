import { createAuthHandlers } from "dero-auth/next";

const { GET, POST } = createAuthHandlers({
  domain: "demo.deropay.com",
  jwtSecret: process.env.JWT_SECRET || "fallback-secret-for-demo-only",
});

export { GET, POST };
