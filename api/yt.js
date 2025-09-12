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

    // Extract video ID from URL
    const videoId = extractVideoId(url);
    if (!videoId) {
      return response.status(400).json({ success: false, error: 'Could not extract video ID from URL' });
    }

    let downloadLinks;

    try {
      // First try with cloudscraper
      downloadLinks = await getDownloadLinksWithCloudscraper(videoId);
    } catch (error) {
      console.log('Cloudscraper failed, trying with Puppeteer...');
      
      // If cloudscraper fails, use Puppeteer as fallback
      downloadLinks = await getDownloadLinksWithPuppeteer(videoId);
    }

    if (!downloadLinks || downloadLinks.audios.length === 0) {
      return response.status(404).json({ success: false, error: 'No download links found' });
    }

    return response.status(200).json({
      success: true,
      data: {
        videoId,
        title: downloadLinks.title || 'Unknown Title',
        duration: downloadLinks.duration || '0:00',
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        downloads: downloadLinks.audios,
        videos: downloadLinks.videos || []
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
    
    return response.status(500).json({ 
      success: false, 
      error: 'Gagal mengambil data dari YouTube. Pastikan URL valid dan coba lagi.' 
    });
  }
}

// Function to extract video ID from YouTube URL
function extractVideoId(url) {
  try {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/,
      /(?:youtube\.com\/embed\/)([^?]+)/,
      /(?:youtube\.com\/v\/)([^?]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  } catch (error) {
    console.error('Error extracting video ID:', error);
    return null;
  }
}

// Function to get download links using Cloudscraper
async function getDownloadLinksWithCloudscraper(videoId) {
  try {
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const saveFromUrl = 'https://id.savefrom.net/21-youtube-to-mp4-9eA.html';

    // Use cloudscraper to bypass protection
    const response = await cloudscraper.post(saveFromUrl, {
      form: {
        sf_url: youtubeUrl,
        sf_submit: ''
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
        'Origin': 'https://id.savefrom.net',
        'Referer': 'https://id.savefrom.net/21-youtube-to-mp4-9eA.html',
        'Connection': 'keep-alive'
      },
      timeout: 30000 // 30 second timeout
    });

    return parseDownloadLinks(response);

  } catch (error) {
    console.error('Cloudscraper error:', error);
    throw error;
  }
}

// Function to get download links using Puppeteer
async function getDownloadLinksWithPuppeteer(videoId) {
  let browser = null;
  try {
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const saveFromUrl = 'https://id.savefrom.net/21-youtube-to-mp4-9eA.html';

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--window-size=1920,1080'
      ],
      timeout: 30000
    });

    const page = await browser.newPage();
    
    // Set user agent and viewport
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    // Set request timeout
    page.setDefaultTimeout(30000);

    // Navigate to SaveFrom.net
    await page.goto(saveFromUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Fill the form and submit
    await page.type('#sf_url', youtubeUrl);
    await page.click('#sf_submit');

    // Wait for results to load with timeout
    try {
      await page.waitForSelector('.media-result', { timeout: 15000 });
    } catch (e) {
      console.log('Media result not found, continuing anyway');
    }

    // Get the page content
    const html = await page.content();
    
    return parseDownloadLinks(html);

  } catch (error) {
    console.error('Puppeteer error:', error);
    throw error;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
    }
  }
}

// Improved function to parse download links from HTML
function parseDownloadLinks(html) {
  const result = {
    title: '',
    duration: '',
    audios: [],
    videos: []
  };

  try {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Extract title
    const titleElement = document.querySelector('.row.title');
    if (titleElement) {
      result.title = titleElement.textContent.trim() || titleElement.getAttribute('title') || '';
    }

    // Extract duration
    const durationElement = document.querySelector('.row.duration');
    if (durationElement) {
      result.duration = durationElement.textContent.trim() || durationElement.getAttribute('title') || '';
    }

    // Extract audio links (OPUS and M4A)
    const audioLinks = document.querySelectorAll('a.link-download');
    
    audioLinks.forEach(link => {
      try {
        const dataType = link.getAttribute('data-type') || '';
        const dataQuality = link.getAttribute('data-quality') || '';
        const href = link.getAttribute('href') || '';
        const text = link.textContent.trim();

        if (dataType.includes('audio') && (dataType.includes('opus') || dataType.includes('m4a'))) {
          const cleanUrl = cleanDownloadUrl(href);
          result.audios.push({
            url: cleanUrl,
            quality: dataQuality + ' kb/s',
            type: dataType.includes('opus') ? 'opus' : 'm4a',
            label: text,
            originalUrl: href
          });
        }
      } catch (linkError) {
        console.error('Error processing audio link:', linkError);
      }
    });

    // Extract video links
    const videoLinks = document.querySelectorAll('a.link:not(.link-download)');
    
    videoLinks.forEach(link => {
      try {
        const dataType = link.getAttribute('data-type') || '';
        const dataQuality = link.getAttribute('data-quality') || '';
        const href = link.getAttribute('href') || '';
        const text = link.textContent.trim();

        if (dataType.includes('mp4') && !dataType.includes('dash') && !dataType.includes('without audio')) {
          const cleanUrl = cleanDownloadUrl(href);
          result.videos.push({
            url: cleanUrl,
            quality: dataQuality + 'p',
            type: 'mp4',
            label: text,
            originalUrl: href
          });
        }
      } catch (linkError) {
        console.error('Error processing video link:', linkError);
      }
    });

    // If no audio links found with class, try alternative parsing
    if (result.audios.length === 0) {
      try {
        const audioRegex = /<a[^>]*data-type="[^"]*audio[^"]*"[^>]*href="([^"]*)"[^>]*data-quality="([^"]*)"[^>]*>([^<]*)<\/a>/g;
        let match;
        
        while ((match = audioRegex.exec(html)) !== null) {
          const cleanUrl = cleanDownloadUrl(match[1]);
          result.audios.push({
            url: cleanUrl,
            quality: match[2] + ' kb/s',
            type: 'opus',
            label: match[3].trim(),
            originalUrl: match[1]
          });
        }
      } catch (regexError) {
        console.error('Error with regex parsing:', regexError);
      }
    }

  } catch (error) {
    console.error('Error parsing download links:', error);
  }

  return result;
}

// Function to clean download URL (remove tracking and get direct URL)
function cleanDownloadUrl(url) {
  if (!url) return '';

  try {
    // Handle URL encoding
    let cleanUrl = decodeURIComponent(url);
    
    // Remove tracking parameters
    const urlObj = new URL(cleanUrl);
    
    // Keep only essential parameters
    const essentialParams = ['expire', 'ei', 'ip', 'id', 'itag', 'source', 'requiressl', 'mime', 'clen', 'dur', 'lmt'];
    const newParams = new URLSearchParams();
    
    for (const param of essentialParams) {
      const value = urlObj.searchParams.get(param);
      if (value) {
        newParams.set(param, value);
      }
    }
    
    // Rebuild URL with essential parameters only
    return `${urlObj.origin}${urlObj.pathname}?${newParams.toString()}`;
    
  } catch (error) {
    console.error('Error cleaning URL:', error);
    return url;
  }
}
