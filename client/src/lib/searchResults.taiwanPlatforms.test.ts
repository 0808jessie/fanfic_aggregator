import { describe, expect, it } from "vitest";
import { isDisplayableResult, normalizeResults } from "./searchResults";

const baseResult = {
  title: "公開同人作品",
  author: "作者",
  tags: "同人",
  summary: "公開摘要",
  scraped_at: "2026-08-13T00:00:00Z",
};

describe("Taiwan platform result validation", () => {
  it("accepts verified Taiwan public work URLs", () => {
    expect(isDisplayableResult({ ...baseResult, platform: "在水裡寫字", url: "https://slashtw.space/forum.php?mod=viewthread&tid=24680" })).toBe(true);
    expect(isDisplayableResult({ ...baseResult, platform: "Penana", url: "https://www.penana.com/story/205687" })).toBe(true);
    expect(isDisplayableResult({ ...baseResult, platform: "巴哈姆特創作大廳", url: "https://home.gamer.com.tw/creationDetail.php?sn=24680" })).toBe(true);
    expect(isDisplayableResult({ ...baseResult, platform: "POPO 原創市集", url: "https://www.popo.tw/books/718299" })).toBe(false);
    expect(isDisplayableResult({ ...baseResult, platform: "KadoKado 角角者", url: "https://www.kadokado.com.tw/book/72641" })).toBe(true);
  });

  it("rejects unrelated domains before they can render as Taiwan platform cards", () => {
    const results = normalizeResults({
      items: [
        { ...baseResult, platform: "Penana", url: "https://example.com/story/205687" },
        { ...baseResult, platform: "在水裡寫字", url: "https://slashtw.space/forum.php?mod=viewthread&tid=24680" },
      ],
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.platform).toBe("在水裡寫字");
    expect(isDisplayableResult({ ...baseResult, platform: "KadoKado 角角者", url: "https://reader.example.com/book/72641" })).toBe(false);
  });
});
