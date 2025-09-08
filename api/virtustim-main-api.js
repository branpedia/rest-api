import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';

// Konstanta untuk base URL
const VIRTUSTIM_BASE_URL = 'https://virtusim.com/api/v2/json.php';

// Fungsi untuk melakukan request ke API Virtustim dengan cloudscraper dan puppeteer fallback
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

// Export fungsi utama untuk 3 API
export async function handleBalance(api_key, params = {}, retry = 0) {
  return await makeVirtustimRequest(api_key, 'balance', params, retry);
}

export async function handleServices(api_key, params = {}, retry = 0) {
  return await makeVirtustimRequest(api_key, 'services', params, retry);
}

export async function handleOrder(api_key, params = {}, retry = 0) {
  if (!params.service) {
    throw new Error('Parameter service diperlukan untuk membuat order');
  }
  return await makeVirtustimRequest(api_key, 'order', params, retry);
}

export default makeVirtustimRequest;
