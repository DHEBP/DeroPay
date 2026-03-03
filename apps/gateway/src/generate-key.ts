const bytes = new Uint8Array(32);
crypto.getRandomValues(bytes);
const key = Array.from(bytes)
  .map((b) => b.toString(16).padStart(2, "0"))
  .join("");

console.log(`\nGenerated API key:\n\n  ${key}\n`);
console.log(`Add to your .env:\n\n  DEROPAY_API_KEY=${key}\n`);
