import express, { Request, Response } from "express";
import OpenAI from "openai";
import adminAuthMiddleware from "../../middleware/adminAuth";

const router = express.Router();

function getOpenAIClient(): OpenAI {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not configured");
    }

    return new OpenAI({ apiKey });
}

const PRODUCT_CATEGORIES = ["Home Decor", "Desktop Figurines", "Customisable"] as const;

const PRODUCT_DETAILS_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        title: {
            type: "string",
            description: "SEO-friendly Amazon-style product title.",
        },
        description: {
            type: "string",
            description: "SEO-friendly product description.",
        },
        keywords: {
            type: "array",
            items: { type: "string" },
            description: "Search keywords relevant to the product.",
        },
        categories: {
            type: "array",
            items: {
                type: "string",
            },
            description: "One or more matching categories from the allowed list.",
        },
    },
    required: ["title", "description", "keywords", "categories"],
} as const;

router.get("/product-details", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
        }

        const openai = getOpenAIClient();

        const imageUrl = String(req.query.imageUrl ?? "").trim();
        const productName = String(req.query.name ?? req.query.productName ?? "").trim();
        const categories = String(req.query.categories ?? "").trim();

        if (!imageUrl || !productName) {
            return res.status(400).json({
                error: "imageUrl and name query parameters are required",
            });
        }

        try {
            new URL(imageUrl);
        } catch {
            return res.status(400).json({ error: "imageUrl must be a valid URL" });
        }

        const prompt = `I have provided the image of my product, its name is ${productName}.
Provide a description for the product which is SEO friendly.
Provide a title for the product which is SEO friendly on amazon.
Provide an array of search keywords for the product.
Categorize the product among following categories (you may multi select) - ${categories || PRODUCT_CATEGORIES.join(", ")}.`;

        const response = await openai.responses.create({
            model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
            input: [
                {
                    role: "user",
                    content: [
                        {
                            type: "input_text",
                            text: `${prompt}\nReturn only JSON matching the provided schema.`,
                        },
                        {
                            type: "input_image",
                            image_url: imageUrl,
                            detail: "auto",
                        },
                    ],
                },
            ],
            text: {
                format: {
                    type: "json_schema",
                    name: "product_details",
                    strict: true,
                    schema: PRODUCT_DETAILS_SCHEMA,
                },
            },
        });

        if (!response.output_text) {
            return res.status(502).json({ error: "OpenAI returned an empty response" });
        }

        const productDetails = JSON.parse(response.output_text) as {
            title: string;
            description: string;
            keywords: string[];
            categories: (typeof PRODUCT_CATEGORIES)[number][];
        };

        return res.json(productDetails);
    } catch (err) {
        console.error("admin GET /product-details error:", err);

        const message = err instanceof Error ? err.message : "Internal server error";
        return res.status(500).json({ error: message });
    }
});

export default router;
