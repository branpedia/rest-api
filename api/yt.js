import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';

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

  const { url, retry = 0 } = request.query;

  if (!url) {
    return response.status(400).json({ success: false, error: 'Parameter URL diperlukan' });
  }

  try {
    // Validate YouTube URL
    if (!url.includes('youtube.com/') && !url.includes('youtu.be/')) {
      return response.status(400).json({ success: false, error: 'URL tidak valid. Pastikan URL berasal dari YouTube.' });
    }

    let result;
    
    try {
      // First try with cloudscraper
      result = await convertWithCloudscraper(url);
    } catch (error) {
      console.log('⚠️ Cloudscraper gagal, coba fallback ke Puppeteer...');
      result = await convertWithPuppeteer(url);
    }

    return response.status(200).json({
      success: true,
      data: {
        title: result.title,
        downloadUrl: result.downloadUrl,
        format: result.format,
        quality: result.quality || '128kbps'
      }
    });

  } catch (error) {
    console.error('❌ Error converter:', error);
    
    if (retry < 3) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }
    
    return response.status(500).json({ 
      success: false, 
      error: 'Gagal mengambil data dari YouTube. Pastikan URL valid dan coba lagi.' 
    });
  }
}

// Convert using Cloudscraper
async function convertWithCloudscraper(url) {
  try {
    // STEP 1: SEARCH
    const searchData = await cloudscraper.post({
      uri: 'https://ssvid.net/api/ajaxSearch/index',
      form: { query: url },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://ssvid.net',
        'Referer': 'https://ssvid.net/'
      },
      json: true
    });

    console.log("🔎 searchData:", searchData);

    if (!searchData || !searchData.vid) {
      throw new Error('Video tidak ditemukan di ssvid.net');
    }

    // Cari token
    let format = "m4a";
    let token = searchData?.links?.m4a?.["140"]?.k;

    if (!token) {
      format = "mp3";
      token = searchData?.links?.mp3?.mp3128?.k 
           || searchData?.links?.mp3?.["128"]?.k
           || searchData?.links?.audio?.["128"]?.k;
    }

    if (!token) {
      throw new Error("Token konversi tidak ditemukan.");
    }

    const vid = searchData.vid;

    // STEP 2: CONVERT
    const convertData = await cloudscraper.post({
      uri: 'https://ssvid.net/api/ajaxConvert/convert',
      form: { vid, k: token },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://ssvid.net',
        'Referer': 'https://ssvid.net/'
      },
      json: true
    });

    console.log("🎯 convertData:", convertData);

    if (!convertData || !convertData.dlink) {
      throw new Error("Download link tidak ditemukan.");
    }

    return {
      title: searchData.title || "YouTube Audio",
      downloadUrl: convertData.dlink,
      format: format,
      quality: format === "mp3" ? "128kbps" : "140kbps"
    };

  } catch (error) {
    console.error('⚠️ Cloudscraper error:', error.message);
    throw error;
  }
}

// Convert using Puppeteer (fallback)
async function convertWithPuppeteer(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );
    
    await page.goto('https://ytmp3.cc/en13/', { waitUntil: 'networkidle2', timeout: 30000 });
    
    await page.type('#input', url);
    await page.click('#submit');
    
    await page.waitForSelector('#download', { timeout: 60000 });
    
    const downloadUrl = await page.$eval('#download', el => el.href);
    const title = await page.$eval('#title', el => el.value);
    
    await browser.close();
    
    return {
      title: title,
      downloadUrl: downloadUrl,
      format: "mp3",
      quality: "128kbps"
    };
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('⚠️ Puppeteer error:', error.message);
    throw error;
  }
}
