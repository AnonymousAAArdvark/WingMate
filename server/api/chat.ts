import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { config as loadEnv } from "dotenv";

if (!process.env.OPENAI_API_KEY) {
  loadEnv({ path: ".env.local" });
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ChatRequestBody = {
  seedId: string;
  seedName: string;
  personaSeed: string;
  lastMessages?: { from: "user" | "seed"; text: string }[];
  userMessage: string;
  preferDateSetup?: boolean;
  userProfile?: {
    name?: string;
    bio?: string;
    prompts?: { question: string; answer: string }[];
    hobbies?: string[];
  };
  counterpartProfile?: {
    name?: string;
    bio?: string;
    prompts?: { question: string; answer: string }[];
    hobbies?: string[];
  };
};

const fallbackReply = "That sounds fun—want to pick a time?";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  try {
    const body = req.body as ChatRequestBody;

    if (!body?.seedName || !body?.personaSeed || !body?.userMessage) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const formatProfile = (
      label: string,
      p?: ChatRequestBody["userProfile"],
    ) => {
      if (!p) return `${label}: (none provided)`;
      const lines: string[] = [];
      if (p.name) lines.push(`name: ${p.name}`);
      if (p.bio) lines.push(`bio: ${p.bio}`);
      if (p.hobbies?.length) lines.push(`hobbies: ${p.hobbies.join(", ")}`);
      if (p.prompts?.length) {
        const ps = p.prompts
          .slice(0, 4)
          .map((q) => `${q.question}: ${q.answer}`)
          .join(" | ");
        lines.push(`prompts: ${ps}`);
      }
      return `${label}: ${lines.join("; ")}`;
    };

    const systemPrompt = [
      `You are ${body.seedName}, role-playing naturally in a dating chat.`,
      `PERSONA: ${body.personaSeed}`,
      formatProfile("Your profile", body.userProfile),
      formatProfile("Other person", body.counterpartProfile),
      "GOALS: Be warm and concise (<= 2 short sentences). Ask light questions to keep chat going.",
      "If meeting is hinted or preferDateSetup=true, propose a simple coffee/walk plan with day/time.",
      "STYLE: Casual texting; avoid over-formality or external links.",
      "SAFETY: Do not request sensitive info.",
    ].join("\n");

    const history: ChatCompletionMessageParam[] =
      body.lastMessages?.map((message) => ({
        role: message.from === "user" ? "user" : "assistant",
        content: message.text,
      })) ?? [];

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: body.userMessage },
    ];

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 80,
      messages,
    });

    const reply =
      completion.choices[0]?.message?.content?.trim() ?? fallbackReply;

    res.status(200).json({ reply });
  } catch (error) {
    console.error("AI chat error", error);
    res.status(200).json({ reply: fallbackReply });
  }
}
