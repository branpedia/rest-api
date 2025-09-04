// api/list.js
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
    try {
        console.log('Mendapatkan request untuk /api/list');
        
        const apiDir = path.join(process.cwd(), 'api');
        console.log('Membaca direktori API:', apiDir);
        
        // Periksa apakah folder api ada
        if (!fs.existsSync(apiDir)) {
            console.log('Folder api tidak ditemukan, mengembalikan array kosong');
            return res.status(200).json({
                success: true,
                data: [],
                message: 'Folder api tidak ditemukan'
            });
        }
        
        // Baca semua file di folder api
        const files = fs.readdirSync(apiDir);
        console.log('File yang ditemukan di folder api:', files);
        
        // Filter hanya file JavaScript dan hilangkan ekstensi, juga abaikan file yang tidak diinginkan
        const apiList = files
            .filter(file => {
                // Hanya file JavaScript yang bukan file khusus
                const isJsFile = file.endsWith('.js');
                const isSpecialFile = [
                    'list.js', 
                    '_app.js', 
                    '_document.js', 
                    'index.js',
                    'middleware.js',
                    'utils.js',
                    'helpers.js'
                ].includes(file);
                
                return isJsFile && !isSpecialFile;
            })
            .map(file => ({
                name: file.replace('.js', ''),
                path: `/api/${file.replace('.js', '')}`,
                fullPath: path.join(apiDir, file)
            }));
        
        console.log('API yang terdeteksi:', apiList.map(api => api.name));
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        
        res.status(200).json({
            success: true,
            data: apiList,
            count: apiList.length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error membaca direktori API:', error);
        
        // Fallback ke daftar API default jika terjadi error
        const fallbackApiList = [
            { name: 'mediafire', path: '/api/mediafire' },
            { name: 'youtube', path: '/api/youtube' },
            { name: 'instagram', path: '/api/instagram' },
            { name: 'tiktok', path: '/api/tiktok' }
        ];
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        res.status(200).json({
            success: true,
            data: fallbackApiList,
            count: fallbackApiList.length,
            message: 'Menggunakan daftar API fallback karena error: ' + error.message,
            timestamp: new Date().toISOString()
        });
    }
};
