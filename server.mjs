import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// 你的 OpenRouter API Key
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
  console.warn("⚠️ 请在 .env 中设置 OPENROUTER_API_KEY");
}

// 简单的首页路由（托管前端文件）
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public"))); // 我们会把 index.html 放在 /public

// 调用 OpenRouter 上的 Sherlock Dash Alpha 模型
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MODEL_NAME = "openrouter/sherlock-dash-alpha"; // 模型名

// 给 LLM 的 system prompt
const SYSTEM_PROMPT = `
你是一个中文派对策划助手。
请根据用户提供的主题、时间、人数，为一个线下派对设计清晰的行程时间轴和物品清单。

必须严格返回 JSON，格式如下（不要多一层，也不要有其他字段）：

{
  "title": "字符串，派对标题",
  "vibe": "字符串，整体氛围，例如：轻松随意 / 热闹社交 / 温馨家庭等",
  "durationText": "字符串，大致时长，例如：约 3 小时",
  "peopleText": "字符串，对人数的描述，例如：10 人左右 / 人数待定",
  "timeline": [
    {
      "time": "字符串，可以是 19:30 / 20:00 / T+30′ 等时间格式",
      "label": "字符串，环节名称，例如：入场 & 签到",
      "detail": "字符串，该环节的说明、怎么玩"
    }
  ],
  "items": [
    "字符串，每一项是一个需要准备的物品说明"
  ],
  "tips": "字符串，整体建议或注意事项"
}

务必：
1. 输出有效 JSON（不要加注释、不要多余文字）。
2. timeline 建议 5～8 条，覆盖 从入场 到 结束 的流程。
3. 如果没给开始时间，可以用 T+0′、T+30′ 这类相对时间表示。
4. 风格偏实际可执行，避免太空洞的鸡汤。
`.trim();

app.post("/api/party-plan", async (req, res) => {
  try {
    const { theme, startTime, people, variantIndex = 0 } = req.body || {};

    const safeTheme = theme || "主题派对";
    const peopleText = people ? `${people} 人左右` : "人数待定";

    const userPrompt = `
派对信息如下：
- 主题：${safeTheme}
- 参与人数：${peopleText}
- 开始时间：${startTime || "未指定，请你自行假设一个合理的晚上时间，可用相对时间表示"}
- 方案风格编号：${variantIndex}（0 偏基础轻松，1 偏互动热闹，2 偏仪式感和氛围）

请按照之前给你的 JSON 格式输出一份策划方案。
注意：只输出 JSON，不要解释，也不要包裹在代码块里。
`.trim();

    const body = {
      model: MODEL_NAME,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    };

    const resp = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://your-app-domain-or-localhost", // 可填你的域名
        "X-Title": "Party Planner Demo",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("OpenRouter error:", resp.status, text);
      return res.status(500).json({ error: "OpenRouter 调用失败", detail: text });
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("模型没有返回内容");
    }

    // 期望 content 是纯 JSON 字符串
    let plan;
    try {
      plan = JSON.parse(content);
    } catch (e) {
      console.error("JSON 解析失败，原始内容：", content);
      throw new Error("模型输出不是合法 JSON");
    }

    return res.json(plan);
  } catch (err) {
    console.error("生成派对规划出错：", err);
    res.status(500).json({ error: "生成派对规划失败", detail: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
  console.log("静态页面请放在 /public 下，例如 public/index.html");
});
