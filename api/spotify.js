import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';

// Konfigurasi cloudscraper
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
    
    // Coba semua server secara berurutan
    try {
      console.log('Mencoba server 1 (spotisongdownloader.to)...');
      result = await tryServer1(url);
      console.log('Server 1 berhasil');
    } catch (error) {
      errorMessages.push(`Server 1: ${error.message}`);
      console.log('Server 1 gagal:', error.message);
      
      // Coba server 2
      try {
        console.log('Mencoba server 2 (spotifydownloader.pro)...');
        result = await tryServer2(url);
        console.log('Server 2 berhasil');
      } catch (error2) {
        errorMessages.push(`Server 2: ${error2.message}`);
        console.log('Server 2 gagal:', error2.message);
        
        // Coba server 3
        try {
          console.log('Mencoba server 3 (spotifymate.com)...');
          result = await tryServer3(url);
          console.log('Server 3 berhasil');
        } catch (error3) {
          errorMessages.push(`Server 3: ${error3.message}`);
          console.log('Server 3 gagal:', error3.message);
          
          // Coba server 4 sebagai fallback terakhir
          try {
            console.log('Mencoba server 4 (spotify-downloader.alien...)...');
            result = await tryServer4(url);
            console.log('Server 4 berhasil');
          } catch (error4) {
            errorMessages.push(`Server 4: ${error4.message}`);
            console.log('Server 4 gagal:', error4.message);
            throw new Error(`Semua server gagal: ${errorMessages.join('; ')}`);
          }
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

// Server 1 implementation - spotisongdownloader.to
async function tryServer1(spotifyUrl) {
  try {
    const baseUrl = 'https://spotisongdownloader.to';
    
    // Get initial page
    const initialHtml = await cloudscraper.get(baseUrl);
    
    // Extract cookies
    let cookieString = '';
    if (initialHtml.request && initialHtml.request.headers && initialHtml.request.headers.cookie) {
      cookieString = initialHtml.request.headers.cookie;
    }
    
    // Prepare headers
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
      throw new Error('Invalid response from server');
    }
    
    // Prepare payload
    const payload = [
      trackInfoResponse.song_name,
      trackInfoResponse.duration,
      trackInfoResponse.img,
      trackInfoResponse.artist,
      trackInfoResponse.url,
      trackInfoResponse.album_name,
      trackInfoResponse.released
    ];
    
    // Send payload
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
      throw new Error('No download link received');
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
    throw new Error(error.message);
  }
}

// Server 2 implementation - spotifydownloader.pro
async function tryServer2(spotifyUrl) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Navigate to downloader site
    await page.goto('https://spotifydownloader.pro/id/', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // Fill form
    await page.type('input[name="url"]', spotifyUrl);
    
    // Submit form
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      page.click('button[type="submit"]')
    ]);
    
    // Wait for results
    await page.waitForSelector('.rb_title, .rb_btn, a[href*="download"]', { timeout: 15000 });
    
    // Extract information
    const result = await page.evaluate(() => {
      // Find title
      const titleElement = document.querySelector('.rb_title') || 
                           document.querySelector('.title') || 
                           document.querySelector('h1, h2, h3');
      const title = titleElement ? titleElement.textContent.trim() : 'Unknown Title';
      
      // Find artist
      let artist = 'Unknown Artist';
      if (titleElement) {
        const artistSpan = titleElement.querySelector('span');
        artist = artistSpan ? artistSpan.textContent.trim().replace(/[()]/g, '') : 'Unknown Artist';
      }
      
      // Find cover image
      const coverElement = document.querySelector('.rb_icon') || 
                           document.querySelector('.cover') || 
                           document.querySelector('img');
      const coverUrl = coverElement ? coverElement.src : '';
      
      // Find download button
      const downloadButton = document.querySelector('.rb_btn') || 
                             document.querySelector('a[href*="download"]') ||
                             document.querySelector('a[href*=".mp3"], a[href*=".m4a"]');
      const downloadUrl = downloadButton ? downloadButton.href : '';
      
      return { title, artist, coverUrl, downloadUrl };
    });
    
    if (!result.downloadUrl) {
      throw new Error('Download URL not found');
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
    throw new Error(error.message);
  }
}

// Server 3 implementation - spotifymate.com
async function tryServer3(spotifyUrl) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Navigate to downloader site
    await page.goto('https://spotifymate.com/', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // Fill form
    await page.type('input[type="text"]', spotifyUrl);
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Wait for conversion
    await page.waitForSelector('.download-button, a[href*="download"]', { timeout: 30000 });
    
    // Get download URL
    const downloadUrl = await page.evaluate(() => {
      const downloadButton = document.querySelector('.download-button') || 
                             document.querySelector('a[href*="download"]');
      return downloadButton ? downloadButton.href : null;
    });
    
    if (!downloadUrl) {
      throw new Error('Download URL not found');
    }
    
    // Get track info
    const trackInfo = await page.evaluate(() => {
      const titleElem = document.querySelector('h1, h2, h3, .title, .song-title');
      const title = titleElem ? titleElem.textContent.trim() : 'Unknown Title';
      
      const artistElem = document.querySelector('.artist, .singer, .author');
      const artist = artistElem ? artistElem.textContent.trim() : 'Unknown Artist';
      
      const coverElem = document.querySelector('img.cover, img.thumbnail');
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
    throw new Error(error.message);
  }
}

// Server 4 implementation - alternatif terakhir
async function tryServer4(spotifyUrl) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Navigate to downloader site
    await page.goto('https://spotify-downloader.alien.slayer.workers.dev/', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // Find input field and fill it
    await page.type('input[type="text"], input[type="url"]', spotifyUrl);
    
    // Find and click submit button
    await page.click('button[type="submit"], input[type="submit"]');
    
    // Wait for results
    await page.waitForSelector('a[href*=".mp3"], a[href*=".m4a"], .download-btn', { timeout: 30000 });
    
    // Get download URL
    const downloadUrl = await page.evaluate(() => {
      const downloadLink = document.querySelector('a[href*=".mp3"]') || 
                           document.querySelector('a[href*=".m4a"]') ||
                           document.querySelector('.download-btn');
      return downloadLink ? downloadLink.href : null;
    });
    
    if (!downloadUrl) {
      throw new Error('Download URL not found');
    }
    
    // Get track info
    const trackInfo = await page.evaluate(() => {
      const titleElem = document.querySelector('h1, h2, h3, .title');
      const title = titleElem ? titleElem.textContent.trim() : 'Unknown Title';
      
      const artistElem = document.querySelector('.artist, .author');
      const artist = artistElem ? artistElem.textContent.trim() : 'Unknown Artist';
      
      const coverElem = document.querySelector('img');
      const coverUrl = coverElem ? coverElem.src : '';
      
      return { title, artist, coverUrl };
    });
    
    await browser.close();
    
    return {
      song_name: trackInfo.title,
      artist: trackInfo.artist,
      img: trackInfo.coverUrl,
      downloadUrl: downloadUrl,
      source: 'server_4'
    };
    
  } catch (error) {
    if (browser) await browser.close();
    throw new Error(error.message);
  }
}
