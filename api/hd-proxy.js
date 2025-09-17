// api/hd-proxy.js
export default async function handler(request, response) {
  // Set CORS headers
  response.setHeader('Access-Control-Allow-Credentials', true);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request
  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  try {
    // Get parameters from query string
    const { filename, scale = '4' } = request.query;

    if (!filename) {
      return response.status(400).json({ error: 'Filename is required' });
    }

    // Reconstruct the original URL
    const originalUrl = `https://get1.imglarger.com/upscaler/results/${filename}`;
    
    // Fetch the original image from imglarger
    const imageResponse = await fetch(originalUrl);
    
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }
    
    // Get the image buffer and content type
    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    
    // Set appropriate headers and send the image
    response.setHeader('Content-Type', contentType);
    response.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    response.setHeader('Content-Disposition', `inline; filename="hd_${scale}x_${filename}"`);
    
    response.status(200).send(buffer);
  } catch (error) {
    console.error('HD Proxy error:', error);
    response.status(500).json({ error: 'Failed to fetch image' });
  }
}
