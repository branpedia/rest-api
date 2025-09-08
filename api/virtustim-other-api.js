import makeVirtustimRequest from './virtustim-main-api.js';

// Export fungsi untuk 10 API lainnya
export async function handleBalanceLogs(api_key, params = {}, retry = 0) {
  return await makeVirtustimRequest(api_key, 'balance_logs', params, retry);
}

export async function handleRecentActivity(api_key, params = {}, retry = 0) {
  return await makeVirtustimRequest(api_key, 'recent_activity', params, retry);
}

export async function handleListCountry(api_key, params = {}, retry = 0) {
  return await makeVirtustimRequest(api_key, 'list_country', params, retry);
}

export async function handleListOperator(api_key, params = {}, retry = 0) {
  return await makeVirtustimRequest(api_key, 'list_operator', params, retry);
}

export async function handleActiveOrder(api_key, params = {}, retry = 0) {
  return await makeVirtustimRequest(api_key, 'active_order', params, retry);
}

export async function handleReactiveOrder(api_key, params = {}, retry = 0) {
  if (!params.id) {
    throw new Error('Parameter id diperlukan untuk reactive order');
  }
  return await makeVirtustimRequest(api_key, 'reactive_order', params, retry);
}

export async function handleStatus(api_key, params = {}, retry = 0) {
  if (!params.id) {
    throw new Error('Parameter id diperlukan untuk mengecek status');
  }
  return await makeVirtustimRequest(api_key, 'status', params, retry);
}

export async function handleSetStatus(api_key, params = {}, retry = 0) {
  if (!params.id || !params.status) {
    throw new Error('Parameter id dan status diperlukan untuk mengubah status. Status: 1=Ready, 2=Cancel, 3=Resend, 4=Completed');
  }
  return await makeVirtustimRequest(api_key, 'set_status', params, retry);
}

export async function handleOrderHistory(api_key, params = {}, retry = 0) {
  return await makeVirtustimRequest(api_key, 'order_history', params, retry);
}

export async function handleDetailOrder(api_key, params = {}, retry = 0) {
  if (!params.id) {
    throw new Error('Parameter id diperlukan untuk detail order');
  }
  return await makeVirtustimRequest(api_key, 'detail_order', params, retry);
}

export async function handleDeposit(api_key, params = {}, retry = 0) {
  if (!params.method || !params.amount) {
    throw new Error('Parameter method dan amount diperlukan untuk deposit. Method: 20=QRIS, 22=USDCBSC, 23=USDTBSC, 24=BTC, 25=ETH, 26=SOLANA');
  }
  return await makeVirtustimRequest(api_key, 'deposit', params, retry);
}
