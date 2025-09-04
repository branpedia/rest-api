export default async function handler(req, res) {
  // Handle preflight request for CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  // Get URL parameter
  const { url } = req.query;
  
  // Check if URL parameter is provided
  if (!url) {
    return res.status(400).json({ 
      success: false, 
      error: 'Parameter url diperlukan' 
    });
  }

  // Validate Instagram URL format
  const instagramRegex = /https?:\/\/(www\.)?instagram\.com\/(p|reel|stories)\/[a-zA-Z0-9_-]+\/?/;
  if (!instagramRegex.test(url)) {
    return res.status(400).json({ 
      success: false, 
      error: 'URL Instagram tidak valid. Format yang didukung: post, reel, stories' 
    });
  }

  try {
    // Call the snapins function to get Instagram data
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
        ]
      }
    });
    
  } catch (error) {
    console.error('Error fetching Instagram data:', error);
    
    // Return error response
    return res.status(500).json({ 
      success: false, 
      error: 'Gagal mengambil data dari Instagram: ' + error.message 
    });
  }
}

// Snapins function from your code
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
    throw new Error(`Gagal mendownload informasi. ${response.status} ${response.statusText}`);
  }

  const json = await response.json();

  const name = json.data?.[0]?.author?.name || "(no name)";
  const username = json.data?.[0]?.author?.username || "(no username)";

  let images = [];
  let videos = [];

  json.data?.forEach(v => {
    if (v.type === "image") {
      images.push(v.imageUrl);
    } else if (v.type === "video") {
      videos.push(v.videoUrl);
    }
  });

  return { name, username, images, videos };
}
