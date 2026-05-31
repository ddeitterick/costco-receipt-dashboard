// Simple Express server for the Costco Receipt Dashboard.
//
// Responsibilities:
//   - Serve the static dashboard (dashboard.html and friends).
//   - Persist uploaded receipt JSON to disk so data survives page reloads
//     and restarts (merged + deduplicated into a single dataset).
//
// API:
//   GET    /api/receipts  -> { receipts: [...] }            (load stored data)
//   POST   /api/receipts  -> body: array of receipts        (merge + persist)
//                            -> { receipts, added, duplicates, total }
//   DELETE /api/receipts  -> clears stored data

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
// Allow the storage location to be overridden (handy for Docker volumes).
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "receipts.json");

// Accept large JSON payloads (receipt exports can be several MB).
app.use(express.json({ limit: "100mb" }));

// --- Persistence helpers ---------------------------------------------------

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readReceipts() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Failed to read stored receipts:", err.message);
    return [];
  }
}

function writeReceipts(receipts) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(receipts), "utf8");
}

// Mirror of the client-side dedupe key so the server and browser agree on
// what counts as a duplicate receipt.
function getReceiptKey(receipt) {
  const date = receipt.transactionDate || receipt.transactionDateTime || "";
  const amount = receipt.total || receipt.totalAmount || "";
  const memberId = receipt.membershipNumber || "";
  const itemCount = (receipt.itemArray && receipt.itemArray.length) || 0;
  return `${date}|${amount}|${memberId}|${itemCount}`;
}

// Total fuel gallons recorded on a receipt's line items.
function receiptFuelGallons(receipt) {
  const items = Array.isArray(receipt.itemArray) ? receipt.itemArray : [];
  return items.reduce((acc, it) => acc + (Number(it.fuelUnitQuantity) || 0), 0);
}

// Some Costco exports contain the same receipt twice: an older copy whose fuel
// line lacks `fuelUnitQuantity` and a newer copy that includes it. Both share
// the same dedupe key, so prefer the copy that carries fuel gallon data.
function isMoreDetailedReceipt(incoming, existing) {
  return receiptFuelGallons(incoming) > 0 && receiptFuelGallons(existing) === 0;
}

// --- API routes ------------------------------------------------------------

app.get("/api/receipts", (req, res) => {
  res.json({ receipts: readReceipts() });
});

app.post("/api/receipts", (req, res) => {
  const incoming = req.body;
  if (!Array.isArray(incoming)) {
    return res
      .status(400)
      .json({ error: "Expected the request body to be an array of receipts." });
  }

  const existing = readReceipts();
  const indexByKey = new Map();
  existing.forEach((receipt, idx) => {
    indexByKey.set(getReceiptKey(receipt), idx);
  });

  let added = 0;
  let duplicates = 0;
  let upgraded = 0;
  incoming.forEach((receipt) => {
    const key = getReceiptKey(receipt);
    if (indexByKey.has(key)) {
      const idx = indexByKey.get(key);
      // Replace the stored copy when this duplicate carries richer fuel data.
      if (isMoreDetailedReceipt(receipt, existing[idx])) {
        existing[idx] = receipt;
        upgraded++;
      }
      duplicates++;
    } else {
      indexByKey.set(key, existing.length);
      existing.push(receipt);
      added++;
    }
  });

  writeReceipts(existing);

  res.json({
    receipts: existing,
    added,
    duplicates,
    upgraded,
    total: existing.length,
  });
});

app.delete("/api/receipts", (req, res) => {
  writeReceipts([]);
  res.json({ receipts: [], total: 0 });
});

// --- Static files ----------------------------------------------------------

app.use(express.static(__dirname, { index: "dashboard.html" }));

app.listen(PORT, () => {
  ensureDataDir();
  console.log(`Costco Receipt Dashboard running at http://localhost:${PORT}`);
  console.log(`Storing data in ${DATA_FILE}`);
});
