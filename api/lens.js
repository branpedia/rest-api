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

  // Tidak perlu cookie karena SerpApi pakai API key
  async getCookie() {
    // SerpApi tidak butuh cookie — cukup API key
    return { api_key: '99a605260e609bb3b58fbe12792cc316686cb7e10e447a38f6bd6360e6b68dbf' };
  },

  // Tidak perlu captcha handling karena SerpApi sudah menangani itu
  async ifCaptcha() {
    return {}; // dummy, tidak diperlukan
  },

  // Panggil API Google Lens SerpApi
  async googleLens(imageUrl, api_key) {
    const pathname = '/search.json';
    const url = new URL(pathname, this.baseUrl);
    const params = new URLSearchParams({
      engine: 'google_lens',
      url: imageUrl,
      api_key: api_key
    });
    url.search = params.toString();

    const headers = this.baseHeaders;
    const { data } = await this.tools.hit('Google Lens', url, { headers }, 'json');

    if (data.error) {
      throw new Error(data.error);
    }

    // Ekstrak data penting
    const visualMatches = (data.visual_matches || []).map(match => ({
      title: match.title,
      link: match.link,
      source: match.source,
      thumbnail: match.thumbnail,
      image: match.image
    }));

    const relatedSearches = (data.related_content || []).map(item => ({
      title: item.query,
      url: item.link
    }));

    return {
      searchUrl: data.search_metadata?.google_lens_url || `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`,
      mainImage: imageUrl,
      visualMatches: visualMatches.slice(0, 10),
      relatedSearches: relatedSearches.slice(0, 5)
    };
  },

  // Fungsi utama: ambil gambar, kembalikan hasil Google Lens
  async analyze(imageUrl) {
    const { api_key } = await this.getCookie();
    const result = await this.googleLens(imageUrl, api_key);
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

  // Handle OPTIONS request for CORS
  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  // Only allow GET requests
  if (request.method !== 'GET') {
    return response.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { imageUrl, retry = 0 } = request.query;

  if (!imageUrl) {
    return response.status(400).json({ success: false, error: 'Parameter imageUrl diperlukan' });
  }

  try {
    // Validasi URL gambar
    new URL(imageUrl); // akan throw jika tidak valid
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      throw new Error('URL harus menggunakan protokol http atau https');
    }

    // Panggil SerpApi Google Lens
    const result = await s.analyze(imageUrl);

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
      details: error.message
    });
  }
}
