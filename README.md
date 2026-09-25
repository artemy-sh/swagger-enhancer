### Swagger Enhancer

[![Lang: EN](https://img.shields.io/badge/lang-EN-red)](README.md)
[![JavaScript](https://img.shields.io/badge/javascript-ES6%2B-blue)](#requirements)
[![Chrome / Edge](https://img.shields.io/badge/platform-Chrome%20%7C%20Edge-blue)](#installation)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![UI Enhancer](https://img.shields.io/badge/type-Swagger%20UI%20enhancer-orange)](#features)
[![Version](https://img.shields.io/badge/version-1.0.1-lightgrey)](#testing)

#### Table of Contents

* [Features](#features)
* [Requirements](#requirements)
* [Installation](#installation)
  * [Install from Chrome Web Store](#install-from-chrome-web-store)
  * [Manual Installation](#manual-installation)
* [Quick Start](#quick-start)
* [Architecture](#architecture)
* [Testing](#testing)
* [Contact](#contact)
* [Bug Reporting](#bug-reporting)
* [License](#license)

---

**Swagger Enhancer** is a browser extension for Chromium-based browsers (Chrome, Edge, Yandex Browser, etc.) that improves the Swagger UI interface.

Adds dark theme, endpoint search, favorites management, response/schema hiding, and scroll-to-top button. Uses Manifest V3, settings sync via `chrome.storage.sync`.

---

### Features

* **Dark Mode**
  Toggle between light and dark themes without refreshing the page.

  ![Demo](docs/dark_theme.gif)

* **Search**
  Search all tags and operations in the specification, including collapsed groups and offscreen routes, within the current favorites filter. Matches paths, HTTP methods, summaries, descriptions, and operation IDs; selecting a result opens its group/operation and scrolls to it. The dropdown shows the ten best matches.

  ![Demo](docs/search.gif)

* **Favorites**
  Save frequently used API methods to a favorites list.
  You can also exclude methods to focus only on the relevant ones.

  ![Demo](docs/favorites.gif)

* **Scroll to Top**
  Quickly scroll to the top of the page — especially helpful with long specs.

* **Authorize in header**
  Open Swagger's standard authorization dialog from the fixed header, at any scroll position. Enable `Authorize in header` in the extension settings (off by default). Both the original Swagger button and the header shortcut are red before authorization and green afterwards, labelled `Authorized: client_id` (or username when available); without an identifier it shows `Authorized`. The shortcut appears only when the API offers authorization. Operation locks are closed/red when unauthorized and open/green when authorized for that operation. All these changes are controlled by the same setting; disabling it restores the original Swagger authorization buttons and icons.

* **Hide Standard Responses**
  Automatically hides typical HTTP responses (`200`, `400`, `404`, etc.) to reduce clutter.

* **Collapse Schemas**
  Automatically collapses the `Schemas` block to keep the UI compact.

* **Persistent Settings**
  Settings sync via `chrome.storage.sync` and auto-apply.

---

### Requirements

* **Browser**: Chrome, Edge, Yandex Browser, or any Chromium-based browser
* **Chromium Version**: 88+ (Manifest V3, `chrome.storage.sync`)
* **Swagger UI**: Pages with `/docs`, `/swagger`, `/api-docs`, `/openapi` patterns

---

### Installation

#### Install from Chrome Web Store

> [![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Install-blue?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/swagger-enhancer/dnadagbnobcgafbdebbabcgicfkpciam)
> 
> Visit the [Chrome Web Store page](https://chromewebstore.google.com/detail/swagger-enhancer/dnadagbnobcgafbdebbabcgicfkpciam) and click **Add to Chrome**.
> The extension will be installed and the icon will appear in your browser toolbar.

#### Manual Installation

1. Clone the repository or download the archive:

   ```bash
   git clone https://github.com/artemy-sh/swagger-enhancer.git
   ```

2. Open the extensions page:

   * In Chrome, Yandex Browser, or Edge:
     Enter `chrome://extensions/` in the address bar and press Enter.

3. Enable **Developer Mode** (toggle in the top-right corner).

4. Click **Load unpacked**.

5. Select the `swagger-enhancer/` folder.

6. The extension icon will appear in the toolbar — done!

---

### Quick Start

1. Open any page that uses **Swagger UI**.

2. Click the **Swagger Enhancer** icon in your browser toolbar.

3. In the popup, enable desired options:
   `Dark Theme`, `Hide Schemas`, `Scroll to Top`, `Favorites`, etc.

4. All settings are saved automatically and work on all Swagger UI tabs.

---

### Architecture

#### **Modular Structure**
```
swagger-enhancer/
├── js/utils.js              # Shared utilities and BaseFeature class
├── js/feature_manager.js    # Centralized feature management
├── js/main.js              # Application entry point
├── js/theme.js             # Dark theme feature
├── js/search.js            # Endpoint search feature
├── js/favorites.js         # Favorites management feature
├── js/authorize.js         # Header authorization shortcut
├── js/scroll_top.js        # Scroll to top feature
├── js/hide_responses.js    # Hide responses feature
├── js/hide_schemas.js      # Hide schemas feature
├── js/github_link.js       # GitHub link feature
├── js/floating_menu.js     # Floating menu feature
└── css/variables.css       # Centralized CSS variables
```

#### **Key Components**

* **`BaseFeature`** — unified base class for all features with lifecycle management
* **`FeatureManager`** — centralized system for registering and managing features
* **`SwaggerEnhancerUtils`** — shared utilities for storage, DOM, and messaging
* **CSS Variables** — centralized theming system with dark mode support

### Testing

Development only (Node.js 20.19+ and npm):

```bash
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

`npm test` runs 46 tests in Node without starting a browser: DOM regressions with mocked Chrome APIs and integration tests using real Swagger UI 4/5 selectors against a 400-operation specification. Coverage includes favorites modes and bulk selection, full-spec search and navigation, cache invalidation, authorization privacy and opt-in behavior, icon spacing, popup persistence failures, schemas, live responses, scrolling, and initialization/cleanup races.

`npm run test:browser` is a separate, optional suite. It loads the actual extension in a temporary Chromium profile against a local Swagger UI and API fixture. It checks popup toggles, cross-tab settings, favorites persistence, search, schemas, Execute responses, and scroll-to-top. A 400-operation / 20-tag scenario checks virtualization, offscreen favorites, filter modes, select-all, and reset. No production API is called. Node tests do not verify actual browser layout or scrolling geometry.

The browser suite uses the pinned Swagger UI 4 and 5 versions in `package-lock.json`; it does not guarantee compatibility with every Swagger UI customization or older browser. Set `SWAGGER_TEST_CHROMIUM` to use an existing compatible Chromium executable.

For the standard SwaggerUIBundle build, favorites filter the Swagger data through a plugin before list rendering, including virtualized lists. The js/favorites_bridge.js adapter also supplies the search index from the filtered specification and navigates via Swagger layout actions. It runs in the page MAIN world without Chrome API access. Custom builds that do not expose SwaggerUIBundle retain the DOM fallback, which can only search mounted routes and does not support virtualized lists.

Tests are not injected into visited pages. Before creating a store upload, include only extension runtime files (`manifest.json`, `popup.html`, `js/`, `css/`, `assets/`), excluding `js/test_runner.js` and `js/page_test_functions.js`. Do not include `node_modules/` or `tests/`. The manifest version must be increased for a new store release.

---

### Contact

* **Author**: Artemy Shalygin
* **Email**: [artemy.sh@gmail.com](mailto:artemy.sh@gmail.com)
* **Telegram**: [@artemy\_sh](https://t.me/artemy_sh)

---

### Bug Reporting

Found a bug or have a suggestion? Please create an [issue](https://github.com/artemy-sh/swagger-enhancer/issues)

---

### License

[MIT License](/LICENSE)
