import puppeteer from 'puppeteer';
import cloudscraper from 'cloudscraper';

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
    const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    if (!ytRegex.test(url)) {
      return response.status(400).json({ success: false, error: 'URL YouTube tidak valid. Format yang benar: https://www.youtube.com/watch?v=VIDEO_ID' });
    }

    let result;
    
    try {
      // Try with direct scraping using Puppeteer
      result = await convertWithPuppeteer(url);
    } catch (error) {
      console.log('Direct scraping failed, trying alternative method...');
      
      // If direct scraping fails, try alternative service
      result = await convertWithAlternativeService(url);
    }

    return response.status(200).json({
      success: true,
      data: {
        title: result.title,
        downloadUrl: result.downloadUrl,
        format: result.format,
        quality: result.quality || '128kbps',
        duration: result.duration,
        thumbnail: result.thumbnail
      }
    });

  } catch (error) {
    console.error('Error in YouTube to MP3 converter:', error);
    
    // Retry logic
    if (retry < 2) {
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

// Convert using Puppeteer - Direct scraping approach
async function convertWithPuppeteer(youtubeUrl) {
  let browser;
  try {
    // Launch browser with appropriate options
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
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Set viewport to a common size
    await page.setViewport({ width: 1366, height: 768 });
    
    // Navigate to ssvid.net
    console.log('Navigating to ssvid.net...');
    await page.goto('https://ssvid.net/en10/', { 
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Wait for the input field to be available
    await page.waitForSelector('#search__input', { timeout: 10000 });
    
    // Type the YouTube URL into the input field
    console.log('Entering YouTube URL...');
    await page.type('#search__input', youtubeUrl);
    
    // Click the convert button
    console.log('Clicking convert button...');
    await page.click('#btn-start');
    
    // Wait for the conversion to complete - look for download button or result
    console.log('Waiting for conversion...');
    
    // Wait for either the download button or error message
    await Promise.race([
      page.waitForSelector('#download-btn', { timeout: 60000 }),
      page.waitForSelector('.alert-error', { timeout: 60000 }),
      page.waitForSelector('a[href*="mp3"]', { timeout: 60000 }),
      page.waitForSelector('button#download', { timeout: 60000 })
    ]);
    
    // Check if there's an error message
    const errorElement = await page.$('.alert-error, .error, .message-error');
    if (errorElement) {
      const errorText = await page.evaluate(el => el.textContent, errorElement);
      throw new Error(errorText || 'Conversion error occurred');
    }
    
    // Try to find the download link in various possible ways
    let downloadUrl = null;
    let title = "YouTube Audio";
    let format = "mp3";
    let quality = "128kbps";
    
    // Method 1: Look for a download button with href
    const downloadButton = await page.$('a#download, a#download-btn, a.download-btn');
    if (downloadButton) {
      downloadUrl = await page.evaluate(el => el.href, downloadButton);
    }
    
    // Method 2: Look for any MP3 link if method 1 failed
    if (!downloadUrl) {
      const mp3Link = await page.$('a[href*="mp3"], button[onclick*="mp3"]');
      if (mp3Link) {
        const linkHandle = await mp3Link.asElement();
        if (linkHandle) {
          downloadUrl = await page.evaluate(el => el.href || (el.onclick ? el.onclick.toString().match(/(https?:\/\/[^\s'"]+)/)?.[1] : null), linkHandle);
        }
      }
    }
    
    // Method 3: Extract from page content if still not found
    if (!downloadUrl) {
      const pageContent = await page.content();
      const urlMatch = pageContent.match(/(https?:\/\/[^\s"']*\.mp3[^\s"']*)/);
      if (urlMatch) {
        downloadUrl = urlMatch[1];
      }
    }
    
    // Try to get the video title
    try {
      const titleElement = await page.$('.video-title, .title, h1, h2, h3');
      if (titleElement) {
        title = await page.evaluate(el => el.textContent, titleElement);
        title = title.trim().substring(0, 100); // Limit title length
      }
    } catch (e) {
      console.log('Could not extract title:', e.message);
    }
    
    if (!downloadUrl) {
      throw new Error("Download link tidak ditemukan setelah konversi.");
    }
    
    await browser.close();
    
    return {
      title: title,
      downloadUrl: downloadUrl,
      format: format,
      quality: quality
    };
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('Puppeteer conversion error:', error);
    throw error;
  }
}

// Alternative conversion service as fallback
async function convertWithAlternativeService(youtubeUrl) {
  try {
    // Try using y2mate API as fallback
    const formData = {
      query: youtubeUrl
    };
    
    const response = await fetch('https://y2mate.guru/api/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify(formData)
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
      format: data.format || "mp3",
      quality: data.quality || "128kbps"
    };
    
  } catch (error) {
    console.error('Alternative service error:', error);
    
    // Final fallback - try a different service
    try {
      const response = await fetch(`https://api.vevioz.com/api/button/mp3/${youtubeUrl.split('v=')[1]}`);
      const data = await response.json();
      
      if (data && data.url) {
        return {
          title: data.title || "YouTube Audio",
          downloadUrl: data.url,
          format: "mp3",
          quality: "128kbps"
        };
      }
    } catch (finalError) {
      console.error('Final fallback failed:', finalError);
      throw new Error('Semua metode konversi gagal');
    }
    
    throw error;
  }
}
