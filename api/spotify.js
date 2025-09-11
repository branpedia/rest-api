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
      return response.status(400).json({ 
        success: false, 
        error: 'URL tidak valid. Pastikan URL berasal dari Spotify dan berupa track.' 
      });
    }

    let html;
    let browser;

    try {
      // First try with cloudscraper
      html = await cloudscraper.get('https://spotisongdownloader.to');
      
      // Get cookies from initial request
      const cookies = await cloudscraper.getCookieString('https://spotisongdownloader.to');
      
      // Submit the Spotify URL to the downloader service
      const formData = {
        url: url
      };

      const submitResponse = await cloudscraper.post({
        uri: 'https://spotisongdownloader.to/api/composer/spotify/xsingle_track.php',
        formData: formData,
        headers: {
          'Cookie': cookies,
          'Origin': 'https://spotisongdownloader.to',
          'Referer': 'https://spotisongdownloader.to',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const trackData = JSON.parse(submitResponse);
      
      // Get download URL
      const downloadResponse = await cloudscraper.post({
        uri: 'https://spotisongdownloader.to/api/composer/spotify/ssdw23456ytrfds.php',
        form: {
          song_name: trackData.song_name,
          artist_name: trackData.artist,
          url: url,
          zip_download: 'false',
          quality: 'm4a'
        },
        headers: {
          'Cookie': cookies,
          'Origin': 'https://spotisongdownloader.to',
          'Referer': 'https://spotisongdownloader.to',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const downloadData = JSON.parse(downloadResponse);

      return response.status(200).json({
        success: true,
        data: {
          title: trackData.song_name,
          artist: trackData.artist,
          duration: trackData.duration,
          album: trackData.album_name,
          released: trackData.released,
          coverUrl: trackData.img,
          downloadUrl: downloadData.dlink,
          fileExtension: 'm4a'
        }
      });

    } catch (error) {
      console.log('Cloudscraper failed, trying with Puppeteer...');
      
      // If cloudscraper fails, use Puppeteer as fallback
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      // Go to the downloader site
      await page.goto('https://spotisongdownloader.to', { waitUntil: 'networkidle2' });
      
      // Enter the Spotify URL
      await page.type('input[name="url"]', url);
      
      // Click the download button
      await page.click('button[type="submit"]');
      
      // Wait for results
      await page.waitForSelector('.download-btn', { timeout: 10000 });
      
      // Extract information
      const trackInfo = await page.evaluate(() => {
        const titleElem = document.querySelector('.song-title');
        const artistElem = document.querySelector('.artist-name');
        const downloadBtn = document.querySelector('.download-btn');
        
        return {
          title: titleElem ? titleElem.textContent.trim() : 'Unknown',
          artist: artistElem ? artistElem.textContent.trim() : 'Unknown',
          downloadUrl: downloadBtn ? downloadBtn.href : null
        };
      });
      
      if (!trackInfo.downloadUrl) {
        throw new Error('Tidak dapat menemukan link download');
      }
      
      await browser.close();

      return response.status(200).json({
        success: true,
        data: {
          title: trackInfo.title,
          artist: trackInfo.artist,
          downloadUrl: trackInfo.downloadUrl,
          fileExtension: 'mp3'
        }
      });
    }

  } catch (error) {
    console.error('Error fetching Spotify data:', error);
    
    // Close browser if it's still open
    if (browser) {
      await browser.close();
    }
    
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
