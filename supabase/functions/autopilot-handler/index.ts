// supabase/functions/autopilot-handler/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("SB_URL");
const SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SB_SERVICE_ROLE_KEY");

const DEFAULT_SEED_PERSONA = "Warm, curious, and upbeat.";
const DEFAULT_HUMAN_PERSONA = "Warm, proactive, and excited to lock in a simple date plan.";

// ---------- FIXED: Realtime HTTP broadcast helper ----------
async function broadcast(matchId: string, event: string, payload: Record<string, unknown>) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return;

  // Topic MUST match the frontend channel name EXACTLY (no prefixes)
  const topic = `match:${matchId}`;

  const res = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    // Realtime expects: { messages: [{ topic, event, payload }] }
    body: JSON.stringify({
      messages: [
        {
          topic,
          event,
          payload,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Broadcast failed", event, errText);
  }
}

serve(async (req) => {
  if (req.method === "GET") return new Response("OK", { status: 200 });

  try {
    const payload = await req.json();
    const { message_id, match_id, sender_id, is_seed } = payload ?? {};

    if (!match_id || !message_id || !SUPABASE_URL || !SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
      return jsonResponse({ error: "Invalid or misconfigured request" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { data: match } = await supabase
      .from("matches")
      .select("id, user_a, user_b, seed_id, autopilot_enabled")
      .eq("id", match_id)
      .maybeSingle();

    if (!match) return jsonResponse({ error: "Match not found" }, 404);

    const seedId = match.seed_id ?? null;
    let recipientId: string | null = null;
    let recipientIsSeed = false;

    if (seedId) {
      if (is_seed === true) {
        // Seed spoke → human replies
        recipientIsSeed = false;
        recipientId = sender_id === match.user_a ? match.user_b : match.user_a;
      } else {
        // Human spoke → seed replies
        recipientIsSeed = true;
        recipientId = null;
      }
    } else {
      // Human ↔ Human
      recipientIsSeed = false;
      recipientId = sender_id === match.user_a ? match.user_b : match.user_a;
    }

    if (!recipientIsSeed && !recipientId) {
      return jsonResponse({ message: "No recipient for autopilot" }, 200);
    }

    // check recipient autopilot
    let recipientAutopilot = false;
    if (recipientIsSeed) {
      recipientAutopilot = true;
    } else if (recipientId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_pro")
        .eq("id", recipientId)
        .maybeSingle();
      recipientAutopilot = (profile?.is_pro ?? false) && (match.autopilot_enabled ?? true);
    }

    if (!recipientAutopilot) {
      return jsonResponse({ message: "Recipient autopilot disabled" }, 200);
    }

    // load context
    const [seedResult, profilesResult, messagesResult] = await Promise.all([
      seedId
        ? supabase
            .from("seed_profiles")
            .select(
              "seed_id, display_name, age, bio, persona_seed, prompts, hobbies, photo_urls, gender, gender_preference, height_cm, ethnicity",
            )
            .eq("seed_id", seedId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("profiles")
        .select(
          "id, display_name, age, bio, persona_seed, prompts, hobbies, photo_urls, gender, gender_preference, height_cm, ethnicity, is_pro",
        )
        .in("id", [match.user_a, match.user_b].filter(Boolean) as string[]),
      supabase
        .from("messages")
        .select("id, sender_id, is_seed, text, created_at")
        .eq("match_id", match_id)
        .order("created_at", { ascending: true }),
    ]);

    const messages = (messagesResult.data ?? []) as MessageRow[];

    // prevent double replies: cooldown and "already replied"
    const lastAI = messages.filter((m) => m.is_seed === recipientIsSeed).at(-1);
    if (lastAI && new Date(lastAI.created_at).getTime() > Date.now() - 8000) {
      return jsonResponse({ message: "Autopilot cooldown active" }, 200);
    }

    const lastMessage = messages.at(-1);
    if (!lastMessage || lastMessage.is_seed === recipientIsSeed) {
      return jsonResponse({ message: "Autopilot already replied" }, 200);
    }

    // broadcast "partner is typing"
    await broadcast(match_id, "autopilot_drafting", {
      match_id,
      sender_id: recipientId ?? "seed",
    });

    const reply = await generateReply({
      recipientId,
      recipientIsSeed,
      seedProfile: seedResult.data as SeedProfile | null,
      profiles: (profilesResult.data ?? []) as ProfileRow[],
      messages,
      match: match as MatchRow,
    });
    if (!reply) return jsonResponse({ message: "No reply generated" }, 200);

    // longer, human-ish typing delay
    const delay = Math.min(1500 + reply.length * 90, 10000);
    await new Promise((r) => setTimeout(r, delay));

    await supabase.from("messages").insert({
      match_id,
      sender_id: recipientIsSeed ? null : recipientId,
      is_seed: recipientIsSeed,
      text: reply,
    });

    // done typing
    await broadcast(match_id, "autopilot_drafting_done", {
      match_id,
      sender_id: recipientId ?? "seed",
    });

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("Autopilot Edge error:", err);
    return jsonResponse({ error: "Unexpected server error" }, 500);
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// === Types ===
type SeedProfile = {
  seed_id: string;
  display_name: string;
  age: number | null;
  bio: string | null;
  persona_seed: string | null;
  prompts: { question: string; answer: string }[] | null;
  hobbies: string[] | null;
  photo_urls: string[] | null;
  gender: string | null;
  gender_preference: string | null;
  height_cm: number | null;
  ethnicity: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  age: number | null;
  bio: string | null;
  persona_seed: string | null;
  prompts: { question: string; answer: string }[] | null;
  hobbies: string[] | null;
  photo_urls: string[] | null;
  gender: string | null;
  gender_preference: string | null;
  height_cm: number | null;
  ethnicity: string | null;
  is_pro: boolean | null;
};

type MessageRow = {
  id: string;
  sender_id: string | null;
  is_seed: boolean | null;
  text: string;
  created_at: string;
};

type MatchRow = {
  id: string;
  user_a: string | null;
  user_b: string | null;
  seed_id: string | null;
  autopilot_enabled: boolean | null;
};

// === AI Reply generation ===
async function generateReply(args: {
  recipientId: string | null;
  recipientIsSeed: boolean;
  seedProfile: SeedProfile | null;
  profiles: ProfileRow[];
  messages: MessageRow[];
  match: MatchRow;
}): Promise<string | null> {
  const { recipientId, recipientIsSeed, seedProfile, profiles, messages, match } = args;

  const recipientProfile = recipientIsSeed
    ? seedProfile
    : profiles.find((p) => p.id === recipientId) ?? null;

  const callerId = recipientIsSeed
    ? match.user_a
    : match.user_a === recipientId
    ? match.user_b
    : match.user_a;

  const callerProfile = callerId
    ? profiles.find((p) => p.id === callerId) ?? null
    : seedProfile;

  const persona = recipientIsSeed
    ? recipientProfile?.persona_seed ?? DEFAULT_SEED_PERSONA
    : (recipientProfile as ProfileRow | null)?.persona_seed ?? DEFAULT_HUMAN_PERSONA;

  const displayName = recipientIsSeed
    ? recipientProfile?.display_name ?? "Match"
    : (recipientProfile as ProfileRow | null)?.display_name ?? "Wingmate user";

  const prompt = buildPrompt(persona, displayName, summary(recipientProfile), summary(callerProfile));
  const conversation = mapConversation(messages, recipientIsSeed, recipientId ?? undefined);
  if (!conversation.length) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.7,
        max_tokens: 80,
        messages: [{ role: "system", content: prompt }, ...conversation],
      }),
    });

    if (!response.ok) return "That sounds fun—want to pick a time?";
    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() ?? "That sounds fun—want to pick a time?";
  } catch {
    return "That sounds fun—want to pick a time?";
  }
}

// === Utilities ===
type ProfileSummary = {
  name?: string;
  age?: number;
  gender?: string;
  genderPreference?: string;
  bio?: string;
  prompts?: { question: string; answer: string }[] | null;
  hobbies?: string[] | null;
  heightCm?: number | null;
  ethnicity?: string | null;
};

function summary(profile: SeedProfile | ProfileRow | null): ProfileSummary | null {
  if (!profile) return null;
  return {
    name: "display_name" in profile ? (profile.display_name ?? undefined) : undefined,
    age: (profile as any).age ?? undefined,
    gender: (profile as any).gender ?? undefined,
    genderPreference: (profile as any).gender_preference ?? undefined,
    bio: (profile as any).bio ?? undefined,
    prompts: (profile as any).prompts ?? null,
    hobbies: (profile as any).hobbies ?? null,
    heightCm: (profile as any).height_cm ?? undefined,
    ethnicity: (profile as any).ethnicity ?? undefined,
  };
}

function describeSummary(label: string, profile: ProfileSummary | null): string {
  if (!profile) return `${label}: (none provided)`;
  const parts: string[] = [];
  if (profile.name) parts.push(`name: ${profile.name}`);
  if (profile.age) parts.push(`age: ${profile.age}`);
  if (profile.gender) parts.push(`gender: ${profile.gender}`);
  if (profile.genderPreference) parts.push(`interested in: ${profile.genderPreference}`);
  if (profile.bio) parts.push(`bio: ${profile.bio}`);
  if (profile.hobbies?.length) parts.push(`hobbies: ${profile.hobbies.join(", ")}`);
  if (profile.prompts?.length)
    parts.push(`prompts: ${profile.prompts.slice(0, 4).map((p) => `${p.question}: ${p.answer}`).join(" | ")}`);
  if (typeof profile.heightCm === "number") parts.push(`height: ${profile.heightCm}cm`);
  if (profile.ethnicity) parts.push(`ethnicity: ${profile.ethnicity}`);
  return `${label}: ${parts.join("; ") || "(none provided)"}`;
}

function buildPrompt(personaSeed: string, userName: string, userProfile?: ProfileSummary, counterpartProfile?: ProfileSummary): string {
  return [
    `You are ${userName}, drafting a natural dating app reply to send as yourself.`,
    `PERSONA: ${personaSeed}`,
    describeSummary("Your profile", userProfile ?? null),
    describeSummary("Their profile", counterpartProfile ?? null),
    "GOALS:",
    "- Warm, confident, concise (1-2 short sentences).",
    "- Ask light questions to keep chat going.",
    "STYLE: Playful texting tone.",
  ].join("\n");
}

function mapConversation(messages: MessageRow[], assistantIsSeed: boolean, realUserId?: string) {
  return messages
    .map((msg) => ({
      role: assistantIsSeed
        ? msg.is_seed
          ? "assistant"
          : "user"
        : msg.sender_id && realUserId && msg.sender_id === realUserId
        ? "assistant"
        : "user",
      content: msg.text,
    }))
    .slice(-8);
}
