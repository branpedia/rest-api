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

  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  if (request.method !== 'GET') {
    return response.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { userId, zoneId } = request.query;

  if (!userId || !zoneId) {
    return response.status(400).json({ 
      success: false, 
      error: 'Parameter userId dan zoneId diperlukan' 
    });
  }

  try {
    // Get token first
    const tokenResponse = await cloudscraper.get('https://www.gempaytopup.com');
    const tokenDom = new JSDOM(tokenResponse);
    const tokenDocument = tokenDom.window.document;
    
    const csrfTokenMeta = tokenDocument.querySelector('meta[name="csrf-token"]');
    const csrfToken = csrfTokenMeta ? csrfTokenMeta.getAttribute('content') : null;
    
    if (!csrfToken) {
      throw new Error('CSRF token tidak ditemukan');
    }

    // Make POST request
    const postData = {
      uid: userId,
      zone: zoneId
    };

    const stalkResponse = await cloudscraper.post({
      uri: 'https://www.gempaytopup.com/stalk-ml',
      headers: {
        'X-CSRF-Token': csrfToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(postData)
    });

    const result = JSON.parse(stalkResponse);
    
    return response.status(200).json({
      success: true,
      data: {
        username: result.username || 'Tidak tersedia',
        region: result.region || 'Tidak tersedia',
        success: result.success || false
      }
    });

  } catch (error) {
    console.error('Error:', error);
    return response.status(500).json({ 
      success: false, 
      error: 'Gagal mengambil data. Pastikan userId dan zoneId valid.' 
    });
  }
}
