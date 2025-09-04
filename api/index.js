const fs = require('fs');
const path = require('path');

// Fungsi untuk memindai dan mendaftarkan semua API
function scanAPIs() {
  const apiDir = path.join(__dirname);
  const files = fs.readdirSync(apiDir);
  const apiList = [];

  files.forEach(file => {
    if (file !== 'index.js' && file.endsWith('.js')) {
      const apiName = path.basename(file, '.js');
      apiList.push({
        name: apiName,
        path: `/api/${apiName}`,
        file: file
      });
    }
  });

  return apiList;
}

// Fungsi untuk mendapatkan dokumentasi API
function getAPIDocumentation(apiName) {
  try {
    const apiModule = require(`./${apiName}`);
    return apiModule.documentation || {};
  } catch (error) {
    return {
      name: apiName,
      method: 'GET',
      description: `API for ${apiName}`,
      parameters: [{ name: 'url', required: true, type: 'string' }]
    };
  }
}

// Endpoint untuk mendapatkan daftar API
function setupAPIEndpoints(app) {
  // Endpoint untuk mendapatkan semua API yang tersedia
  app.get('/api/list', (req, res) => {
    const apis = scanAPIs();
    res.json({ success: true, data: apis });
  });

  // Endpoint untuk mendapatkan dokumentasi spesifik API
  app.get('/api/docs/:apiName', (req, res) => {
    const apiName = req.params.apiName;
    const documentation = getAPIDocumentation(apiName);
    res.json({ success: true, data: documentation });
  });
}

module.exports = {
  scanAPIs,
  getAPIDocumentation,
  setupAPIEndpoints
};
