import { makeScopeKey, parseScopeKey, rowMatchesScope } from "@/lib/scope-key";

describe("scope-key", () => {
  it("monta e parseia scopeKey", () => {
    expect(makeScopeKey("briza-1", "5511999887766")).toBe("briza-1:5511999887766");
    expect(parseScopeKey("briza-1:5511999887766")).toEqual({
      instance: "briza-1",
      number: "5511999887766",
    });
  });

  it("rowMatchesScope isola por instância", () => {
    const a = { number: "5511999887766", instance: "briza-a" };
    const b = { number: "5511999887766", instance: "briza-b" };
    expect(rowMatchesScope(a, "5511999887766", "briza-a")).toBe(true);
    expect(rowMatchesScope(a, "5511999887766", "briza-b")).toBe(false);
    expect(rowMatchesScope(b, "5511999887766", "briza-b")).toBe(true);
  });

  it("legado sem instance casa com busca sem instance", () => {
    const legacy = { number: "5511999887766" };
    expect(rowMatchesScope(legacy, "5511999887766", "")).toBe(true);
  });
});
