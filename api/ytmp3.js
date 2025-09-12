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
      console.log('Cloudscraper failed, trying with Puppeteer...');
      
      // If cloudscraper fails, use Puppeteer as fallback
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
    console.error('Error in YouTube to MP3 converter:', error);
    
    // Retry logic
    if (retry < 3) {
      // Wait for 1 second before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }
    
    return response.status(500).json({ 
      success: false, 
      error: 'Gagal mengambil data dari YouTube. Pastikan URL valid dan coba lagi.' 
    });
  }
}

// Convert using Cloudscraper - Updated for current ssvid.net
async function convertWithCloudscraper(url) {
  try {
    // First, get the main page to get cookies and tokens
    const initialResponse = await cloudscraper.get('https://ssvid.net/');
    
    // Extract the token from the page (if needed)
    // For now, we'll directly use the API endpoints as observed
    
    // STEP 1: SEARCH - Get video info
    const searchResponse = await cloudscraper.post({
      uri: 'https://ssvid.net/api/ajaxSearch/index',
      form: { 
        q: url,
        t: 'search'
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://ssvid.net',
        'Referer': 'https://ssvid.net/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const searchData = JSON.parse(searchResponse);
    console.log('Search response:', searchData);

    if (!searchData || !searchData.status || searchData.status !== 'ok') {
      throw new Error('Video tidak ditemukan di ssvid.net');
    }

    // Get the video ID from the response
    const vid = searchData.vid;
    if (!vid) {
      throw new Error('Video ID tidak ditemukan');
    }

    // Get token for m4a format
    let format = "m4a";
    let token = null;
    
    // Check if audio formats are available
    if (searchData.links && searchData.links.audio) {
      // Look for M4A format
      for (const [key, value] of Object.entries(searchData.links.audio)) {
        if (key.includes('m4a') || value.k) {
          token = value.k;
          break;
        }
      }
    }

    if (!token) {
      throw new Error("Token konversi untuk M4A tidak ditemukan.");
    }

    // STEP 2: CONVERT - Get download link
    const convertResponse = await cloudscraper.post({
      uri: 'https://ssvid.net/api/ajaxConvert/convert',
      form: { 
        vid: vid, 
        k: token,
        t: 'convert'
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://ssvid.net',
        'Referer': 'https://ssvid.net/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const convertData = JSON.parse(convertResponse);
    console.log('Convert response:', convertData);
    
    if (!convertData || !convertData.durl) {
      throw new Error("Download link tidak ditemukan.");
    }

    return {
      title: searchData.title || "YouTube Audio",
      downloadUrl: convertData.durl,
      format: format,
      quality: "128kbps"
    };
    
  } catch (error) {
    console.error('Cloudscraper conversion error:', error);
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
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Navigate to ssvid.net
    await page.goto('https://ssvid.net/', { 
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Input the URL
    await page.type('#search__input', url);
    
    // Click the convert button
    await page.click('#btn-start');
    
    // Wait for conversion to complete
    await page.waitForSelector('#audio', { timeout: 60000 });
    
    // Click on audio tab
    await page.click('#audio');
    
    // Wait for audio formats to load
    await page.waitForSelector('.btn-orange', { timeout: 30000 });
    
    // Find and click the M4A convert button
    const convertButtons = await page.$$('.btn-orange');
    if (convertButtons.length > 0) {
      await convertButtons[0].click();
    }
    
    // Wait for download button to appear
    await page.waitForSelector('a.btn-success[href*="dl"]', { timeout: 60000 });
    
    // Get download link
    const downloadUrl = await page.$eval('a.btn-success', el => el.href);
    
    // Get title
    const title = await page.title();
    
    await browser.close();
    
    return {
      title: title.replace(' - SSvid.net', ''),
      downloadUrl: downloadUrl,
      format: "m4a",
      quality: "128kbps"
    };
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('Puppeteer conversion error:', error);
    throw error;
  }
}
