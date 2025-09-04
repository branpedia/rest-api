// Fungsi untuk memuat API secara dinamis
async function loadAPIs() {
    try {
        // Menggunakan fetch untuk mendapatkan daftar API
        const response = await fetch('/api/list');
        
        // Jika endpoint /api/list tidak tersedia, gunakan fallback
        if (!response.ok) {
            console.warn('Endpoint /api/list tidak tersedia, menggunakan fallback detection');
            await loadAPIsFallback();
            return;
        }
        
        const result = await response.json();
        
        if (result.success) {
            renderAPIs(result.data);
        } else {
            console.error('Gagal memuat daftar API');
            await loadAPIsFallback();
        }
    } catch (error) {
        console.error('Error:', error);
        await loadAPIsFallback();
    }
}

// Fallback function untuk mendeteksi API secara manual
async function loadAPIsFallback() {
    try {
        // Daftar API default jika tidak bisa mendapatkan dari server
        const defaultAPIs = [
            { name: 'mediafire', path: '/api/mediafire' },
            { name: 'youtube', path: '/api/youtube' },
            { name: 'instagram', path: '/api/instagram' },
            { name: 'tiktok', path: '/api/tiktok' }
        ];
        
        renderAPIs(defaultAPIs);
    } catch (error) {
        console.error('Error dalam fallback detection:', error);
    }
}

// Fungsi untuk merender API ke halaman
function renderAPIs(apiList) {
    const apiEndpointsSection = document.getElementById('api');
    if (!apiEndpointsSection) return;
    
    // Hapus konten lama (kecuali judul)
    const oldContent = apiEndpointsSection.querySelectorAll('.endpoint');
    oldContent.forEach(element => {
        if (!element.closest('h3')) {
            element.remove();
        }
    });
    
    // Kelompokkan API berdasarkan kategori
    const categories = {
        'Downloader': [],
        'AI Services': [],
        'Other': []
    };
    
    apiList.forEach(api => {
        // Tentukan kategori berdasarkan nama API
        if (api.name.includes('mediafire') || api.name.includes('youtube') || 
            api.name.includes('instagram') || api.name.includes('tiktok') ||
            api.name.includes('download')) {
            categories['Downloader'].push(api);
        } else if (api.name.includes('ai') || api.name.includes('toanime') ||
                  api.name.includes('chatgpt')) {
            categories['AI Services'].push(api);
        } else {
            categories['Other'].push(api);
        }
    });
    
    // Render API berdasarkan kategori
    for (const [category, apis] of Object.entries(categories)) {
        if (apis.length > 0) {
            const categoryTitle = document.createElement('h3');
            categoryTitle.textContent = category;
            apiEndpointsSection.appendChild(categoryTitle);
            
            apis.forEach(api => {
                const endpointElement = createEndpointElement(api);
                apiEndpointsSection.appendChild(endpointElement);
            });
        }
    }
}

// Fungsi untuk membuat elemen endpoint
function createEndpointElement(api) {
    const endpointDiv = document.createElement('div');
    endpointDiv.className = 'endpoint';
    
    // Dapatkan parameter default berdasarkan nama API
    let method = 'GET';
    let params = [];
    
    if (api.name.includes('mediafire') || api.name.includes('youtube') || 
        api.name.includes('instagram') || api.name.includes('tiktok')) {
        params = [{ name: 'url', required: true }];
    } else if (api.name.includes('toanime')) {
        params = [{ name: 'image_url', required: false }];
    }
    
    // Bangun URL dengan parameter
    let urlWithParams = api.path;
    if (params.length > 0) {
        urlWithParams += '?';
        params.forEach((param, index) => {
            urlWithParams += `${param.name}={${param.name}}`;
            if (index < params.length - 1) {
                urlWithParams += '&';
            }
        });
    }
    
    // Bangun form input berdasarkan parameter
    let formInputs = '';
    params.forEach(param => {
        formInputs += `
            <div class="parameter__name ${param.required ? 'required' : ''}">
                ${param.name}${param.required ? '<span>&nbsp;*</span>' : ''}
            </div>
            <div class="input-group">
                <input type="text" id="test${api.name}${param.name}" 
                       placeholder="Masukkan ${param.name}" class="url-input">
            </div>
        `;
    });
    
    endpointDiv.innerHTML = `
        <div class="endpoint-header">
            <span class="endpoint-method">${method}</span>
            <span class="endpoint-url">${urlWithParams}</span>
            <button class="copy-btn" data-endpoint="${api.path}">
                <i class="fas fa-copy"></i> Copy Endpoint
            </button>
        </div>
        <div class="response">
            <div class="response-header">
                <span class="response-title">Response</span>
                <button class="copy-result-btn"><i class="fas fa-copy"></i> Copy Result</button>
            </div>
{
  "success": true,
  "data": {
    "message": "Response from ${api.name} API"
  }
}
        </div>
        <div class="test-form">
            <h4>Test Endpoint</h4>
            ${formInputs}
            <div class="input-group">
                <button class="test-btn" onclick="testEndpoint('${api.name}', '${api.path}', ${JSON.stringify(params)})">
                    <i class="fas fa-bolt"></i> Test
                </button>
            </div>
            <div id="testResult${api.name}" class="test-result"></div>
        </div>
    `;
    
    return endpointDiv;
}

// Fungsi untuk test endpoint (diperbarui)
window.testEndpoint = function(apiName, endpoint, params) {
    const resultDiv = document.getElementById(`testResult${apiName}`);
    const testBtn = document.querySelector(`#testResult${apiName}`).previousElementSibling.querySelector('.test-btn');
    
    // Bangun query parameters
    const queryParams = {};
    let hasError = false;
    
    params.forEach(param => {
        const input = document.getElementById(`test${apiName}${param.name}`);
        if (param.required && (!input || !input.value.trim())) {
            showError(resultDiv, `${param.name} tidak boleh kosong!`);
            hasError = true;
            return;
        }
        
        if (input && input.value.trim()) {
            queryParams[param.name] = input.value.trim();
        }
    });
    
    if (hasError) return;
    
    // Tampilkan loading
    const originalText = testBtn.innerHTML;
    testBtn.innerHTML = '<span class="loading-spinner"></span> Loading...';
    testBtn.disabled = true;
    
    resultDiv.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <span class="loading-spinner"></span>
            <p>Memproses request...</p>
        </div>
    `;
    resultDiv.className = 'test-result';
    
    // Build API URL
    let apiUrl = `${window.location.origin}${endpoint}`;
    const queryString = Object.keys(queryParams)
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`)
        .join('&');
    
    if (queryString) {
        apiUrl += `?${queryString}`;
    }
    
    // Panggil API
    fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // Kembalikan tampilan tombol
            testBtn.innerHTML = originalText;
            testBtn.disabled = false;
            
            // Tampilkan hasil
            if (data.success) {
                showSuccess(resultDiv, data);
            } else {
                showError(resultDiv, data.error, data.tips);
            }
        })
        .catch(error => {
            // Kembalikan tampilan tombol
            testBtn.innerHTML = originalText;
            testBtn.disabled = false;
            showError(resultDiv, 'Error: ' + error.message);
        });
};

// Fungsi untuk menampilkan hasil sukses
function showSuccess(resultDiv, data) {
    const formattedData = JSON.stringify(data, null, 2);
    const escapedData = formattedData.replace(/'/g, "\\'");
    
    resultDiv.innerHTML = `
        <div class="result-header">
            <span class="result-title">✅ Success</span>
            <button class="copy-btn" onclick="copyToClipboard('${escapedData}')">
                <i class="fas fa-copy"></i> Copy Result
            </button>
        </div>
        <pre>${formattedData}</pre>
        ${data.data && data.data.downloadUrl ? `
        <div style="margin-top: 10px;">
            <a href="${data.data.downloadUrl}" target="_blank" style="color: var(--primary-light); word-break: break-all;">
                <i class="fas fa-download"></i> Download File
            </a>
        </div>
        ` : ''}
    `;
    resultDiv.className = 'test-result success';
}

// Fungsi untuk menampilkan error
function showError(resultDiv, errorMessage, tips = null) {
    resultDiv.innerHTML = `
        <div class="result-header">
            <span class="result-title">❌ Error</span>
        </div>
        <p style="color: var(--accent-red);">${errorMessage}</p>
        ${tips ? `<p style="color: var(--text-secondary); font-size: 0.9rem;">Tips: ${tips}</p>` : ''}
    `;
    resultDiv.className = 'test-result error';
}

// Fungsi untuk copy ke clipboard
window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
        // Tampilkan feedback bahwa teks telah disalin
        const toast = document.createElement('div');
        toast.textContent = 'Copied to clipboard!';
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: var(--primary);
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            z-index: 1000;
            font-size: 0.9rem;
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
};

// Muat API saat halaman dimuat
document.addEventListener('DOMContentLoaded', function() {
    // Hanya jalankan di halaman API Endpoints
    if (document.getElementById('api')) {
        loadAPIs();
    }
    
    // Tambahkan event listener untuk tombol copy endpoint
    document.addEventListener('click', function(e) {
        if (e.target.closest('.copy-btn')) {
            const button = e.target.closest('.copy-btn');
            const endpoint = button.getAttribute('data-endpoint');
            
            if (endpoint) {
                const fullUrl = window.location.origin + endpoint;
                copyToClipboard(fullUrl);
            }
        }
        
        if (e.target.closest('.copy-result-btn')) {
            const preElement = e.target.closest('.endpoint').querySelector('pre');
            if (preElement) {
                copyToClipboard(preElement.textContent);
            }
        }
    });
});
