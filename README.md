# Branpedia REST API

REST API untuk downloader berbagai platform seperti MediaFire, YouTube, Instagram, dan TikTok.

## Fitur

- MediaFire Downloader
- YouTube Downloader (placeholder)
- Instagram Downloader (placeholder)
- TikTok Downloader (placeholder)
- Responsif untuk mobile dan desktop
- Antarmuka yang user-friendly

## Instalasi

1. Clone repository ini
2. Install dependencies: `npm install`
3. Jalankan server: `npm start`
4. Akses di browser: `http://localhost:3000`

## API Endpoints

- `GET /api/mediafire?url={mediafire_url}` - Ekstrak link download dari MediaFire
- `GET /api/youtube?url={youtube_url}` - Ekstrak info video dari YouTube
- `GET /api/instagram?url={instagram_url}` - Ekstrak media dari Instagram
- `GET /api/tiktok?url={tiktok_url}` - Ekstrak video dari TikTok
- `GET /api/stats` - Statistik penggunaan API
- `GET /api/health` - Health check endpoint

## Deployment

### Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. Login: `vercel login`
3. Deploy: `vercel`

### Manual

1. Build project: `npm run build`
2. Deploy ke platform pilihan Anda

## Kontribusi

Silakan fork repository ini dan buat pull request untuk perubahan yang ingin Anda usulkan.

## Lisensi

MIT License - lihat file LICENSE untuk detail lengkap.
