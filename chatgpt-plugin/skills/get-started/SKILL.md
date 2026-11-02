---
name: get-started
description: Use when the user wants to edit, generate, or find product images with Sirv AI Studio.
---

# Get started with Sirv AI Studio

Sirv AI Studio edits and stores product images. The user signs in with their Studio account and picks a workspace. AI actions use that workspace's credits.

1. To edit an image, ask for an image URL, an uploaded file, or an asset in the user's library.
2. Pick the tool for the job:
   - background removal: `sirv_remove_background`
   - larger image: `sirv_upscale`
   - new scene or background: `sirv_product_lifestyle` or `sirv_background_replace`
   - alt text: `sirv_alt_text`, or `sirv_generate_asset_alt_text` to save it on a library asset
   - find images in the Studio library: `sirv_search_assets` (not the Sirv CDN file tools)
3. Show the result URL. The image result tools show the original and the result side by side.
4. Before a tool deletes assets or products, tell the user what goes and ask them to confirm.

If a tool says the workspace does not have enough credits, tell the user and give them the top-up link from the tool's answer.
