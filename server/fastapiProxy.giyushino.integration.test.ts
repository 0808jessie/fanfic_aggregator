import { describe, it, expect } from "vitest";
import axios from "axios";

describe("Strict FastAPI /search Integration for '義忍'", () => {
    it("successfully connects to FastAPI /search and receives non-empty items for '義忍'", async () => {
        const response = await axios.post("http://localhost:8000/search", {
            keyword: "義忍",
            platforms: ["ao3"],
            page: 1,
        }, {
            timeout: 35000,
            validateStatus: () => true,
        });

        expect(response.status).toBe(200);
        const data = response.data;
        expect(data).toHaveProperty("items");
        expect(data.items.length).toBeGreaterThan(0);
        expect(data.items[0].title).toBeTruthy();
        expect(data.items[0].url).toContain("archiveofourown.org");
    }, 45000);
});
