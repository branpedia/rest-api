// API TikTok Downloader dengan Multi-Server Support
// Endpoint: GET /api/tiktok?url=[tiktok_url]

import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';

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

    // Try multiple servers
    let tiktokData = null;
    
    // Server 1: ttsave.app (using AJAX search)
    try {
      tiktokData = await tryTTSaveApp(url);
      console.log('Server 1 success');
    } catch (error) {
      console.log('Server 1 failed:', error.message);
    }
    
    // Server 2: savetik.co (using AJAX search)
    if (!tiktokData || !tiktokData.mediaUrls || tiktokData.mediaUrls.length === 0) {
      try {
        tiktokData = await trySaveTik(url);
        console.log('Server 2 success');
      } catch (error) {
        console.log('Server 2 failed:', error.message);
      }
    }
    
    // Server 3: tikwn.com (using AJAX search)
    if (!tiktokData || !tiktokData.mediaUrls || tiktokData.mediaUrls.length === 0) {
      try {
        tiktokData = await tryTikWN(url);
        console.log('Server 3 success');
      } catch (error) {
        console.log('Server 3 failed:', error.message);
      }
    }
    
    // Server 4: ssstik.io (using AJAX search)
    if (!tiktokData || !tiktokData.mediaUrls || tiktokData.mediaUrls.length === 0) {
      try {
        tiktokData = await trySSSTik(url);
        console.log('Server 4 success');
      } catch (error) {
        console.log('Server 4 failed:', error.message);
      }
    }
    
    // Server 5: Use puppeteer as last resort
    if (!tiktokData || !tiktokData.mediaUrls || tiktokData.mediaUrls.length === 0) {
      try {
        tiktokData = await tryWithPuppeteer(url);
        console.log('Server 5 (Puppeteer) success');
      } catch (error) {
        console.log('Server 5 failed:', error.message);
      }
    }

    // If all servers fail
    if (!tiktokData || !tiktokData.mediaUrls || tiktokData.mediaUrls.length === 0) {
      return res.status(404).json({ error: 'Could not fetch TikTok data from any server' });
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

// Server 1: ttsave.app (using AJAX search)
async function tryTTSaveApp(tiktokUrl) {
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
        'Upgrade-Insecure-Requests': '1',
        'X-Requested-With': 'XMLHttpRequest'
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
          from: 'ttsave.app'
        });
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

// Server 2: savetik.co (using AJAX search)
async function trySaveTik(tiktokUrl) {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'POST',
      url: 'https://savetik.co/api/ajaxSearch',
      formData: { q: tiktokUrl },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Origin': 'https://savetik.co',
        'Referer': 'https://savetik.co/en',
        'DNT': '1',
        'Connection': 'keep-alive',
        'X-Requested-With': 'XMLHttpRequest'
      }
    };

    cloudscraper(options, (error, response, body) => {
      if (error) {
        reject(error);
        return;
      }

      try {
        const data = JSON.parse(body);
        
        if (!data.data) {
          reject(new Error('No data found in response'));
          return;
        }

        // Parse HTML response
        const dom = new JSDOM(data.data);
        const document = dom.window.document;
        
        // Extract video URL
        const videoElement = document.querySelector('video#vid');
        const videoUrl = videoElement ? videoElement.getAttribute('data-src') : null;
        
        // Extract title
        const titleElement = document.querySelector('h3');
        const title = titleElement ? titleElement.textContent : 'TikTok Video';
        
        // Extract author
        const authorElement = document.querySelector('.user-name');
        const author = authorElement ? authorElement.textContent : 'TikTok User';
        
        if (!videoUrl) {
          reject(new Error('No video URL found'));
          return;
        }

        resolve({
          mediaUrls: [videoUrl],
          meta: { 
            title: title,
            author: author,
            cover: null
          },
          from: 'savetik.co'
        });
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

// Server 3: tikwn.com (using AJAX search)
async function tryTikWN(tiktokUrl) {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'POST',
      url: 'https://tikwn.com/api/ajaxSearch',
      formData: { q: tiktokUrl },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Origin': 'https://tikwn.com',
        'Referer': 'https://tikwn.com',
        'DNT': '1',
        'Connection': 'keep-alive',
        'X-Requested-With': 'XMLHttpRequest'
      }
    };

    cloudscraper(options, (error, response, body) => {
      if (error) {
        reject(error);
        return;
      }

      try {
        const data = JSON.parse(body);
        
        if (!data.data) {
          reject(new Error('No data found in response'));
          return;
        }

        // Parse HTML response
        const dom = new JSDOM(data.data);
        const document = dom.window.document;
        
        // Extract video URL
        const downloadLink = document.querySelector('a[download]');
        const videoUrl = downloadLink ? downloadLink.href : null;
        
        // Extract title
        const titleElement = document.querySelector('h3');
        const title = titleElement ? titleElement.textContent : 'TikTok Video';
        
        if (!videoUrl) {
          reject(new Error('No video URL found'));
          return;
        }

        resolve({
          mediaUrls: [videoUrl],
          meta: { 
            title: title,
            author: 'TikTok User',
            cover: null
          },
          from: 'tikwn.com'
        });
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

// Server 4: ssstik.io (using AJAX search)
async function trySSSTik(tiktokUrl) {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'POST',
      url: 'https://ssstik.io/abc?url=dl',
      formData: { id: tiktokUrl, locale: 'en' },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Origin': 'https://ssstik.io',
        'Referer': 'https://ssstik.io/en',
        'DNT': '1',
        'Connection': 'keep-alive',
        'X-Requested-With': 'XMLHttpRequest'
      }
    };

    cloudscraper(options, (error, response, body) => {
      if (error) {
        reject(error);
        return;
      }

      try {
        const data = JSON.parse(body);
        
        if (!data || !data.url) {
          reject(new Error('No download URL found in response'));
          return;
        }

        resolve({
          mediaUrls: [data.url],
          meta: { 
            title: data.title || 'TikTok Video',
            author: data.author || 'TikTok User',
            cover: null
          },
          from: 'ssstik.io'
        });
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

// Server 5: Use puppeteer as last resort
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
    await page.waitForSelector('#btn-download-fallback', { timeout: 15000 });
    
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
