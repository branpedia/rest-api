import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';

// API YouTube to MP3 Converter
// Endpoint: GET /api/ytmp3?url=[youtube_url]

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
    // Validate YouTube URL
    if (!url.includes('youtube.com/') && !url.includes('youtu.be/')) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    // Extract video ID from URL
    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: 'Could not extract video ID from URL' });
    }

    // Get download links using multiple methods
    let downloadLinks = await getDownloadLinksWithCloudscraper(videoId);
    
    // If cloudscraper fails, use puppeteer
    if (!downloadLinks || downloadLinks.audios.length === 0) {
      downloadLinks = await getDownloadLinksWithPuppeteer(videoId);
    }

    if (!downloadLinks || downloadLinks.audios.length === 0) {
      return res.status(404).json({ error: 'No download links found' });
    }

    return res.status(200).json({
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
    console.error('YouTube to MP3 API Error:', error);
    return res.status(500).json({ 
      error: 'Failed to process YouTube video',
      message: error.message 
    });
  }
}

// Function to extract video ID from YouTube URL
function extractVideoId(url) {
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
      }
    });

    return parseDownloadLinks(response);

  } catch (error) {
    console.error('Cloudscraper error:', error);
    return null;
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
      ]
    });

    const page = await browser.newPage();
    
    // Set user agent and viewport
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    // Navigate to SaveFrom.net
    await page.goto(saveFromUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Fill the form and submit
    await page.type('#sf_url', youtubeUrl);
    await page.click('#sf_submit');

    // Wait for results to load
    await page.waitForSelector('.media-result', { timeout: 15000 }).catch(() => {
      console.log('Media result not found, continuing anyway');
    });

    // Get the page content
    const html = await page.content();
    
    return parseDownloadLinks(html);

  } catch (error) {
    console.error('Puppeteer error:', error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
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
    });

    // Extract video links
    const videoLinks = document.querySelectorAll('a.link:not(.link-download)');
    
    videoLinks.forEach(link => {
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
    });

    // If no audio links found with class, try alternative parsing
    if (result.audios.length === 0) {
      const alternativeAudioLinks = html.match(/<a[^>]*data-type="[^"]*audio[^"]*"[^>]*href="([^"]*)"[^>]*data-quality="([^"]*)"[^>]*>([^<]*)<\/a>/g);
      
      if (alternativeAudioLinks) {
        alternativeAudioLinks.forEach(linkHtml => {
          const hrefMatch = linkHtml.match(/href="([^"]*)"/);
          const qualityMatch = linkHtml.match(/data-quality="([^"]*)"/);
          const textMatch = linkHtml.match/>([^<]*)<\/a>/);
          
          if (hrefMatch && qualityMatch && textMatch) {
            const cleanUrl = cleanDownloadUrl(hrefMatch[1]);
            result.audios.push({
              url: cleanUrl,
              quality: qualityMatch[1] + ' kb/s',
              type: 'opus',
              label: textMatch[1].trim(),
              originalUrl: hrefMatch[1]
            });
          }
        });
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
