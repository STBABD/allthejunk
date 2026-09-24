const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

const PROMPT = `You are reading a photo or scan of a golf scorecard. Some cards label separate rows "Men's" and "Ladies'" — use the Men's ones. Other cards don't label by gender at all, but still print more than one Handicap/Stroke Index row, one per tee color (e.g. one paired with a Blue/White tee block, another lower down paired with a Red/forward tee block). In that case, use the Handicap row that sits directly next to the main "Par" row — that's the card's primary Stroke Index. Ignore any second Handicap row further down that's specifically paired with a shorter forward tee.

Extract Par and Stroke Index for each of the 18 holes.

Respond with ONLY a JSON object and nothing else — no markdown fences, no explanation before or after. Use exactly this shape:

{"holes":[{"hole":1,"par":4,"stroke_index":5}, ... one entry for holes 1 through 18]}

Rules:
- If you cannot clearly read a value for a given hole, use null for that field rather than guessing. Never estimate or infer a plausible-looking number — only report digits you can actually see printed on the card.
- Stroke Index may also be labeled "Handicap," "HDCP," "S.I.," or "Hcp" on the card.
- If the card only has 9 holes visible, still return an entry for each hole you can see, using its actual printed hole number.`;

exports.readScorecard = onCall(
  { secrets: [anthropicApiKey], cors: true, timeoutSeconds: 60 },
  async (request) => {
    const { imageBase64, mediaType } = request.data || {};
    if (!imageBase64 || !mediaType) {
      throw new HttpsError("invalid-argument", "Missing imageBase64 or mediaType.");
    }
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    let response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicApiKey.value(),
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1500,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
              { type: "text", text: PROMPT }
            ]
          }]
        })
      });
    } catch (e) {
      throw new HttpsError("unavailable", "Couldn't reach the vision API: " + e.message);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new HttpsError("internal", "Vision API returned " + response.status + ": " + errText.slice(0, 300));
    }

    const data = await response.json();
    const text = (data.content || []).map((b) => b.text || "").join("").trim();

    let parsed;
    try {
      const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      throw new HttpsError("internal", "Vision API response wasn't valid JSON: " + text.slice(0, 300));
    }

    if (!parsed || !Array.isArray(parsed.holes)) {
      throw new HttpsError("internal", "Vision API response was missing the expected 'holes' array.");
    }

    return { holes: parsed.holes };
  }
);