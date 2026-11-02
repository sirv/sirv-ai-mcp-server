# Sirv AI MCP Server

MCP (Model Context Protocol) server for Sirv AI Studio - AI-powered image and video processing.

## Features

This MCP server exposes 54 tools across AI processing, asset management, product management, Shopify integration, Supplier Portal operations and Sirv CDN file management:

### Image Processing
- **sirv_remove_background** - Remove backgrounds from images using BiRefNet or Bria
- **sirv_upscale** - Upscale images 2-4x using ESRGAN, Clarity, or Topaz
- **sirv_background_replace** - Replace image backgrounds with AI-generated scenes
- **sirv_object_removal** - Remove objects from images, or fill a masked area from a prompt
- **sirv_depth_map** - Generate depth maps from images

### Image Generation
- **sirv_generate** - Generate images from text prompts
- **sirv_image_to_image** - Transform images based on text prompts
- **sirv_image_translation** - Translate text inside images

### Product AI
- **sirv_product_lifestyle** - Create lifestyle product shots
- **sirv_virtual_try_on** - Virtual clothing try-on

### 3D & Video
- **sirv_image_to_3d** - Convert images to 3D models
- **sirv_optimize_glb** - Optimize GLB models with mesh and texture compression
- **sirv_video_generation** - Generate videos from text/images
- **sirv_video_upscale** - Upscale videos 2x or 4x to listing quality with SeedVR or Topaz

### Batch Operations
- **sirv_batch_remove_background** - Process entitled batches of images
- **sirv_batch_upscale** - Upscale entitled batches of images

### Workflows
- **sirv_list_workflows** - List saved workflows
- **sirv_get_workflow** - Get workflow details

### Asset Management (DAM)
- **sirv_list_assets** - List assets with filtering and pagination
- **sirv_get_asset** - Get a single asset by ID
- **sirv_search_assets** - Search workspace assets by text, matching every word or its stem
- **sirv_find_similar_assets** - Find visually similar assets using the workspace visual-similarity index
- **sirv_update_asset** - Update asset fields (filename, alt text, favorite)
- **sirv_delete_asset** - Soft-delete an asset
- **sirv_get_asset_metadata** - Get custom metadata for an asset
- **sirv_update_asset_metadata** - Update custom metadata fields
- **sirv_generate_asset_alt_text** - AI-generate alt text for an asset
- **sirv_bulk_asset_operation** - Bulk favorite/unfavorite/delete/tag/move
- **sirv_import_asset_url** - Import an asset from an external URL

### Product Management (PIM)
- **sirv_list_products** - List products with filtering and pagination
- **sirv_get_product** - Get a single product by ID
- **sirv_create_product** - Create a new product
- **sirv_update_product** - Update product fields
- **sirv_delete_product** - Delete a product
- **sirv_search_products** - Quick search by name or SKU
- **sirv_list_products_with_assets** - List products with linked asset details
- **sirv_link_assets_to_product** - Link assets to a product
- **sirv_bulk_product_action** - Bulk delete, update status, link assets

### Shopify Integration
- **sirv_shopify_status** - Check Shopify connection status
- **sirv_push_image_to_shopify** - Publish a Studio asset to a Shopify product through an approved publish plan
- **sirv_sync_shopify_products** - Start a background import of Shopify products and images into the PIM

### Supplier Portal
- **sirv_get_supplier_sftp_status** - Check entitled Supplier Portal SFTP connection details
- **sirv_get_supplier_review_assist_requirements** - Check Supplier Portal submission requirements
- **sirv_run_supplier_autofix** - Run credit-charged autofix on a supplier image

### Sirv CDN File Management

These tools work on the workspace's connected Sirv account, rather than the
Studio asset library:

- **sirv_cdn_search_files** - Search Sirv files with pagination and sorting
- **sirv_cdn_get_file_metadata** - Read file metadata
- **sirv_cdn_manage_folder** - Create a folder or list its contents
- **sirv_cdn_upload_from_url** - Upload a file from a public URL
- **sirv_cdn_update_file_metadata** - Set title, description, tags or product metadata
- **sirv_cdn_update_file_tags** - Add or remove file tags
- **sirv_cdn_manage_file** - Rename, copy or delete a file

### Utility
- **sirv_alt_text** - Generate alt text descriptions
- **sirv_get_usage** - Check credit usage statistics

### Organization Context

- **sirv_list_organizations** - List the organizations available to the authenticated user

All DAM, product, Shopify, Supplier Portal and Sirv CDN tools accept an optional `orgId` parameter to scope requests to a specific organization. If omitted, the user's default organization is used. The server sends `orgId` as the `X-Org-Id` header, which the API validates against the user's org membership.

### Entitlement Checks

Every Studio plan includes API and MCP access; an admin can turn it off for a workspace. Preview-readable tools such as list, get, search, metadata-read, usage, organization, and workflow-read calls then execute without another tool-specific check. Mutation tools, direct AI tools that spend credits, batch operations, visual similarity, Shopify delivery/sync, and Supplier Portal Pro tools call Studio's `/api/mcp/authorize-tool` endpoint before execution and fail closed when the workspace lacks the matching entitlement.

## Installation

Use the hosted server at `https://mcp.sirv.studio`, or run the npm package:

```bash
SIRV_AI_BASE_URL="https://www.sirv.studio" npx -y sirv-ai-mcp-server
```

Use version 1.0.5 or later. Earlier versions are the legacy server from
before the www.sirv.studio cutover on 2026-10-30.

To build from source:

```bash
bun install
bun run build
node dist/index.js
```

## Configuration

### Environment Variables

```bash
# Required: Sirv AI Studio URL
SIRV_AI_BASE_URL="https://www.sirv.studio"

# Optional: API key for authentication (if not using OAuth)
SIRV_AI_API_KEY="your-api-key"

# Transport mode: "stdio" (default) or "http"
MCP_TRANSPORT="stdio"

# HTTP server settings (when using http transport)
MCP_HTTP_PORT=3001
MCP_HTTP_HOST=0.0.0.0
MCP_BASE_URL="https://your-mcp-server.com"

# HTTPS (optional - can also use reverse proxy)
MCP_SSL_KEY_PATH="/path/to/key.pem"
MCP_SSL_CERT_PATH="/path/to/cert.pem"

# Security: IP allowlisting
MCP_ENABLE_IP_ALLOWLIST="true"
MCP_ALLOWED_IPS="1.2.3.4,5.6.7.8/24"

# CORS: Allowed origins (comma-separated)
MCP_CORS_ORIGINS="https://claude.ai,https://your-app.com"
```

## Transport Modes

### Stdio Transport (Default)

Used for local integrations with Claude Desktop and Claude Code.

```bash
bun run start
# or
bun run dev
```

### HTTP Transport

Used for remote/hosted deployments accessible via HTTPS.

```bash
bun run start:http
# or
bun run dev:http
```

When running in HTTP mode, the server exposes:
- `/` - MCP protocol endpoint (`/mcp` is also accepted for compatibility)
- `/health` - Health check endpoint
- `/.well-known/oauth-authorization-server` - OAuth 2.0 metadata
- `/.well-known/oauth-protected-resource` - Protected resource metadata

## Security Features

### Request Limits

HTTP requests accept uncompressed JSON up to 1 MiB. Tool arguments are limited to
10,000 array elements and object members in total, including nested values. Split
larger requests into smaller calls. File uploads use URLs rather than inline bytes.

### OAuth 2.0 Support

The server implements OAuth 2.0 with PKCE for secure authentication:
- Authorization code flow with S256 code challenge
- Token refresh support
- Secure token storage in `~/.sirv-ai/tokens.json`

### Tool Safety Annotations

All tools include proper MCP safety annotations:
- `readOnlyHint` - Indicates if the tool only reads data
- `destructiveHint` - Indicates if the tool can delete or overwrite data
- `idempotentHint` - Indicates if repeated calls produce the same result
- `openWorldHint` - Indicates if the tool accesses external services

### CORS Configuration

When running in HTTP mode, CORS is configured for browser-based authentication:
- Default allowed origins: `https://claude.ai`, `https://console.anthropic.com`
- Customizable via `MCP_CORS_ORIGINS` environment variable
- Proper preflight handling with credentials support

### IP Allowlisting

Optional IP-based access control:
- Pre-configured Claude.ai/Claude Code IP ranges
- Enable with `MCP_ENABLE_IP_ALLOWLIST=true`
- Add custom IPs/CIDR ranges via `MCP_ALLOWED_IPS`

### HTTPS Support

For production deployments:
1. **Direct HTTPS**: Set `MCP_SSL_KEY_PATH` and `MCP_SSL_CERT_PATH`
2. **Reverse Proxy**: Run HTTP behind nginx/Caddy with TLS termination

## Usage with Claude Desktop

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "sirv-ai": {
      "command": "npx",
      "args": ["-y", "sirv-ai-mcp-server"],
      "env": {
        "SIRV_AI_BASE_URL": "https://www.sirv.studio"
      }
    }
  }
}
```

## Usage with Claude Code

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "sirv-ai": {
      "command": "npx",
      "args": ["-y", "sirv-ai-mcp-server"],
      "env": {
        "SIRV_AI_BASE_URL": "https://www.sirv.studio"
      }
    }
  }
}
```

## Usage with ChatGPT

For the hosted server, use `https://mcp.sirv.studio`
as the MCP connector URL. Connectors added with `https://mcp-dev.sirv.studio`
keep working. Studio handles sign-in and consent at
`https://www.sirv.studio`. Every Studio plan can connect. When a workspace runs out of credits, tools answer with a link to Studio's Buy credits page.
This connection path is separate from ChatGPT Actions, which use the
OpenAPI specification.

Use the callback URL supplied by your ChatGPT connector. Studio accepts
`https://chatgpt.com/connector/oauth/<id>` with one ID segment containing
letters, digits, underscores or hyphens, as well as the older
`https://chatgpt.com/connector_platform_oauth_redirect` callback. The URL
must also match the client's registered redirect URI. OAuth still requires
PKCE S256. See the [MCP developer docs](https://www.sirv.studio/docs/developers/mcp).

In the current source, ten image-result tools attach an interactive image
widget. Account, asset, product, batch, workflow, video and 3D tools return
their tool results without that widget. For multi-image generation, the
widget previews the first result rather than a gallery.

The widget uses the MCP Apps resource
`ui://widget/sirv-studio-v3.html` with MIME type `text/html;profile=mcp-app`.
This describes the server implementation, not a claim that the app is listed
in the ChatGPT directory.

## Remote Server Deployment

For hosting the MCP server remotely (accessible via claude.ai):

Keep the two origins distinct:

- `SIRV_AI_BASE_URL` is the Studio app that serves OAuth and API requests.
- `MCP_BASE_URL` is the public origin clients use to reach the MCP server.
  It supplies the advertised OAuth resource and widget domain.

The [Docker Compose configuration](docker-compose.yml) defaults to
`https://www.sirv.studio` and `https://mcp.sirv.studio`, respectively.
Set both explicitly for another deployment.

Check discovery before connecting a client:

```bash
curl --fail https://mcp.sirv.studio/.well-known/oauth-protected-resource
curl --fail https://mcp.sirv.studio/.well-known/oauth-authorization-server
```

For these defaults, `resource` should be `https://mcp.sirv.studio`,
and `issuer` and the sole `authorization_servers` entry should be
`https://www.sirv.studio`. The authorization, token and registration
endpoints should use the Studio origin.

### 1. Deploy with HTTPS

```bash
# Using SSL certificates directly
MCP_TRANSPORT=http \
MCP_HTTP_PORT=443 \
MCP_BASE_URL=https://mcp.your-domain.com \
MCP_SSL_KEY_PATH=/etc/ssl/private/key.pem \
MCP_SSL_CERT_PATH=/etc/ssl/certs/cert.pem \
MCP_ENABLE_IP_ALLOWLIST=true \
SIRV_AI_BASE_URL=https://www.sirv.studio \
bun run start:http
```

### 2. Or use a reverse proxy (recommended)

nginx configuration example:
```nginx
server {
    listen 443 ssl http2;
    server_name mcp.your-domain.com;

    ssl_certificate /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. Configure in claude.ai

Once deployed, users can connect via the MCP settings in claude.ai using your server URL.

## Development

```bash
# Run in development mode with auto-reload (stdio)
bun run dev

# Run in development mode (http)
bun run dev:http

# Build for production
bun run build

# Run the server (stdio)
bun run start

# Run the server (http)
bun run start:http
```

## Example Tool Usage

### Remove Background
```
Remove the background from https://example.com/product.jpg
```

### Generate Image
```
Generate an image of a modern minimalist living room with natural lighting
```

### Browse Assets
```
Show me my latest 10 assets
Search my assets for "product photos"
```

### Manage Products
```
List all active products from Shopify
Create a product with SKU "CHAIR-001" named "Modern Chair"
Link these 3 assets to the chair product as gallery images
```

### Shopify Workflow
```
Check my Shopify connection status
Sync products from Shopify including images
Push this processed image to Shopify product 12345
```

## Credit Costs

| Tool | Credits |
|------|---------|
| Background Removal | 1-2 |
| Upscale | 2-3 |
| Generate | 2 |
| Image to Image | 2-4 |
| Background Replace | 4 |
| Object Removal | 3 |
| Alt Text | 1 |
| Depth Map | FREE |
| Virtual Try-On | 4 |
| Image to 3D | 80 |
| Video Generation | Variable |

## Troubleshooting

### Connection Issues

**"Server not found" or connection refused**
- Verify the server is running: `bun run start` for stdio or `bun run start:http` for HTTP mode
- Check that `SIRV_AI_BASE_URL` is set correctly
- For HTTP mode, ensure the port isn't blocked by a firewall

**"Authentication failed"**
- Delete stored tokens: `rm -rf ~/.sirv-ai/tokens.json`
- Re-authenticate through the OAuth flow
- Verify your account is active at https://www.sirv.studio

**"Invalid API key"**
- Check that `SIRV_AI_API_KEY` is correctly set (if using API key auth)
- Regenerate your API key in your Sirv AI Studio account settings

### Tool Errors

**"Insufficient credits"**
- Check your credit balance using `sirv_get_usage` tool
- Purchase more credits at https://www.sirv.studio/billing

**"Image URL not accessible"**
- Ensure the image URL is publicly accessible (not behind authentication)
- Try uploading the image to a public hosting service first

**"Processing timeout"**
- Large images or complex operations may take longer
- Try with a smaller image or lower resolution setting
- Video generation and 3D conversion can take several minutes

### HTTP Transport Issues

**CORS errors in browser**
- Add your origin to `MCP_CORS_ORIGINS` environment variable
- Example: `MCP_CORS_ORIGINS="https://your-app.com,https://claude.ai"`

**SSL/TLS certificate errors**
- Verify certificate paths are correct in `MCP_SSL_KEY_PATH` and `MCP_SSL_CERT_PATH`
- Ensure certificates are not expired
- For development, consider using a reverse proxy with Let's Encrypt

**IP blocked**
- If using IP allowlisting, add your IP to `MCP_ALLOWED_IPS`
- Check if your IP has changed (dynamic IP addresses)

### Getting Help

- Report a problem: https://www.sirv.studio/contact?type=support
- Documentation: https://www.sirv.studio/docs
- Contact support: support@sirv.studio

## Privacy Policy & Terms of Service

By using Sirv AI MCP Server, you agree to our terms and policies:

- **Privacy Policy**: https://www.sirv.studio/privacy
- **Terms of Service**: https://www.sirv.studio/terms

### Data Handling

- Images are processed through fal.ai APIs and are subject to their data policies
- Generated outputs are stored temporarily for retrieval
- User authentication tokens are stored locally in `~/.sirv-ai/tokens.json`
- No user data is collected by the MCP server itself beyond what's necessary for authentication

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
