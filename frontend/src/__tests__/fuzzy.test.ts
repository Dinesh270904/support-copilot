import { describe, expect, it } from "vitest";
import { fuzzyScore, rank } from "../lib/fuzzy";

describe("fuzzy", () => {
  it("matches subsequences and rejects letters out of order", () => {
    expect(fuzzyScore("t104", "T-104 Locked out")).not.toBeNull();
    expect(fuzzyScore("xyz", "T-104 Locked out")).toBeNull();
    expect(fuzzyScore("lcd", "Locked")).not.toBeNull();
    expect(fuzzyScore("lko", "Locked")).toBeNull(); // the o comes before the k
    expect(fuzzyScore("kl", "Locked")).toBeNull();
  });
  it("ranks an ID prefix above a scattered match", () => {
    const items = ["Plan change invoice t-1 abc", "T-104 Locked out", "Checkout timed out"];
    expect(rank(items, "t-104", (x) => x)[0]).toBe("T-104 Locked out");
  });
  it("ranks word-start and consecutive matches higher", () => {
    expect(fuzzyScore("sftp", "Request to export records to an SFTP server")!).toBeGreaterThan(fuzzyScore("sftp", "s f t p scattered letters")!);
  });
  it("an empty query keeps everything in order", () => {
    expect(rank(["a", "b"], "", (x) => x)).toEqual(["a", "b"]);
  });
});
