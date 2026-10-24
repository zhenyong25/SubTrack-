# Desktop layout

Desktop rules are grouped at the end of `styles.css`. They start at 1024px; smaller screens retain the existing mobile layout.

The workspace fills all available width to the right of the 176px navigation rail, with a 16px right gutter and no maximum-width cap. The rail sits at the top left below the header, aligned with the workspace top. Each navigation row centers its icon and label as a group. It scrolls internally when the window is too short to fit all navigation items.

Desktop panel and collection gutters are 12px. Panel padding is generally 16px. Chart pairs stretch to equal outer heights, with 200px category plots, compact legends, and flexible annual plots so neighboring panel bottoms align.

| Page | Desktop arrangement |
| --- | --- |
| Subscriptions | Summary pair, four statistics, matched chart pair, subscription collection beside card usage; subscriptions use two columns from 1440px |
| Cards | Two columns, increasing to three from 1440px; cards stretch to align within each row |
| Expenses | Compact full-width budget and four statistics; calendar beside stacked category/annual charts; full-width ledger with two or three independent day columns. Selecting one day restores a full-width ledger |
| Income | Compact summary and four statistics, matched annual/category charts, two or three columns of income sources |
| Investments | Category/account filters side by side; chart beside recent entries; compact flow chart and performance sections; two or three columns of holdings |
| Net worth | Breakdown beside trend, cash accounts beside retirement funds; equal-height top panels |
| Settings | Two independent columns, increasing to three from 1600px; panels do not leave empty shared grid tracks |

At 1024–1279px, charts and panels use wider allocations to preserve readability. Desktop layout rules use named classes and do not introduce transformed ancestors around fixed dialogs. Mobile navigation retains its existing icons; desktop adds labels. Accessible labels and active-page state apply at every width.

## Validation

Checked all seven tabs with synthetic local fixtures in Chromium at 390, 768, 1024, 1280, 1920, and 2560px (42 page/viewport combinations). Assertions cover page overflow, full-width desktop content, centered/fitting navigation, and matching bottoms of the Income and Subscriptions chart pairs. No browser exceptions.

Also checked selected-day expense layout, budget editing, and navigation in 500px- and 330px-high desktop windows. TypeScript checking and the production/PWA build passed. The build retains its existing large-bundle warning.
