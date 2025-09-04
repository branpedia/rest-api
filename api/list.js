// api/list.js
export default async function handler(req, res) {
  try {
    console.log('Mendapatkan request untuk /api/list');
    
    // Daftar API yang tersedia (hardcoded untuk Vercel)
    const apiList = [
      { name: 'mediafire', path: '/api/mediafire' },
      { name: 'youtube', path: '/api/youtube' },
      { name: 'instagram', path: '/api/instagram' },
      { name: 'tiktok', path: '/api/tiktok' },
      { name: 'ai-toanime', path: '/api/ai-toanime' }
    ];
    
    console.log('Mengembalikan daftar API:', apiList.map(a => a.name));
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    res.status(200).json({
      success: true,
      data: apiList,
      count: apiList.length,
      timestamp: new Date().toISOString(),
      message: 'Daftar API hardcoded untuk Vercel deployment'
    });
    
  } catch (error) {
    console.error('Error generating API list:', error);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    res.status(500).json({
      success: false,
      error: 'Internal server error: ' + error.message
    });
  }
}
