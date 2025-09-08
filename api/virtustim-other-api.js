import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';

// Konstanta untuk base URL
const VIRTUSTIM_BASE_URL = 'https://virtusim.com/api/v2/json.php';

// Fungsi untuk melakukan request ke API Virtustim
async function makeVirtustimRequest(apiKey, action, params = {}, retry = 0) {
  const urlParams = new URLSearchParams({
    api_key: apiKey,
    action: action,
    ...params
  });

  const url = `${VIRTUSTIM_BASE_URL}?${urlParams.toString()}`;
  
  let html;
  let browser;
  let finalResponse;

  try {
    // Coba dengan cloudscraper terlebih dahulu
    console.log(`Trying to fetch ${url} with Cloudscraper...`);
    const response = await cloudscraper.get({
      uri: url,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 30000
    });
    
    finalResponse = response;
  } catch (error) {
    console.log('Cloudscraper failed, trying with Puppeteer...');
    
    // Jika cloudscraper gagal, gunakan Puppeteer sebagai fallback
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
      
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      // Set timeout untuk page.goto
      await page.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: 30000 
      });
      
      // Tunggu hingga konten dimuat
      await page.waitForSelector('body', { timeout: 10000 });
      
      // Tunggu sebentar untuk memastikan data sudah dimuat
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Dapatkan HTML dari halaman
      html = await page.content();
      finalResponse = html;
      
      await browser.close();
    } catch (puppeteerError) {
      if (browser) {
        await browser.close();
      }
      throw new Error(`Gagal mengakses Virtustim: ${puppeteerError.message}`);
    }
  }

  // Coba parsing sebagai JSON
  try {
    const jsonResponse = JSON.parse(finalResponse);
    return jsonResponse;
  } catch (e) {
    // Jika parsing JSON gagal, coba ekstrak dari HTML menggunakan JSDOM
    try {
      const dom = new JSDOM(finalResponse);
      const document = dom.window.document;
      
      // Coba ekstrak JSON dari elemen pre (jika ada)
      const preElements = document.querySelectorAll('pre');
      for (const pre of preElements) {
        try {
          const jsonData = JSON.parse(pre.textContent);
          return jsonData;
        } catch (parseError) {
          // Lanjut ke elemen pre berikutnya jika parsing gagal
          continue;
        }
      }
      
      // Coba ekstrak dari body text
      const bodyText = document.body.textContent;
      try {
        const jsonData = JSON.parse(bodyText);
        return jsonData;
      } catch (parseError) {
        // Cari JSON dalam text menggunakan regex
        const jsonMatch = bodyText.match(/{[\s\S]*}/);
        if (jsonMatch) {
          try {
            const jsonData = JSON.parse(jsonMatch[0]);
            return jsonData;
          } catch (regexError) {
            throw new Error('Gagal parsing response JSON dari Virtustim');
          }
        }
        throw new Error('Gagal parsing response dari Virtustim');
      }
    } catch (domError) {
      throw new Error('Gagal parsing response dari Virtustim: ' + domError.message);
    }
  }
}

// Handler untuk 10 API lainnya
export default async function handler(request, response) {
  // Set CORS headers
  response.setHeader('Access-Control-Allow-Credentials', true);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request for CORS
  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  // Only allow GET requests
  if (request.method !== 'GET') {
    return response.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { action, api_key, retry = 0, ...params } = request.query;

  if (!api_key) {
    return response.status(400).json({ success: false, error: 'Parameter api_key diperlukan' });
  }

  if (!action) {
    return response.status(400).json({ success: false, error: 'Parameter action diperlukan' });
  }

  try {
    let result;
    
    // 10 endpoint lainnya
    switch (action) {
      case 'balance_logs':
        result = await makeVirtustimRequest(api_key, 'balance_logs', {}, retry);
        break;
      case 'recent_activity':
        result = await makeVirtustimRequest(api_key, 'recent_activity', {}, retry);
        break;
      case 'list_country':
        result = await makeVirtustimRequest(api_key, 'list_country', {}, retry);
        break;
      case 'list_operator':
        result = await makeVirtustimRequest(api_key, 'list_operator', params, retry);
        break;
      case 'active_order':
        result = await makeVirtustimRequest(api_key, 'active_order', {}, retry);
        break;
      case 'reactive_order':
        // Validasi parameter untuk reactive order
        if (!params.id) {
          return response.status(400).json({ success: false, error: 'Parameter id diperlukan untuk reactive order' });
        }
        result = await makeVirtustimRequest(api_key, 'reactive_order', params, retry);
        break;
      case 'status':
        // Validasi parameter untuk status
        if (!params.id) {
          return response.status(400).json({ success: false, error: 'Parameter id diperlukan untuk mengecek status' });
        }
        result = await makeVirtustimRequest(api_key, 'status', params, retry);
        break;
      case 'set_status':
        // Validasi parameter untuk set_status
        if (!params.id || !params.status) {
          return response.status(400).json({ 
            success: false, 
            error: 'Parameter id dan status diperlukan untuk mengubah status. Status: 1=Ready, 2=Cancel, 3=Resend, 4=Completed' 
          });
        }
        result = await makeVirtustimRequest(api_key, 'set_status', params, retry);
        break;
      case 'order_history':
        result = await makeVirtustimRequest(api_key, 'order_history', {}, retry);
        break;
      case 'detail_order':
        // Validasi parameter untuk detail order
        if (!params.id) {
          return response.status(400).json({ success: false, error: 'Parameter id diperlukan untuk detail order' });
        }
        result = await makeVirtustimRequest(api_key, 'detail_order', params, retry);
        break;
      case 'deposit':
        // Validasi parameter untuk deposit
        if (!params.method || !params.amount) {
          return response.status(400).json({ 
            success: false, 
            error: 'Parameter method dan amount diperlukan untuk deposit. Method: 20=QRIS, 22=USDCBSC, 23=USDTBSC, 24=BTC, 25=ETH, 26=SOLANA' 
          });
        }
        result = await makeVirtustimRequest(api_key, 'deposit', params, retry);
        break;
      default:
        return response.status(400).json({ success: false, error: 'Action tidak valid. Action yang tersedia: balance_logs, recent_activity, list_country, list_operator, active_order, reactive_order, status, set_status, order_history, detail_order, deposit' });
    }

    return response.status(200).json(result);
  } catch (error) {
    console.error('Error in Virtustim API:', error);
    
    // Retry logic
    if (retry < 3) {
      // Wait for 1 second before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      return handler({ 
        ...request, 
        query: { ...request.query, retry: parseInt(retry) + 1 } 
      }, response);
    }
    
    return response.status(500).json({ 
      success: false, 
      error: error.message || 'Gagal mengambil data dari Virtustim. Pastikan API key valid dan coba lagi.' 
    });
  }
}
