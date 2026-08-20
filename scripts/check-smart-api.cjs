const { readFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { app, safeStorage } = require("electron");

const configRoot =
  process.env.SHENGZUO_SMART_API_USER_DATA?.trim() ||
  path.join(process.env.APPDATA || "", "声作");

app.setName("声作");
app.setPath("userData", configRoot);
app.setPath(
  "sessionData",
  path.join(os.tmpdir(), "ShengZuo", "browser-session-v2"),
);

const providerMessage = (payload) => {
  const error = payload?.error;
  if (typeof error === "string") return error.slice(0, 160);
  return typeof error?.message === "string" ? error.message.slice(0, 160) : "";
};

const requestResult = async (name, url, init) => {
  try {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => ({}));
    return { name, ok: response.ok, status: response.status, payload };
  } catch (error) {
    return {
      name,
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : "连接失败",
    };
  }
};

void app.whenReady().then(async () => {
  let apiKey;
  try {
    const configPath = path.join(configRoot, "workspace", "smart-api.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    if (!config.baseUrl || !config.model || !config.encryptedApiKey) {
      throw new Error("API配置不完整。");
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Windows 安全存储暂时不可用。");
    }
    apiKey = safeStorage.decryptString(
      Buffer.from(config.encryptedApiKey, "base64"),
    );
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
    const balance = await requestResult(
      "balance",
      "https://api.deepseek.com/user/balance",
      { method: "GET", headers },
    );
    const endpoint = String(config.baseUrl).replace(/\/+$/u, "");
    const chat = await requestResult(
      "chat",
      endpoint.endsWith("/chat/completions")
        ? endpoint
        : `${endpoint}/chat/completions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: "user", content: "只回复OK" }],
          max_tokens: 4,
          temperature: 0,
          ...(new URL(config.baseUrl).hostname === "api.deepseek.com"
            ? { thinking: { type: "disabled" } }
            : {}),
        }),
      },
    );
    const balanceInfos = Array.isArray(balance.payload?.balance_infos)
      ? balance.payload.balance_infos.map((item) => ({
          currency: item.currency,
          total: item.total_balance,
          granted: item.granted_balance,
          toppedUp: item.topped_up_balance,
        }))
      : [];
    process.stdout.write(
      `${JSON.stringify({
        configured: true,
        model: config.model,
        balance: {
          ok: balance.ok,
          status: balance.status,
          available: balance.payload?.is_available,
          infos: balanceInfos,
          message: providerMessage(balance.payload),
        },
        chat: {
          ok: chat.ok,
          status: chat.status,
          hasContent: Boolean(chat.payload?.choices?.[0]?.message?.content),
          message: providerMessage(chat.payload) || chat.message,
        },
      })}\n`,
    );
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        configured: false,
        message: error instanceof Error ? error.message : "检查失败。",
      })}\n`,
    );
  } finally {
    apiKey = undefined;
    app.quit();
  }
});
