// public/js/api-loader.js
// Fungsi untuk memuat API secara dinamis
async function loadAPIs() {
    const apiEndpointsSection = document.getElementById('api');
    const apiCounter = document.getElementById('api-counter');
    
    if (!apiEndpointsSection) return;
    
    // Tampilkan status loading
    apiEndpointsSection.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i> Memuat daftar API...
        </div>
    `;
    
    if (apiCounter) {
        apiCounter.textContent = "Loading...";
    }
    
    try {
        console.log('Mencoba memuat daftar API dari /api/list');
        const response = await fetch('/api/list');
        
        // Jika endpoint /api/list tidak tersedia, gunakan fallback
        if (!response.ok) {
            console.warn('Endpoint /api/list tidak tersedia, status:', response.status);
            showMessage(apiEndpointsSection, 'Endpoint /api/list tidak tersedia, menggunakan fallback detection', 'warning');
            await loadAPIsFallback();
            return;
        }
        
        const result = await response.json();
        
        if (result.success) {
            console.log('Berhasil memuat daftar API:', result.data);
            renderAPIs(result.data);
        } else {
            console.error('Gagal memuat daftar API:', result.error);
            showMessage(apiEndpointsSection, 'Gagal memuat daftar API: ' + (result.error || 'Unknown error'), 'error');
            await loadAPIsFallback();
        }
    } catch (error) {
        console.error('Error:', error);
        showMessage(apiEndpointsSection, 'Error: ' + error.message, 'error');
        await loadAPIsFallback();
    }
}

// Fallback function untuk mendeteksi API secara manual
async function loadAPIsFallback() {
    const apiEndpointsSection = document.getElementById('api');
    const apiCounter = document.getElementById('api-counter');
    
    if (!apiEndpointsSection) return;
    
    try {
        console.log('Menggunakan fallback detection untuk Vercel');
        showMessage(apiEndpointsSection, 'Menggunakan fallback detection', 'info');
        
        // Daftar API default untuk Vercel
        const defaultAPIs = [
            { name: 'mediafire', path: '/api/mediafire' },
            { name: 'youtube', path: '/api/youtube' },
            { name: 'instagram', path: '/api/instagram' },
            { name: 'tiktok', path: '/api/tiktok' }
        ];
        
        // Coba test endpoint mana yang benar-benar ada
        const availableAPIs = [];
        
        for (const api of defaultAPIs) {
            try {
                const response = await fetch(api.path, { method: 'HEAD' });
                if (response.ok) {
                    availableAPIs.push(api);
                    console.log(`API ${api.name} tersedia`);
                }
            } catch (e) {
                console.log(`API ${api.name} tidak tersedia`);
            }
        }
        
        // Beri delay kecil untuk UX
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (availableAPIs.length > 0) {
            renderAPIs(availableAPIs);
        } else {
            // Jika tidak ada API yang merespon, tampilkan semua sebagai fallback
            renderAPIs(defaultAPIs);
        }
        
    } catch (error) {
        console.error('Error dalam fallback detection:', error);
        showMessage(apiEndpointsSection, 'Error dalam fallback detection: ' + error.message, 'error');
        
        // Fallback terakhir - tampilkan API default
        const fallbackAPIs = [
            { name: 'mediafire', path: '/api/mediafire' },
            { name: 'youtube', path: '/api/youtube' }
        ];
        
        renderAPIs(fallbackAPIs);
    }
}

// Fungsi untuk menampilkan pesan
function showMessage(container, message, type = 'info') {
    const icon = type === 'error' ? 'exclamation-triangle' : 
                 type === 'warning' ? 'exclamation-circle' : 'info-circle';
    
    container.innerHTML = `
        <div class="message-state ${type}">
            <i class="fas fa-${icon}"></i>
            <p>${message}</p>
        </div>
    `;
}

// Fungsi untuk merender API ke halaman
function renderAPIs(apiList) {
    const apiEndpointsSection = document.getElementById('api');
    const apiCounter = document.getElementById('api-counter');
    
    if (!apiEndpointsSection) return;
    
    // Update counter
    if (apiCounter) {
        apiCounter.textContent = `${apiList.length} Endpoints`;
    }
    
    // Hapus konten lama
    apiEndpointsSection.querySelectorAll('.endpoint, .loading-state, .message-state').forEach(el => el.remove());
    
    // Jika tidak ada API
    if (apiList.length === 0) {
        apiEndpointsSection.innerHTML += `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <h3>Tidak Ada API yang Tersedia</h3>
                <p>Tambahkan file API ke folder /api untuk melihatnya di sini.</p>
            </div>
        `;
        return;
    }
    
    // Kelompokkan API berdasarkan kategori
    const categories = {
        'Downloader': [],
        'AI Services': [],
        'Tools': []
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
            categories['Tools'].push(api);
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
    endpointDiv.id = `endpoint-${api.name}`;
    
    // Dapatkan parameter default berdasarkan nama API
    let method = 'GET';
    let params = [];
    let exampleResponse = {
        success: true,
        data: { message: `Response from ${api.name} API` }
    };
    
    if (api.name.includes('mediafire')) {
        params = [{ name: 'url', required: true }];
        exampleResponse = {
            success: true,
            data: {
                name: "contoh-file.zip",
                size: "5.2MB",
                extension: "zip",
                uploaded: "2023-10-05 10:30:45",
                downloadUrl: "https://download.mediafire.com/contoh-file.zip"
            }
        };
    } else if (api.name.includes('youtube')) {
        params = [{ name: 'url', required: true }];
        exampleResponse = {
            success: true,
            data: {
                title: "Contoh Video YouTube",
                duration: "10:30",
                thumbnail: "https://i.ytimg.com/vi/abc123/default.jpg",
                downloadUrl: "https://api.example.com/download/youtube/abc123"
            }
        };
    } else if (api.name.includes('instagram') || api.name.includes('tiktok')) {
        params = [{ name: 'url', required: true }];
        exampleResponse = {
            success: true,
            data: {
                type: "video",
                caption: "Caption dari konten",
                downloadUrl: `https://api.example.com/download/${api.name}/abc123`,
                thumbnail: `https://api.example.com/thumbnail/${api.name}/abc123`,
                duration: "0:15",
                size: "3.2MB"
            }
        };
    } else if (api.name.includes('ai') || api.name.includes('toanime')) {
        params = [{ name: 'image', required: true }];
        exampleResponse = {
            success: true,
            data: {
                original: "base64_image_data",
                result: "base64_image_data"
            }
        };
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
        const placeholder = param.name === 'url' ? 'https://example.com' : 
                           param.name === 'image' ? 'URL gambar atau base64' : 
                           `Masukkan ${param.name}`;
        
        formInputs += `
            <div class="parameter__name ${param.required ? 'required' : ''}">
                ${param.name}${param.required ? '<span>&nbsp;*</span>' : ''}
            </div>
            <div class="input-group">
                <input type="text" id="test-${api.name}-${param.name}" 
                       placeholder="${placeholder}" class="url-input">
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
<pre>${JSON.stringify(exampleResponse, null, 2)}</pre>
        </div>
        <div class="test-form">
            <h4>Test Endpoint</h4>
            ${formInputs}
            <div class="input-group">
                <button class="test-btn" onclick="testEndpoint('${api.name}', '${api.path}', ${JSON.stringify(params)})">
                    <i class="fas fa-bolt"></i> Test
                </button>
            </div>
            <div id="testResult-${api.name}" class="test-result"></div>
        </div>
    `;
    
    return endpointDiv;
}

// Fungsi untuk test endpoint
window.testEndpoint = function(apiName, endpoint, params) {
    const resultDiv = document.getElementById(`testResult-${apiName}`);
    const testBtn = document.querySelector(`#endpoint-${apiName} .test-btn`);
    
    // Bangun query parameters
    const queryParams = {};
    let hasError = false;
    
    params.forEach(param => {
        const input = document.getElementById(`test-${apiName}-${param.name}`);
        if (param.required && (!input || !input.value.trim())) {
            showTestError(resultDiv, `${param.name} tidak boleh kosong!`);
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
    testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    testBtn.disabled = true;
    
    resultDiv.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Memproses request...</p>
        </div>
    `;
    resultDiv.className = 'test-result';
    resultDiv.style.display = 'block';
    
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
                showTestSuccess(resultDiv, data);
            } else {
                showTestError(resultDiv, data.error, data.tips);
            }
        })
        .catch(error => {
            // Kembalikan tampilan tombol
            testBtn.innerHTML = originalText;
            testBtn.disabled = false;
            showTestError(resultDiv, 'Error: ' + error.message);
        });
};

// Fungsi untuk menampilkan hasil sukses
function showTestSuccess(resultDiv, data) {
    const formattedData = JSON.stringify(data, null, 2);
    
    resultDiv.innerHTML = `
        <div class="result-header">
            <span class="result-title">✅ Success</span>
            <button class="copy-btn" onclick="copyToClipboard(${JSON.stringify(formattedData)})">
                <i class="fas fa-copy"></i> Copy Result
            </button>
        </div>
        <pre>${formattedData}</pre>
        ${data.data && data.data.downloadUrl ? `
        <div style="margin-top: 10px;">
            <a href="${data.data.downloadUrl}" target="_blank" class="download-link">
                <i class="fas fa-download"></i> Download File
            </a>
        </div>
        ` : ''}
    `;
    resultDiv.className = 'test-result success';
    resultDiv.style.display = 'block';
}

// Fungsi untuk menampilkan error pada test
function showTestError(resultDiv, errorMessage, tips = null) {
    resultDiv.innerHTML = `
        <div class="result-header">
            <span class="result-title">❌ Error</span>
        </div>
        <p class="error-message">${errorMessage}</p>
        ${tips ? `<p class="error-tips">Tips: ${tips}</p>` : ''}
    `;
    resultDiv.className = 'test-result error';
    resultDiv.style.display = 'block';
}

// Fungsi untuk copy ke clipboard
window.copyToClipboard = function(text) {
    // Handle both string and JSON stringified text
    const textToCopy = typeof text === 'string' ? text : JSON.stringify(text);
    
    navigator.clipboard.writeText(textToCopy).then(() => {
        // Tampilkan feedback bahwa teks telah disalin
        const toast = document.createElement('div');
        toast.className = 'copy-toast';
        toast.textContent = 'Copied to clipboard!';
        document.body.appendChild(toast);
        
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy: ', err);
        alert('Gagal menyalin teks: ' + err.message);
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
