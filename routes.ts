import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import sharp from "sharp";

function generateUKPricing(brand: string, condition: string) {
  const brandPrices: Record<string, number> = {
    nike: 22,
    adidas: 20,
    zara: 12,
    "h&m": 8,
    gucci: 95,
    prada: 85,
    "ralph lauren": 30,
    levi: 18,
    uniqlo: 10,
    gap: 9,
    "north face": 35,
    patagonia: 40,
    carhartt: 28,
    "tommy hilfiger": 25,
    superdry: 16,
    primark: 5,
    asos: 8,
    "river island": 10,
    topshop: 12,
    "ted baker": 25,
    burberry: 75,
    barbour: 45,
  };

  const conditionMultipliers: Record<string, number> = {
    "new with tags": 1.0,
    "like new": 0.85,
    "very good": 0.7,
    good: 0.55,
    satisfactory: 0.4,
  };

  const brandKey = brand.toLowerCase();
  let basePrice = 15;
  for (const [key, price] of Object.entries(brandPrices)) {
    if (brandKey.includes(key)) {
      basePrice = price;
      break;
    }
  }

  let condMult = 0.7;
  for (const [key, mult] of Object.entries(conditionMultipliers)) {
    if (condition.toLowerCase().includes(key)) {
      condMult = mult;
      break;
    }
  }

  const maxProfit = Math.max(3, Math.round(basePrice * condMult + Math.random() * 5));
  const quickSell = Math.max(2, Math.round(maxProfit * 0.65));

  const baseProbability = Math.min(
    99,
    Math.max(15, Math.round(60 * condMult + Math.random() * 20 + (basePrice > 20 ? 10 : 0))),
  );

  return { quickSellPrice: quickSell, maxProfitPrice: maxProfit, sellProbability: baseProbability };
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/enhance", async (req: Request, res: Response) => {
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "Image is required" });
      }

      const inputBuffer = Buffer.from(imageBase64, "base64");

      const jpegBuffer = await sharp(inputBuffer)
        .jpeg({ quality: 95 })
        .toBuffer();

      const enhanced = await sharp(jpegBuffer)
        .modulate({
          brightness: 1.12,
          saturation: 1.15,
        })
        .linear(1.18, -(128 * 1.18 - 128))
        .sharpen({ sigma: 1.2, m1: 1.0, m2: 0.5 })
        .normalise()
        .jpeg({ quality: 90 })
        .toBuffer();

      const convertedOriginal = jpegBuffer.toString("base64");
      const enhancedBase64 = enhanced.toString("base64");
      return res.json({ enhancedBase64, convertedOriginal });
    } catch (err: any) {
      console.error("Enhance error:", err?.message || err);
      return res.status(500).json({ error: "Image enhancement failed" });
    }
  });

  app.post("/api/analyze-stream", async (req: Request, res: Response) => {
    try {
      const { images, apiKey } = req.body;

      const imageList: string[] = images || [];

      if (imageList.length === 0 || !apiKey) {
        return res.status(400).json({ error: "At least one image and API key are required" });
      }

      const openai = new OpenAI({ apiKey });

      const imageContent = imageList.map((img: string) => ({
        type: "image_url" as const,
        image_url: {
          url: `data:image/jpeg;base64,${img}`,
        },
      }));

      const photoCount = imageList.length;
      const photoText =
        photoCount === 1
          ? "Analyze this clothing item for resale on Vinted UK."
          : `These ${photoCount} photos show the same clothing item from different angles. Analyze them together and return a single listing for Vinted UK.`;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        stream: true,
        messages: [
          {
            role: "system",
            content: `You are a top-selling Vinted UK clothing reseller assistant. Analyze the clothing item in the ORIGINAL unedited photo(s) carefully.

Return a JSON object with these fields:

- brand: The brand name (look at labels, tags, logos carefully)
- category: The clothing category (e.g., T-Shirt, Jeans, Jacket, Dress, Sneakers, Hoodie)
- title: A punchy Vinted listing title (max 80 chars), include brand + size if visible
- material: The likely material composition
- condition: One of "New with tags", "Like new", "Very good", "Good", "Satisfactory"
- conditionScore: A Vinted-style condition score, e.g. "Very Good - minor signs of wear on collar" or "Satisfactory - small stain on front" or "Like New - no visible flaws". Be specific about any flaws you see.
- flaws: List any imperfections found: stains, holes, pilling, loose threads, fading, stretched elastic, broken zips, missing buttons, or signs of wear. If none found, say "No visible flaws detected". Be honest and detailed.
- description: Write a punchy, bullet-pointed Vinted UK listing description in this exact format:

\u2022 Brand: [brand name]
\u2022 Size: [size if visible, or "See measurements"]
\u2022 Condition: [condition with flaw details]
\u2022 Material: [material]
\u2022 Colour: [colour]
\u2022 Details: [1-2 key selling points]

[One punchy selling sentence about the item]

#[brand] #[category] #[relevant trend/style tag]

IMPORTANT: Scan the image carefully for ANY imperfections: stains, holes, pilling, bobbling, loose threads, fading, discolouration, stretched areas, or general wear. Report them honestly in conditionScore and flaws fields.

If multiple images are provided, they show the same item from different angles. Combine all information into one listing.
Return ONLY valid JSON, no markdown formatting or code blocks.`,
          },
          {
            role: "user",
            content: [
              ...imageContent,
              {
                type: "text" as const,
                text: photoText,
              },
            ],
          },
        ],
        max_tokens: 800,
      });

      let fullContent = "";

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        if (delta) {
          fullContent += delta;
          res.write(`data: ${JSON.stringify({ delta, done: false })}\n\n`);
        }
      }

      let parsed;
      try {
        const cleanContent = fullContent
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
        parsed = JSON.parse(cleanContent);
      } catch {
        res.write(`data: ${JSON.stringify({ error: "Failed to parse AI response", done: true })}\n\n`);
        res.end();
        return;
      }

      const pricing = generateUKPricing(parsed.brand || "", parsed.condition || "");

      const finalResult = {
        ...parsed,
        ...pricing,
        suggestedPrice: pricing.maxProfitPrice,
      };

      res.write(`data: ${JSON.stringify({ result: finalResult, done: true })}\n\n`);
      res.end();
    } catch (err: any) {
      console.error("Analyze stream error:", err?.message || err);
      const message =
        err?.status === 401
          ? "Invalid API key"
          : err?.message || "Analysis failed";
      try {
        if (!res.headersSent) {
          return res.status(err?.status || 500).json({ error: message });
        }
        res.write(`data: ${JSON.stringify({ error: message, done: true })}\n\n`);
        res.end();
      } catch {
        res.end();
      }
    }
  });

  app.post("/api/analyze", async (req: Request, res: Response) => {
    try {
      const { imageBase64, images, apiKey } = req.body;

      const imageList: string[] = images || (imageBase64 ? [imageBase64] : []);

      if (imageList.length === 0 || !apiKey) {
        return res
          .status(400)
          .json({ error: "At least one image and API key are required" });
      }

      const openai = new OpenAI({ apiKey });

      const imageContent = imageList.map((img: string) => ({
        type: "image_url" as const,
        image_url: {
          url: `data:image/jpeg;base64,${img}`,
        },
      }));

      const photoCount = imageList.length;
      const photoText =
        photoCount === 1
          ? "Analyze this clothing item for resale on Vinted UK."
          : `These ${photoCount} photos show the same clothing item from different angles. Analyze them together and return a single listing for Vinted UK.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a top-selling Vinted UK clothing reseller assistant. Analyze the clothing item carefully.

Return a JSON object with these fields:
- brand: The brand name
- category: The clothing category
- title: A punchy Vinted listing title (max 80 chars)
- material: The likely material composition
- condition: One of "New with tags", "Like new", "Very good", "Good", "Satisfactory"
- conditionScore: A Vinted-style condition score with details
- flaws: Any imperfections found
- description: A bullet-pointed Vinted UK listing description

Return ONLY valid JSON, no markdown formatting or code blocks.`,
          },
          {
            role: "user",
            content: [
              ...imageContent,
              { type: "text" as const, text: photoText },
            ],
          },
        ],
        max_tokens: 800,
      });

      const content = response.choices[0]?.message?.content || "";

      let parsed;
      try {
        const cleanContent = content
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
        parsed = JSON.parse(cleanContent);
      } catch {
        return res.status(500).json({ error: "Failed to parse AI response" });
      }

      const pricing = generateUKPricing(parsed.brand || "", parsed.condition || "");

      return res.json({
        ...parsed,
        ...pricing,
        suggestedPrice: pricing.maxProfitPrice,
      });
    } catch (err: any) {
      console.error("Analyze error:", err?.message || err);
      const message =
        err?.status === 401
          ? "Invalid API key"
          : err?.message || "Analysis failed";
      return res.status(err?.status || 500).json({ error: message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
