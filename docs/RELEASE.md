# Release 2.1.0

## Chrome Web Store copy

Name: Swagger Enhancer

Short description, matching the manifest:

```text
Dark theme, full-spec search, favorites and inline schema previews for Swagger UI.
```

Detailed description:

```text
Your API. A better flow.

Swagger Enhancer adds navigation and display controls to Swagger UI for developers and QA teams.

- Switch between light and dark themes without reloading.
- Search tags, paths, methods, descriptions and operation IDs, including offscreen operations in standard Swagger UI.
- Keep favorite endpoints per specification, or hide favorites while exploring the rest of the API.
- Preview schema fields, types and references next to a link. Follow related models, go back, or open the full schema.
- Open authorization from the fixed header and see authorization status on route locks.
- Copy a documentation link, a route URL on the current host, or just its path.
- Hide response documentation while keeping executed requests and their results visible.
- Collapse Schemas by default, then reveal and expand models through explicit links.
- Return to the top of long documentation pages.
- Choose documentation addresses with editable site rules, including custom domains and localhost ports.

Getting started
Open your Swagger documentation and click the extension icon. Search, Favorites and Scroll to Top are enabled on a fresh installation. Enable other features as needed. The standard docs, swagger and openapi address rules can be removed or extended in Sites. Save site changes and reload the documentation. Ordinary pages are not modified.

Compatibility
Chromium 111 or newer. Tested with Swagger UI 4.19.1 and 5.33.0, OpenAPI 3.0 and 3.1, in both themes. Full-spec navigation and previews use the standard SwaggerUIBundle adapter. Custom builds retain a fallback with search limited to mounted operations.

Privacy
No analytics and no API data sent to developer servers. Preferences and site rules use Chrome Sync. Favorites stay in the documentation site's local storage. Schema previews use the specification already loaded by Swagger UI.
```

## Privacy practices

Single purpose:

```text
Improve navigation and readability in Swagger UI API documentation.
```

Permission justifications:

- `storage`: save feature preferences and user-defined site rules with Chrome Sync. Favorites remain in the documentation site's localStorage.
- `scripting`: register bundled content scripts for documentation domains and paths added by the user. No remote code is loaded.
- Host access: support user-selected Swagger documentation across domains, localhost and ports, and load bundled feature styles. Activation requires an allowed address and a Swagger UI page. API data is not sent to developer servers.

Privacy policy: https://raw.githubusercontent.com/artemy-sh/swagger-enhancer/main/privacy.md

Support: https://github.com/artemy-sh/swagger-enhancer/issues

Website: https://github.com/artemy-sh/swagger-enhancer

## Package and media

- `npm run package` creates `dist/swagger-enhancer-2.1.0.zip` and its SHA-256 file. The ZIP has the manifest at its root and contains only runtime and legal files.
- Run `npm test` and `npm run test:browser`, then smoke-test the extracted ZIP before uploading it.
- The five refreshed README GIFs are in `docs/`. Store screenshots are in `docs/store/`, 1280x800 RGB PNG. Both use the local demo with synthetic data.
- The 72-second 1080p promo uses the original lofi track Quiet Orbit. Generation instructions are in [demo/README.md](../demo/README.md). The Web Store video field needs a YouTube URL after the new video is uploaded.
- Uploading a package, submitting it for review and publication are separate steps. A GitHub release does not update the store. Store descriptions must match this package and its privacy policy.

## Release notes

Use the 2.1.0 section of [CHANGELOG.md](../CHANGELOG.md) for the GitHub release. The older v2.0.0 tag remains unchanged.
