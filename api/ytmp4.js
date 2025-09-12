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
      // First try with ssvid
      result = await convertWithSsvid(url, quality);
    } catch (error) {
      console.log('Ssvid failed, trying with Y2Mate...');
      
      // If ssvid fails, use Y2Mate as fallback
      const videoId = extractVideoId(url);
      result = await convertWithY2Mate(videoId, quality);
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

// Extract video ID from YouTube URL
function extractVideoId(url) {
  let videoId = '';
  if (url.includes('youtube.com/watch?v=')) {
    videoId = url.split('v=')[1];
    const ampersandPosition = videoId.indexOf('&');
    if (ampersandPosition !== -1) {
      videoId = videoId.substring(0, ampersandPosition);
    }
  } else if (url.includes('youtu.be/')) {
    videoId = url.split('youtu.be/')[1];
    const ampersandPosition = videoId.indexOf('?');
    if (ampersandPosition !== -1) {
      videoId = videoId.substring(0, ampersandPosition);
    }
  }
  return videoId;
}

// Convert using SSvid.net
async function convertWithSsvid(url, quality) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Navigate to ssvid.net
    await page.goto('https://ssvid.net/id4', { 
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Wait for input field
    await page.waitForSelector('#search__input', { timeout: 10000 });
    
    // Clear input field first
    await page.click('#search__input', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    
    // Fill input with YouTube URL
    await page.type('#search__input', url);
    
    // Click the start button
    await page.click('#btn-start');
    
    // Wait for results to appear
    await page.waitForSelector('#result_container', { timeout: 60000 });
    
    // Check if there's a CAPTCHA
    const hasCaptcha = await page.$('#CF-turnstile');
    if (hasCaptcha) {
      throw new Error('CAPTCHA detected, cannot proceed automatically');
    }
    
    // Get video title
    const title = await page.$eval('.vtitle', el => el.textContent.trim());
    
    // Get video ID
    const videoId = await page.$eval('#video_id', el => el.value);
    
    // Get all available MP4 quality options
    const qualityOptions = await page.$$eval('#mp4 .table-striped tbody tr', rows => 
      rows.map(row => {
        const qualityText = row.querySelector('td:first-child').textContent.trim();
        const sizeText = row.querySelector('td:nth-child(2)').textContent.trim();
        const button = row.querySelector('button');
        const onclick = button.getAttribute('onclick');
        // Extract the token from onclick attribute
        const tokenMatch = onclick.match(/startConvert\('mp4','([^']+)'\)/);
        const token = tokenMatch ? tokenMatch[1] : null;
        return { quality: qualityText, size: sizeText, token };
      })
    );
    
    // Select the appropriate quality
    let selectedOption;
    if (quality === 'auto') {
      // Prefer higher qualities first
      selectedOption = qualityOptions.find(opt => opt.quality.includes('auto')) || 
                       qualityOptions.find(opt => opt.quality.includes('1080p')) ||
                       qualityOptions.find(opt => opt.quality.includes('720p')) ||
                       qualityOptions[0];
    } else {
      // Try to find the exact quality
      selectedOption = qualityOptions.find(opt => 
        opt.quality.toLowerCase().includes(quality.toLowerCase())
      ) || qualityOptions[0];
    }
    
    if (!selectedOption || !selectedOption.token) {
      throw new Error('Could not find valid conversion option');
    }
    
    // Execute the conversion by clicking the button
    await page.evaluate((qualityText) => {
      const rows = document.querySelectorAll('#mp4 .table-striped tbody tr');
      for (let row of rows) {
        const rowQuality = row.querySelector('td:first-child').textContent.trim();
        if (rowQuality === qualityText) {
          const button = row.querySelector('button');
          if (button) button.click();
          break;
        }
      }
    }, selectedOption.quality);
    
    // Wait for conversion to complete and get download link
    // This might require handling the AJAX conversion process
    // For now, we'll construct the download URL manually based on the token
    
    // Construct download URL (this might need adjustment based on actual API)
    const downloadUrl = `https://ssvid.net/api/download/mp4/${selectedOption.token}`;
    
    await browser.close();
    
    return {
      title: title,
      downloadUrl: downloadUrl,
      format: "mp4",
      quality: selectedOption.quality,
      duration: null,
      thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      filesize: selectedOption.size
    };
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('Ssvid conversion error:', error);
    throw error;
  }
}

// Convert using Y2Mate (fallback)
async function convertWithY2Mate(videoId, quality) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Navigate to y2mate.com
    await page.goto(`https://www.y2mate.com/youtube-mp4/${videoId}`, { 
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Wait for conversion options
    await page.waitForSelector('.mp4-table', { timeout: 60000 });
    
    // Get video title
    const title = await page.$eval('.caption-text', el => el.textContent.trim());
    
    // Get quality options
    const qualityOptions = await page.$$eval('.mp4-table .table-bordered tbody tr', rows => 
      rows.map(row => {
        const qualityText = row.querySelector('td:first-child').textContent.trim();
        const sizeText = row.querySelector('td:nth-child(2)').textContent.trim();
        const link = row.querySelector('a').href;
        return { quality: qualityText, size: sizeText, link };
      })
    );
    
    // Select quality
    let selectedOption;
    if (quality === 'auto') {
      selectedOption = qualityOptions[0];
    } else {
      selectedOption = qualityOptions.find(option => option.quality.includes(quality)) || qualityOptions[0];
    }
    
    // Click the selected quality
    await page.evaluate((link) => {
      const element = document.querySelector(`a[href="${link}"]`);
      if (element) element.click();
    }, selectedOption.link);
    
    // Wait for conversion
    await page.waitForSelector('#process-result .btn-file', { timeout: 120000 });
    
    // Get download link
    const downloadUrl = await page.$eval('#process-result .btn-file', el => el.href);
    
    await browser.close();
    
    return {
      title: title,
      downloadUrl: downloadUrl,
      format: "mp4",
      quality: selectedOption.quality,
      duration: null,
      thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      filesize: selectedOption.size
    };
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('Y2Mate conversion error:', error);
    throw error;
  }
}
