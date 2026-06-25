# Costco Receipt Dashboard

A small, single-file browser dashboard to analyze Costco receipt JSON exports. Drop a receipts JSON into the page and get quick insights: totals, top items, returns, discounts, and gasoline analytics. The project includes a small browser snippet (`download_costco_receipts.js`) you can run from the Costco site to export your receipts.

<img alt="image" src="https://github.com/user-attachments/assets/4532bdfa-8204-42d5-9d3d-ec09b4b82af4" />

## Features
- **Sync from Costco** (server mode): pull new receipts straight into the dashboard with a button — no file download/upload round-trip (see below).
- Upload / analyze a JSON array of Costco receipts (no server required).
- Summary cards for totals (spend, receipts, unique items/warehouses, gas, discounts, returns).
- Top tables and charts: most-spent items, most-purchased items, biggest price increases, per-warehouse spend, refunds, gasoline breakdown, and top discounted products.
- **Member filtering**: View aggregated stats for all members or drill down to see individual member spending and purchase history.
- **Member stats card**: Per-member summaries including total spent, trip count, average items per trip, preferred warehouse and gas station (based on frequency with 3+ visits minimum).
- Discounts are detected (heuristic) and applied to per-item pricing so price-based metrics reflect net paid amounts.

## Quick start
1. Open `dashboard.html` in a browser (double-click the file or use a local static server).
   - Opened this way the dashboard is fully client-side and does **not** persist data between page loads. To keep your uploads, run the optional server (see below).
2. Option A — Use the included downloader snippet to fetch receipts from the Costco site:
	- Open the browser console on https://www.costco.com/OrderStatusCmd and paste the contents of `download_costco_receipts.js` (the snippet is documented at the top of that file). It will download a JSON file containing your receipts.
3. Option B — Upload receipts JSON file(s) using the `Receipts JSON` file input near the top of the dashboard:
	- You can upload multiple files at once (useful for household receipts from multiple members).
	- The dashboard automatically deduplicates receipts to prevent double-counting if you upload the same file multiple times.
4. Option C — Use the **Sync new receipts from Costco** panel to fetch directly (requires the server, see below).
5. The page will parse the data, show a status line with the total number of receipts and the date range, and populate all cards/tables.

## Sync from Costco (one-click collection)
When the dashboard is running with the server, you can collect new receipts without downloading and re-uploading a file. Because your Costco login lives only in the costco.com browser session, you supply those login tokens once and the server makes the request for you.

1. Open the **Sync new receipts from Costco** panel near the top of the dashboard.
2. In another tab, log in at https://www.costco.com/OrderStatusCmd and open the browser console (F12 → Console).
3. Click **Copy snippet** in the panel, paste it into the console, and press Enter. The console shows your `idToken` and `clientID` as its result (and copies them to the clipboard in browsers that support the console `copy()` helper).
4. Copy that result &mdash; surrounding quotes or backslashes are fine &mdash; paste it back into the dashboard's text box and click **Sync now**.

The server fetches your full receipt history, merges + dedupes it into the stored dataset, and refreshes the dashboard. Notes:
- Your tokens are sent only to your own server, used for a single request, and are **never logged or stored**.
- Tokens expire (the `idToken` lasts only a few minutes), so re-run the snippet to grab fresh ones whenever a sync reports an expired-token error.
- If the result is `{"idToken":null,"clientID":null}`, you aren't logged in on that tab &mdash; sign in at costco.com and run it again.
- If you expose the dashboard beyond `localhost`, serve it over HTTPS so the tokens aren't sent in the clear.

## Persistent storage (optional server)
By default the dashboard runs entirely in the browser and forgets your data on refresh. To save uploaded receipts so they are reloaded automatically on every page load, run the included Node.js server. Uploaded files are merged and deduplicated into a single dataset stored on disk (`data/receipts.json`).

### Run with Node.js
1. Install [Node.js](https://nodejs.org/) (v18+).
2. Install dependencies and start the server:
   ```sh
   npm install
   npm start
   ```
3. Open http://localhost:3000 in your browser.
4. Upload receipts as usual. They are saved server-side and will load automatically the next time you open the page.

Environment variables:
- `PORT` — port to listen on (default `3000`).
- `DATA_DIR` — directory where `receipts.json` is stored (default `./data`).

API endpoints (used by the dashboard, but available for scripting):
- `GET /api/receipts` — return the stored receipts (`{ "receipts": [...] }`).
- `POST /api/receipts` — body is an array of receipts; merges + dedupes + persists.
- `POST /api/sync` — body is `{ "idToken": "...", "clientID": "..." }`; fetches receipts from Costco, merges + dedupes + persists, and returns `{ receipts, added, duplicates, upgraded, total, fetched }`.
- `DELETE /api/receipts` — clears all stored receipts.

### Run with Docker
Build and run the container, mounting a volume so your data persists:
```sh
docker build -t costco-receipt-dashboard .
docker run -p 3000:3000 -v costco-data:/app/data costco-receipt-dashboard
```

Or use Docker Compose:
```sh
docker compose up -d
```
Then open http://localhost:3000. The `data` volume keeps your receipts between container restarts.

### Prebuilt image (GitHub Container Registry)
Every push to `main` builds and publishes a container image via GitHub Actions. Once published you can run it directly:
```sh
docker run -p 3000:3000 -v costco-data:/app/data ghcr.io/ddeitterick/costco-receipt-dashboard:latest
```

Notes on data requirements
- The dashboard expects an array of receipt objects (the shape returned by the GraphQL snippet included). If your JSON uses a different shape, transform it to an array of receipts before loading.
- For member filtering and member stats to work, receipt objects should include a `membershipNumber` field (the Costco member ID). Receipts without this field won't appear in per-member views.
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

### Member Filter (top right)
- Use the **Filter by Member** dropdown to view analytics for a specific member or all members. When a member is selected:
  - The **Most Total Spent Items**, **Most Purchased Items**, **Most Expensive Items**, and **Biggest Price Increases** tables show only that member's purchases and prices.
  - Other cards (warehouse, returns, gasoline, discounts, member stats, and charts) continue to show aggregated data across all members.

### Most Total Spent Items
- Top items by total money spent (uses discounted amounts where discounts reference the purchased line).
- When filtering by member, shows the member's top items by spend.

### Biggest Price Increases
- Items that increased most between their min and max observed per-unit prices. Prices are computed from adjusted (discount-applied) purchase amounts.

### Most Expensive Items
- Items with the highest average per-unit price (minimum 3 purchases). Discounted prices are used for the average.

### Most Purchased Items
- Items with the largest number of units purchased. Average price shown is the discounted average when applicable.

### Spending by Warehouse
- Per-warehouse totals and trip counts. Warehouse labels are normalized and include warehouse number when available.

### Member Stats
- Per-member spending summary (all members shown, not filtered by the member dropdown):
  - **Membership Number**: unique identifier for the member.
  - **Total Spent**: grand total across all receipts for that member.
  - **Trips**: number of shopping trips (receipts) for the member.
  - **Avg Items/Trip**: average number of units purchased per trip.
  - **Preferred Warehouse**: warehouse with the most visits (requires 3+ trips); shows "No Preference" if no warehouse has 3+ visits.
  - **Preferred Gas Station**: gas station with the most fill-ups (requires 3+ gas trips); shows "No Preference" if not met.

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
- If you have issues running the download_costco_receipts.js all at once (especially when using Safari), run each section of Javascript (there should be 3 sections) individually.

## License and Attribution

This project is licensed under the BSD 2-Clause "Simplified" License. See the [LICENSE](LICENSE) file for details.

This project uses code from the [@ankurdave/beancount_import_sources](https://github.com/ankurdave/beancount_import_sources) repository, which is licensed under the BSD 2-Clause "Simplified" License.

## Acknowledgements
Thanks to the authors and resources that inspired or provided parts of this dashboard and script:

- ankurdave - https://github.com/ankurdave/beancount_import_sources/blob/main/download/download_costco_receipts.js
- Reddit user u/ikeee for the OG report
- Reddit user u/ViKoToMo for the updated version
- Reddit user u/webrender for the YouTube video on how to run the Javascript (https://www.youtube.com/watch?v=v0zRaWkQ5lQ)
