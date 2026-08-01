import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    screenshot: "only-on-failure",
    trace: "off",
  },
  projects: [
    {
      name: "desktop-edge",
      use: {
        ...devices["Desktop Chrome"],
        channel: "msedge",
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile-edge",
      use: {
        ...devices["Pixel 5"],
        browserName: "chromium",
        channel: "msedge",
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
