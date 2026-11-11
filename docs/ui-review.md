# UI review — 11 November 2026

This pass keeps SubTrack's existing visual style and fixes shared presentation and interaction problems across the app.

## Coverage

All 12 primary destinations were reviewed at 320, 390, 768, 1024, and 1440 CSS pixels in light and dark mode: Subscriptions, Cards, Expenses, Income, Investments, Trade, Net worth, Debts, Goals, Insurance, My City, and Settings.

Secondary checks cover the Trade panels; card board and country catalogues; portfolio returns, dividends, and tax lots; crypto, Pokémon, and poker; Pokémon shops, events, services, and scam watch; cash forecast and financial review; search and reminders; subscription details; and common creation/editing forms. Empty states and authentication are also checked.

## Improvements implemented

| Area | Finding and change |
| --- | --- |
| Theme colors | Tailwind could not generate opacity variants from the existing bare CSS color variables. Theme colors now support opacity, restoring tinted backgrounds, selected states, borders, and translucent headers throughout the app. |
| Dark mode | Surface and border colors were identical. A distinct border color now separates cards, tables, fields, and navigation. Native controls also follow the active color scheme. |
| Mobile navigation | Twelve icons without visible labels were difficult to distinguish. Destinations now have labels and larger targets; selecting a destination or resizing keeps it visible within the navigation. Switching destinations resets the page to the top. |
| Keyboard access | Added a skip link and consistent visible focus. Subscription tiles can be opened with Enter or Space. Card Edit/Delete keys no longer trigger the surrounding card's activation handler. |
| Card readability | Long names were truncated beside action buttons and badges. Names can wrap, badges have room, and actions occupy a separate row. |
| Charts | Removed a fixed initial chart width that could briefly overflow narrower laptop cards. The dashboard, income, and expense charts now respect reduced-motion preferences, including their JavaScript animations. |
| Calendar controls | Larger previous/next buttons, accessible labels, and wrapping headers keep year/month controls usable on narrow screens. |
| Forms and actions | Added missing icon-button names, associated income/subscription/settings labels with their fields, enlarged color swatches, and exposed the reminder-copy action to touch and keyboard users. |
| Trade toolbar | An evenly spaced two-row layout on phones replaces the uneven wrapping of eight tabs. |
| Shared polish | Consistent system-font fallbacks, discoverable scrollbars for overflow areas, and reduced-motion CSS. |

## Verification

Run `npm run build` before `npm run test:ui:browser`. The UI runner bundles a test-only fixture with synthetic records and no Supabase configuration, launches a separate Chromium profile, and removes that profile afterward. It checks layout overflow, accessible button names, navigation visibility, theme opacity, keyboard interactions, and forms. Screenshots and a machine-readable report are written to `artifacts/ui-review/after/`.

For a focused check, use `node scripts/test-ui-browser.mjs --width=1024 --main-only`. `--audit` records findings without failing on layout findings; `--before` writes to a separate evidence directory.

Additional checks: the existing auth-refresh browser test, portfolio analytics tests, global search tests, and ticker browser test.

Results for this pass: production build passed; 207 UI layout/state checks passed with no detected overflow, unnamed buttons, off-screen selected navigation, or runtime exceptions. Auth-refresh and ticker browser checks passed, as did all 16 portfolio and 12 global-search tests.

`npx tsc --noEmit` reports four existing errors in `components/FinanceWorld.tsx`, `services/cloudSyncService.ts`, and `tests/cloudSync.test.ts`. The same four errors were confirmed against the source before this pass. Production builds succeed.

## Limits and follow-up candidates

- Browser review uses Chromium and synthetic local records. External market/catalogue requests deliberately exercise unavailable-data states. Real-account provider data and Safari/iOS behavior still need device checks.
- This is a visual and interaction review, not a complete accessibility conformance audit. Repeated tab and dialog implementations remain candidates for shared components with uniform keyboard and focus behavior.
- The main JavaScript bundle is about 3.13 MB before compression. Loading large secondary areas such as the city and Pokémon tools on demand is a worthwhile performance follow-up.
- Dense financial tables retain horizontal scrolling on phones. Optional compact row layouts would need a separate design pass to keep every value and currency clear.
- Price-refresh badges could distinguish the last polling attempt from the market quote's timestamp more explicitly.
