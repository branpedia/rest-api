import axios from 'axios';

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
    return response.status(400).json({ 
      success: false, 
      error: 'Parameter URL diperlukan. Contoh: ?url=https://videy.co/v/?id=abc123' 
    });
  }

  try {
    // Extract video ID
    const videoIdMatch = url.match(/[?&]id=([^&]+)/i);
    if (!videoIdMatch) {
      return response.status(400).json({ 
        success: false, 
        error: 'Format URL salah! Pastikan URL mengandung parameter id. Contoh: https://videy.co/v/?id=xxxx' 
      });
    }

    const videoId = videoIdMatch[1];
    const videoUrl = `https://cdn.videy.co/${videoId}.mp4`;

    try {
      // Get video details dengan HEAD request
      const headRes = await axios.head(videoUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 10000
      });

      const fileSize = headRes.headers['content-length'];
      const contentType = headRes.headers['content-type'];

      if (!fileSize || !contentType.includes('video')) {
        return response.status(404).json({ 
          success: false, 
          error: 'Video tidak ditemukan atau tidak valid' 
        });
      }

      // Format file size
      const formatSize = (bytes) => {
        if (!bytes) return '0 KB';
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
      };

      // Return video information
      return response.status(200).json({
        success: true,
        data: {
          videoId: videoId,
          downloadUrl: videoUrl,
          fileSize: formatSize(fileSize),
          fileSizeBytes: parseInt(fileSize),
          contentType: contentType,
          details: {
            platform: 'Videy.co',
            quality: 'Original'
          }
        }
      });

    } catch (error) {
      console.error('Video check error:', error.message);
      
      // Jika HEAD request gagal, coba dengan GET request untuk memastikan
      try {
        const getRes = await axios.get(videoUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Range': 'bytes=0-100' // Hanya request sebagian kecil untuk checking
          },
          timeout: 5000
        });

        if (getRes.status === 206) { // Partial content
          return response.status(200).json({
            success: true,
            data: {
              videoId: videoId,
              downloadUrl: videoUrl,
              fileSize: 'Unknown (video tersedia)',
              fileSizeBytes: 0,
              contentType: getRes.headers['content-type'] || 'video/mp4',
              details: {
                platform: 'Videy.co',
                quality: 'Original',
                note: 'File size tidak dapat ditentukan'
              }
            }
          });
        }

      } catch (getError) {
        console.error('GET request also failed:', getError.message);
        throw new Error('Video tidak tersedia atau telah dihapus');
      }

      throw new Error('Video tidak dapat diakses');
    }

  } catch (error) {
    console.error('Error fetching Videy data:', error.message);
    
    // Retry logic
    if (retry < 2) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }
    
    return response.status(500).json({ 
      success: false, 
      error: error.message || 'Gagal mengunduh video dari Videy.co. Pastikan URL valid dan coba lagi.' 
    });
  }
}
