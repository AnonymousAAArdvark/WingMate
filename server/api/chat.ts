import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { config as loadEnv } from "dotenv";
import { supabase } from "../lib/supabase";
import type {
  MatchRow,
  MessageRow,
  ProfileRow,
  SeedProfileRow,
} from "../types/database";

if (!process.env.OPENAI_API_KEY || !process.env.SUPABASE_URL) {
  loadEnv({ path: ".env.local" });
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


type ProfileSummary = {
  name?: string;
  age?: number;
  gender?: string;
  genderPreference?: string;
  bio?: string;
  prompts?: SeedProfileRow["prompts"];
  hobbies?: string[];
  heightCm?: number | null;
  ethnicity?: string | null;
};

type ConversationFragment = {
  from: "user" | "seed";
  text: string;
};

type MatchChatRequest = {
  matchId: string;
  message: string;
};

type AutopilotDraftRequest = {
  autopilotDraft: true;
  personaSeed: string;
  seedName: string;
  instructions: string;
  messages: ConversationFragment[];
  preferDateSetup?: boolean;
  userProfile?: ProfileSummary;
  counterpartProfile?: ProfileSummary;
};

type ChatRequestBody = MatchChatRequest | AutopilotDraftRequest;

const fallbackReply = "That sounds fun—want to pick a time?";

function describeProfile(
  label: string,
  profile?: ProfileRow | SeedProfileRow | ProfileSummary | null,
) {
  if (!profile) return `${label}: (none provided)`;
  const descriptors: string[] = [];
  const name =
    "display_name" in profile
      ? profile.display_name
      : "name" in profile
        ? profile.name ?? null
        : null;
  const bio = "bio" in profile ? profile.bio ?? "" : "";
  const age = "age" in profile ? (profile as any).age ?? null : null;
  const gender = "gender" in profile ? (profile as any).gender ?? null : null;
  const genderPref =
    "gender_preference" in profile
      ? (profile as any).gender_preference ?? null
      : "genderPreference" in profile
        ? (profile as ProfileSummary).genderPreference ?? null
        : null;
  const height =
    "height_cm" in profile
      ? (profile as any).height_cm ?? null
      : "heightCm" in profile
        ? (profile as ProfileSummary).heightCm ?? null
        : null;
  const ethnicity =
    "ethnicity" in profile
      ? (profile as any).ethnicity ?? null
      : "ethnicity" in profile
        ? (profile as ProfileSummary).ethnicity ?? null
        : null;
  const personaSeed =
    "persona_seed" in profile ? profile.persona_seed ?? "" : undefined;
  const prompts = profile.prompts ?? [];
  const hobbies = profile.hobbies ?? [];

  if (name) descriptors.push(`name: ${name}`);
  if (age) descriptors.push(`age: ${age}`);
  if (gender) descriptors.push(`gender: ${gender}`);
  if (genderPref) descriptors.push(`interested in: ${genderPref}`);
  if (bio) descriptors.push(`bio: ${bio}`);
  if (hobbies.length) {
    descriptors.push(`hobbies: ${hobbies.join(", ")}`);
  }
  if (prompts.length) {
    descriptors.push(
      `prompts: ${prompts
        .slice(0, 4)
        .map((prompt) => `${prompt.question}: ${prompt.answer}`)
        .join(" | ")}`,
    );
  }
  if (personaSeed) {
    descriptors.push(`persona_seed: ${personaSeed}`);
  }
  if (height) {
    descriptors.push(`height: ${height}cm`);
  }
  if (ethnicity) {
    descriptors.push(`ethnicity: ${ethnicity}`);
  }

  return `${label}: ${descriptors.join("; ") || "(none provided)"}`;
}

function buildAutopilotPrompt(body: AutopilotDraftRequest) {
  return [
    `You are ${body.seedName}, drafting a natural dating app reply to send as yourself.`,
    `PERSONA: ${body.personaSeed}`,
    describeProfile("Your profile", body.userProfile ?? null),
    describeProfile("Their profile", body.counterpartProfile ?? null),
    "GOALS:",
    "- Keep it warm, confident, and concise (1-2 short sentences).",
    body.preferDateSetup
      ? "- If it fits, suggest a simple plan (coffee, walk) with a light tone."
      : "- Move the conversation forward without forcing plans if it feels too early.",
    "STYLE: Texting tone; stay playful, no formalities or links.",
    "SAFETY: Keep conversation friendly; avoid sensitive data requests.",
  ].join("\n");
}

// Variant to build prompt from individual pieces (used for both seed and human autopilot)
function toProfileSummaryFromRow(
  profile?: ProfileRow | SeedProfileRow | null,
): ProfileSummary {
  return {
    name: profile?.display_name ?? undefined,
    age: (profile as any)?.age ?? undefined,
    gender: (profile as any)?.gender ?? undefined,
    genderPreference: (profile as any)?.gender_preference ?? undefined,
    bio: profile?.bio ?? undefined,
    prompts: profile?.prompts ?? undefined,
    hobbies: profile?.hobbies ?? undefined,
    heightCm: (profile as any)?.height_cm ?? undefined,
    ethnicity: (profile as any)?.ethnicity ?? undefined,
  };
}

function toAutopilotHistory(
  fragments: ConversationFragment[],
): ChatCompletionMessageParam[] {
  return fragments.map((fragment) => ({
    role: fragment.from === "seed" ? "assistant" : "user",
    content: fragment.text,
  }));
}

async function generateAutopilotDraft(body: AutopilotDraftRequest) {
  const prompt = buildAutopilotPrompt(body);
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    temperature: 0.7,
    max_tokens: 80,
    messages: [
      { role: "system", content: prompt },
      ...toAutopilotHistory(body.messages),
      { role: "user", content: body.instructions },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() ?? fallbackReply;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const accessToken = authHeader.slice("Bearer ".length);
    const {
      data: authData,
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (authError || !authData?.user) {
      res.status(401).json({ error: "Invalid session" });
      return;
    }

    const callerId = authData.user.id;
    const body = req.body as ChatRequestBody;

    if ("autopilotDraft" in body && body.autopilotDraft) {
      try {
        const reply = await generateAutopilotDraft(body);
        res.status(200).json({ reply });
      } catch (error) {
        console.error("Autopilot draft error", error);
        res.status(200).json({ reply: fallbackReply });
      }
      return;
    }
  } catch (error) {
    console.error("AI chat error", error);
    res.status(200).json({ error: fallbackReply });
  }
}
