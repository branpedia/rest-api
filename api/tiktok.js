// API TikTok Downloader dengan Cloudscraper, Puppeteer, dan JSDOM
// Endpoint: GET /api/tiktok?url=[tiktok_url]

import cloudscraper from 'cloudscraper';
import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    // Validate TikTok URL
    if (!url.includes('tiktok.com') && !url.includes('vt.tiktok.com')) {
      return res.status(400).json({ error: 'Invalid TikTok URL' });
    }

    // Try multiple methods to get TikTok data
    let tiktokData = null;
    
    // Method 1: Cloudscraper (bypass Cloudflare)
    try {
      tiktokData = await tryWithCloudscraper(url);
    } catch (error) {
      console.log('Cloudscraper method failed, trying puppeteer...');
    }
    
    // Method 2: Puppeteer (if cloudscraper fails)
    if (!tiktokData || !tiktokData.mediaUrls || tiktokData.mediaUrls.length === 0) {
      try {
        tiktokData = await tryWithPuppeteer(url);
      } catch (error) {
        console.log('Puppeteer method failed...');
      }
    }
    
    // Method 3: Direct API (if both above fail)
    if (!tiktokData || !tiktokData.mediaUrls || tiktokData.mediaUrls.length === 0) {
      try {
        tiktokData = await tryWithDirectAPI(url);
      } catch (error) {
        console.log('Direct API method failed...');
      }
    }

    // If all methods fail
    if (!tiktokData || !tiktokData.mediaUrls || tiktokData.mediaUrls.length === 0) {
      return res.status(404).json({ error: 'Could not fetch TikTok data from any method' });
    }

    // Return successful response
    return res.status(200).json({
      success: true,
      data: {
        title: tiktokData.meta.title || 'TikTok Video',
        author: tiktokData.meta.author || 'Unknown',
        duration: tiktokData.meta.duration || 0,
        uploadTime: tiktokData.meta.create_time || null,
        mediaCount: tiktokData.mediaUrls.length,
        mediaUrls: tiktokData.mediaUrls,
        coverUrl: tiktokData.meta.cover || null,
        source: tiktokData.from || 'unknown'
      }
    });

  } catch (error) {
    console.error('TikTok API Error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch TikTok data',
      message: error.message 
    });
  }
}

// Method 1: Using Cloudscraper to bypass protection
async function tryWithCloudscraper(tiktokUrl) {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'POST',
      url: 'https://ttsave.app/download',
      formData: { id: tiktokUrl },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Origin': 'https://ttsave.app',
        'Referer': 'https://ttsave.app/id',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    };

    cloudscraper(options, (error, response, body) => {
      if (error) {
        reject(error);
        return;
      }

      try {
        const dom = new JSDOM(body);
        const document = dom.window.document;
        
        // Extract download link
        const downloadBtn = document.querySelector('#btn-download-fallback');
        const downloadUrl = downloadBtn ? downloadBtn.href : null;
        
        // Extract title
        const titleEl = document.querySelector('#download-progress-name');
        const title = titleEl && titleEl.textContent ? titleEl.textContent : 'TikTok Video';
        
        if (!downloadUrl) {
          reject(new Error('No download URL found'));
          return;
        }

        resolve({
          mediaUrls: [downloadUrl],
          meta: { 
            title: title,
            author: 'TikTok User',
            cover: null
          },
          from: 'ttsave.app (Cloudscraper)'
        });
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

// Method 2: Using Puppeteer to render JavaScript
async function tryWithPuppeteer(tiktokUrl) {
  let browser = null;
  
  try {
    // Launch puppeteer with stealth options
    browser = await puppeteer.launch({
      headless: true,
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
    
    // Navigate to ttsave.app
    await page.goto('https://ttsave.app/id', { waitUntil: 'networkidle2' });
    
    // Fill in the form
    await page.type('#input-query', tiktokUrl);
    
    // Click the download button
    await page.click('#btn-download');
    
    // Wait for results to load
    await page.waitForSelector('#btn-download-fallback', { timeout: 10000 });
    
    // Extract the download URL
    const downloadUrl = await page.$eval('#btn-download-fallback', el => el.href);
    
    // Extract title if available
    const title = await page.$eval('#download-progress-name', el => el.textContent).catch(() => 'TikTok Video');
    
    await browser.close();
    
    return {
      mediaUrls: [downloadUrl],
      meta: { 
        title: title,
        author: 'TikTok User',
        cover: null
      },
      from: 'ttsave.app (Puppeteer)'
    };
    
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    throw error;
  }
}

// Method 3: Using direct API as fallback
async function tryWithDirectAPI(tiktokUrl) {
  try {
    // Try TikWM API
    const encodedParams = new URLSearchParams();
    encodedParams.set('url', tiktokUrl);
    encodedParams.set('hd', '1');

    const response = await fetch('https://tikwm.com/api/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Cookie': 'current_language=en',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      body: encodedParams
    });

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const data = await response.json();
    
    if (data.code !== 0 || !data.data) {
      throw new Error('Invalid response from API');
    }

    const d = data.data;
    let mediaUrls = [];
    
    if (d.hdplay) mediaUrls.push(d.hdplay);
    else if (d.play) mediaUrls.push(d.play);
    else if (d.wmplay) mediaUrls.push(d.wmplay);
    
    if (Array.isArray(d.images)) mediaUrls = mediaUrls.concat(d.images);
    if (Array.isArray(d.image_post)) mediaUrls = mediaUrls.concat(d.image_post);
    
    // Filter duplicates and empty values
    mediaUrls = mediaUrls.filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

    return {
      mediaUrls,
      meta: { 
        title: d.title || 'TikTok Video', 
        author: d.author || 'TikTok User', 
        duration: d.duration || 0, 
        cover: d.cover || null, 
        create_time: d.create_time || null 
      },
      from: 'tikwm.com (Direct API)'
    };

  } catch (error) {
    console.error('Direct API method error:', error);
    throw error;
  }
}
