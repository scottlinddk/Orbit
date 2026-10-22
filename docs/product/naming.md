# Naming

Status: decided on 2026-10-22. Tracks issue 43.

## Decisions

1. **The project name stays Orbit.** This does not reopen `docs/architecture/open-questions.md`.
2. **"Planet" is a lowercase, descriptive noun** for a declarative plugin ("install a planet"). It is not a logo, a brand, or a product name. Never write "Orbit Planets" as a product. Reason: the plugin concept is a feature of Orbit, and a descriptive use carries the least trademark risk.
3. **Fallback term: "Satellite".** If clearance finds a problem with "Planet", rename the term. It appears in docs, the manifest `planet.<id>` widget prefix and the UI. The widget type prefix is permanent once Planets ship to users (`packages/widget-sdk/README.md`), so any rename happens before the first public release, not after.
4. **Clearance before a public 1.0.** A professional trademark search for "Orbit" in the relevant classes (software, at least) in the launch jurisdictions: Denmark and the EU (EUIPO and the Danish register), and the US (USPTO). The research's claims about existing marks and products are unverified in this repository and are not cited here. Counsel decides.

## Rules until clearance is done

- No marketing or UI copy uses "Planets" as a brand.
- No logo, domain purchase or store listing is committed to the name "Orbit".
- Add "trademark clearance for Orbit" to the 1.0 release checklist.
