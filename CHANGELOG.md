# Changelog

## 2.1.0 - 2026-11-04

### Added

- Inline schema previews with fields, types, required properties, references, Back and full-model navigation.
- Editable site tags with removable defaults, custom domains, URL patterns and ports.
- Rating, sharing and issue links with an animated outline cat.
- Local Orbit Playground, reproducible promo/video scripts and five refreshed README GIFs.

### Fixed

- Schema links reveal and expand the requested model, including offscreen models and schemas collapsed by default.
- Schema cards close on specification changes and preserve keyboard focus after Back.
- Operations no longer keep a permanent loading indicator. Equivalent specification updates preserve search selection.
- Copy controls have consistent icons, spacing and feedback for documentation links, full URLs and paths.
- Popup sizing, light/dark contrast, mouse/keyboard focus and Scroll to Top on long lists.
- Settings loading, save failures, retry and initialization/cleanup races. Removed obsolete popup tab-message warnings.

### Changed

- Favorites and their filter are stored per specification and update across tabs. Legacy origin-wide favorites migrate once, with the original keys retained.
- Added the `scripting` permission for custom site registration, existing host access is unchanged. Minimum Chromium version is explicitly 111.
- Updated documentation, privacy disclosures and store copy. Added a validated, reproducible release ZIP build.

### Known limitation

- Swagger UI 5.33.0 can fail when a specification update removes its last schema. This also occurs without the extension.

## 2.0.0

- Full-spec search and favorites filtering, including offscreen operations and collapsed groups.
- Opt-in header authorization and route/documentation link copying.
- Response/schema display controls, cross-tab preferences and safer recovery when Swagger integrations fail.
