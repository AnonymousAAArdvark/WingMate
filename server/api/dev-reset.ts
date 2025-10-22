import type { VercelRequest, VercelResponse } from "@vercel/node";
import { config as loadEnv } from "dotenv";
import { supabase } from "../lib/supabase";

if (!process.env.SUPABASE_URL) {
  loadEnv({ path: ".env.local" });
}

const devFeaturesEnabled = process.env.DEV_FEATURES_ENABLED === "true";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  if (!devFeaturesEnabled) {
    res.status(403).json({ error: "Dev features disabled" });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const accessToken = authHeader.slice("Bearer ".length);
  const { data: auth, error } = await supabase.auth.getUser(accessToken);
  if (error || !auth?.user) {
    res.status(401).json({ error: "Invalid session" });
    return;
  }

  const userId = auth.user.id;

  try {
    const [{ error: delDismissed }, { error: delMatches }] = await Promise.all([
      supabase.from("dismissed_seeds").delete().eq("user_id", userId),
      supabase
        .from("matches")
        .delete()
        .eq("user_a", userId)
        .not("seed_id", "is", null),
    ]);

    if (delDismissed || delMatches) {
      console.error("dev-reset errors", delDismissed, delMatches);
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("dev-reset exception", e);
    res.status(500).json({ error: "Reset failed" });
  }
}

