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

// Convert using Cloudscraper - UPDATED VERSION
async function convertWithCloudscraper(url) {
  try {
    // STEP 1: Get the search page with the video info
    const searchResponse = await cloudscraper.get({
      uri: 'https://ssvid.net/id4',
      qs: { q: url },
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
        'Referer': 'https://ssvid.net/id4',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    // Parse HTML response
    const dom = new JSDOM(searchResponse);
    const document = dom.window.document;

    // Extract video title
    const titleElement = document.querySelector('.vtitle');
    const title = titleElement ? titleElement.textContent.trim() : "YouTube Audio";

    // Extract video ID
    const videoIdElement = document.querySelector('#video_id');
    const vid = videoIdElement ? videoIdElement.value : null;

    if (!vid) {
      throw new Error('Video ID tidak ditemukan');
    }

    // Find MP3 download button and extract token
    const mp3Button = document.querySelector('button[onclick*="startConvert(\'mp3\'"]');
    if (!mp3Button) {
      throw new Error('Tombol MP3 tidak ditemukan');
    }

    // Extract token from onclick attribute
    const onclick = mp3Button.getAttribute('onclick');
    const tokenMatch = onclick.match(/startConvert\('mp3','([^']+)'\)/);
    
    if (!tokenMatch || !tokenMatch[1]) {
      throw new Error('Token konversi tidak ditemukan');
    }

    const token = tokenMatch[1];

    // STEP 2: CONVERT - Get download link using the new API endpoint
    const convertResponse = await cloudscraper.post({
      uri: 'https://ssvid.net/api/ajaxConvert/convert',
      form: { 
        vid: vid, 
        k: token,
        mobile: false
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://ssvid.net',
        'Referer': `https://ssvid.net/id4?q=${encodeURIComponent(url)}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const convertData = JSON.parse(convertResponse);
    
    if (!convertData || !convertData.dlink) {
      throw new Error("Download link tidak ditemukan.");
    }

    return {
      title: title,
      downloadUrl: convertData.dlink,
      format: "mp3",
      quality: "128kbps"
    };
    
  } catch (error) {
    console.error('Cloudscraper conversion error:', error);
    throw error;
  }
}

// Convert using Puppeteer (fallback) - UPDATED VERSION
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
    await page.goto('https://ssvid.net/id4', { 
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Input the URL
    await page.type('#search__input', url);
    
    // Click the convert button
    await page.click('#btn-start');
    
    // Wait for conversion to complete
    await page.waitForSelector('.tab-content', { timeout: 60000 });
    
    // Wait a bit more for the conversion to finish
    await page.waitForTimeout(3000);
    
    // Click the MP3 download button
    const mp3Button = await page.$('button[onclick*="mp3"]');
    if (mp3Button) {
      await mp3Button.click();
      
      // Wait for download link to appear
      await page.waitForSelector('a[href*="download"]', { timeout: 30000 });
    }
    
    // Get download link
    const downloadUrl = await page.evaluate(() => {
      const downloadLink = document.querySelector('a[href*="download"]');
      return downloadLink ? downloadLink.href : null;
    });
    
    // Get title
    const title = await page.evaluate(() => {
      const titleElement = document.querySelector('.vtitle');
      return titleElement ? titleElement.textContent.trim() : "YouTube Audio";
    });
    
    await browser.close();
    
    if (!downloadUrl) {
      throw new Error('Download link tidak ditemukan');
    }
    
    return {
      title: title,
      downloadUrl: downloadUrl,
      format: "mp3",
      quality: "128kbps"
    };
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('Puppeteer conversion error:', error);
    throw error;
  }
}
