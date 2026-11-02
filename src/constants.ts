export const CHARACTER_LIMIT = 25000;

export const BIREFNET_MODELS = {
  general: "General Use (Heavy)",
  portrait: "Portrait",
} as const;

export const BIREFNET_V2_MODELS = {
  light: "General Use (Light)",
  light2k: "General Use (Light 2K)",
  heavy: "General Use (Heavy)",
  matting: "Matting",
  portrait: "Portrait",
  dynamic: "General Use (Dynamic)",
} as const;

export const UPSCALE_MODELS = {
  esrgan: "esrgan",
  clarity: "clarity",
  topaz: "topaz",
} as const;

export const GENERATE_MODELS = {
  "nano-banana-2-lite": "nano-banana-2-lite",
  "nano-banana-2": "nano-banana-2",
  flux3: "flux3",
  zimage: "zimage",
  gemini: "gemini",
  seedream: "seedream",
} as const;

export const IMAGE_TO_IMAGE_MODELS = {
  "nano-banana-lite-edit": "nano-banana-lite-edit",
  "nano-banana-2-edit": "nano-banana-2-edit",
  "flux3-edit": "flux3-edit",
  "qwen-integrate-product": "qwen-integrate-product",
} as const;

export const BACKGROUND_REPLACE_MODELS = {
  "nano-banana-lite": "nano-banana-lite",
  bria: "bria",
  "flux3-edit": "flux3-edit",
} as const;

export const ALT_TEXT_DETAIL_LEVELS = {
  caption: "caption",
  "detailed-caption": "detailed-caption",
  "more-detailed-caption": "more-detailed-caption",
} as const;

export const IMAGE_TO_3D_MODELS = {
  meshy: "meshy",
  "meshy-multi": "meshy-multi",
  seed3d: "seed3d",
  trellis: "trellis",
  trellis2: "trellis2",
  hunyuan3d: "hunyuan3d",
} as const;

export const VIDEO_MODELS = {
  veo31: "veo31",
  ltx: "ltx",
  kling: "kling",
  "h3-max": "h3-max",
} as const;

export const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"] as const;
