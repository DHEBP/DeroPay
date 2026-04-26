import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export const GET = async (_req: MedusaRequest, res: MedusaResponse) => {
  res.json({
    name: "HOLOGRAM",
    status: "online",
    payments: ["stripe", "deropay"],
  })
}
