### Swagger Enhancer

[![Lang: RU](https://img.shields.io/badge/lang-RU-blue)](README_RU.md)
[![JavaScript](https://img.shields.io/badge/javascript-ES6%2B-blue)](#зависимости-для-запуска)
[![Chrome / Edge](https://img.shields.io/badge/platform-Chrome%20%7C%20Edge-blue)](#установка)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![UI Enhancer](https://img.shields.io/badge/type-Swagger%20UI%20enhancer-orange)](#описание)
[![Version](https://img.shields.io/badge/version-1.0.0-lightgrey)](#история-версий)

#### Table of Contents

* [Overview](#overview)
* [Features](#features)
* [Requirements](#requirements)
* [Installation](#installation)
  * [Install from Chrome Web Store](#install-from-chrome-web-store)
  * [Manual Installation](#manual-installation)
* [Quick Start](#quick-start)
* [Contact](#contact)
* [Bug Reporting](#bug-reporting)
* [License](#license)

---

**Swagger Enhancer** is a browser extension for Chromium-based browsers (Chrome, Yandex Browser, Edge, etc.) designed to extend the default functionality of the Swagger UI.

It adds custom interface settings including dark mode, search bar, hiding of response blocks and schemas, scroll-to-top button, and endpoint favorites. All settings are saved automatically and applied when opening any Swagger UI page.

---

### Features

* **Dark Mode**
  Toggle between light and dark themes without refreshing the page.

  ![Demo](docs/dark_theme.gif)

* **Search Bar**
  Quickly search by tags or endpoint names.

  ![Demo](docs/search.gif)

* **Favorites**
  Save frequently used API methods to a favorites list.
  You can also exclude methods to focus only on the relevant ones.

  ![Demo](docs/favorites.gif)

* **Scroll to Top**
  Quickly scroll to the top of the page — especially helpful with long specs.

* **Hide Standard Responses**
  Automatically hides typical HTTP responses (`200`, `400`, `404`, etc.) to reduce clutter.

* **Collapse Schemas**
  Automatically collapses the `Schemas` block to keep the UI compact.

* **Persistent Settings**
  All changes are saved via `chrome.storage` and applied automatically on load.

---

### Requirements

* **Browser**: Chrome, Edge, Yandex Browser, or any Chromium-based browser
* **Chromium Version**: 88+ (supports `chrome.storage.sync` and ES6+)
* **Swagger UI**: Any page using Swagger UI (`/docs` or similar)

---

### Installation

#### Install from Opera Addons

> https://addons.opera.com/ru/extensions/
> 
> Open the extension page and click **Add to Chrome**.
> The icon will appear in the browser toolbar.

#### Manual Installation

1. Clone the repository or download the archive:

   ```bash
   git clone https://github.com/artemy-sh/swagger-enhancer.git
   ```

2. Open the extensions page:

   * In Chrome, Yandex Browser, or Edge:
     Enter `chrome://extensions/` in the address bar and press Enter.

3. Enable **Developer Mode** (toggle in the top-right corner).

4. Click **Load unpacked** (or "Загрузить распакованное расширение").

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
