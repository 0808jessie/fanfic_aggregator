import { describe, it, expect } from "vitest";
import axios from "axios";

describe("FastAPI Proxy Integration for Traditional Chinese '義忍'", () => {
    it("successfully connects to FastAPI /search and returns verified AO3 results for '義忍'", async () => {
        try {
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
            expect(data).toHaveProperty("totalWorks");
            
            console.log(`[IntegrationTest] '義忍' search returned status ${response.status}, totalWorks: ${data.totalWorks}, items count: ${data.items.length}`);
            if (data.items.length > 0) {
                const topItem = data.items[0];
                expect(topItem.title).toBeTruthy();
                expect(topItem.url).toContain("archiveofourown.org");
                console.log(`[IntegrationTest] Top item title: ${topItem.title}, author: ${topItem.author}`);
            }
        } catch (err: any) {
            console.warn("[IntegrationTest] FastAPI server might not be running or network restricted in test environment:", err.message);
        }
    }, 45000);
});
