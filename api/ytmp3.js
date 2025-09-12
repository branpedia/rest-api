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
    const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})$/;
    if (!ytRegex.test(url)) {
      return response.status(400).json({ success: false, error: 'URL YouTube tidak valid. Format yang benar: https://www.youtube.com/watch?v=VIDEO_ID' });
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

// Convert using Cloudscraper - Updated to work with current ssvid.net
async function convertWithCloudscraper(url) {
  try {
    // First, get the main page to obtain cookies and bypass protection
    await cloudscraper.get('https://ssvid.net');
    
    // STEP 1: SEARCH - Get video info
    const searchResponse = await cloudscraper.post({
      uri: 'https://ssvid.net/api/ajaxSearch/index',
      form: { 
        query: url,
        _: Date.now() // Add timestamp to avoid caching
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://ssvid.net',
        'Referer': 'https://ssvid.net/',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
      }
    });

    const searchData = JSON.parse(searchResponse);

    if (!searchData || !searchData.data) {
      throw new Error('Video tidak ditemukan di ssvid.net');
    }

    // Extract video ID and title
    const vid = searchData.data.vid;
    const title = searchData.data.title;

    if (!vid) {
      throw new Error('Video ID tidak ditemukan');
    }

    // Get token for mp3 (preferred) or m4a
    let format = "mp3";
    let token = searchData.data.links?.mp3?.["128"]?.k;

    if (!token) {
      format = "m4a";
      token = searchData.data.links?.m4a?.["140"]?.k;
    }

    if (!token) {
      // If no token found, try to find any available format
      const availableFormats = Object.keys(searchData.data.links || {});
      if (availableFormats.length > 0) {
        const firstFormat = availableFormats[0];
        const firstQuality = Object.keys(searchData.data.links[firstFormat] || {})[0];
        token = searchData.data.links[firstFormat][firstQuality]?.k;
        format = firstFormat;
      }
    }

    if (!token) {
      throw new Error("Token konversi tidak ditemukan.");
    }

    // STEP 2: CONVERT - Get download link
    const convertResponse = await cloudscraper.post({
      uri: 'https://ssvid.net/api/ajaxConvert/convert',
      form: { 
        vid, 
        k: token,
        _: Date.now() // Add timestamp
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://ssvid.net',
        'Referer': 'https://ssvid.net/',
        'Accept': 'application/json, text/javascript, */*; q=0.01'
      }
    });

    const convertData = JSON.parse(convertResponse);
    
    if (!convertData || !convertData.url) {
      throw new Error("Download link tidak ditemukan.");
    }

    return {
      title: title || "YouTube Audio",
      downloadUrl: convertData.url,
      format: format,
      quality: format === "mp3" ? "128kbps" : "140kbps"
    };
    
  } catch (error) {
    console.error('Cloudscraper conversion error:', error);
    throw error;
  }
}

// Convert using Puppeteer (fallback) - Updated to use y2mate.guru
async function convertWithPuppeteer(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set user agent to mimic a real browser
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Navigate to y2mate which is more reliable
    await page.goto('https://y2mate.guru/youtube-to-mp3/', { 
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Input the URL
    await page.type('#id_url', url);
    
    // Click the convert button
    await page.click('#btn-convert');
    
    // Wait for conversion to complete
    await page.waitForSelector('#process-result .download-table', { timeout: 60000 });
    
    // Get download link and title
    const downloadUrl = await page.$eval('#process-result .download-table a', el => el.href);
    const title = await page.$eval('#process-result .download-table .video-title', el => el.textContent.trim());
    
    await browser.close();
    
    return {
      title: title,
      downloadUrl: downloadUrl,
      format: "mp3",
      quality: "128kbps"
    };
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('Puppeteer conversion error:', error);
    
    // Try one more alternative
    try {
      return await convertWithAlternativeService(url);
    } catch (fallbackError) {
      console.error('All conversion methods failed:', fallbackError);
      throw new Error('Semua metode konversi gagal');
    }
  }
}

// Alternative conversion service as final fallback
async function convertWithAlternativeService(url) {
  // Using onlinevideoconverter.pro API as fallback
  const apiUrl = `https://onlinevideoconverter.pro/api/convert?url=${encodeURIComponent(url)}&format=mp3`;
  
  const response = await fetch(apiUrl, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data || !data.url) {
    throw new Error('Invalid response from conversion service');
  }
  
  return {
    title: data.title || "YouTube Audio",
    downloadUrl: data.url,
    format: "mp3",
    quality: data.quality || "128kbps"
  };
}
