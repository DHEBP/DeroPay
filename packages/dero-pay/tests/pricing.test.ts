import { describe, it, expect } from "vitest";
import {
  ATOMIC_UNITS_PER_DERO,
  DERO_DECIMALS,
  deroToAtomic,
  atomicToDero,
  formatDero,
  isValidAmount,
} from "../src/core/pricing.js";

describe("constants", () => {
  it("has correct atomic units per DERO", () => {
    expect(ATOMIC_UNITS_PER_DERO).toBe(100_000n);
  });

  it("has correct decimal places", () => {
    expect(DERO_DECIMALS).toBe(5);
  });
});

describe("deroToAtomic", () => {
  it("converts whole DERO amounts", () => {
    expect(deroToAtomic("1")).toBe(100_000n);
    expect(deroToAtomic("25")).toBe(2_500_000n);
    expect(deroToAtomic("0")).toBe(0n);
  });

  it("converts fractional amounts", () => {
    expect(deroToAtomic("1.5")).toBe(150_000n);
    expect(deroToAtomic("0.001")).toBe(100n);
    expect(deroToAtomic("0.00001")).toBe(1n);
  });

  it("accepts numbers", () => {
    expect(deroToAtomic(1)).toBe(100_000n);
    expect(deroToAtomic(25)).toBe(2_500_000n);
  });

  it("truncates beyond 5 decimal places", () => {
    expect(deroToAtomic("0.000001")).toBe(0n);
    expect(deroToAtomic("1.000009")).toBe(100_000n);
  });

  it("handles trailing zeros in fraction", () => {
    expect(deroToAtomic("1.0")).toBe(100_000n);
    expect(deroToAtomic("1.10")).toBe(110_000n);
  });
});

describe("atomicToDero", () => {
  it("converts atomic to DERO string", () => {
    expect(atomicToDero(100_000n)).toBe("1.00000");
    expect(atomicToDero(150_000n)).toBe("1.50000");
    expect(atomicToDero(2_500_000n)).toBe("25.00000");
  });

  it("handles zero", () => {
    expect(atomicToDero(0n)).toBe("0.00000");
  });

  it("handles sub-DERO amounts", () => {
    expect(atomicToDero(100n)).toBe("0.00100");
    expect(atomicToDero(1n)).toBe("0.00001");
  });

  it("respects maxDecimals parameter", () => {
    expect(atomicToDero(150_000n, 2)).toBe("1.50");
    expect(atomicToDero(100_000n, 0)).toBe("1.");
  });

  it("handles negative amounts", () => {
    expect(atomicToDero(-150_000n)).toBe("-1.50000");
  });
});

describe("formatDero", () => {
  it("appends DERO suffix", () => {
    expect(formatDero(150_000n)).toBe("1.50000 DERO");
    expect(formatDero(0n)).toBe("0.00000 DERO");
  });

  it("respects maxDecimals", () => {
    expect(formatDero(150_000n, 2)).toBe("1.50 DERO");
  });
});

describe("isValidAmount", () => {
  it("accepts positive amounts", () => {
    expect(isValidAmount(1n)).toBe(true);
    expect(isValidAmount(100_000n)).toBe(true);
  });

  it("rejects zero", () => {
    expect(isValidAmount(0n)).toBe(false);
  });

  it("rejects negative amounts", () => {
    expect(isValidAmount(-1n)).toBe(false);
  });
});

describe("round-trip conversion", () => {
  it("preserves value through deroToAtomic → atomicToDero", () => {
    const amounts = ["1.0", "5.5", "100.12345", "0.001"];
    for (const amount of amounts) {
      const atomic = deroToAtomic(amount);
      const back = atomicToDero(atomic, 5);
      const backAtomic = deroToAtomic(back);
      expect(backAtomic).toBe(atomic);
    }
  });
});
