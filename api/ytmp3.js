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

// Convert using Cloudscraper - FIXED VERSION
async function convertWithCloudscraper(url) {
  try {
    // STEP 1: SEARCH - Get video info
    const searchResponse = await cloudscraper.post({
      uri: 'https://ssvid.net/api/search',
      form: { 
        q: url,
        t: 'search' // Added based on the console log
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://ssvid.net',
        'Referer': 'https://ssvid.net/'
      }
    });

    const searchData = JSON.parse(searchResponse);
    console.log('Search response:', searchData);

    if (!searchData || !searchData.data || !searchData.data.vid) {
      throw new Error('Video tidak ditemukan di ssvid.net');
    }

    const vid = searchData.data.vid;
    const title = searchData.data.title;

    // Get token for m4a (audio)
    // Based on the HTML, we need to extract the token from the onclick attribute
    // The format is: startConvert('m4a','i/tVG6MuyJLMHjHHt+soTBTEBnMBauP8SBw/GpGQma9wEVTp5Z2sAi1VPeGCidgpb8JIcOqVMFY=')
    
    // Since we can't easily parse the HTML with cloudscraper, let's try a different approach
    // We'll use the API endpoint that handles conversion

    // STEP 2: CONVERT - Get download link for M4A
    const convertResponse = await cloudscraper.post({
      uri: 'https://ssvid.net/api/convert',
      form: { 
        vid: vid,
        k: 'm4a', // Request M4A format
        t: 'convert'
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://ssvid.net',
        'Referer': 'https://ssvid.net/'
      }
    });

    const convertData = JSON.parse(convertResponse);
    console.log('Convert response:', convertData);
    
    if (!convertData || !convertData.data || !convertData.data.dlink) {
      // Try MP3 as fallback
      const mp3Response = await cloudscraper.post({
        uri: 'https://ssvid.net/api/convert',
        form: { 
          vid: vid,
          k: 'mp3', // Request MP3 format
          t: 'convert'
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': 'https://ssvid.net',
          'Referer': 'https://ssvid.net/'
        }
      });

      const mp3Data = JSON.parse(mp3Response);
      
      if (!mp3Data || !mp3Data.data || !mp3Data.data.dlink) {
        throw new Error("Download link tidak ditemukan.");
      }

      return {
        title: title,
        downloadUrl: mp3Data.data.dlink,
        format: "mp3",
        quality: "128kbps"
      };
    }

    return {
      title: title,
      downloadUrl: convertData.data.dlink,
      format: "m4a",
      quality: "128kbps"
    };
    
  } catch (error) {
    console.error('Cloudscraper conversion error:', error);
    throw error;
  }
}

// ALTERNATIVE: Parse the HTML to extract tokens (more reliable)
async function convertWithHTMLParsing(url) {
  try {
    // First, get the search page to extract tokens
    const searchPage = await cloudscraper.get({
      uri: 'https://ssvid.net/',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // Then submit the search form
    const searchResponse = await cloudscraper.post({
      uri: 'https://ssvid.net/api/search',
      form: { 
        q: url,
        t: 'search'
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://ssvid.net',
        'Referer': 'https://ssvid.net/'
      }
    });

    const searchData = JSON.parse(searchResponse);
    
    if (!searchData || !searchData.data || !searchData.data.vid) {
      throw new Error('Video tidak ditemukan');
    }

    // Now get the conversion page to extract tokens from HTML
    const resultPage = await cloudscraper.get({
      uri: `https://ssvid.net/id/${searchData.data.vid}`,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // Parse HTML to extract conversion tokens
    const dom = new JSDOM(resultPage);
    const document = dom.window.document;
    
    // Find M4A conversion button and extract token
    const m4aButtons = document.querySelectorAll('button[onclick*="startConvert(\'m4a\'"]');
    let m4aToken = null;
    
    if (m4aButtons.length > 0) {
      const onclick = m4aButtons[0].getAttribute('onclick');
      const match = onclick.match(/startConvert\('m4a','([^']+)'\)/);
      if (match && match[1]) {
        m4aToken = match[1];
      }
    }

    if (m4aToken) {
      const convertResponse = await cloudscraper.post({
        uri: 'https://ssvid.net/api/convert',
        form: { 
          vid: searchData.data.vid,
          k: m4aToken,
          t: 'convert'
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': 'https://ssvid.net',
          'Referer': `https://ssvid.net/id/${searchData.data.vid}`
        }
      });

      const convertData = JSON.parse(convertResponse);
      
      if (convertData && convertData.data && convertData.data.dlink) {
        return {
          title: searchData.data.title,
          downloadUrl: convertData.data.dlink,
          format: "m4a",
          quality: "128kbps"
        };
      }
    }

    throw new Error("Tidak dapat mendapatkan link download");
    
  } catch (error) {
    console.error('HTML parsing conversion error:', error);
    throw error;
  }
}

// Convert using Puppeteer (fallback) - UPDATED
async function convertWithPuppeteer(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Navigate to ssvid.net instead of ytmp3.cc
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
    
    // Wait a bit more for the conversion to finish
    await page.waitForTimeout(3000);
    
    // Click on the M4A download button
    const downloadButton = await page.$('button[onclick*="startConvert(\'m4a\'"]');
    if (downloadButton) {
      await downloadButton.click();
      
      // Wait for download link to appear
      await page.waitForSelector('a.btn-success[download]', { timeout: 30000 });
      
      // Get download link and title
      const downloadUrl = await page.$eval('a.btn-success[download]', el => el.href);
      const title = await page.$eval('h2.video-title', el => el.textContent.trim());
      
      await browser.close();
      
      return {
        title: title,
        downloadUrl: downloadUrl,
        format: "m4a",
        quality: "128kbps"
      };
    }
    
    throw new Error("Download button not found");
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('Puppeteer conversion error:', error);
    throw error;
  }
}
