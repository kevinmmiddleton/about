# KevBot Setup

## 1. Cloudflare Worker Setup

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Workers & Pages → Create Worker
2. Name it something like `kevbot`
3. Paste the contents of `worker.js` into the editor
4. Click "Save and Deploy"
5. Go to Settings → Variables → Add variable:
   - Name: `ANTHROPIC_API_KEY`
   - Value: Your Anthropic API key
   - Click "Encrypt" to keep it secure
6. Note your worker URL (e.g., `https://kevbot.your-subdomain.workers.dev`)

## 2. Add to Your Site

Add this before your closing `</body>` tag:

```html
<script src="/kevbot/kevbot.js"></script>
<script>
  KevBot.init('https://kevbot.your-subdomain.workers.dev');
</script>
```

Replace the URL with your actual Cloudflare Worker URL.

## That's it!

A chat bubble will appear in the bottom-right corner of your site.

## Customization

The widget respects `prefers-color-scheme: dark` automatically.

To customize colors, edit the CSS variables in `kevbot.js`:
- Primary gradient: `#6C8CFF` to `#A48CF9`
- These match your site's existing color scheme

## Cost

- Cloudflare Workers: Free tier includes 100,000 requests/day
- Anthropic API: ~$0.003 per conversation turn with Claude 3.5 Sonnet
