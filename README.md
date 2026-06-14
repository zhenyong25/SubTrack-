<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1VKaTbQT_UmpdEQmMiwATE11URb_QKo6B

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Cloudflare Pages

This app is ready to deploy to Cloudflare Pages.

Build settings:

- Build command: `npm run build`
- Output directory: `dist`

If you use the included GitHub Actions workflow, add these repository secrets later:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `GEMINI_API_KEY`

Add this repository variable too:

- `CLOUDFLARE_PAGES_PROJECT_NAME`

If you prefer Cloudflare Pages Git integration instead of GitHub Actions, connect the GitHub repo in the Cloudflare dashboard, use the same build command and output directory, and add `GEMINI_API_KEY` as a Pages environment variable there.

## Supabase

To connect the app to your Supabase database later, add these Vite environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY`

The app will use Supabase when those values are present and fall back to localStorage if they are missing. Because your tables are tied to `auth.users.id`, real database writes still require a signed-in Supabase user session.
