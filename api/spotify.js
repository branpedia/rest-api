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
    // Validate Spotify URL
    if (!url.includes('spotify.com') || !url.includes('/track/')) {
      return response.status(400).json({ success: false, error: 'URL tidak valid. Pastikan URL track Spotify.' });
    }

    let result;
    let errorMessages = [];
    
    // Try server 1 first
    try {
      console.log('Mencoba server 1...');
      result = await tryServer1(url);
      
      // If download URL is from problematic domains, try to resolve it
      if (result.downloadUrl && (result.downloadUrl.includes('mymp3.xyz') || 
                                 result.downloadUrl.includes('spapu') ||
                                 result.downloadUrl.includes('dl.spapu'))) {
        console.log('Mencoba mengatasi URL download bermasalah...');
        try {
          result.downloadUrl = await resolveProblematicUrl(result.downloadUrl);
          result.directDownload = true;
        } catch (resolveError) {
          console.log('Gagal mengatasi URL bermasalah, mencoba server 2...');
          throw new Error(`URL download bermasalah: ${resolveError.message}`);
        }
      }
    } catch (error) {
      errorMessages.push(`Server 1: ${error.message}`);
      console.log('Server 1 gagal, mencoba server 2...', error.message);
      
      // If server 1 fails, try server 2
      try {
        result = await tryServer2(url);
      } catch (error2) {
        errorMessages.push(`Server 2: ${error2.message}`);
        throw new Error(`Semua server gagal: ${errorMessages.join('; ')}`);
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

// Function to resolve problematic download URLs
async function resolveProblematicUrl(downloadUrl) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Navigate to the download URL
    await page.goto(downloadUrl, { 
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Wait a bit for redirects
    await page.waitForTimeout(3000);
    
    // Check if we've been redirected to a direct download
    const currentUrl = page.url();
    
    // If current URL is a direct audio file, return it
    if (currentUrl.match(/\.(mp3|m4a|aac|wav|flac|ogg)$/i)) {
      await browser.close();
      return currentUrl;
    }
    
    // Try to find download buttons or links
    const directDownloadUrl = await page.evaluate(() => {
      // Look for direct download links
      const downloadSelectors = [
        'a[href*=".mp3"]', 
        'a[href*=".m4a"]',
        'a[href*=".aac"]',
        'a[href*="download"]',
        'button[onclick*="download"]',
        'a[onclick*="download"]'
      ];
      
      for (const selector of downloadSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          const href = element.getAttribute('href') || element.getAttribute('onclick');
          if (href && href.match(/https?:\/\//)) {
            // Extract URL from onclick if needed
            if (href.includes('window.location') || href.includes('window.open')) {
              const urlMatch = href.match(/(https?:\/\/[^'"]+)/);
              if (urlMatch) return urlMatch[1];
            }
            return href;
          }
        }
      }
      
      // Look for audio elements
      const audioElement = document.querySelector('audio');
      if (audioElement && audioElement.src) {
        return audioElement.src;
      }
      
      return null;
    });
    
    if (directDownloadUrl) {
      await browser.close();
      return directDownloadUrl;
    }
    
    // As a last resort, try to intercept network requests
    const finalUrl = await new Promise((resolve) => {
      page.on('response', async (response) => {
        const url = response.url();
        if (url.match(/\.(mp3|m4a|aac|wav|flac|ogg)$/i)) {
          resolve(url);
        }
      });
      
      // Click any button that might trigger download
      setTimeout(async () => {
        try {
          await page.click('body');
        } catch (e) {}
        
        // If no response after 5 seconds, return original URL
        setTimeout(() => resolve(downloadUrl), 5000);
      }, 1000);
    });
    
    await browser.close();
    return finalUrl;
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('Error resolving problematic URL:', error);
    throw new Error(`Failed to resolve URL: ${error.message}`);
  }
}

// Server 1 implementation - using cloudscraper
async function tryServer1(spotifyUrl) {
  try {
    const baseUrl = 'https://spotisongdownloader.to';
    
    // Get initial page to obtain cookies
    const initialHtml = await cloudscraper.get(baseUrl);
    
    // Extract cookies from the response
    let cookies = [];
    if (initialHtml.includes('document.cookie')) {
      const cookieMatch = initialHtml.match(/document\.cookie\s*=\s*'([^']+)'/);
      if (cookieMatch && cookieMatch[1]) {
        cookies.push(cookieMatch[1]);
      }
    }
    
    // Add additional cookies that might be needed
    cookies.push('_ga=GA1.1.2675401.1754827078');
    
    // Prepare headers with cookies
    const headers = {
      'Referer': baseUrl,
      'Cookie': cookies.join('; '),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };
    
    // Try to bypass captcha if needed
    try {
      await cloudscraper.get({
        url: `${baseUrl}/ifCaptcha.php`,
        headers: headers
      });
    } catch (e) {
      console.log('ifCaptcha mungkin tidak diperlukan atau gagal:', e.message);
    }
    
    // Get track info
    const trackInfoUrl = `${baseUrl}/api/composer/spotify/xsingle_track.php?url=${encodeURIComponent(spotifyUrl)}`;
    const trackInfoResponse = await cloudscraper.get({
      url: trackInfoUrl,
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
      url: `${baseUrl}/track.php`,
      headers: headers,
      form: { data: JSON.stringify(payload) }
    });
    
    // Get download URL
    const downloadResponse = await cloudscraper.post({
      url: `${baseUrl}/api/composer/spotify/ssdw23456ytrfds.php`,
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
      downloadUrl: downloadResponse.dlink
    };
    
  } catch (error) {
    console.error('Error with server 1:', error);
    throw new Error(`Server 1 failed: ${error.message}`);
  }
}

// Server 2 implementation - using puppeteer as fallback
async function tryServer2(spotifyUrl) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Navigate to the downloader site
    await page.goto('https://spotifydownloader.pro/id/', { 
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Fill in the form
    await page.type('input[name="url"]', spotifyUrl);
    
    // Submit the form
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.click('button[type="submit"]')
    ]);
    
    // Wait for results to load with a longer timeout
    await page.waitForSelector('.rb_title, .rb_btn, a[href*="download"]', { timeout: 15000 });
    
    // Extract information
    const result = await page.evaluate(() => {
      // Try multiple selectors for title
      const titleSelectors = ['.rb_title', '.title', 'h1', 'h2', 'h3'];
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
      const coverSelectors = ['.rb_icon', '.cover', 'img'];
      let coverElement = null;
      for (const selector of coverSelectors) {
        coverElement = document.querySelector(selector);
        if (coverElement && coverElement.src) break;
      }
      const coverUrl = coverElement ? coverElement.src : '';
      
      // Try multiple selectors for download button
      const downloadSelectors = ['.rb_btn', 'a[href*="download"]', 'a[href*=".mp3"]', 'a[href*=".m4a"]'];
      let downloadButton = null;
      for (const selector of downloadSelectors) {
        downloadButton = document.querySelector(selector);
        if (downloadButton && downloadButton.href) break;
      }
      const downloadUrl = downloadButton ? downloadButton.href : '';
      
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
    
    // If the download URL is problematic, try to resolve it
    if (result.downloadUrl.includes('mymp3.xyz') || 
        result.downloadUrl.includes('spapu') ||
        result.downloadUrl.includes('dl.spapu')) {
      result.downloadUrl = await resolveProblematicUrl(result.downloadUrl);
      result.directDownload = true;
    }
    
    return {
      song_name: result.title.replace(`(${result.artist})`, '').trim(),
      artist: result.artist,
      img: result.coverUrl,
      downloadUrl: result.downloadUrl
    };
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('Error with server 2:', error);
    throw new Error(`Server 2 failed: ${error.message}`);
  }
}
