// Playwright test configuration: https://playwright.dev/docs/test-configuration
import { defineConfig, devices } from '@playwright/test';

// Tests use their own port, so they run on a different origin than the app you
// use day to day (localStorage and OPFS are per origin) and can't touch its data.
// Each test also gets a fresh, empty browser profile.
const PORT = 4174;

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: `http://localhost:${PORT}`,
        trace: 'retain-on-failure',
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        // One at a time: Playwright's WebKit shares OPFS between profiles (see tests/helpers.js).
        { name: 'webkit', use: { ...devices['Desktop Safari'] }, workers: 1 },
    ],
    webServer: {
        command: `npx http-server . -p ${PORT} -c-1 --silent`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
    },
});
