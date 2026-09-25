# Privacy Policy

Swagger Enhancer does not collect personal data or send data to developer-operated servers. It does not use analytics.

Extension settings, such as the theme and enabled features, are saved using `chrome.storage.sync`. The browser may synchronize these settings across devices when browser sync is enabled.

Favorite endpoints and the favorites filter are saved in the Swagger site's `localStorage`, separately for each origin. Swagger Enhancer does not synchronize favorites through Chrome Sync.

The optional authorization shortcut opens Swagger UI's existing dialog. It displays the client ID or username when provided by an active Swagger authorization. These identifiers are used only for the button label and are not stored or synchronized by the extension. Tokens, passwords, and client secrets are not read or copied by this feature; Swagger UI handles credentials as usual.

The optional `Copy full URL` controls write a route URL or documentation link to the clipboard only when clicked. They do not read clipboard contents. The route URL contains only the current page origin and route path. The documentation link preserves the current documentation page address, including its query string (for example, a selected specification URL), and replaces the fragment with the operation's Swagger anchor.
