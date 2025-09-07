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

    // Extract video ID
    const videoId = extractVideoId(url);
    if (!videoId) {
      return response.status(400).json({ success: false, error: 'Tidak dapat mengambil ID video dari URL' });
    }

    let result;
    
    try {
      // First try with cloudscraper
      result = await convertWithCloudscraper(videoId, url);
    } catch (error) {
      console.log('Cloudscraper failed, trying with Puppeteer...');
      
      // If cloudscraper fails, use Puppeteer as fallback
      result = await convertWithPuppeteer(url);
    }

    return response.status(200).json({
      success: true,
      data: {
        title: result.title,
        duration: result.duration,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        downloadUrl: result.downloadUrl,
        quality: result.quality || '128kbps',
        size: result.size || 'Unknown'
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

// Function to extract video ID from YouTube URL
function extractVideoId(url) {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : null;
}

// Convert using Cloudscraper
async function convertWithCloudscraper(videoId, url) {
  try {
    // Get video info first
    const infoResponse = await cloudscraper.get(`https://ssvid.net/en?url=${encodeURIComponent(url)}`);
    const infoDom = new JSDOM(infoResponse);
    const infoDocument = infoDom.window.document;
    
    const title = infoDocument.querySelector('h2')?.textContent?.trim() || 'YouTube Video';
    const duration = infoDocument.querySelector('.duration')?.textContent?.trim() || 'Unknown';
    
    // Perform conversion
    const formData = {
      query: url
    };
    
    const searchResponse = await cloudscraper.post({
      uri: 'https://ssvid.net/api/ajaxSearch/index',
      formData: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      }
    });
    
    const searchData = JSON.parse(searchResponse);
    
    if (!searchData.data || searchData.data.length === 0) {
      throw new Error('Video tidak ditemukan');
    }
    
    const videoData = searchData.data[0];
    
    const convertFormData = {
      vid: videoData.vid,
      k: videoData.key
    };
    
    const convertResponse = await cloudscraper.post({
      uri: 'https://ssvid.net/api/ajaxConvert/convert',
      formData: convertFormData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      }
    });
    
    const convertData = JSON.parse(convertResponse);
    
    if (!convertData || !convertData.source) {
      throw new Error('Konversi gagal');
    }
    
    return {
      title: title,
      duration: duration,
      downloadUrl: convertData.source,
      quality: '128kbps',
      size: convertData.size || 'Unknown'
    };
    
  } catch (error) {
    console.error('Cloudscraper conversion error:', error);
    throw error;
  }
}

// Convert using Puppeteer
async function convertWithPuppeteer(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Navigate to a YouTube downloader site
    await page.goto(`https://ytmp3.cc/en13/`, { 
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Input the URL
    await page.type('#input', url);
    
    // Click the convert button
    await page.click('#submit');
    
    // Wait for conversion to complete
    await page.waitForSelector('#download', { timeout: 60000 });
    
    // Get download link
    const downloadUrl = await page.$eval('#download', el => el.href);
    const title = await page.$eval('#title', el => el.value);
    
    await browser.close();
    
    return {
      title: title,
      downloadUrl: downloadUrl,
      quality: '128kbps',
      size: 'Unknown'
    };
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('Puppeteer conversion error:', error);
    throw error;
  }
}
