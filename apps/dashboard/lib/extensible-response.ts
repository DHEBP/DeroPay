/**
 * Standard response for extensible/stub API routes.
 *
 * Returns a 501 Not Implemented with a helpful message explaining
 * this is a scaffolded endpoint ready for self-implementation.
 */

export type ExtensibleResponseBody = {
  error: {
    code: "not_implemented";
    message: string;
    module: string;
    extensionPoints: string[];
  };
};

export function extensibleResponse(
  module: string,
  description: string,
  extensionPoints: string[],
): Response {
  const body: ExtensibleResponseBody = {
    error: {
      code: "not_implemented",
      message: `The ${module} module is scaffolded for self-implementation. ${description}`,
      module,
      extensionPoints,
    },
  };

  return new Response(JSON.stringify(body, null, 2), {
    status: 501,
    headers: {
      "Content-Type": "application/json",
      "X-DeroPay-Extensible": "true",
    },
  });
}
