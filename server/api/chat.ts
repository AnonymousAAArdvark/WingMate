import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { config as loadEnv } from "dotenv";
import { randomUUID } from "crypto";
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

const devFeaturesEnabled = process.env.DEV_FEATURES_ENABLED === "true";

type ProfileSummary = {
  name?: string;
  bio?: string;
  prompts?: SeedProfileRow["prompts"];
  hobbies?: string[];
};

type ConversationFragment = {
  from: "user" | "seed";
  text: string;
};

type MatchChatRequest = {
  matchId: string;
  preferDateSetup?: boolean;
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
const MAX_AUTOPILOT_TURNS = parseInt(
  process.env.AUTOPILOT_MAX_TURNS || "5",
  10,
);

// Delay helpers to simulate realistic reading/typing gaps
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function calculateDelay(messageText: string): number {
  const baseDelay = 1000 + Math.random() * 1000; // 1–2s reading
  const typingDelay = (messageText.length / 4) * 1000; // ~4 chars/sec
  return Math.min(baseDelay + typingDelay, 5000); // cap at 5s
}

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
  const personaSeed =
    "persona_seed" in profile ? profile.persona_seed ?? "" : undefined;
  const prompts = profile.prompts ?? [];
  const hobbies = profile.hobbies ?? [];

  if (name) descriptors.push(`name: ${name}`);
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
function buildAutopilotPromptFromPieces(
  personaSeed: string,
  userName: string,
  userProfile?: ProfileSummary,
  counterpartProfile?: ProfileSummary,
  preferDateSetup?: boolean,
) {
  return [
    `You are ${userName}, drafting a natural dating app reply to send as yourself.`,
    `PERSONA: ${personaSeed}`,
    describeProfile("Your profile", userProfile ?? null),
    describeProfile("Their profile", counterpartProfile ?? null),
    "MEMORY & CONSISTENCY:",
    "- ALWAYS stay consistent with 'Your profile' facts.",
    "- If asked about favorites, prompts, hobbies, or bio details, answer using those facts.",
    "- If something is unknown, use your persona to respond gracefully, but do not contradict known facts.",
    "GOALS:",
    "- Keep it warm, confident, and concise (1-2 short sentences).",
    "- Ask light questions to keep chat going.",
    preferDateSetup
      ? "- If it fits, suggest a simple plan (coffee, walk) with a light tone."
      : "- Move the conversation forward without forcing plans if it feels too early.",
    "STYLE: Texting tone; stay playful, no formalities or links.",
    "SAFETY: Keep conversation friendly; avoid sensitive data requests.",
  ].join("\n");
}

function toHistory(messages: MessageRow[]): ChatCompletionMessageParam[] {
  return messages.map((message) => ({
    role: message.is_seed ? "assistant" : "user",
    content: message.text,
  }));
}

function toAutopilotHistory(
  fragments: ConversationFragment[],
): ChatCompletionMessageParam[] {
  return fragments.map((fragment) => ({
    role: fragment.from === "seed" ? "assistant" : "user",
    content: fragment.text,
  }));
}

function toRoleMappedHistory(
  messages: MessageRow[],
  assistantIsSeed: boolean,
  realUserId?: string,
): ChatCompletionMessageParam[] {
  return messages.map((m) => ({
    role: assistantIsSeed
      ? m.is_seed
        ? "assistant"
        : "user"
      : m.sender_id && realUserId && m.sender_id === realUserId
        ? "assistant"
        : "user",
    content: m.text,
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

async function generateAutopilotReply(params: {
  personaSeed: string;
  userName: string;
  userProfile?: ProfileSummary;
  counterpartProfile?: ProfileSummary;
  conversation: MessageRow[];
  assistantIsSeed: boolean;
  realUserId?: string;
  preferDateSetup?: boolean;
}): Promise<string> {
  const {
    personaSeed,
    userName,
    userProfile,
    counterpartProfile,
    conversation,
    assistantIsSeed,
    realUserId,
    preferDateSetup,
  } = params;

  const prompt = buildAutopilotPromptFromPieces(
    personaSeed,
    userName,
    userProfile,
    counterpartProfile,
    preferDateSetup,
  );

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    temperature: 0.7,
    max_tokens: 80,
    messages: [
      { role: "system", content: prompt },
      ...toRoleMappedHistory(conversation.slice(-8), assistantIsSeed, realUserId),
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

    if (!("matchId" in body) || !body.matchId) {
      res.status(400).json({ error: "Missing matchId" });
      return;
    }

    const matchBody = body as MatchChatRequest;

    const { data: matchRecord, error: matchError } = await supabase
      .from("matches")
      .select("id, user_a, user_b, seed_id, autopilot_enabled")
      .eq("id", matchBody.matchId)
      .maybeSingle();

    const match = (matchRecord ?? null) as MatchRow | null;

    if (matchError) {
      console.error("Failed to load match", matchError);
      res.status(500).json({ error: "Unable to load match" });
      return;
    }

    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    if (![match.user_a, match.user_b].includes(callerId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (!match.seed_id) {
      res.status(400).json({ error: "AI replies only available for seed matches" });
      return;
    }

    const [{ data: seedRecord }, { data: userRecord }] = await Promise.all([
      supabase
        .from("seed_profiles")
        .select(
          "seed_id, display_name, bio, persona_seed, prompts, hobbies, photo_url, is_active",
        )
        .eq("seed_id", match.seed_id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select(
          "id, display_name, age, bio, persona_seed, prompts, hobbies, photo_urls, is_pro",
        )
        .eq("id", callerId)
        .maybeSingle(),
    ]);

    const seedProfile = (seedRecord ?? null) as SeedProfileRow | null;
    const userProfile = (userRecord ?? null) as ProfileRow | null;

    if (!seedProfile) {
      res.status(404).json({ error: "Seed profile not found" });
      return;
    }

    const { data: messageRecords, error: messagesError } = await supabase
      .from("messages")
      .select("id, match_id, sender_id, is_seed, text, created_at")
      .eq("match_id", match.id)
      .order("created_at", { ascending: true })
      .limit(20);

    const messages = (messageRecords ?? []) as MessageRow[];

    if (messagesError) {
      console.error("Failed to load messages", messagesError);
      res.status(500).json({ error: "Unable to load messages" });
      return;
    }

    // First reply is always from the seed (treated as Pro with autopilot)
    let reply = fallbackReply;
    try {
      reply = await generateAutopilotReply({
        personaSeed: seedProfile.persona_seed ?? "Warm, curious, and upbeat.",
        userName: seedProfile.display_name,
        userProfile: {
          name: seedProfile.display_name,
          bio: seedProfile.bio ?? undefined,
          prompts: seedProfile.prompts ?? undefined,
          hobbies: seedProfile.hobbies ?? undefined,
        },
        counterpartProfile: {
          name: userProfile?.display_name ?? undefined,
          bio: userProfile?.bio ?? undefined,
          prompts: userProfile?.prompts ?? undefined,
          hobbies: userProfile?.hobbies ?? undefined,
        },
        conversation: messages,
        assistantIsSeed: true,
        preferDateSetup: matchBody.preferDateSetup,
      });
    } catch (error) {
      console.error("OpenAI chat error", error);
    }

    // Delay to simulate thinking/typing
    await sleep(calculateDelay(reply));

    const { data: insertedMessage, error: insertError } = await supabase
      .from("messages")
      .insert({
        match_id: match.id,
        sender_id: null,
        is_seed: true,
        text: reply,
      })
      .select("id, created_at")
      .single();

    if (insertError) {
      console.error("Failed to persist AI reply", insertError);
    }

    const seedMessageRow: MessageRow = {
      id: insertedMessage?.id ?? randomUUID(),
      match_id: match.id,
      sender_id: null,
      is_seed: true,
      text: reply,
      created_at:
        insertedMessage?.created_at ?? new Date().toISOString(),
    };

    if (!insertError) {
      const insertedReplies: { text: string; from: "seed" | "user" }[] = [
        { text: reply, from: "seed" },
      ];
      let conversation = [...messages, seedMessageRow];

      const humanAutopilot = match.autopilot_enabled && (userProfile?.is_pro ?? false);
      const seedAutopilot = true;

      let humanTurns = 0;
      let seedTurns = 1;

      while (
        humanAutopilot &&
        seedAutopilot &&
        humanTurns < MAX_AUTOPILOT_TURNS &&
        seedTurns < MAX_AUTOPILOT_TURNS
      ) {
        try {
          const humanReply = await generateAutopilotReply({
            personaSeed:
              userProfile?.persona_seed ??
              "Warm, proactive, and excited to lock in a simple date plan.",
            userName: userProfile?.display_name ?? "Wingmate user",
            userProfile: {
              name: userProfile?.display_name ?? undefined,
              bio: userProfile?.bio ?? undefined,
              prompts: userProfile?.prompts ?? undefined,
              hobbies: userProfile?.hobbies ?? undefined,
            },
            counterpartProfile: {
              name: seedProfile.display_name,
              bio: seedProfile.bio ?? undefined,
              prompts: seedProfile.prompts ?? undefined,
              hobbies: seedProfile.hobbies ?? undefined,
            },
            conversation,
            assistantIsSeed: false,
            realUserId: match.user_a,
            preferDateSetup: true,
          });

          const cleanedHuman = humanReply.trim();
          if (!cleanedHuman) break;
          await sleep(calculateDelay(cleanedHuman));
          const { data: humanIns, error: humanInsErr } = await supabase
            .from("messages")
            .insert({
              match_id: match.id,
              sender_id: match.user_a,
              is_seed: false,
              text: cleanedHuman,
            })
            .select("id, created_at")
            .single();
          if (humanInsErr) break;
          const humanMessage: MessageRow = {
            id: humanIns?.id ?? randomUUID(),
            match_id: match.id,
            sender_id: match.user_a,
            is_seed: false,
            text: cleanedHuman,
            created_at: humanIns?.created_at ?? new Date().toISOString(),
          };
          conversation.push(humanMessage);
          insertedReplies.push({ text: cleanedHuman, from: "user" });
          humanTurns += 1;
        } catch (e) {
          console.error("Autopilot (human) loop failed", e);
          break;
        }

        if (seedTurns >= MAX_AUTOPILOT_TURNS) break;

        try {
          const seedReply2 = await generateAutopilotReply({
            personaSeed: seedProfile.persona_seed ?? "Warm, curious, and upbeat.",
            userName: seedProfile.display_name,
            userProfile: {
              name: seedProfile.display_name,
              bio: seedProfile.bio ?? undefined,
              prompts: seedProfile.prompts ?? undefined,
              hobbies: seedProfile.hobbies ?? undefined,
            },
            counterpartProfile: {
              name: userProfile?.display_name ?? undefined,
              bio: userProfile?.bio ?? undefined,
              prompts: userProfile?.prompts ?? undefined,
              hobbies: userProfile?.hobbies ?? undefined,
            },
            conversation,
            assistantIsSeed: true,
            preferDateSetup: matchBody.preferDateSetup,
          });

          const cleanedSeed2 = seedReply2.trim();
          if (!cleanedSeed2) break;
          await sleep(calculateDelay(cleanedSeed2));
          const { data: seedIns, error: seedInsErr } = await supabase
            .from("messages")
            .insert({
              match_id: match.id,
              sender_id: null,
              is_seed: true,
              text: cleanedSeed2,
            })
            .select("id, created_at")
            .single();
          if (seedInsErr) break;
          const seedMessage2: MessageRow = {
            id: seedIns?.id ?? randomUUID(),
            match_id: match.id,
            sender_id: null,
            is_seed: true,
            text: cleanedSeed2,
            created_at: seedIns?.created_at ?? new Date().toISOString(),
          };
          conversation.push(seedMessage2);
          insertedReplies.push({ text: cleanedSeed2, from: "seed" });
          seedTurns += 1;
        } catch (e) {
          console.error("Autopilot (seed) loop failed", e);
          break;
        }
      }

      return res
        .status(200)
        .json({ reply: insertedReplies[0]?.text ?? fallbackReply, replies: insertedReplies });
    }

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("AI chat error", error);
    res.status(200).json({ reply: fallbackReply });
  }
}
