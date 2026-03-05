// 1. Go to https://www.costco.com/OrderStatusCmd.
// 2. Run the following code in the JS console:

async function listOnlineOrders(startDate, endDate, warehouseNumber, pageNumber = 1, pageSize = 100) {
    return await new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.responseType = 'json';
        xhr.open('POST', 'https://ecom-api.costco.com/ebusiness/order/v1/orders/graphql');
        xhr.setRequestHeader('Access-Control-Allow-Origin', '*');
    // GraphQL expects standard JSON
    xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Costco.Env', 'ecom');
        xhr.setRequestHeader('Costco.Service', 'restOrders');
        xhr.setRequestHeader('Costco-X-Wcs-Clientid', localStorage.getItem('clientID'));
        xhr.setRequestHeader('Client-Identifier', '481b1aec-aa3b-454b-b81b-48187e28f205');
        xhr.setRequestHeader('Costco-X-Authorization', 'Bearer ' + localStorage.getItem('idToken'));

        const getOnlineOrdersQuery = {
            query: `
                query getOnlineOrders($startDate:String!, $endDate:String!, $warehouseNumber:String!, $pageNumber:Int, $pageSize:Int){
                    getOnlineOrders(startDate:$startDate, endDate:$endDate, warehouseNumber:$warehouseNumber, pageNumber:$pageNumber, pageSize:$pageSize) {
                      totalNumberOfRecords
                      bcOrders {
                        orderHeaderId
                        orderPlacedDate : orderedDate
                        orderNumber : sourceOrderNumber 
                        orderTotal
                        warehouseNumber
                        status
                        emailAddress
                        orderCancelAllowed
                        orderPaymentFailed : orderPaymentEditAllowed
                        orderReturnAllowed
                        orderLineItems {
                          orderLineItemCancelAllowed
                        	orderLineItemId
                          orderReturnAllowed
                          itemId
                          itemNumber
                          itemTypeId
                          lineNumber
                          itemDescription
                          deliveryDate
                          warehouseNumber
                          status
                          orderStatus
                          parentOrderLineItemId
                          isFSAEligible
                          shippingType
                          shippingTimeFrame
                          isShipToWarehouse
                          carrierItemCategory
                          carrierContactPhone
                          programTypeId
                          isBuyAgainEligible
                          scheduledDeliveryDate
                          scheduledDeliveryDateEnd
                          configuredItemData
                          shipment {
                            shipmentId             
                            orderHeaderId
                            orderShipToId 
                            lineNumber 
                            orderNumber
                            shippingType 
                            shippingTimeFrame 
                            shippedDate 
                            packageNumber 
                            trackingNumber 
                            trackingSiteUrl 
                            carrierName         
                            estimatedArrivalDate 
                            deliveredDate 
                            isDeliveryDelayed 
                            isEstimatedArrivalDateEligible 
                            statusTypeId 
                            status 
                            pickUpReadyDate
                            pickUpCompletedDate
                            reasonCode
                            trackingEvent {
                              event
                              carrierName
                              eventDate
                              estimatedDeliveryDate
                              scheduledDeliveryDate
                              trackingNumber
                            }
                          }
                        }
                      }
                    }
                }`.replace(/\s+/g, ' '),
            variables: {
                startDate: startDate,
                endDate: endDate,
                warehouseNumber: warehouseNumber,
                pageNumber: pageNumber,
                pageSize: pageSize,
            },
        };

        console.log('Sending query with variables:', getOnlineOrdersQuery.variables);

        xhr.onload = async function () {
            if (xhr.status === 200) {
                try {
                    const data = xhr.response && xhr.response.data;
                    if (!data) return resolve({ orders: [], totalRecords: 0 });
                    // API may return getOnlineOrders as an array with a single object
                    let payload = data.getOnlineOrders;
                    if (Array.isArray(payload)) {
                        payload = payload[0] || null;
                    }
                    if (payload) {
                        resolve({
                            orders: payload.bcOrders || [],
                            totalRecords: payload.totalNumberOfRecords || 0,
                        });
                    } else {
                        resolve({ orders: [], totalRecords: 0 });
                    }
                } catch (e) {
                    // If parsing failed but status is 200, still resolve empty result
                    resolve({ orders: [], totalRecords: 0 });
                }
            } else {
                reject(xhr.status);
            }
        };

        xhr.send(JSON.stringify(getOnlineOrdersQuery));
    });
}

async function downloadOnlineOrders() {
    var startDate = new Date('2000-01-01');
    var endDate = new Date();
    
    // Format dates as YYYY-MM-DD (ISO format)
    var startDateStr = startDate.toISOString().split('T')[0];
    var endDateStr = endDate.toISOString().split('T')[0];

    // NOTE: Online Orders endpoint appears to require a warehouseNumber (string).
    // Use a specific warehouse number if known; otherwise prompt the user.
    // Example from successful query: "847". You can replace this with your local warehouse.
    var warehouseNumber = '847';
    var pageNumber = 1;
    var pageSize = 100;
    
    console.log(`Fetching online orders from ${startDateStr} to ${endDateStr}...`);
    // First request to determine total records
    const firstPage = await listOnlineOrders(startDateStr, endDateStr, warehouseNumber, pageNumber, pageSize);
    let allOrders = firstPage.orders || [];
    const totalRecords = firstPage.totalRecords || allOrders.length;

    // If multiple pages, fetch the rest
    const totalPages = Math.ceil(totalRecords / pageSize);
    if (totalPages > 1) {
        console.log(`Total records: ${totalRecords}. Fetching ${totalPages} pages...`);
        for (let p = 2; p <= totalPages; p++) {
            try {
                const page = await listOnlineOrders(startDateStr, endDateStr, warehouseNumber, p, pageSize);
                if (page && Array.isArray(page.orders)) {
                    allOrders = allOrders.concat(page.orders);
                }
                console.log(`Fetched page ${p}/${totalPages} (running total: ${allOrders.length})`);
            } catch (errStatus) {
                console.warn(`Skipping page ${p} due to HTTP status ${errStatus}`);
            }
        }
    }

    console.log(`Downloaded ${allOrders.length} online orders, saving.`);
    // Enrich with order details
    try {
        const orderNumbers = Array.from(new Set(allOrders.map(o => o.orderNumber).filter(Boolean)));
        console.log(`Fetching detailed data for ${orderNumbers.length} orders...`);
        const detailsMap = await fetchAllOrderDetails(orderNumbers, 20);
        // Attach details
        allOrders = allOrders.map(o => {
            const detail = detailsMap[o.orderNumber];
            if (detail) {
                o._details = detail; // use underscored key to avoid collision
            }
            return o;
        });
        console.log('Order details enrichment complete.');
    } catch (e) {
        console.warn('Failed to enrich orders with details:', e);
    }
    
    {
        var a = document.createElement('a');
        a.download = `costco-online-orders-${endDate.toISOString()}.json`;
        a.href = window.URL.createObjectURL(new Blob([JSON.stringify(allOrders, null, 2)], { type: 'text/plain' }));
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
    }
}

// Existing full orders downloader still available if needed:
// await downloadOnlineOrders();

// Download ONLY the detailed order information (no base bcOrders array)
async function downloadOnlineOrderDetails() {
    var startDate = new Date('2000-01-01');
    var endDate = new Date();
    var startDateStr = startDate.toISOString().split('T')[0];
    var endDateStr = endDate.toISOString().split('T')[0];
    var warehouseNumber = '847';
    var pageNumber = 1;
    var pageSize = 100;

    console.log(`[Details-only] Gathering order numbers from ${startDateStr} to ${endDateStr}...`);
    const firstPage = await listOnlineOrders(startDateStr, endDateStr, warehouseNumber, pageNumber, pageSize);
    let allOrders = firstPage.orders || [];
    const totalRecords = firstPage.totalRecords || allOrders.length;
    const totalPages = Math.ceil(totalRecords / pageSize);
    if (totalPages > 1) {
        for (let p = 2; p <= totalPages; p++) {
            try {
                const page = await listOnlineOrders(startDateStr, endDateStr, warehouseNumber, p, pageSize);
                if (page && Array.isArray(page.orders)) {
                    allOrders = allOrders.concat(page.orders);
                }
                console.log(`[Details-only] Collected page ${p}/${totalPages} (orders so far: ${allOrders.length})`);
            } catch (errStatus) {
                console.warn(`[Details-only] Skipping page ${p} due to HTTP status ${errStatus}`);
            }
        }
    }

    const orderNumbers = Array.from(new Set(allOrders.map(o => o.orderNumber).filter(Boolean)));
    console.log(`[Details-only] Fetching details for ${orderNumbers.length} unique orders...`);
    const detailsMap = await fetchAllOrderDetails(orderNumbers, 20);
    // Convert map to array preserving original orderNumbers ordering
    const detailedOrders = orderNumbers.map(num => detailsMap[num]).filter(Boolean);
    console.log(`[Details-only] Retrieved details for ${detailedOrders.length} orders. Saving file...`);

    var a = document.createElement('a');
    a.download = `costco-online-order-details-${endDate.toISOString()}.json`;
    a.href = window.URL.createObjectURL(new Blob([JSON.stringify(detailedOrders, null, 2)], { type: 'text/plain' }));
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
}


// Query detailed order info for a single order number (API requires exactly one)
async function getOrderDetail(orderNumber, attempt = 0) {
    return await new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.responseType = 'json';
        xhr.open('POST', 'https://ecom-api.costco.com/ebusiness/order/v1/orders/graphql');
        xhr.setRequestHeader('Access-Control-Allow-Origin', '*');
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Costco.Env', 'ecom');
        xhr.setRequestHeader('Costco.Service', 'restOrders');
        xhr.setRequestHeader('Costco-X-Wcs-Clientid', localStorage.getItem('clientID'));
        xhr.setRequestHeader('Client-Identifier', '481b1aec-aa3b-454b-b81b-48187e28f205');
        xhr.setRequestHeader('Costco-X-Authorization', 'Bearer ' + localStorage.getItem('idToken'));

        // Use array with one element since server expects exactly one order in list
        const payloadVar = [orderNumber];
        const getOrderDetailsQuery = {
            query: `query getOrderDetails($orderNumbers: [String]) {\n  getOrderDetails(orderNumbers:$orderNumbers) {\n    warehouseNumber\n    orderNumber : sourceOrderNumber \n    orderPlacedDate : orderedDate\n    status\n    locale\n    orderReturnAllowed\n    shopCardAppliedAmount\n    walletShopCardAppliedAmount\n    giftOfMembershipAppliedAmount\n    orderCancelAllowed\n    orderPaymentFailed : orderPaymentEditAllowed\n    orderShippingEditAllowed\n    merchandiseTotal\n    retailDeliveryFee\n    shippingAndHandling\n    grocerySurcharge\n    frozenSurchargeFee\n    uSTaxTotal1\n    foreignTaxTotal1\n    foreignTaxTotal2\n    foreignTaxTotal3\n    foreignTaxTotal4  \n    orderTotal\n    firstName\n    lastName\n    line1\n    line2\n    line3\n    city\n    state\n    postalCode\n    countryCode\n    companyName\n    emailAddress\n    phoneNumber\n    membershipNumber\n    nonMemberSurchargeAmount\n    discountAmount\n    retailDeliveryFees {\n      key\n      value\n    }\n    developmentFees {\n      key\n      value\n    }\n    orderPayment {\n      paymentType\n      totalCharged\n      cardExpireMonth\n      cardExpireYear\n      nameOnCard\n      cardNumber\n      isGOMPayment\n      storedValueBucket\n    }\n    shipToAddress : orderShipTos {\n      referenceNumber\n      firstName\n      lastName\n      line1\n      line2\n      line3\n      city\n      state\n      postalCode\n      countryCode\n      companyName\n      emailAddress\n      phoneNumber : contactPhone\n      isShipToWarehouse\n      addressWarehouseName\n      giftMessage\n      giftToFirstName\n      giftToLastName\n      giftFromName\n      orderLineItems {\n        shipToWarehousePackageStatus\n        orderStatus\n        orderNumber\n        orderedDate\n        itemTypeId\n        isFeeItem\n        orderLineItemCancelAllowed\n        estimatedDeliveryDate\n        supplierAvailabilityDate\n        fulfilledBy  \n        itemNumber\n        itemDescription : sourceItemDescription\n        price : unitPrice\n        quantity : orderedTotalQuantity\n        merchandiseTotalAmount\n        lineItemId\n        sourceLineItemId\n        parentOrderLineItemId\n        itemId\n        isBuyAgainEligible\n        sequenceNumber : sourceSequenceNumber\n        parentOrderNumber\n        lineNumber\n        replaceStatus\n        returnType\n        itemType\n        programType\n        minOrderDate\n        maxOrderDate\n        fSADescription\n        odsJobId\n        orderedShipMethodDescription\n        shippingChargeAmount\n        preferredArrivalDate\n        requestedDeliveryDate\n        returnStatus\n        productSerialNumber\n        configuredItemData\n        orderedShipMethod\n        isRescheduleEligible\n        deliveryReschedulingSite\n        scheduledDeliveryDate\n        scheduledDeliveryDateEnd\n        limitedReturnPolicyRule\n        isLimitedReturnPolicyExceeded\n        itemWeight\n        itemGroupNumber\n        isPerishable\n        carrierItemCategory\n        carrierContactPhone\n        isUPSMILabelEligible\n        parentLineNumber\n        isExchangeBlock\n        shipToAddressReferenceNumber\n        isVerificationRequired\n        isDept24\n        returnableQuantity\n        totalReturnedQuantity\n        exchangeOrderNumber\n        isGiftMessageSupported\n        isReturnCalendarEligible\n        programTypeId\n        inventoryWarehouseId\n        foreignTax1\n        foreignTax2\n        foreignTax3\n        foreignTax4\n        itemStatus {\n          orderPlaced {\n            quantity\n            transactionDate\n            orderLineItemId\n            lineItemStatusId\n            orderLineItemCancelAllowed\n            orderLineItemReturnAllowed\n          }\n          readyForPickup {\n            quantity\n            transactionDate\n            orderLineItemId\n            lineItemStatusId\n            orderLineItemCancelAllowed\n            orderLineItemReturnAllowed\n          }\n          shipped {\n            quantity\n            transactionDate\n            orderLineItemId\n            lineItemStatusId\n            orderLineItemCancelAllowed\n            orderLineItemReturnAllowed\n          }\n          cancelled {\n            quantity\n            transactionDate\n            orderLineItemId\n            lineItemStatusId\n            orderLineItemCancelAllowed\n            orderLineItemReturnAllowed\n          }\n          returned {\n            quantity\n            transactionDate\n            orderLineItemId\n            lineItemStatusId\n            orderLineItemCancelAllowed\n            orderLineItemReturnAllowed\n          }\n          delivered {\n            quantity\n            transactionDate\n            orderLineItemId\n            lineItemStatusId\n            orderLineItemCancelAllowed\n            orderLineItemReturnAllowed\n          }\n          cancellationRequested {\n            quantity\n            transactionDate\n            orderLineItemId\n            lineItemStatusId\n            orderLineItemCancelAllowed\n            orderLineItemReturnAllowed\n          }\n        }\n        shipment {\n          lineNumber\n          orderNumber                    \n          packageNumber\n          trackingNumber\n          pickUpCompletedDate\n          pickUpReadyDate\n          carrierName\n          trackingSiteUrl\n          shippedDate\n          estimatedArrivalDate\n          deliveredDate\n          isDeliveryDelayed\n          isEstimatedArrivalDateEligible\n          reasonCode\n          trackingEvent {\n            event\n            carrierName\n            eventDate\n            estimatedDeliveryDate\n            scheduledDeliveryDate\n            trackingNumber\n          }\n        }\n      }\n    }\n  }\n}`,
            variables: { orderNumbers: payloadVar }
        };

        xhr.onload = function () {
            if (xhr.status === 200) {
                try {
                    const data = xhr.response && xhr.response.data;
                    if (!data) return resolve(null);
                    let payload = data.getOrderDetails;
                    if (!payload) return resolve(null);
                    // Server may return object or array with single object
                    if (Array.isArray(payload)) payload = payload[0] || null;
                    resolve(payload);
                } catch (e) {
                    resolve(null);
                }
            } else {
                // Retry on backend fault (400) once
                if (attempt < 2) {
                    setTimeout(() => {
                        getOrderDetail(orderNumber, attempt + 1).then(resolve).catch(reject);
                    }, 300 * (attempt + 1));
                } else {
                    reject(xhr.status);
                }
            }
        };

        xhr.send(JSON.stringify(getOrderDetailsQuery));
    });
}

// Fetch details for all orders with chunking
async function fetchAllOrderDetails(orderNumbers) {
    const map = {};
    for (let i = 0; i < orderNumbers.length; i++) {
        const num = orderNumbers[i];
        try {
            const detail = await getOrderDetail(num);
            if (detail && detail.orderNumber) {
                map[detail.orderNumber] = detail;
            }
        } catch (status) {
            console.warn('Detail fetch failed for order', num, 'HTTP status:', status);
        }
        if (i % 10 === 0) {
            console.log(`Progress: ${i + 1}/${orderNumbers.length} details fetched (unique: ${Object.keys(map).length})`);
        }
    }
    return map;
}

await downloadOnlineOrderDetails();