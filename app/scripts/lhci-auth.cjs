module.exports = async (browser, { url }) => {
  if (new URL(url).pathname === "/login") return;

  const page = await browser.newPage();
  try {
    await page.goto("http://localhost:5173/login", {
      waitUntil: "networkidle2",
    });
    const result = await page.evaluate(
      async ({ username, password }) => {
        const response = await fetch("http://localhost:3000/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ username, password }),
        });
        return { ok: response.ok, status: response.status };
      },
      {
        username: process.env.LHCI_USERNAME || "demo-alice",
        password: process.env.LHCI_PASSWORD || "Alice-chat-2026!",
      },
    );
    if (!result.ok)
      throw new Error(`LHCI login failed with HTTP ${result.status}`);
  } finally {
    await page.close();
  }
};
