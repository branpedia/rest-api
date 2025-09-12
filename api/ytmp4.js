import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';

// Fungsi utama untuk download video YouTube
export default async function handler(request, response) {
  const { url, quality = '360' } = request.query;

  if (!url) {
    return response.status(400).json({
      success: false,
      error: 'Parameter URL diperlukan'
    });
  }

  try {
    // Validasi URL YouTube
    if (!url.includes('youtube.com/') && !url.includes('youtu.be/')) {
      return response.status(400).json({
        success: false,
        error: 'URL tidak valid. Pastikan URL berasal dari YouTube.'
      });
    }

    let result;
    
    // Coba dengan cloudscraper terlebih dahulu
    try {
      result = await convertWithCloudscraper(url, quality);
    } catch (error) {
      console.log('Cloudscraper failed, trying with Puppeteer...');
      
      // Jika cloudscraper gagal, gunakan Puppeteer
      result = await convertWithPuppeteer(url, quality);
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
    console.error('Error:', error);
    return response.status(500).json({
      success: false,
      error: error.message || 'Gagal mengambil video dari YouTube'
    });
  }
}

// Convert menggunakan Cloudscraper
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
      '360': searchData?.links?.mp4?.["360"]?.k,
      '480': searchData?.links?.mp4?.["480"]?.k,
      '720': searchData?.links?.mp4?.["720"]?.k,
      '1080': searchData?.links?.mp4?.["1080"]?.k
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
      quality: selectedQuality + 'p',
      duration: searchData.duration,
      thumbnail: searchData.image,
      filesize: searchData?.links?.mp4?.[selectedQuality === 'auto' ? 'auto' : selectedQuality]?.size
    };
    
  } catch (error) {
    console.error('Cloudscraper conversion error:', error);
    throw error;
  }
}

// Convert menggunakan Puppeteer (fallback)
async function convertWithPuppeteer(url, quality) {
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
    
    // Navigate to y2mate.com
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
    
    // Extract available qualities
    const qualities = await page.$$eval('.mp4-table .table-bordered tbody tr', rows => {
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
    const exactMatch = qualities.find(q => q.quality.includes(quality + 'p'));
    if (exactMatch) {
      selectedOnClick = exactMatch.onClick;
    } else {
      // If exact match not found, try to find the best available quality
      const qualityOrder = ['1080', '720', '480', '360'];
      for (const q of qualityOrder) {
        const match = qualities.find(item => item.quality.includes(q + 'p'));
        if (match) {
          selectedQuality = q;
          selectedOnClick = match.onClick;
          break;
        }
      }
      
      // If still not found, use the first available
      if (!selectedOnClick && qualities.length > 0) {
        selectedOnClick = qualities[0].onClick;
        selectedQuality = qualities[0].quality.match(/\d+/)?.[0] || '360';
      }
    }
    
    if (!selectedOnClick) {
      throw new Error('Tidak dapat menemukan kualitas video yang sesuai');
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
      quality: selectedQuality + 'p',
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

// Fungsi untuk mendapatkan info video menggunakan JSDOM
export async function getVideoInfo(url) {
  try {
    // Gunakan JSDOM untuk parsing HTML
    const response = await cloudscraper.get(url);
    const dom = new JSDOM(response);
    const document = dom.window.document;
    
    // Extract video info
    const title = document.querySelector('meta[property="og:title"]')?.content || 'YouTube Video';
    const duration = document.querySelector('meta[property="video:duration"]')?.content || null;
    const thumbnail = document.querySelector('meta[property="og:image"]')?.content || null;
    
    return {
      success: true,
      data: {
        title,
        duration,
        thumbnail,
        url
      }
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      success: false,
      error: 'Gagal mengambil info video'
    };
  }
}
