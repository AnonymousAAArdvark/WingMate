export const BASE_URL =
  process.env.EXPO_PUBLIC_BASE_URL || "http://localhost:3000";

type ProfileSummary = {
  name?: string;
  bio?: string;
  prompts?: { question: string; answer: string }[];
  hobbies?: string[];
};

type AutopilotDraftRequest = {
  accessToken: string;
  personaSeed: string;
  seedName: string;
  instructions: string;
  messages: { from: "user" | "seed"; text: string }[];
  preferDateSetup?: boolean;
  userProfile?: ProfileSummary;
  counterpartProfile?: ProfileSummary;
};

async function postChat<T>(
  payload: Record<string, unknown>,
  accessToken: string,
): Promise<T> {
  const response = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Failed to reach chat endpoint");
  }

  return (await response.json()) as T;
}
export async function fetchAutopilotDraft({
  accessToken,
  personaSeed,
  seedName,
  instructions,
  messages,
  preferDateSetup,
  userProfile,
  counterpartProfile,
}: AutopilotDraftRequest) {
  return postChat<{ reply: string }>(
    {
      autopilotDraft: true,
      personaSeed,
      seedName,
      instructions,
      messages,
      preferDateSetup,
      userProfile,
      counterpartProfile,
    },
    accessToken,
  );
}
