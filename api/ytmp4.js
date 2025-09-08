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

  const { url, quality = 'auto', retry = 0 } = request.query;

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
      result = await convertWithCloudscraper(url, quality);
    } catch (error) {
      console.log('Cloudscraper failed, trying with Puppeteer...');
      
      // If cloudscraper fails, use Puppeteer as fallback
      result = await convertWithPuppeteer(url, quality);
    }

    return response.status(200).json({
      success: true,
      data: {
        title: result.title,
        downloadUrl: result.downloadUrl,
        format: result.format,
        quality: result.quality,
        duration: result.duration,
        thumbnail: result.thumbnail,
        filesize: result.filesize
      }
    });

  } catch (error) {
    console.error('Error in YouTube to MP4 converter:', error);
    
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

// Convert using Cloudscraper
async function convertWithCloudscraper(url, quality) {
  try {
    // STEP 1: SEARCH - Get video info
    const searchResponse = await cloudscraper.post({
      uri: 'https://ssvid.net/api/ajaxSearch/index',
      form: { query: url },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://ssvid.net',
        'Referer': 'https://ssvid.net/'
      }
    });

    const searchData = JSON.parse(searchResponse);

    if (!searchData || !searchData.vid) {
      throw new Error('Video tidak ditemukan di ssvid.net');
    }

    // Get token for the requested quality (default to auto)
    let token;
    let selectedQuality = quality;
    
    // Quality mapping
    const qualityMap = {
      'auto': searchData?.links?.mp4?.auto?.k,
      '1080p': searchData?.links?.mp4?.["1080"]?.k,
      '720p': searchData?.links?.mp4?.["720"]?.k,
      '480p': searchData?.links?.mp4?.["480"]?.k,
      '360p': searchData?.links?.mp4?.["360"]?.k
    };

    // If requested quality not available, try auto
    token = qualityMap[quality] || qualityMap['auto'];
    
    // If auto not available, try any available quality
    if (!token) {
      for (const q in qualityMap) {
        if (qualityMap[q]) {
          token = qualityMap[q];
          selectedQuality = q;
          break;
        }
      }
    }

    if (!token) {
      throw new Error("Token konversi untuk MP4 tidak ditemukan.");
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
        'Referer': 'https://ssvid.net/'
      }
    });

    const convertData = JSON.parse(convertResponse);
    
    if (!convertData || !convertData.dlink) {
      throw new Error("Download link tidak ditemukan.");
    }

    return {
      title: searchData.title || "YouTube Video",
      downloadUrl: convertData.dlink,
      format: "mp4",
      quality: selectedQuality,
      duration: searchData.duration,
      thumbnail: searchData.image,
      filesize: searchData?.links?.mp4?.[selectedQuality === 'auto' ? 'auto' : selectedQuality.replace('p', '')]?.size
    };
    
  } catch (error) {
    console.error('Cloudscraper conversion error:', error);
    throw error;
  }
}

// Convert using Puppeteer (fallback)
async function convertWithPuppeteer(url, quality) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Navigate to y2mate.com (supports MP4)
    await page.goto('https://www.y2mate.com/youtube-mp4', { 
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Input the URL
    await page.type('#txt-url', url);
    
    // Click the convert button
    await page.click('#btn-submit');
    
    // Wait for conversion options to appear
    await page.waitForSelector('.mp4-table', { timeout: 60000 });
    
    // Select quality (try to find the requested quality)
    let qualityFound = false;
    
    if (quality !== 'auto') {
      try {
        const qualityButtons = await page.$$('.mp4-table .table-bordered tbody tr');
        for (const button of qualityButtons) {
          const qualityText = await button.$eval('td:first-child', el => el.textContent.trim());
          if (qualityText.includes(quality)) {
            await button.click('a');
            qualityFound = true;
            break;
          }
        }
      } catch (e) {
        console.log('Could not select specific quality, using default');
      }
    }
    
    // If specific quality not found or auto, use the first available option
    if (!qualityFound) {
      await page.click('.mp4-table .table-bordered tbody tr:first-child a');
    }
    
    // Wait for conversion to complete
    await page.waitForSelector('#process-result .btn-file', { timeout: 120000 });
    
    // Get download link and title
    const downloadUrl = await page.$eval('#process-result .btn-file', el => el.href);
    const title = await page.$eval('.caption-text', el => el.textContent.trim());
    
    await browser.close();
    
    return {
      title: title,
      downloadUrl: downloadUrl,
      format: "mp4",
      quality: qualityFound ? quality : 'auto',
      duration: null,
      thumbnail: null,
      filesize: null
    };
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('Puppeteer conversion error:', error);
    throw error;
  }
        }
