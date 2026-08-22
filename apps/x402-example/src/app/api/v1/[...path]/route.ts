import { inferenceGatewayHandler } from "@/lib/inference-gateway";

export const runtime = "nodejs";
export const GET = inferenceGatewayHandler;
export const POST = inferenceGatewayHandler;
