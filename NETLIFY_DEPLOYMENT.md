# Netlify preview deployment

This adds a hosting option for the existing Next.js application. A successful
local build does not establish that a Netlify deployment is live or verified.

## Build and runtime

`netlify.toml` selects Node.js 24, `npm run build`, and the `.next` output.
Netlify's automatic Next.js adapter supplies the server runtime for `/api/status`
and `/api/control`. Do not use a static export or upload `.next` as plain static
files: both API handlers must execute on the server.

Install from the existing lockfile, without dependency lifecycle scripts:

```bash
npm ci --ignore-scripts
node --test security.test.mjs
npm run build
```

No Python dependencies are required for this web application. The root
`requirements.txt` belongs to the separate deployment agent and is preserved.
Netlify's hosted Git builds automatically detect that file and run pip. Use the
manual CLI workflow below while the no-pip constraint remains in effect. Do not
enable Git-based builds until the deployment-agent dependencies are isolated in
a separately reviewed change.

## Manual preview

Use Netlify CLI 27.6.0, authenticated to the intended account:

```bash
npm exec --yes --ignore-scripts --package=netlify-cli@27.6.0 -- netlify status
```

Link a verified existing preview site or create a manual site without Git build
integration. Confirm the selected team and site before creating a deployment.
From the project directory, run:

```bash
npm exec --yes --ignore-scripts --package=netlify-cli@27.6.0 -- netlify deploy
```

This workflow builds locally and deploys a draft. Check that the Next.js adapter
ran and generated its server function. Do not use `--prod`, change the existing
domain, or disable deployment protection to make a preview pass.

## Preview checks

Start with no provider credentials and no `CONTROL_API_TOKEN` on the preview.
The web page should load, while both API endpoints return HTTP 503 with
`Operator authentication not configured`:

```bash
curl -i https://YOUR-PREVIEW-HOST/api/status
curl -i -X POST https://YOUR-PREVIEW-HOST/api/control \
  -H 'Content-Type: application/json' --data '{}'
```

Treat the placeholder above as the unique draft deployment hostname, not a
production domain. If the site has host-level access protection, authenticate
through that protection before checking the application responses.

When operator authentication is later configured, use a new random secret of at
least 32 characters, stored with Netlify's server-side Functions scope. Never put
it in this file, `netlify.toml`, source code, a URL, or a `NEXT_PUBLIC_` variable.
Missing or incorrect authorization must return HTTP 401. A valid operator token
still must not override the existing policy gate or its FIDO2 requirement.
Do not copy production provider tokens into a preview.

## What this migration does not complete

The status and control routes still integrate with Vercel and Railway. Changing
where the dashboard is hosted does not replace those adapters. Device telemetry,
durable server audit storage, and a complete authenticated operator interface
remain separate work. Keep the preview labelled and do not claim these features
are operational merely because the page loads.

## References

- [Next.js on Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)
- [Build dependency management](https://docs.netlify.com/build/configure-builds/manage-dependencies/)
- [Netlify CLI](https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/)
