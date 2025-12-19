# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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