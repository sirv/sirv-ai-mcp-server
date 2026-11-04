import { describe, it, expect } from "vitest";
import { z } from "zod";
import { BackgroundReplaceSchema } from "../../tools/image-processing.js";

const RemoveBackgroundSchema = z.object({
  image_url: z.string().url().describe("URL of the image to process"),
  provider: z
    .enum(["birefnet", "bria", "pixelcut"])
    .default("birefnet")
    .describe("Background removal provider"),
  model: z
    .enum([
      "General Use (Light)",
      "General Use (Light 2K)",
      "General Use (Heavy)",
      "Matting",
      "Portrait",
      "General Use (Dynamic)",
    ])
    .default("General Use (Heavy)")
    .describe("Model to use for background removal"),
  operating_resolution: z
    .enum(["1024x1024", "2048x2048", "2304x2304"])
    .default("1024x1024")
    .describe("Processing resolution"),
}).strict();

const UpscaleSchema = z.object({
  image_url: z.string().url().describe("URL of the image to upscale"),
  scale: z
    .number()
    .int()
    .min(2)
    .max(4)
    .default(2)
    .describe("Upscale factor: 2x, 3x, or 4x"),
  model: z
    .enum(["esrgan", "clarity", "topaz"])
    .default("esrgan")
    .describe("Upscaler model"),
  prompt: z.string().optional().describe("Optional prompt for clarity model"),
  creativity: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Creativity level for clarity model"),
}).strict();

const ObjectRemovalSchema = z.object({
  image_url: z.string().url().describe("URL of the image to edit"),
  mask_url: z.string().url().describe("URL of mask image"),
}).strict();

describe("RemoveBackgroundSchema", () => {
  it("accepts valid input with all fields", () => {
    const input = {
      image_url: "https://example.com/image.jpg",
      provider: "birefnet",
      model: "General Use (Heavy)",
      operating_resolution: "1024x1024",
    };

    const result = RemoveBackgroundSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("applies defaults for optional fields", () => {
    const input = {
      image_url: "https://example.com/image.jpg",
    };

    const result = RemoveBackgroundSchema.parse(input);
    expect(result.provider).toBe("birefnet");
    expect(result.model).toBe("General Use (Heavy)");
    expect(result.operating_resolution).toBe("1024x1024");
  });

  it("rejects invalid URL", () => {
    const input = {
      image_url: "not-a-url",
    };

    const result = RemoveBackgroundSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects invalid provider", () => {
    const input = {
      image_url: "https://example.com/image.jpg",
      provider: "invalid-provider",
    };

    const result = RemoveBackgroundSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    const input = {
      image_url: "https://example.com/image.jpg",
      unknown_field: "value",
    };

    const result = RemoveBackgroundSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("UpscaleSchema", () => {
  it("accepts valid input", () => {
    const input = {
      image_url: "https://example.com/image.jpg",
      scale: 2,
      model: "esrgan",
    };

    const result = UpscaleSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("applies default scale of 2", () => {
    const input = {
      image_url: "https://example.com/image.jpg",
    };

    const result = UpscaleSchema.parse(input);
    expect(result.scale).toBe(2);
  });

  it("rejects scale below 2", () => {
    const input = {
      image_url: "https://example.com/image.jpg",
      scale: 1,
    };

    const result = UpscaleSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects scale above 4", () => {
    const input = {
      image_url: "https://example.com/image.jpg",
      scale: 5,
    };

    const result = UpscaleSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects non-integer scale", () => {
    const input = {
      image_url: "https://example.com/image.jpg",
      scale: 2.5,
    };

    const result = UpscaleSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("accepts optional prompt and creativity for clarity model", () => {
    const input = {
      image_url: "https://example.com/image.jpg",
      model: "clarity",
      prompt: "enhance details",
      creativity: 0.5,
    };

    const result = UpscaleSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects creativity outside 0-1 range", () => {
    const input = {
      image_url: "https://example.com/image.jpg",
      creativity: 1.5,
    };

    const result = UpscaleSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("BackgroundReplaceSchema", () => {
  it("accepts valid input with prompt", () => {
    const input = {
      image_url: "https://example.com/image.jpg",
      prompt: "A beach at sunset",
      model: "bria",
    };

    const result = BackgroundReplaceSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("accepts valid input with reference image", () => {
    const input = {
      image_url: "https://example.com/image.jpg",
      ref_image_url: "https://example.com/background.jpg",
    };

    const result = BackgroundReplaceSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("accepts minimal input (only image_url)", () => {
    const input = {
      image_url: "https://example.com/image.jpg",
    };

    const result = BackgroundReplaceSchema.safeParse(input);
    expect(result.success).toBe(true);
    expect(result.data?.model).toBe("ideogram-keep");
  });

  it("accepts and canonicalizes the retired Nano Banana identifier", () => {
    const result = BackgroundReplaceSchema.parse({
      image_url: "https://example.com/image.jpg",
      model: "nano-banana",
    });

    expect(result.model).toBe("nano-banana-lite");
  });

  it("rejects invalid model", () => {
    const input = {
      image_url: "https://example.com/image.jpg",
      model: "invalid-model",
    };

    const result = BackgroundReplaceSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("ObjectRemovalSchema", () => {
  it("accepts valid input", () => {
    const input = {
      image_url: "https://example.com/image.jpg",
      mask_url: "https://example.com/mask.png",
    };

    const result = ObjectRemovalSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("requires mask_url", () => {
    const input = {
      image_url: "https://example.com/image.jpg",
    };

    const result = ObjectRemovalSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects invalid mask_url", () => {
    const input = {
      image_url: "https://example.com/image.jpg",
      mask_url: "not-a-url",
    };

    const result = ObjectRemovalSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
