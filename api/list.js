// api/list.js
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
    try {
        const apiDir = path.join(process.cwd(), 'api');
        
        // Periksa apakah folder api ada
        if (!fs.existsSync(apiDir)) {
            return res.status(200).json({
                success: true,
                data: []
            });
        }
        
        // Baca semua file di folder api
        const files = fs.readdirSync(apiDir);
        
        // Filter hanya file JavaScript dan hilangkan ekstensi
        const apiList = files
            .filter(file => file.endsWith('.js') && file !== 'list.js')
            .map(file => ({
                name: file.replace('.js', ''),
                path: `/api/${file.replace('.js', '')}`
            }));
        
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json({
            success: true,
            data: apiList
        });
        
    } catch (error) {
        console.error('Error reading API directory:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};
