# Privacy Policy

Swagger Enhancer does not collect personal data or send data to developer-operated servers. It does not use analytics.

Extension settings, such as the theme, enabled features and user-defined site rules, are saved using `chrome.storage.sync`. The browser may synchronize these settings across devices when browser sync is enabled.

Favorite endpoints and the favorites filter are saved in the Swagger site's `localStorage`, separately for each specification within an origin. Specifications are identified by their resolved document URL, or by the documentation page address and API title for inline specifications. Changes update other open tabs for the same specification. Swagger Enhancer does not synchronize favorites through Chrome Sync. Legacy origin-wide favorites are migrated once to the first opened specification, with the original keys retained as a backup.

The optional authorization shortcut opens Swagger UI's existing dialog. It displays the client ID or username when provided by an active Swagger authorization. These identifiers are used only for the button label and are not stored or synchronized by the extension. Tokens, passwords, and client secrets are not read or copied by this feature; Swagger UI handles credentials as usual.

The optional `Copy full URL` controls write a route URL or documentation link to the clipboard only when clicked. They do not read clipboard contents. The route URL contains only the current page origin and route path. The documentation link preserves the current documentation page address, including its query string (for example, a selected specification URL), and replaces the fragment with the operation's Swagger anchor.

Rating links open Swagger Enhancer's Chrome Web Store reviews in a new tab, without sending the documentation page as a referrer. The popup's Share link button copies only the fixed public store URL after a click. It does not read clipboard contents or include the current API, documentation URL, or authorization data. Rating, sharing, and support actions do not send analytics events or open automatically.

The decorative cat uses mouse pointer coordinates only in page memory to adjust its gaze. Coordinates are not logged, saved, synchronized, or transmitted. Tracking stops when the document is hidden, reduced motion is enabled, or the mascot is removed.

The optional schema preview reads schema definitions from the specification already loaded by Swagger UI and renders them locally. It does not fetch additional schemas or transmit, save or synchronize schema contents.

The `scripting` permission registers bundled content scripts for user-defined Swagger documentation addresses. Existing host access lets the extension load its packaged styles and support documentation on different domains and ports. Features activate only on enabled addresses where Swagger UI is detected. No remotely hosted code is loaded.
