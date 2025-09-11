import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';

// Tambahkan timeout untuk cloudscraper
cloudscraper.defaults({
  timeout: 30000,
  challengesToSolve: 3,
  decodeEmails: false
});

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
    // Validate Spotify URL
    if (!url.includes('spotify.com') || !url.includes('/track/')) {
      return response.status(400).json({ success: false, error: 'URL tidak valid. Pastikan URL track Spotify.' });
    }

    let result;
    let errorMessages = [];
    
    // Try multiple servers with fallback
    try {
      console.log('Mencoba server 1 (spotisongdownloader.to)...');
      result = await tryServer1(url);
    } catch (error) {
      errorMessages.push(`Server 1: ${error.message}`);
      console.log('Server 1 gagal:', error.message);
      
      // If server 1 fails, try server 2
      try {
        console.log('Mencoba server 2 (spotifydownloader.pro)...');
        result = await tryServer2(url);
      } catch (error2) {
        errorMessages.push(`Server 2: ${error2.message}`);
        console.log('Server 2 gagal:', error2.message);
        
        // If server 2 fails, try server 3 (alternatif)
        try {
          console.log('Mencoba server 3 (alternatif)...');
          result = await tryServer3(url);
        } catch (error3) {
          errorMessages.push(`Server 3: ${error3.message}`);
          throw new Error(`Semua server gagal: ${errorMessages.join('; ')}`);
        }
      }
    }

    return response.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error fetching Spotify data:', error);
    
    // Retry logic
    if (retry < 2) {
      // Wait for 1 second before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }
    
    return response.status(500).json({ 
      success: false, 
      error: 'Gagal mengambil data dari Spotify. Pastikan URL valid dan coba lagi.' 
    });
  }
}

// Server 1 implementation - using cloudscraper
async function tryServer1(spotifyUrl) {
  try {
    const baseUrl = 'https://spotisongdownloader.to';
    
    // Get initial page to obtain cookies with custom headers
    const initialHtml = await cloudscraper.get({
      uri: baseUrl,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
      }
    });
    
    // Extract cookies from cloudscraper
    let cookieString = '';
    if (initialHtml.request && initialHtml.request.headers && initialHtml.request.headers.cookie) {
      cookieString = initialHtml.request.headers.cookie;
    }
    
    // Prepare headers with cookies
    const headers = {
      'Referer': baseUrl,
      'Cookie': cookieString,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'X-Requested-With': 'XMLHttpRequest'
    };
    
    // Get track info
    const trackInfoUrl = `${baseUrl}/api/composer/spotify/xsingle_track.php?url=${encodeURIComponent(spotifyUrl)}`;
    const trackInfoResponse = await cloudscraper.get({
      uri: trackInfoUrl,
      headers: headers,
      json: true
    });
    
    if (!trackInfoResponse || !trackInfoResponse.song_name) {
      throw new Error('Invalid response from server 1');
    }
    
    // Prepare payload for the next request
    const payload = [
      trackInfoResponse.song_name,
      trackInfoResponse.duration,
      trackInfoResponse.img,
      trackInfoResponse.artist,
      trackInfoResponse.url,
      trackInfoResponse.album_name,
      trackInfoResponse.released
    ];
    
    // Send the payload
    await cloudscraper.post({
      uri: `${baseUrl}/track.php`,
      headers: headers,
      form: { data: JSON.stringify(payload) }
    });
    
    // Get download URL
    const downloadResponse = await cloudscraper.post({
      uri: `${baseUrl}/api/composer/spotify/ssdw23456ytrfds.php`,
      headers: headers,
      form: {
        song_name: trackInfoResponse.song_name || '',
        artist_name: trackInfoResponse.artist || '',
        url: spotifyUrl,
        zip_download: 'false',
        quality: 'm4a'
      },
      json: true
    });
    
    if (!downloadResponse || !downloadResponse.dlink) {
      throw new Error('No download link received from server 1');
    }
    
    return {
      song_name: trackInfoResponse.song_name,
      artist: trackInfoResponse.artist,
      duration: trackInfoResponse.duration,
      img: trackInfoResponse.img,
      album_name: trackInfoResponse.album_name,
      released: trackInfoResponse.released,
      downloadUrl: downloadResponse.dlink,
      source: 'server_1'
    };
    
  } catch (error) {
    console.error('Error with server 1:', error);
    throw new Error(`Server 1 failed: ${error.message}`);
  }
}

// Server 2 implementation - using puppeteer
async function tryServer2(spotifyUrl) {
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
    
    // Set realistic user agent and viewport
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });
    
    // Block unnecessary resources to speed up page load
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });
    
    // Navigate to the downloader site
    await page.goto('https://spotifydownloader.pro/id/', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // Fill in the form
    await page.type('input[name="url"]', spotifyUrl);
    
    // Submit the form
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      page.click('button[type="submit"]')
    ]);
    
    // Wait for results to load
    await page.waitForSelector('.rb_title, .rb_btn, a[href*="download"]', { timeout: 15000 });
    
    // Extract information
    const result = await page.evaluate(() => {
      // Try multiple selectors for title
      const titleSelectors = ['.rb_title', '.title', 'h1', 'h2', 'h3', '[class*="title"]'];
      let titleElement = null;
      for (const selector of titleSelectors) {
        titleElement = document.querySelector(selector);
        if (titleElement) break;
      }
      
      const title = titleElement ? titleElement.textContent.trim() : 'Unknown Title';
      
      let artist = 'Unknown Artist';
      if (titleElement) {
        const artistSpan = titleElement.querySelector('span');
        artist = artistSpan ? artistSpan.textContent.trim().replace(/[()]/g, '') : 'Unknown Artist';
      }
      
      // Try multiple selectors for cover image
      const coverSelectors = ['.rb_icon', '.cover', 'img', '[src*="image"]'];
      let coverElement = null;
      for (const selector of coverSelectors) {
        coverElement = document.querySelector(selector);
        if (coverElement && coverElement.src) break;
      }
      const coverUrl = coverElement ? coverElement.src : '';
      
      // Try multiple selectors for download button
      const downloadSelectors = ['.rb_btn', 'a[href*="download"]', 'a[href*=".mp3"]', 'a[href*=".m4a"]', 'button'];
      let downloadButton = null;
      for (const selector of downloadSelectors) {
        downloadButton = document.querySelector(selector);
        if (downloadButton && (downloadButton.href || downloadButton.onclick)) break;
      }
      
      let downloadUrl = '';
      if (downloadButton) {
        downloadUrl = downloadButton.href || '';
        
        // If no href, check onclick
        if (!downloadUrl && downloadButton.onclick) {
          const onclickText = downloadButton.onclick.toString();
          const urlMatch = onclickText.match(/(https?:\/\/[^'"]+)/);
          if (urlMatch) downloadUrl = urlMatch[1];
        }
      }
      
      return { title, artist, coverUrl, downloadUrl };
    });
    
    if (!result.downloadUrl) {
      // Try to find download URL in page content
      const pageContent = await page.content();
      const urlMatch = pageContent.match(/(https?:\/\/[^\s"']*\.(mp3|m4a)[^\s"']*)/i);
      if (urlMatch && urlMatch[1]) {
        result.downloadUrl = urlMatch[1];
      } else {
        throw new Error('Download URL not found on server 2');
      }
    }
    
    await browser.close();
    
    return {
      song_name: result.title.replace(`(${result.artist})`, '').trim(),
      artist: result.artist,
      img: result.coverUrl,
      downloadUrl: result.downloadUrl,
      source: 'server_2'
    };
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('Error with server 2:', error);
    throw new Error(`Server 2 failed: ${error.message}`);
  }
}

// Server 3 implementation - alternative server
async function tryServer3(spotifyUrl) {
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
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });
    
    // Try a different downloader site
    await page.goto('https://spotifymate.com/', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // Fill in the form
    await page.type('input[type="text"]', spotifyUrl);
    
    // Submit the form
    await page.click('button[type="submit"]');
    
    // Wait for conversion
    await page.waitForSelector('.download-button, a[href*="download"], button[onclick*="download"]', { timeout: 30000 });
    
    // Get download URL
    const downloadUrl = await page.evaluate(() => {
      // Try multiple selectors for download button
      const downloadSelectors = ['.download-button', 'a[href*="download"]', 'button[onclick*="download"]'];
      let downloadButton = null;
      
      for (const selector of downloadSelectors) {
        downloadButton = document.querySelector(selector);
        if (downloadButton) break;
      }
      
      if (!downloadButton) return null;
      
      // Get URL from href or onclick
      if (downloadButton.href) {
        return downloadButton.href;
      } else if (downloadButton.onclick) {
        const onclickText = downloadButton.onclick.toString();
        const urlMatch = onclickText.match(/(https?:\/\/[^'"]+)/);
        return urlMatch ? urlMatch[1] : null;
      }
      
      return null;
    });
    
    if (!downloadUrl) {
      throw new Error('Download URL not found on server 3');
    }
    
    // Try to get track info
    const trackInfo = await page.evaluate(() => {
      const titleElem = document.querySelector('h1, h2, h3, .title, .song-title');
      const title = titleElem ? titleElem.textContent.trim() : 'Unknown Title';
      
      const artistElem = document.querySelector('.artist, .singer, .author');
      const artist = artistElem ? artistElem.textContent.trim() : 'Unknown Artist';
      
      const coverElem = document.querySelector('img.cover, img.thumbnail, img[src*="image"]');
      const coverUrl = coverElem ? coverElem.src : '';
      
      return { title, artist, coverUrl };
    });
    
    await browser.close();
    
    return {
      song_name: trackInfo.title,
      artist: trackInfo.artist,
      img: trackInfo.coverUrl,
      downloadUrl: downloadUrl,
      source: 'server_3'
    };
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('Error with server 3:', error);
    throw new Error(`Server 3 failed: ${error.message}`);
  }
}
