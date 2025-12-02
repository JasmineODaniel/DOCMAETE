// DOCMATE - Camera and OCR Management
// Handles camera access, image capture, and OCR processing

let cameraStream = null;
let cameraVideo = null;
let cameraCanvas = null;
let capturedImages = [];

// Initialize camera functionality
function initializeCamera() {
    cameraVideo = document.getElementById('cameraVideo');
    cameraCanvas = document.getElementById('cameraCanvas');
    
    // Load captured images from storage
    capturedImages = JSON.parse(localStorage.getItem('docmate_captured_images')) || [];
    displayCapturedImages();
}

// Start camera
async function startCamera() {
    try {
        // Request camera access
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'environment' // Use back camera on mobile
            }
        });
        
        if (cameraVideo) {
            cameraVideo.srcObject = cameraStream;
            cameraVideo.style.display = 'block';
            
            // Hide placeholder and show controls
            const placeholder = document.getElementById('cameraPlaceholder');
            const controls = document.getElementById('cameraControls');
            const startBtn = document.getElementById('startCameraBtn');
            const stopBtn = document.getElementById('stopCameraBtn');
            
            if (placeholder) placeholder.style.display = 'none';
            if (controls) controls.style.display = 'block';
            if (startBtn) startBtn.style.display = 'none';
            if (stopBtn) stopBtn.style.display = 'inline-flex';
            
            showToast('Camera started successfully!', 'success');
        }
        
    } catch (error) {
        console.error('Camera access error:', error);
        showToast('Could not access camera. Please check permissions.', 'error');
    }
}

// Stop camera
function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    
    if (cameraVideo) {
        cameraVideo.srcObject = null;
        cameraVideo.style.display = 'none';
    }
    
    // Show placeholder and hide controls
    const placeholder = document.getElementById('cameraPlaceholder');
    const controls = document.getElementById('cameraControls');
    const startBtn = document.getElementById('startCameraBtn');
    const stopBtn = document.getElementById('stopCameraBtn');
    
    if (placeholder) placeholder.style.display = 'block';
    if (controls) controls.style.display = 'none';
    if (startBtn) startBtn.style.display = 'inline-flex';
    if (stopBtn) stopBtn.style.display = 'none';
    
    showToast('Camera stopped', 'info');
}

// Capture image from camera
async function captureImage() {
    if (!cameraVideo || !cameraCanvas) {
        showToast('Camera not properly initialized', 'error');
        return;
    }
    
    if (!cameraStream) {
        showToast('Camera is not active', 'warning');
        return;
    }
    
    try {
        // Set canvas dimensions to match video
        const context = cameraCanvas.getContext('2d');
        cameraCanvas.width = cameraVideo.videoWidth;
        cameraCanvas.height = cameraVideo.videoHeight;
        
        // Draw current video frame to canvas
        context.drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);
        
        // Convert canvas to blob
        const imageDataUrl = cameraCanvas.toDataURL('image/jpeg', 0.8);
        
        showLoading('Processing image with OCR...');
        
        // Process image with OCR
        const ocrResult = await processImageWithOCR(imageDataUrl);
        
        // Save captured image with OCR result
        const capturedImage = {
            id: Date.now(),
            imageData: imageDataUrl,
            ocrText: ocrResult.text,
            confidence: ocrResult.confidence,
            timestamp: new Date().toISOString(),
            processed: true
        };
        
        capturedImages.unshift(capturedImage);
        localStorage.setItem('docmate_captured_images', JSON.stringify(capturedImages));
        
        // Create document from OCR text if substantial content found
        if (ocrResult.text && ocrResult.text.trim().length > 50) {
            await createDocumentFromOCR(capturedImage);
        }
        
        displayCapturedImages();
        hideLoading();
        showToast('Image captured and processed successfully!', 'success');
        
    } catch (error) {
        console.error('Image capture error:', error);
        hideLoading();
        showToast('Error capturing image: ' + error.message, 'error');
    }
}

// Process image with OCR using Tesseract.js
async function processImageWithOCR(imageDataUrl) {
    try {
        if (typeof Tesseract === 'undefined') {
            throw new Error('OCR library not loaded');
        }
        
        const { data } = await Tesseract.recognize(imageDataUrl, 'eng', {
            logger: m => {
                if (m.status === 'recognizing text') {
                    const progress = Math.round(m.progress * 100);
                    const loadingText = document.getElementById('loadingText');
                    if (loadingText) {
                        loadingText.textContent = `Processing OCR... ${progress}%`;
                    }
                }
            }
        });
        
        return {
            text: data.text,
            confidence: data.confidence,
            words: data.words
        };
        
    } catch (error) {
        console.error('OCR processing error:', error);
        return {
            text: 'OCR processing failed. Please try again.',
            confidence: 0,
            words: []
        };
    }
}

// Create document from OCR text
async function createDocumentFromOCR(capturedImage) {
    try {
        const book = {
            id: Date.now(),
            title: `Captured Document ${new Date().toLocaleDateString()}`,
            content: capturedImage.ocrText,
            originalContent: capturedImage.ocrText,
            contentType: 'ocr',
            pages: splitIntoPages(capturedImage.ocrText),
            currentPage: 0,
            uploadDate: new Date().toISOString(),
            sourceImage: capturedImage.id,
            ocrConfidence: capturedImage.confidence
        };
        
        if (!book.pages || book.pages.length === 0) {
            book.pages = [capturedImage.ocrText || 'No text could be extracted from the image.'];
        }
        
        // Add to books
        currentBooks.unshift(book);
        localStorage.setItem('docmate_books', JSON.stringify(currentBooks));
        
        // Update displays
        displayLibrary();
        updateCounts();
        
        showToast('Document created from captured image!', 'success');
        
    } catch (error) {
        console.error('Error creating document from OCR:', error);
        showToast('Error creating document from image', 'error');
    }
}

// Display captured images
function displayCapturedImages() {
    const gallery = document.getElementById('imageGallery');
    if (!gallery) return;
    
    if (capturedImages.length === 0) {
        gallery.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-images empty-icon"></i>
                <h3 class="empty-title">No images captured yet</h3>
                <p class="empty-desc">Use the camera to capture documents for OCR processing</p>
            </div>
        `;
        return;
    }
    
        gallery.innerHTML = capturedImages.map(image => `
            <div class="image-card">
                <div class="card-header">
                    <div>
                        <div class="card-title">Captured Image</div>
                        <div class="card-meta">${new Date(image.timestamp).toLocaleDateString()}</div>
                    </div>
                <div class="card-actions">
                    <button class="edit-btn" onclick="viewImageDetails(${image.id})" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="edit-btn" onclick="deleteImage(${image.id})" title="Delete Image">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                </div>
                <div class="image-preview" style="margin: 1rem 0;">
                    <img src="${image.imageData}" alt="Captured document" style="max-width: 100%; height: 150px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border-color);">
                </div>
                <div class="card-content">
                    <p><strong>OCR Confidence:</strong> ${Math.round(image.confidence || 0)}%</p>
                    <p><strong>Text Preview:</strong></p>
                    <p style="font-size: 0.875rem; color: var(--text-secondary); max-height: 60px; overflow: hidden;">
                        ${(image.ocrText || 'No text extracted').substring(0, 100)}...
                    </p>
                </div>
                <div class="card-actions" style="margin-top: 1rem;">
                    <button class="btn-secondary" onclick="createDocumentFromImage(${image.id})" style="width: 100%;">
                        <i class="fas fa-file-alt"></i> Create Document
                    </button>
                    <button class="btn-secondary" onclick="copyImageText(${image.id})" style="width: 100%; margin-top: 0.5rem;">
                        <i class="fas fa-copy"></i> Copy Text
                    </button>
                    <button class="btn-secondary" onclick="readImageText(${image.id})" style="width: 100%; margin-top: 0.5rem;">
                        <i class="fas fa-play"></i> Read Text
                    </button>
                </div>
            </div>
        `).join('');
}

// View image details
function viewImageDetails(imageId) {
    const image = capturedImages.find(img => img.id === imageId);
    if (!image) return;
    
    // Create modal or detailed view
    const modal = document.createElement('div');
    modal.className = 'image-detail-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 2rem;
    `;
    
    modal.innerHTML = `
        <div class="modal-content" style="background: var(--card-bg); border-radius: 12px; padding: 2rem; max-width: 90%; max-height: 90%; overflow-y: auto;">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h3 style="font-family: 'Michroma', monospace; margin: 0;">Image Details</h3>
                <button onclick="this.closest('.image-detail-modal').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-secondary);">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div style="text-align: center; margin-bottom: 2rem;">
                    <img src="${image.imageData}" alt="Captured document" style="max-width: 100%; max-height: 400px; border-radius: 8px; border: 1px solid var(--border-color);">
                </div>
                <div style="margin-bottom: 1rem;">
                    <strong>Captured:</strong> ${new Date(image.timestamp).toLocaleString()}
                </div>
                <div style="margin-bottom: 1rem;">
                    <strong>OCR Confidence:</strong> ${Math.round(image.confidence || 0)}%
                </div>
                <div style="margin-bottom: 1rem;">
                    <strong>Extracted Text:</strong>
                </div>
                <div style="background: var(--hover-bg); padding: 1rem; border-radius: 8px; max-height: 300px; overflow-y: auto; white-space: pre-wrap; font-family: monospace; font-size: 0.875rem;">
                    ${image.ocrText || 'No text could be extracted from this image.'}
                </div>
                <div style="margin-top: 2rem; display: flex; gap: 1rem; justify-content: flex-end;">
                    <button onclick="createDocumentFromImage(${image.id}); this.closest('.image-detail-modal').remove();" class="btn-primary">
                        <i class="fas fa-file-alt"></i> Create Document
                    </button>
                    <button onclick="this.closest('.image-detail-modal').remove()" class="btn-secondary">
                        Close
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close modal on outside click
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// Create document from existing image
async function createDocumentFromImage(imageId) {
    const image = capturedImages.find(img => img.id === imageId);
    if (!image) return;
    
    if (!image.ocrText || image.ocrText.trim().length < 10) {
        showToast('Not enough text content to create a document', 'warning');
        return;
    }
    
    await createDocumentFromOCR(image);
    showSection('library');
}

// Delete image
function deleteImage(imageId) {
    if (confirm('Are you sure you want to delete this image?')) {
        capturedImages = capturedImages.filter(img => img.id !== imageId);
        localStorage.setItem('docmate_captured_images', JSON.stringify(capturedImages));
        displayCapturedImages();
        showToast('Image deleted', 'info');
    }
}

async function copyImageText(imageId) {
    const image = capturedImages.find(img => img.id === imageId);
    if (!image || !image.ocrText) {
        showToast('No text available to copy', 'warning');
        return;
    }
    try {
        await navigator.clipboard.writeText(image.ocrText);
        showToast('Text copied', 'success');
    } catch (err) {
        console.error(err);
        showToast('Could not copy text', 'error');
    }
}

function readImageText(imageId) {
    const image = capturedImages.find(img => img.id === imageId);
    if (!image || !image.ocrText) {
        showToast('No text available to read', 'warning');
        return;
    }
    if (!('speechSynthesis' in window)) {
        showToast('Speech not supported in this browser', 'error');
        return;
    }
    const utterance = new SpeechSynthesisUtterance(image.ocrText);
    const voice = pickPreferredVoice();
    if (voice) utterance.voice = voice;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
    showToast('Reading captured text...', 'info');
}

function pickPreferredVoice() {
    const selector = document.getElementById('voiceSelector');
    const preferred = selector ? selector.value : null;
    const voices = speechSynthesis.getVoices();
    if (!preferred || !voices || !voices.length) return null;
    const matchers = {
        american_male: v => v.lang?.toLowerCase().startsWith('en-us') && /david|guy|male|us/i.test(v.name),
        american_female: v => v.lang?.toLowerCase().startsWith('en-us') && /zira|aria|jenny|female|us/i.test(v.name),
        british_male: v => v.lang?.toLowerCase().startsWith('en-gb') && /george|ryan|male|uk|gb/i.test(v.name),
        british_female: v => v.lang?.toLowerCase().startsWith('en-gb') && /hazel|emma|libby|female|uk|gb/i.test(v.name),
        nigerian_male: v => v.lang?.toLowerCase().startsWith('en-ng') && /male|nigeria|ng/i.test(v.name),
        nigerian_female: v => v.lang?.toLowerCase().startsWith('en-ng') && /female|nigeria|ng/i.test(v.name)
    };
    const matcher = matchers[preferred];
    if (matcher) {
        const found = voices.find(matcher);
        if (found) return found;
    }
    return voices[0] || null;
}

// Initialize camera when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeCamera();
});

// Export camera functions
window.cameraManager = {
    startCamera,
    stopCamera,
    captureImage,
    viewImageDetails,
    deleteImage,
    createDocumentFromImage,
    displayCapturedImages,
    copyImageText,
    readImageText
};
