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

    // Get download links from SaveFrom.net
    const downloadLinks = await getDownloadLinks(videoId);

    if (!downloadLinks || downloadLinks.length === 0) {
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
        videos: downloadLinks.videos
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

// Function to get download links from SaveFrom.net
async function getDownloadLinks(videoId) {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const saveFromUrl = 'https://id.savefrom.net/21-youtube-to-mp4-9eA.html';

  try {
    // First, get the initial page to get cookies
    const initialResponse = await fetch(saveFromUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    const cookies = initialResponse.headers.get('set-cookie') || '';
    
    // Create form data for the request
    const formData = new URLSearchParams();
    formData.append('sf_url', youtubeUrl);
    formData.append('sf_submit', '');

    // Submit the form to get download links
    const response = await fetch('https://id.savefrom.net/21-youtube-to-mp4-9eA.html', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
        'Origin': 'https://id.savefrom.net',
        'Referer': 'https://id.savefrom.net/21-youtube-to-mp4-9eA.html',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      body: formData.toString()
    });

    const html = await response.text();
    
    // Parse the HTML to extract download links
    return parseDownloadLinks(html);

  } catch (error) {
    console.error('Error getting download links:', error);
    throw error;
  }
}

// Function to parse download links from HTML
function parseDownloadLinks(html) {
  const result = {
    title: '',
    duration: '',
    audios: [],
    videos: []
  };

  try {
    // Extract title
    const titleMatch = html.match(/<div class="row title"[^>]*title="([^"]*)"/);
    if (titleMatch) {
      result.title = titleMatch[1];
    }

    // Extract duration
    const durationMatch = html.match(/<div class="row duration"[^>]*title="([^"]*)"/);
    if (durationMatch) {
      result.duration = durationMatch[1];
    }

    // Extract audio links (OPUS and M4A)
    const audioRegex = /<a[^>]*class="[^"]*link-download[^"]*"[^>]*data-quality="([^"]*)"[^>]*data-type="([^"]*)"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g;
    let match;
    
    while ((match = audioRegex.exec(html)) !== null) {
      const quality = match[1];
      const type = match[2];
      const url = match[3];
      const label = match[4].trim();

      if (type.includes('audio') && (type.includes('opus') || type.includes('m4a'))) {
        result.audios.push({
          url: decodeURIComponent(url),
          quality: quality + ' kb/s',
          type: type.includes('opus') ? 'opus' : 'm4a',
          label: label
        });
      }
    }

    // Extract video links
    const videoRegex = /<a[^>]*class="[^"]*link[^"]*"[^>]*data-quality="([^"]*)"[^>]*data-type="([^"]*)"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g;
    
    while ((match = videoRegex.exec(html)) !== null) {
      const quality = match[1];
      const type = match[2];
      const url = match[3];
      const label = match[4].trim();

      if (type.includes('mp4') && !type.includes('dash') && !type.includes('without audio')) {
        result.videos.push({
          url: decodeURIComponent(url),
          quality: quality + 'p',
          type: 'mp4',
          label: label
        });
      }
    }

    // Clean up URLs (remove tracking parameters)
    result.audios = result.audios.map(audio => ({
      ...audio,
      url: cleanUrl(audio.url)
    }));

    result.videos = result.videos.map(video => ({
      ...video,
      url: cleanUrl(video.url)
    }));

  } catch (error) {
    console.error('Error parsing download links:', error);
  }

  return result;
}

// Function to clean URL from tracking parameters
function cleanUrl(url) {
  try {
    const urlObj = new URL(url);
    // Remove common tracking parameters
    const blacklistedParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'ga_track_events', 'data-ga-event', 'sig', 'lsig', 'sparams', 'lsparams'
    ];
    
    blacklistedParams.forEach(param => {
      urlObj.searchParams.delete(param);
    });

    return urlObj.toString();
  } catch {
    return url;
  }
}
