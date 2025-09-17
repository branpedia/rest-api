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

  const { url, quality = '128' } = request.query;

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
      result = await convertToMp3WithCloudscraper(url, quality);
    } catch (error) {
      console.log('Cloudscraper failed, trying with Puppeteer...');
      
      // If cloudscraper fails, use Puppeteer as fallback
      result = await convertToMp3WithPuppeteer(url, quality);
    }

    return response.status(200).json({
      success: true,
      data: {
        title: result.title,
        downloadUrl: result.downloadUrl,
        quality: result.quality,
        duration: result.duration,
        thumbnail: result.thumbnail,
        filesize: result.filesize
      }
    });

  } catch (error) {
    console.error('Error in YouTube to MP3 converter:', error);
    return response.status(500).json({ 
      success: false, 
      error: 'Gagal mengambil audio dari YouTube. Pastikan URL valid dan coba lagi.' 
    });
  }
}

// Convert ke MP3 menggunakan Cloudscraper
async function convertToMp3WithCloudscraper(url, quality) {
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

    // Get token for the requested MP3 quality
    let token;
    let selectedQuality = quality;
    
    // MP3 quality mapping
    const qualityMap = {
      '128': searchData?.links?.mp3?.["128"]?.k,
      '192': searchData?.links?.mp3?.["192"]?.k,
      '320': searchData?.links?.mp3?.["320"]?.k
    };

    // If requested quality not available, try 128
    token = qualityMap[quality] || qualityMap['128'];
    
    // If 128 not available, try any available quality
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
      throw new Error("Token konversi untuk MP3 tidak ditemukan.");
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
      title: searchData.title || "YouTube Audio",
      downloadUrl: convertData.dlink,
      quality: selectedQuality + 'kbps',
      duration: searchData.duration,
      thumbnail: searchData.image,
      filesize: searchData?.links?.mp3?.[selectedQuality]?.size
    };
    
  } catch (error) {
    console.error('Cloudscraper MP3 conversion error:', error);
    throw error;
  }
}

// Convert ke MP3 menggunakan Puppeteer (fallback)
async function convertToMp3WithPuppeteer(url, quality) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
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
    
    // Navigate to y2mate.com YouTube MP3 page
    await page.goto('https://www.y2mate.com/youtube-mp3', { 
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Input the URL
    await page.type('#txt-url', url);
    
    // Click the convert button
    await page.click('#btn-submit');
    
    // Wait for conversion options to appear
    await page.waitForSelector('.mp3-table', { timeout: 60000 });
    
    // Extract available MP3 qualities
    const qualities = await page.$$eval('.mp3-table .table-bordered tbody tr', rows => {
      return rows.map(row => {
        const qualityCell = row.querySelector('td:first-child');
        const sizeCell = row.querySelector('td:nth-child(2)');
        const button = row.querySelector('a');
        return {
          quality: qualityCell ? qualityCell.textContent.trim() : '',
          size: sizeCell ? sizeCell.textContent.trim() : '',
          onClick: button ? button.getAttribute('onclick') : ''
        };
      });
    });
    
    // Find the requested quality or the best available
    let selectedQuality = quality;
    let selectedOnClick = '';
    
    // Try to find exact match first
    const exactMatch = qualities.find(q => q.quality.includes(quality + 'kbps'));
    if (exactMatch) {
      selectedOnClick = exactMatch.onClick;
    } else {
      // If exact match not found, try to find the best available quality
      const qualityOrder = ['320', '192', '128'];
      for (const q of qualityOrder) {
        const match = qualities.find(item => item.quality.includes(q + 'kbps'));
        if (match) {
          selectedQuality = q;
          selectedOnClick = match.onClick;
          break;
        }
      }
      
      // If still not found, use the first available
      if (!selectedOnClick && qualities.length > 0) {
        selectedOnClick = qualities[0].onClick;
        selectedQuality = qualities[0].quality.match(/\d+/)?.[0] || '128';
      }
    }
    
    if (!selectedOnClick) {
      throw new Error('Tidak dapat menemukan kualitas audio yang sesuai');
    }
    
    // Extract the function call from onClick
    const match = selectedOnClick.match(/\(\'([^']+)\',\'([^']+)\',\'([^']+)\'\)/);
    if (!match) {
      throw new Error('Format onClick tidak dikenali');
    }
    
    const [, k, vid, type] = match;
    
    // Click the download button
    await page.evaluate((k, vid, type) => {
      // This function will be executed in the browser context
      const event = new Event('click');
      const element = document.querySelector(`a[onclick*="${k}"]`);
      if (element) {
        element.dispatchEvent(event);
      }
    }, k, vid, type);
    
    // Wait for download link to appear
    await page.waitForSelector('#process-result .btn-file', { timeout: 120000 });
    
    // Get download link and title
    const downloadUrl = await page.$eval('#process-result .btn-file', el => el.href);
    const title = await page.$eval('.caption-text', el => el.textContent.trim());
    
    await browser.close();
    
    return {
      title: title,
      downloadUrl: downloadUrl,
      quality: selectedQuality + 'kbps',
      duration: null,
      thumbnail: null,
      filesize: null
    };
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('Puppeteer MP3 conversion error:', error);
    throw error;
  }
}

// Function to extract video ID from YouTube URL
function extractVideoId(url) {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : null;
}
