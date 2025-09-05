import cloudscraper from 'cloudscraper';

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

  if (request.method !== 'GET') {
    return response.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { url } = request.query;

  if (!url) {
    return response.status(400).json({ success: false, error: 'Parameter URL diperlukan' });
  }

  try {
    // Validate Videy URL
    if (!url.includes('videy.co') || !url.includes('id=')) {
      return response.status(400).json({ success: false, error: 'URL tidak valid' });
    }

    // Extract video ID
    const videoIdMatch = url.match(/[?&]id=([^&]+)/i);
    if (!videoIdMatch) {
      return response.status(400).json({ success: false, error: 'Format URL salah' });
    }

    const videoId = videoIdMatch[1];
    const videoUrl = `https://cdn.videy.co/${videoId}.mp4`;

    // Get video info
    try {
      const headResponse = await cloudscraper.head(videoUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 10000
      });

      const fileSize = headResponse.request.headers['content-length'];
      const contentType = headResponse.request.headers['content-type'];

      // Format size
      const formatSize = (bytes) => {
        if (!bytes) return 'Unknown';
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
      };

      return response.status(200).json({
        success: true,
        data: {
          creator: "branpedia",
          size: formatSize(fileSize),
          format: "mp4",
          downloadUrl: videoUrl
        }
      });

    } catch (error) {
      // If HEAD fails, just return the download URL without size info
      return response.status(200).json({
        success: true,
        data: {
          creator: "branpedia",
          size: "Unknown",
          format: "mp4",
          downloadUrl: videoUrl
        }
      });
    }

  } catch (error) {
    console.error('Error:', error);
    return response.status(500).json({ 
      success: false, 
      error: 'Gagal memproses video' 
    });
  }
}
