// api/instagram.js
import fetch from 'node-fetch';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET instead.'
    });
  }

  // Get URL parameter
  const { url } = req.query;

  // Check if URL parameter is provided
  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'Parameter url is required. Example: /api/instagram?url=https://www.instagram.com/p/ABC123/'
    });
  }

  // Validate Instagram URL format
  const instagramRegex = /https?:\/\/(www\.)?instagram\.com\/(p|reel|stories)\/([a-zA-Z0-9_-]+)\/?/;
  if (!instagramRegex.test(url)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid Instagram URL. Supported formats: Posts, Reels, and Stories'
    });
  }

  try {
    console.log('Processing Instagram URL:', url);
    
    // Call snapins function to get Instagram data
    const result = await snapins(url);
    
    // Return successful response
    return res.status(200).json({
      success: true,
      data: {
        author: {
          name: result.name,
          username: result.username
        },
        media: [
          ...result.images.map(img => ({ type: 'image', url: img })),
          ...result.videos.map(vid => ({ type: 'video', url: vid }))
        ],
        count: {
          images: result.images.length,
          videos: result.videos.length,
          total: result.images.length + result.videos.length
        }
      }
    });

  } catch (error) {
    console.error('Error fetching Instagram data:', error.message);
    
    // Return error response
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch Instagram data: ' + error.message
    });
  }
}

// Snapins function to extract Instagram data
async function snapins(urlIgPost) {
  const headers = {
    "content-type": "application/x-www-form-urlencoded"
  };

  const response = await fetch("https://snapins.ai/action.php", {
    headers,
    body: "url=" + encodeURIComponent(urlIgPost),
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Failed to download information. Status: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();

  // Check if data is valid
  if (!json.data || !Array.isArray(json.data) || json.data.length === 0) {
    throw new Error('No media data found in the response');
  }

  const name = json.data[0]?.author?.name || "Unknown";
  const username = json.data[0]?.author?.username || "unknown";

  let images = [];
  let videos = [];

  json.data.forEach(v => {
    if (v.type === "image" && v.imageUrl) {
      images.push(v.imageUrl);
    } else if (v.type === "video" && v.videoUrl) {
      videos.push(v.videoUrl);
    }
  });

  // If no media found, throw error
  if (images.length === 0 && videos.length === 0) {
    throw new Error('No images or videos found in the post');
  }

  return { name, username, images, videos };
}
