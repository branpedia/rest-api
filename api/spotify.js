import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';

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

    // Step 1: Submit the Spotify URL to the downloader service
    const formData = {
      url: url
    };

    const submitResponse = await cloudscraper.post({
      uri: 'https://spotifydownloader.pro/id/',
      formData: formData,
      headers: {
        'Origin': 'https://spotifydownloader.pro',
        'Referer': 'https://spotifydownloader.pro/id/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    // Parse the response HTML
    const dom = new JSDOM(submitResponse);
    const document = dom.window.document;

    // Extract metadata
    const titleElement = document.querySelector('.rb_title');
    const title = titleElement ? titleElement.textContent.trim() : 'Unknown Title';
    
    let artist = 'Unknown Artist';
    if (titleElement) {
      const artistSpan = titleElement.querySelector('span');
      artist = artistSpan ? artistSpan.textContent.trim().replace(/[()]/g, '') : 'Unknown Artist';
    }

    const coverElement = document.querySelector('.rb_icon');
    const coverUrl = coverElement ? coverElement.getAttribute('src') : '';

    // Extract download link
    const downloadButton = document.querySelector('a.rb_btn');
    const downloadPath = downloadButton ? downloadButton.getAttribute('href') : '';

    if (!downloadPath) {
      throw new Error('Tidak dapat menemukan link download');
    }

    // Construct full download URL
    const downloadUrl = downloadPath.startsWith('http') 
      ? downloadPath 
      : `https://spotifydownloader.pro${downloadPath}`;

    // Get file information
    const fileInfoResponse = await cloudscraper.head(downloadUrl);
    const contentLength = fileInfoResponse.headers['content-length'];
    const contentType = fileInfoResponse.headers['content-type'] || 'audio/mpeg';
    
    let fileSize = 'Unknown';
    if (contentLength) {
      const sizeInMB = parseInt(contentLength) / (1024 * 1024);
      fileSize = `${sizeInMB.toFixed(2)} MB`;
    }

    // Get file extension from content type
    let fileExtension = 'mp3';
    if (contentType.includes('mpeg')) fileExtension = 'mp3';
    if (contentType.includes('ogg')) fileExtension = 'ogg';

    return response.status(200).json({
      success: true,
      data: {
        title: title,
        artist: artist,
        size: fileSize,
        extension: fileExtension,
        coverUrl: coverUrl,
        downloadUrl: downloadUrl
      }
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
