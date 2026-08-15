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

  it("switches to the Blueprint fallback when a third-party cover fails", () => {
    const { container } = render(<BlueprintCover src="https://www.doujin.com.tw/blocked-cover.jpg" title="封面測試" />);
    const cover = within(container);

    fireEvent.error(cover.getByRole("img", { name: "《封面測試》封面" }));
    expect(cover.getByRole("img", { name: "封面測試 的 Blueprint 預設封面" })).toBeTruthy();
    expect(cover.getByText("ATLAS INDEX COVER")).toBeTruthy();
  });
});
