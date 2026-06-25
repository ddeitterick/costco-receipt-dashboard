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

// Merge a batch of incoming receipts into the stored dataset, deduplicating by
// receipt key and upgrading older copies that lack fuel data. Persists the
// result to disk and returns a summary. Shared by the upload (POST
// /api/receipts) and live sync (POST /api/sync) paths.
function mergeReceipts(incoming) {
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

  return {
    receipts: existing,
    added,
    duplicates,
    upgraded,
    total: existing.length,
  };
}

// --- Costco live sync ------------------------------------------------------

// Endpoint and GraphQL query mirror download_costco_receipts.js. The browser
// console script authenticates with tokens from costco.com localStorage; here
// the user supplies those same tokens and the server makes the call (servers
// are not subject to the browser's CORS restrictions).
const COSTCO_GRAPHQL_URL =
  "https://ecom-api.costco.com/ebusiness/order/v1/orders/graphql";
const COSTCO_CLIENT_IDENTIFIER = "481b1aec-aa3b-454b-b81b-48187e28f205";

const RECEIPTS_GRAPHQL_QUERY = `
  query receiptsWithCounts($startDate: String!, $endDate: String!) {
    receiptsWithCounts(startDate: $startDate, endDate: $endDate) {
      inWarehouse
      gasStation
      carWash
      gasAndCarWash
      receipts {
        warehouseName
        receiptType
        documentType
        transactionDateTime
        transactionDate
        companyNumber
        warehouseNumber
        operatorNumber
        warehouseShortName
        registerNumber
        transactionNumber
        transactionType
        transactionBarcode
        total
        warehouseAddress1
        warehouseAddress2
        warehouseCity
        warehouseState
        warehouseCountry
        warehousePostalCode
        totalItemCount
        subTotal
        taxes
        instantSavings
        membershipNumber
        invoiceNumber
        sequenceNumber
        itemArray {
          itemNumber
          itemDescription01
          frenchItemDescription1
          itemDescription02
          frenchItemDescription2
          itemIdentifier
          itemDepartmentNumber
          unit
          amount
          taxFlag
          merchantID
          entryMethod
          transDepartmentNumber
          fuelUnitQuantity
          fuelGradeCode
          itemUnitPriceAmount
          fuelUomCode
          fuelUomDescription
          fuelUomDescriptionFr
          fuelGradeDescription
          fuelGradeDescriptionFr
        }
        tenderArray {
          tenderTypeCode
          tenderSubTypeCode
          tenderDescription
          amountTender
          displayAccountNumber
          sequenceNumber
          approvalNumber
          responseCode
          transactionID
          merchantID
          entryMethod
          tenderTypeName
          tenderAcctTxnNumber
          tenderAuthorizationCode
          tenderTypeNameFr
          tenderEntryMethodDescription
          walletType
          walletId
          storedValueBucket
        }
        couponArray {
          upcnumberCoupon
          voidflagCoupon
          refundflagCoupon
          taxflagCoupon
          amountCoupon
        }
        subTaxes {
          tax1
          tax2
          tax3
          tax4
          aTaxPercent
          aTaxLegend
          aTaxAmount
          aTaxPrintCode
          aTaxPrintCodeFR
          aTaxIdentifierCode
          bTaxPercent
          bTaxLegend
          bTaxAmount
          bTaxPrintCode
          bTaxPrintCodeFR
          bTaxIdentifierCode
          cTaxPercent
          cTaxLegend
          cTaxAmount
          cTaxIdentifierCode
          dTaxPercent
          dTaxLegend
          dTaxAmount
          dTaxPrintCode
          dTaxPrintCodeFR
          dTaxIdentifierCode
          uTaxLegend
          uTaxAmount
          uTaxableAmount
        }
      }
    }
  }`.replace(/\s+/g, " ");

// Fetch the full receipt history from Costco using member-supplied tokens.
// Tokens are used only for this request and are never logged or persisted.
async function fetchReceiptsFromCostco(idToken, clientID) {
  const endDate = new Date();
  const endDateStr = endDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const body = {
    query: RECEIPTS_GRAPHQL_QUERY,
    variables: { startDate: "01/01/2000", endDate: endDateStr },
  };

  let response;
  try {
    response = await fetch(COSTCO_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json-patch+json",
        "Costco.Env": "ecom",
        "Costco.Service": "restOrders",
        "Costco-X-Wcs-Clientid": clientID,
        "Client-Identifier": COSTCO_CLIENT_IDENTIFIER,
        "Costco-X-Authorization": "Bearer " + idToken,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const e = new Error(
      "Could not reach Costco. Check the server's network connection."
    );
    e.statusCode = 502;
    throw e;
  }

  if (response.status === 401 || response.status === 403) {
    const e = new Error(
      "Costco rejected the tokens (likely expired). Grab fresh tokens from " +
        "costco.com and try again."
    );
    e.statusCode = 401;
    throw e;
  }

  if (!response.ok) {
    const e = new Error(`Costco returned an unexpected status (${response.status}).`);
    e.statusCode = 502;
    throw e;
  }

  let payload;
  try {
    payload = await response.json();
  } catch (err) {
    const e = new Error("Costco returned a response that could not be parsed.");
    e.statusCode = 502;
    throw e;
  }

  const data = payload && payload.data;
  if (data && data.receiptsWithCounts && Array.isArray(data.receiptsWithCounts.receipts)) {
    return data.receiptsWithCounts.receipts;
  }
  if (data && Array.isArray(data.receipts)) {
    return data.receipts;
  }
  return [];
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

  res.json(mergeReceipts(incoming));
});

app.post("/api/sync", async (req, res) => {
  const { idToken, clientID } = req.body || {};
  if (!idToken || !clientID) {
    return res.status(400).json({
      error:
        "Both idToken and clientID are required. Copy them from costco.com " +
        "using the helper snippet.",
    });
  }

  try {
    const fetched = await fetchReceiptsFromCostco(idToken, clientID);
    const result = mergeReceipts(fetched);
    res.json({ ...result, fetched: fetched.length });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ error: err.message || "Sync failed." });
  }
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
