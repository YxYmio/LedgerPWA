// worker.js - 獨立的背景運算執行緒
self.importScripts("./reports.js");

self.onmessage = function (e) {
  const { type, payload, reqId } = e.data;
  let result = null;

  try {
    if (type === "CALC_BALANCE_SHEET") {
      result = calculateBalanceSheet(
        payload.accounts,
        payload.transactions,
        payload.investments,
        payload.currencyRates,
        payload.endDate,
      );
    } else if (type === "CALC_INCOME_STATEMENT") {
      result = calculateIncomeStatement(
        payload.accounts,
        payload.transactions,
        payload.startDate,
        payload.endDate,
      );
    } else if (type === "CALC_CASH_FLOW") {
      result = calculateCashFlow(
        payload.accounts,
        payload.transactions,
        payload.startDate,
        payload.endDate,
      );
    }
    // 運算完成，將結果回傳給主執行緒
    self.postMessage({ type: "SUCCESS", reqId, reqType: type, data: result });
  } catch (err) {
    self.postMessage({ type: "ERROR", reqId, error: err.message });
  }
};
