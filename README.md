# Costco Receipt Dashboard

A small, single-file browser dashboard to analyze Costco receipt JSON exports. Drop a receipts JSON into the page and get quick insights: totals, top items, returns, discounts, and gasoline analytics. The project includes a small browser snippet (`download_costco_receipts.js`) you can run from the Costco site to export your receipts.

## Features
- Upload / analyze a JSON array of Costco receipts (no server required).
- Summary cards for totals (spend, receipts, unique items/warehouses, gas, discounts, returns).
- Top tables and charts: most-spent items, most-purchased items, biggest price increases, per-warehouse spend, refunds, gasoline breakdown, and top discounted products.
- Discounts are detected (heuristic) and applied to per-item pricing so price-based metrics reflect net paid amounts.

## Quick start
1. Open `dashboard.html` in a browser (double-click the file or use a local static server).
2. Option A — Use the included downloader snippet to fetch receipts from the Costco site:
	- Open the browser console on https://www.costco.com/OrderStatusCmd and paste the contents of `download_costco_receipts.js` (the snippet is documented at the top of that file). It will download a JSON file containing your receipts.
3. Option B — Upload an existing receipts JSON file using the `Receipts JSON` file input near the top of the dashboard.
4. The page will parse the file, show a status line with the number of receipts and the date range, and populate all cards/tables.

Notes on data requirements
- The dashboard expects an array of receipt objects (the shape returned by the GraphQL snippet included). If your JSON uses a different shape, transform it to an array of receipts before loading.
- For gasoline analytics the dashboard uses `itemArray[].fuelUnitQuantity` to compute gallons. If fuel lines lack that field, gallons and $/gallon averages will be incomplete.
- Discount detection: the dashboard recognizes discount line items when a line has a negative `unit` and negative `amount` and `itemDescription01` starts with `"/<itemNumber>"` (this matches the typical Costco refund/discount line that references the original SKU). Receipt-level `instantSavings` are not automatically distributed to items — see "Advanced" below if you'd like automatic allocation.

## What each card shows

### Summary cards (top)
- Total Purchases (items): total number of purchased units across all receipts.
- Unique Items: number of distinct item SKUs seen.
- Unique Warehouses: distinct warehouses / stations visited (normalized to uppercase labels).
- Receipts: number of receipts (shopping trips) loaded.
- Total Spent: grand total across receipts (includes tax where present).
- Total Gas Spent: sum of gas station totals. Subtext includes average $/gallon and total gallons (3 decimals) when fuel data is present.
- Avg Item Price: average paid per purchased unit (uses discounted item amounts when applicable).
- Avg Per Receipt: average spend per shopping trip.
- Total Discounts: total money saved by detected discounts (sum of absolute discount line amounts).
- Total Returned: total refunded amount (sum of absolute refund amounts); amounts are shown in black (not red).

### Most Total Spent Items
- Top items by total money spent (uses discounted amounts where discounts reference the purchased line).

### Biggest Price Increases
- Items that increased most between their min and max observed per-unit prices. Prices are computed from adjusted (discount-applied) purchase amounts.

### Most Expensive Items
- Items with the highest average per-unit price (minimum 3 purchases). Discounted prices are used for the average.

### Most Purchased Items
- Items with the largest number of units purchased. Average price shown is the discounted average when applicable.

### Spending by Warehouse
- Per-warehouse totals and trip counts. Warehouse labels are normalized and include warehouse number when available.

### Most Returned Items
- Items with the largest total refunds. Refunds are aggregated from receipts whose `transactionType` is `Refund`. Refund amounts are displayed in black.

### Gasoline Purchases
- Per-gas-station totals: number of fill-ups, total spent, total gallons (3 decimals), average per fill-up, and average $/gallon.

### Top Discounted Items
- Top 10 items that had discount line items applied (times discounted, total discount, average discount).

## Advanced / Troubleshooting
- If you see parsing errors, ensure the uploaded JSON is an array of receipt objects.
- If discounts are missing from per-item averages, the dashboard's discount heuristic may not match your dataset. Provide a short sample and I can add rules to detect other discount formats (coupons, receipt-level instant savings distribution, etc).
- The downloader script uses tokens from local storage and must be run in the browser on the Costco site (see `download_costco_receipts.js`). Use it only on your own account and device.

## Acknowledgements
Thanks to the authors and resources that inspired or provided parts of this dashboard and tooling:

- [Your list here] — add names, projects, or links you'd like to credit.
