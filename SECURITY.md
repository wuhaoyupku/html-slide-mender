# Security Policy

## Supported Versions

The project is pre-1.0. Security fixes target the current `main` branch.

## Reporting a Vulnerability

Please do not open a public issue for sensitive security reports.

If this repository has security advisories enabled, use GitHub private vulnerability reporting. Otherwise, contact the maintainers privately and include:

- Affected version or commit.
- Steps to reproduce.
- Impact.
- Any suggested mitigation.

## Security Model

HTML Mender edits user-opened pages only after the user starts the extension or opens a skill-injected local HTML copy.

The MVP does not write back to live websites or overwrite local source files. The durable save path is downloading a new HTML file.
