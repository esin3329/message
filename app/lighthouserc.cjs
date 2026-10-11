module.exports = {
  ci: {
    collect: {
      url: [
        "http://localhost:5173/login",
        "http://localhost:5173/rooms",
        "http://localhost:5173/rooms/lhci-demo-room",
      ],
      numberOfRuns: 1,
      startServerCommand: "corepack pnpm --filter @repo/web preview",
      startServerReadyPattern: "http://localhost:5173",
      puppeteerScript: "./scripts/lhci-auth.cjs",
      settings: {
        formFactor: "mobile",
        screenEmulation: {
          mobile: true,
          width: 390,
          height: 844,
          deviceScaleFactor: 1,
          disabled: false,
        },
        throttling: {
          rttMs: 150,
          throughputKbps: 1638,
          requestLatencyMs: 150,
          downloadThroughputKbps: 1638,
          uploadThroughputKbps: 675,
          cpuSlowdownMultiplier: 4,
        },
        throttlingMethod: "simulate",
        disableStorageReset: true,
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
      },
    },
    upload: { target: "filesystem", outputDir: "../.research/lhci" },
  },
};
