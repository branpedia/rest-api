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
    
    // Try server 1 first
    try {
      console.log('Mencoba server 1...');
      result = await tryServer1(url);
    } catch (error) {
      console.log('Server 1 gagal, mencoba server 2...', error.message);
      // If server 1 fails, try server 2
      result = await tryServer2(url);
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

// Server 1 implementation
async function tryServer1(spotifyUrl) {
  const baseUrl = 'https://spotisongdownloader.to';
  
  // Get cookies first
  const cookie = await getCookie(baseUrl);
  
  // Check if captcha is needed
  const headers = await ifCaptcha(baseUrl, cookie);
  
  // Get track info
  const trackInfo = await singleTrack(baseUrl, spotifyUrl, headers);
  
  // Get track HTML
  await singleTrackHtml(baseUrl, trackInfo, headers);
  
  // Get download URL
  const downloadInfo = await downloadUrl(baseUrl, spotifyUrl, headers, trackInfo);
  
  return {
    song_name: downloadInfo.song_name,
    artist: downloadInfo.artist,
    duration: downloadInfo.duration,
    img: downloadInfo.img,
    album_name: downloadInfo.album_name,
    released: downloadInfo.released,
    downloadUrl: downloadInfo.dlink
  };
}

async function getCookie(baseUrl) {
  try {
    const html = await cloudscraper.get(baseUrl);
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // Extract cookie from meta tag or other element
    // This is a simplified approach - you might need to adjust based on actual site structure
    const cookieScript = document.querySelector('script');
    let cookie = '';
    
    if (cookieScript && cookieScript.textContent.includes('document.cookie')) {
      // Try to extract cookie from script
      const cookieMatch = cookieScript.textContent.match(/document\.cookie\s*=\s*'([^']+)'/);
      if (cookieMatch && cookieMatch[1]) {
        cookie = cookieMatch[1];
      }
    }
    
    if (!cookie) {
      // Fallback: use cloudscraper's built-in cookie handling
      const response = await cloudscraper.get(baseUrl);
      cookie = response.request.headers.cookie || '';
    }
    
    if (!cookie) throw new Error('Failed to get cookie');
    
    return cookie + '; _ga=GA1.1.2675401.1754827078';
  } catch (error) {
    console.error('Error getting cookie:', error);
    throw new Error('Failed to get cookie from server 1');
  }
}

async function ifCaptcha(baseUrl, cookie) {
  try {
    const url = `${baseUrl}/ifCaptcha.php`;
    await cloudscraper.get({
      url: url,
      headers: {
        'Referer': baseUrl,
        'Cookie': cookie
      }
    });
    
    return {
      'Referer': baseUrl,
      'Cookie': cookie
    };
  } catch (error) {
    console.error('Error with ifCaptcha:', error);
    throw new Error('Failed to bypass captcha');
  }
}

async function singleTrack(baseUrl, spotifyUrl, headers) {
  try {
    const url = `${baseUrl}/api/composer/spotify/xsingle_track.php?url=${encodeURIComponent(spotifyUrl)}`;
    const response = await cloudscraper.get({
      url: url,
      headers: headers,
      json: true
    });
    
    return response;
  } catch (error) {
    console.error('Error getting single track:', error);
    throw new Error('Failed to get track info from server 1');
  }
}

async function singleTrackHtml(baseUrl, trackInfo, headers) {
  try {
    const payload = [
      trackInfo.song_name,
      trackInfo.duration,
      trackInfo.img,
      trackInfo.artist,
      trackInfo.url,
      trackInfo.album_name,
      trackInfo.released
    ];
    
    const response = await cloudscraper.post({
      url: `${baseUrl}/track.php`,
      headers: headers,
      form: { data: JSON.stringify(payload) }
    });
    
    return true;
  } catch (error) {
    console.error('Error with track HTML:', error);
    throw new Error('Failed to process track HTML');
  }
}

async function downloadUrl(baseUrl, spotifyUrl, headers, trackInfo) {
  try {
    const response = await cloudscraper.post({
      url: `${baseUrl}/api/composer/spotify/ssdw23456ytrfds.php`,
      headers: headers,
      form: {
        song_name: trackInfo.song_name || '',
        artist_name: trackInfo.artist || '',
        url: spotifyUrl,
        zip_download: 'false',
        quality: 'm4a'
      },
      json: true
    });
    
    return { ...response, ...trackInfo };
  } catch (error) {
    console.error('Error getting download URL:', error);
    throw new Error('Failed to get download URL from server 1');
  }
}

// Server 2 implementation
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
    await page.goto('https://spotifydownloader.pro/id/', { waitUntil: 'networkidle2' });
    
    // Fill in the form
    await page.type('input[name="url"]', spotifyUrl);
    
    // Submit the form
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('button[type="submit"]')
    ]);
    
    // Wait for results to load
    await page.waitForSelector('.rb_title, .rb_btn', { timeout: 10000 });
    
    // Extract information
    const result = await page.evaluate(() => {
      const titleElement = document.querySelector('.rb_title');
      const title = titleElement ? titleElement.textContent.trim() : '';
      
      let artist = '';
      if (titleElement) {
        const artistSpan = titleElement.querySelector('span');
        artist = artistSpan ? artistSpan.textContent.trim().replace(/[()]/g, '') : '';
      }
      
      const coverElement = document.querySelector('.rb_icon');
      const coverUrl = coverElement ? coverElement.src : '';
      
      const downloadButton = document.querySelector('.rb_btn');
      const downloadUrl = downloadButton ? downloadButton.href : '';
      
      return { title, artist, coverUrl, downloadUrl };
    });
    
    if (!result.downloadUrl) {
      throw new Error('Download URL not found on server 2');
    }
    
    await browser.close();
    
    return {
      song_name: result.title.replace(`(${result.artist})`, '').trim(),
      artist: result.artist,
      img: result.coverUrl,
      downloadUrl: result.downloadUrl
    };
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('Error with server 2:', error);
    throw new Error('Failed to get data from server 2');
  }
}
