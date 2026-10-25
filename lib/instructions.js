export const INSTRUCTIONS = {
  codex: {
    title: "OpenAI / ChatGPT Codex",
    stepsEn: [
      "1. Log in via CLI on server: run \"codex login\" in terminal.",
      "2. Click \"📥 From CLI\" to auto-import ~/.codex/auth.json.",
      "3. Or click \"Device Login\" above and enter the code at auth.openai.com.",
    ],
    stepsZh: [
      "1. 在服务器上通过 CLI 登录：在终端运行 \"codex login\"。",
      "2. 点击 \"📥 从 CLI 导入\" 自动读取 ~/.codex/auth.json。",
      "3. 或者点击上方的 \"设备码登录\" (Device Login) 并在 auth.openai.com 输入代码。",
    ],
    link: "https://chatgpt.com",
  },
  claude: {
    title: "Claude Code",
    stepsEn: [
      "1. Run \"claude login\" in server console.",
      "2. Click \"📥 From CLI\" — plugin will import ~/.claude/.credentials.json.",
      "3. Or paste your Session Token / API Key from Anthropic Console and click \"Save token\".",
    ],
    stepsZh: [
      "1. 在服务器控制台运行 \"claude login\"。",
      "2. 点击 \"📥 从 CLI 导入\" — 插件将自动导入 ~/.claude/.credentials.json。",
      "3. 或者从 Anthropic 控制台复制您的 Session Token 或 API Key 并点击 \"保存令牌\"。",
    ],
    link: "https://console.anthropic.com/settings/keys",
  },
  cursor: {
    title: "Cursor IDE",
    stepsEn: [
      "1. Auto CLI: if Cursor is used on server, click \"📥 From CLI\" (reads from ~/.cursor/cli-config.json).",
      "2. Manual: open Cursor Settings (Connect button or link below), copy your session token or API key.",
      "3. Paste it into the input field and click \"Save token\".",
    ],
    stepsZh: [
      "1. CLI 自动导入：若服务器安装了 Cursor，点击 \"📥 从 CLI 导入\" (读取自 ~/.cursor/cli-config.json)。",
      "2. 手动导入：打开 Cursor 设置页面（点击连接或下方链接），复制 WorkOS 会话令牌或 API 密钥。",
      "3. 将其粘贴到输入框中并点击 \"保存令牌\"。",
    ],
    link: "https://cursor.com/settings",
  },
  antigravity: {
    title: "Google Antigravity / Gemini",
    stepsEn: [
      "1. Easiest way: click \"📥 From CLI\" — server already has active token in ~/.gemini/antigravity-cli/antigravity-oauth-token.",
      "2. Clicking \"📥 From CLI\" instantly loads fresh credentials.",
      "3. Manual: paste session JSON or OAuth tokens and click \"Save token\".",
      "Note: \"Connect\" button requires custom Google client_id in plugin settings; use \"📥 From CLI\" for seamless login!",
    ],
    stepsZh: [
      "1. 推荐方式：点击 \"📥 从 CLI 导入\" — 服务器已保存 ~/.gemini/antigravity-cli/antigravity-oauth-token 会话。",
      "2. 点击 \"📥 从 CLI 导入\" 可即时加载最新的凭据与 refresh_token。",
      "3. 手动输入：将会话 JSON 或 OAuth access_token/refresh_token 粘贴至输入框并保存。",
      "注：\"连接\" 按钮需要自定义 Google OAuth Client ID，推荐直接使用 \"📥 从 CLI 导入\"！",
    ],
    link: "https://antigravity.google",
  },
  kimi: {
    title: "Moonshot Kimi",
    stepsEn: [
      "1. Open Moonshot developer console (link below or click Connect).",
      "2. Generate and copy your API Key (sk-...).",
      "3. Paste it into the input field and click \"Save token\".",
      "4. Or click \"📥 From CLI\" if ~/.kimi-code is configured.",
    ],
    stepsZh: [
      "1. 打开 Moonshot 开发者控制台（点击下方链接或点击连接）。",
      "2. 创建并复制您的 API 密钥 (sk-...)。",
      "3. 将密钥粘贴到槽位输入框中并点击 \"保存令牌\"。",
      "4. 如果配置了 Kimi Code CLI，也可点击 \"📥 从 CLI 导入\" (~/.kimi-code)。",
    ],
    link: "https://platform.moonshot.cn/console/api-keys",
  },
  glm: {
    title: "Zhipu GLM (Z.AI)",
    stepsEn: [
      "1. Open Zhipu BigModel API Keys center (link below or click Connect).",
      "2. Copy your GLM API Key.",
      "3. Paste it into the input field and click \"Save token\".",
      "4. Or click \"📥 From CLI\" if ZCode CLI is installed (~/.zcode).",
    ],
    stepsZh: [
      "1. 打开智谱 AI 开放平台（点击下方链接或点击连接）。",
      "2. 复制您的 GLM API 密钥。",
      "3. 粘贴到输入框中并点击 \"保存令牌\"。",
      "4. 若已安装 ZCode CLI (~/.zcode)，点击 \"📥 从 CLI 导入\" 即可自动导入。",
    ],
    link: "https://bigmodel.cn/usercenter/proj-mgmt/apikeys",
  },
  grok: {
    title: "xAI Grok",
    stepsEn: [
      "1. Click \"Device Login\" (or \"Connect\") on the slot card.",
      "2. A one-time code will appear on the card.",
      "3. Open https://accounts.x.ai/oauth2/device, enter the code, and approve access for your xAI account.",
      "4. The plugin automatically captures tokens and enables Grok models.",
      "5. Or click \"📥 From CLI\" (~/.grok/auth.json) / paste an xAI API Key.",
    ],
    stepsZh: [
      "1. 点击卡片上的 \"设备码登录\" (Device Login) 或 \"连接\"。",
      "2. 界面将展示一次性设备授权码。",
      "3. 打开 https://accounts.x.ai/oauth2/device，输入代码，并为您拥有 Grok 订阅的 xAI 账户授权。",
      "4. 授权成功后，插件会自动捕获会话并激活 Grok 官方模型。",
      "5. 或点击 \"📥 从 CLI 导入\" (~/.grok/auth.json) / 直接粘贴 xAI API 密钥。",
    ],
    link: "https://accounts.x.ai/oauth2/device",
  },
  kiro: {
    title: "AWS Kiro",
    stepsEn: [
      "1. Click \"📥 From CLI\" to import from ~/.kiro/credentials.json.",
      "2. Or paste KIRO_API_KEY and click \"Save token\".",
    ],
    stepsZh: [
      "1. 点击 \"📥 从 CLI 导入\" 从 ~/.kiro/credentials.json 或 ~/.aws/sso 导入凭据。",
      "2. 或直接粘贴 KIRO_API_KEY 并点击 \"保存令牌\"。",
    ],
    link: "https://aws.amazon.com",
  },
  copilot: {
    title: "GitHub Copilot",
    stepsEn: [
      "1. Click \"Device Login\" (or \"Connect\") on the slot card.",
      "2. A one-time code will appear on the card.",
      "3. Open https://github.com/login/device, enter the code, and approve access for your GitHub account with Copilot subscription.",
      "4. The plugin automatically captures tokens and enables Copilot models.",
    ],
    stepsZh: [
      "1. 点击卡片上的 \"设备码登录\" (Device Login) 或 \"连接\"。",
      "2. 界面将展示一次性设备授权码。",
      "3. 在浏览器打开 https://github.com/login/device 输入代码，并为您拥有 Copilot 订阅的 GitHub 账户授权。",
      "4. 授权成功后，插件会自动捕获会话并激活 GitHub Copilot 官方模型。",
    ],
    link: "https://github.com/login/device",
  },
}
