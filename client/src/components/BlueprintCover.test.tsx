import React from "react";
import { fireEvent, render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BlueprintCover } from "./BlueprintCover";

describe("BlueprintCover", () => {
  it("uses no-referrer and lazy loading for third-party covers", () => {
    const { container } = render(<BlueprintCover src="https://cxc.today/covers/42.jpg" title="封面測試" />);

    const image = within(container).getByRole("img", { name: "《封面測試》封面" });
    expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(image.getAttribute("loading")).toBe("lazy");
  });

  it("uses an in-frame blurred backdrop for portrait covers without leaving white space", () => {
    const { container } = render(<BlueprintCover src="https://cxc.today/covers/portrait.jpg" title="直式封面" />);
    const image = within(container).getByRole("img", { name: "《直式封面》封面" });
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 600 },
      naturalHeight: { configurable: true, value: 900 },
    });
    fireEvent.load(image);

    expect(image.className).toContain("object-cover");
    expect(container.querySelector("img[aria-hidden='true']")?.className).toContain("blur-2xl");
    expect(container.querySelector("[data-testid='result-cover']")?.className).toContain("aspect-[16/9]");
  });

  it("switches to the reading-cover fallback when a third-party cover fails", () => {
    const { container } = render(<BlueprintCover src="https://www.doujin.com.tw/blocked-cover.jpg" title="封面測試" />);
    const cover = within(container);

    fireEvent.error(cover.getByRole("img", { name: "《封面測試》封面" }));
    expect(cover.getByRole("img", { name: "封面測試 的預設作品封面" }).className).toContain("from-indigo-50/60");
    expect(cover.queryByText("閱讀索引")).toBeNull();
  });
});
