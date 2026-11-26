# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.20] - 2026-11-26

### Fixed

- The org details popover showed `[REDACTED] Use 'sf org auth show-user-password' to view` as the password on SF CLI 2.156.3+. The Password field is now a "Click to reveal" link that runs `sf org auth show-user-password`, shows the password in the popover and copies it to the clipboard

## [0.0.19] - 2026-11-24

### Changed

- ORGanetto now activates in every workspace, not only those containing `sfdx-project.json`. Your orgs are global to the SF CLI, so the extension no longer requires a Salesforce project

## [0.0.18] - 2026-11-24

### Fixed

- "Get Auth URL" returned `[REDACTED] Use 'sf org auth show-sfdx-auth-url' to view` on SF CLI 2.156.3+, where `sf org display --verbose` no longer exposes the SFDX Auth URL. The extension now uses `sf org auth show-sfdx-auth-url` and falls back to `sf org display` on older CLI versions

## [0.0.17] - 2026-06-15

### Added

- Connection status is now shown in the org details popover, including the full text reported by the SF CLI (e.g. `RefreshTokenAuthError`)
- Sort control (dropdown + direction toggle) to sort orgs by Last Opened, Alias, or Status

### Changed

- Redesigned the org list as a responsive layout: stacked cards with actions below on narrow viewports, and aligned table-style rows on wide viewports. This replaces the previous approach of hiding the URL column and collapsing the status badge on small screens

## [0.0.16] - 2026-06-02

### Added

- Project website (`website/index.html`)

## [0.0.15] - 2026-06-02

### Added

- Responsive layout for small viewports (≤768px): the URL column is hidden and the connection status collapses from a text badge to a compact icon (`✓` for connected, `—` otherwise)

## [0.0.14] - 2026-04-21

### Added

- Password field in the org details popover when `sf org list` JSON includes a password (shown as `-` otherwise)

## [0.0.13] - 2026-02-18

### Fixed

- Use quotes around alias in commands to avoid issues with special characters

## [0.0.12] - 2026-02-17

### Added

- Accordion icon on the ORGanetto webview editor tab (`panel.iconPath`)

## [0.0.11] - 2026-02-17

### Added

- Search now matches across all columns (alias, URL, status, prod type, last opened) instead of alias only
- Fuzzy search: query characters can match in order with any characters in between (e.g. "sbox" matches "sandbox")
- URL column is now sortable

## [0.0.10] - 2025-12-19

### Fixed

- HTML responses in org connection status are now replaced with a clear error message ("HTTP response contains html. Org does not exist or is not reachable") instead of displaying raw HTML

## [0.0.9] - 2025-11-13

### Added

- Automatic cache refresh on extension activation to ensure org data is always up-to-date
- Comprehensive extension description for marketplace: "Help you manage your sf cli orgs. Perfect for admins and developers juggling multiple Salesforce environments"
- Keywords for better discoverability: salesforce, sfdx, sf, orgs, sandbox, scratch, dev hub

### Fixed

- Scratch org status detection now properly uses `isExpired` property since SF CLI doesn't provide `connectedStatus` for scratch orgs
- Connection status badge now correctly displays "Connected" for active scratch orgs and "Expired" for expired ones

## [0.0.8] - 2025-11-06

- Initial release