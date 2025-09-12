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
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    if (!youtubeRegex.test(url)) {
      return response.status(400).json({ success: false, error: 'URL YouTube tidak valid' });
    }

    // Extract video ID
    const videoId = url.match(youtubeRegex)[4];
    
    let result;
    
    try {
      // Try method 1 first
      result = await convertWithCloudscraper(url);
    } catch (error1) {
      console.log('Method 1 failed, trying method 2...');
      try {
        result = await convertWithY2MateAlternative(url);
      } catch (error2) {
        console.log('Method 2 failed, trying method 3...');
        result = await convertWithPuppeteerFallback(url);
      }
    }

    return response.status(200).json({
      success: true,
      data: {
        title: result.title,
        downloadUrl: result.downloadUrl,
        format: result.format,
        quality: result.quality,
        duration: result.duration || 'Unknown',
        thumbnail: result.thumbnail || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
      }
    });

  } catch (error) {
    console.error('Error in YouTube to MP3 converter:', error);
    
    // Retry logic
    if (retry < 2) {
      await new Promise(resolve => setTimeout(resolve, 1000 * (retry + 1)));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }
    
    return response.status(500).json({ 
      success: false, 
      error: 'Gagal mengonversi video. Pastikan URL valid dan coba lagi.' 
    });
  }
}

// Method 1: Original cloudscraper with improved error handling
async function convertWithCloudscraper(url) {
  try {
    // STEP 1: SEARCH - Get video info
    const searchResponse = await cloudscraper.post({
      uri: 'https://ssvid.net/api/ajaxSearch/index',
      form: { query: url },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://ssvid.net',
        'Referer': 'https://ssvid.net/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const searchData = JSON.parse(searchResponse);

    if (!searchData || !searchData.vid) {
      throw new Error('Video tidak ditemukan di ssvid.net');
    }

    // Get token for available formats
    let format = "mp3";
    let token = searchData?.links?.mp3?.mp3128?.k;

    if (!token) {
      format = "m4a";
      token = searchData?.links?.m4a?.["140"]?.k;
    }

    if (!token) {
      // Try other possible formats
      const availableFormats = Object.keys(searchData.links || {});
      if (availableFormats.length > 0) {
        const firstFormat = availableFormats[0];
        const firstQuality = Object.keys(searchData.links[firstFormat] || {})[0];
        token = searchData.links[firstFormat][firstQuality]?.k;
        format = firstFormat;
      }
    }

    if (!token) {
      throw new Error("Token konversi tidak ditemukan.");
    }

    const vid = searchData.vid;

    // STEP 2: CONVERT - Get download link
    const convertResponse = await cloudscraper.post({
      uri: 'https://ssvid.net/api/ajaxConvert/convert',
      form: { vid, k: token },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://ssvid.net',
        'Referer': 'https://ssvid.net/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const convertData = JSON.parse(convertResponse);
    
    if (!convertData || !convertData.dlink) {
      throw new Error("Download link tidak ditemukan.");
    }

    return {
      title: searchData.title || "YouTube Audio",
      downloadUrl: convertData.dlink,
      format: format,
      quality: format === "mp3" ? "128kbps" : "140kbps",
      duration: searchData.duration || 'Unknown'
    };
    
  } catch (error) {
    console.error('Cloudscraper conversion error:', error);
    throw error;
  }
}

// Method 2: Alternative Y2Mate approach using cloudscraper
async function convertWithY2MateAlternative(url) {
  try {
    // First get video info using oembed
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    
    const oembedResponse = await cloudscraper.get(oembedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const oembedData = JSON.parse(oembedResponse);
    const title = oembedData.title;

    // Try different converter service
    const converterResponse = await cloudscraper.post({
      uri: 'https://yt5s.com/en/api/convert',
      form: {
        v: url,
        format: 'mp3'
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://yt5s.com',
        'Referer': 'https://yt5s.com/'
      }
    });

    const converterData = JSON.parse(converterResponse);
    
    if (!converterData || !converterData.durl) {
      throw new Error('Konversi gagal di yt5s');
    }

    return {
      title: title,
      downloadUrl: converterData.durl,
      format: 'mp3',
      quality: '128kbps',
      duration: 'Unknown'
    };

  } catch (error) {
    console.error('Y2Mate alternative error:', error);
    throw error;
  }
}

// Method 3: Puppeteer fallback with different service
async function convertWithPuppeteerFallback(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });
    
    // Use a different converter service that's more reliable
    await page.goto('https://ytmp3.nu/', { 
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Input the URL
    await page.type('#url', url);
    
    // Click the convert button
    await page.click('#submit');
    
    // Wait for conversion with multiple selectors
    await Promise.race([
      page.waitForSelector('#downloadbtn', { timeout: 60000 }),
      page.waitForSelector('.download-btn', { timeout: 60000 }),
      page.waitForSelector('a[href*="download"]', { timeout: 60000 })
    ]);
    
    // Get download link from multiple possible selectors
    let downloadUrl = '';
    const selectors = ['#downloadbtn', '.download-btn', 'a[href*="download"]'];
    
    for (const selector of selectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          downloadUrl = await page.evaluate(el => el.href, element);
          if (downloadUrl) break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (!downloadUrl) {
      throw new Error('Download link tidak ditemukan');
    }

    // Get title
    const title = await page.evaluate(() => {
      const titleSelectors = ['.video-title', '.title', 'h1', 'h2', 'h3'];
      for (const selector of titleSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim()) {
          return el.textContent.trim();
        }
      }
      return 'YouTube Audio';
    });

    await browser.close();
    
    return {
      title: title,
      downloadUrl: downloadUrl,
      format: "mp3",
      quality: "128kbps",
      duration: "Unknown"
    };
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('Puppeteer fallback error:', error);
    throw error;
  }
}
