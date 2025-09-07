import axios from 'axios';
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

    let searchRes, convertRes;
    const videoId = extractVideoId(url);
    
    try {
      // STEP 1: SEARCH
      searchRes = await axios.post(
        "https://ssvid.net/api/ajaxSearch/index",
        new URLSearchParams({ query: url }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
          },
        }
      );

      if (!searchRes.data.data || searchRes.data.data.length === 0) {
        throw new Error('Video tidak ditemukan');
      }

      const videoData = searchRes.data.data[0];
      
      // STEP 2: CONVERT
      convertRes = await axios.post(
        "https://ssvid.net/api/ajaxConvert/convert",
        new URLSearchParams({
          vid: videoData.vid,
          k: videoData.key
        }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
          },
        }
      );

      if (!convertRes.data || !convertRes.data.source) {
        throw new Error('Konversi gagal');
      }

      return response.status(200).json({
        success: true,
        data: {
          title: videoData.title,
          duration: videoData.duration,
          thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
          downloadUrl: convertRes.data.source,
          quality: '128kbps',
          size: convertRes.data.size || 'Unknown'
        }
      });

    } catch (error) {
      console.error('Error fetching YouTube data:', error);
      
      // Retry logic
      if (retry < 2) {
        // Wait for 1 second before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
        return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
      }
      
      // Fallback to Puppeteer if API fails
      return await fallbackPuppeteerScraper(url, response);
    }

  } catch (error) {
    console.error('Error in YouTube to MP3 converter:', error);
    return response.status(500).json({ 
      success: false, 
      error: 'Gagal mengambil data dari YouTube. Pastikan URL valid dan coba lagi.' 
    });
  }
}

// Function to extract video ID from YouTube URL
function extractVideoId(url) {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : null;
}

// Fallback method using Puppeteer
async function fallbackPuppeteerScraper(url, response) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Navigate to a YouTube downloader site
    await page.goto(`https://ytmp3.cc/en13/?url=${encodeURIComponent(url)}`, { 
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Wait for conversion to complete
    await page.waitForSelector('#download', { timeout: 60000 });
    
    // Get download link
    const downloadUrl = await page.$eval('#download', el => el.href);
    const title = await page.$eval('#title', el => el.value);
    
    await browser.close();
    
    return response.status(200).json({
      success: true,
      data: {
        title: title,
        downloadUrl: downloadUrl,
        quality: '128kbps',
        size: 'Unknown',
        source: 'fallback'
      }
    });
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('Fallback method also failed:', error);
    throw error;
  }
}
