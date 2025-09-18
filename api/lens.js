const s = {
  tools: {
    async hit(description, url, options, returnType = 'text') {
      try {
        const response = await fetch(url, options);
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}\n${await response.text() || '(response body kosong)'}`);
        }
        if (returnType === 'text') {
          const data = await response.text();
          return { data, response };
        } else if (returnType === 'json') {
          const data = await response.json();
          return { data, response };
        } else {
          throw new Error(`invalid returnType param.`);
        }
      } catch (e) {
        throw new Error(`hit ${description} failed. ${e.message}`);
      }
    }
  },

  get baseUrl() {
    return 'https://serpapi.com';
  },

  get baseHeaders() {
    return {
      'accept-encoding': 'gzip, deflate, br, zstd',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0'
    };
  },

  // SerpApi tidak butuh cookie — cukup API key
  async getCookie() {
    return { api_key: '99a605260e609bb3b58fbe12792cc316686cb7e10e447a38f6bd6360e6b68dbf' };
  },

  // Tidak perlu CAPTCHA handling — SerpApi sudah menangani
  async ifCaptcha() {
    return {};
  },

  // 🔥 Fungsi utama: panggil Google Lens API SerpApi
  async googleLens(imageUrl, options = {}) {
    const { api_key } = await this.getCookie();
    const { hl = 'en', country = 'us', type = 'visual_matches', q = '' } = options;

    const pathname = '/search.json';
    const url = new URL(pathname, this.baseUrl);

    const params = new URLSearchParams({
      engine: 'google_lens',
      url: imageUrl,
      api_key,
      hl,
      country,
      type,
      ...(q && { q }) // Hanya tambahkan jika ada
    });

    url.search = params.toString();

    const headers = this.baseHeaders;
    const { data } = await this.tools.hit('Google Lens', url, { headers }, 'json');

    // Cek status dari SerpApi
    if (data.search_metadata?.status === 'Error') {
      throw new Error(data.search_metadata?.error || 'Google Lens returned error');
    }

    if (data.search_metadata?.status !== 'Success') {
      throw new Error('Google Lens hasn\'t returned any results for this query.');
    }

    // Ekstrak data relevan
    const visualMatches = (data.visual_matches || []).map(match => ({
      title: match.title,
      link: match.link,
      source: match.source,
      thumbnail: match.thumbnail,
      image: match.image,
      price: match.price,
      in_stock: match.in_stock,
      condition: match.condition,
      rating: match.rating,
      reviews: match.reviews
    }));

    const relatedSearches = (data.related_content || []).map(item => ({
      title: item.query,
      url: item.link
    }));

    return {
      searchUrl: data.search_metadata?.google_lens_url || `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`,
      mainImage: imageUrl,
      visualMatches: visualMatches.slice(0, 10),
      relatedSearches: relatedSearches.slice(0, 5),
      metadata: {
        processedAt: data.search_metadata?.processed_at,
        total_time_taken: data.search_metadata?.total_time_taken,
        id: data.search_metadata?.id
      }
    };
  },

  // Fungsi utama yang dipanggil oleh handler
  async analyze(imageUrl, options = {}) {
    // Validasi awal URL
    new URL(imageUrl); // throw jika tidak valid

    // Cek protokol
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      throw new Error('URL gambar harus menggunakan http:// atau https://');
    }

    // Cek ekstensi gambar (opsional, untuk keamanan)
    const validImageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'];
    const urlLower = imageUrl.toLowerCase();
    const hasValidExt = validImageExtensions.some(ext => urlLower.endsWith(ext));
    if (!hasValidExt) {
      console.warn('Peringatan: URL gambar tidak memiliki ekstensi umum. Tetap dilanjutkan...');
    }

    const result = await this.googleLens(imageUrl, options);
    return result;
  }
};

export default async function handler(request, response) {
  // Set CORS headers
  response.setHeader('Access-Control-Allow-Credentials', true);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request
  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  // Hanya izinkan GET
  if (request.method !== 'GET') {
    return response.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { imageUrl, retry = 0, hl = 'en', country = 'us', type = 'visual_matches', q = '' } = request.query;

  if (!imageUrl) {
    return response.status(400).json({ success: false, error: 'Parameter imageUrl diperlukan' });
  }

  try {
    // Buat objek opsi untuk googleLens
    const options = { hl, country, type, q };

    // Panggil SerpApi Google Lens
    const result = await s.analyze(imageUrl, options);

    return response.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error fetching Google Lens data:', error.message);

    // Retry logic
    if (parseInt(retry) < 2) {
      console.log(`Retrying... Attempt ${parseInt(retry) + 1}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }

    return response.status(500).json({
      success: false,
      error: 'Gagal mengambil data dari Google Lens. Pastikan URL gambar valid, bisa diakses publik, dan API key SerpApi aktif.',
      details: error.message,
      hint: 'Gunakan URL dari imgur.com, wikimedia.org, atau unsplash.com. Contoh: https://i.imgur.com/HBrB8p0.png'
    });
  }
}
