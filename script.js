// DOCMATE - Smart Reading Platform
// Main JavaScript functionality

// Configure PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

// Global state
let currentBooks = JSON.parse(localStorage.getItem('docmate_books')) || [];
let currentNotes = JSON.parse(localStorage.getItem('docmate_notes')) || [];
let currentAudioNotes = JSON.parse(localStorage.getItem('docmate_audio_notes')) || [];
let currentBook = null;
let currentPage = 0;
let totalPages = 0;
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let currentLanguage = 'en';
let supabaseClient = null;
let currentUser = null;
let authMode = 'signup';

// Language configurations
const languageConfig = {
    'en': { lang: 'en-US', name: 'English', translateCode: 'en' },
    'yo': { lang: 'yo-NG', name: 'Yoruba', fallback: 'en-US', translateCode: 'yo' },
    'ig': { lang: 'ig-NG', name: 'Igbo', fallback: 'en-US', translateCode: 'ig' },
    'ha': { lang: 'ha-NG', name: 'Hausa', fallback: 'en-US', translateCode: 'ha' },
    'fr': { lang: 'fr-FR', name: 'French', translateCode: 'fr' },
    'es': { lang: 'es-ES', name: 'Spanish', translateCode: 'es' },
    'ar': { lang: 'ar-SA', name: 'Arabic', translateCode: 'ar' },
    'sw': { lang: 'sw-KE', name: 'Swahili', fallback: 'en-US', translateCode: 'sw' },
    'pt': { lang: 'pt-PT', name: 'Portuguese', translateCode: 'pt' },
    'de': { lang: 'de-DE', name: 'German', translateCode: 'de' },
    'it': { lang: 'it-IT', name: 'Italian', translateCode: 'it' },
    'ru': { lang: 'ru-RU', name: 'Russian', translateCode: 'ru' },
    'zh': { lang: 'zh-CN', name: 'Chinese', translateCode: 'zh' },
    'ja': { lang: 'ja-JP', name: 'Japanese', translateCode: 'ja' },
    'hi': { lang: 'hi-IN', name: 'Hindi', translateCode: 'hi' }
};

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initAuth();
    loadTheme();
    displayLibrary();
    displaySavedNotes();
    displayAudioNotes();
    if (window.audioManager) {
        window.audioManager.init();
    }
    updateCounts();
    
    // Add event listeners
    setupEventListeners();
    
    // Initialize speech synthesis
    if ('speechSynthesis' in window) {
        // Trigger voice warm-up to reduce first-play lag
        speechSynthesis.getVoices();
        speechSynthesis.onvoiceschanged = function() {
            speechSynthesis.getVoices();
        };
    }
});

// Event Listeners Setup
function setupEventListeners() {
    // File input
    document.getElementById('fileInput').addEventListener('change', handleFileUpload);
    const analysisInput = document.getElementById('analysisFileInput');
    if (analysisInput) {
        analysisInput.addEventListener('change', analyzeDocument);
    }
    
    // Search inputs
    document.getElementById('librarySearchInput').addEventListener('input', searchLibrary);
    document.getElementById('notesSearchInput').addEventListener('input', searchNotes);
    document.getElementById('audioSearchInput').addEventListener('input', searchAudioNotes);
    document.getElementById('searchInput').addEventListener('keypress', handleSearchEnter);
    
    const voiceSelector = document.getElementById('voiceSelector');
    if (voiceSelector) {
        voiceSelector.addEventListener('change', onVoiceChange);
    }
    
    // Drag and drop
    const uploadZone = document.querySelector('.upload-zone');
    if (uploadZone) {
        uploadZone.addEventListener('dragover', handleDragOver);
        uploadZone.addEventListener('dragleave', handleDragLeave);
        uploadZone.addEventListener('drop', handleFileDrop);
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
}

// Mobile Menu Toggle
function toggleMobileMenu() {
    const sidebar = document.getElementById('navSidebar');
    sidebar.classList.toggle('active');
}

// Navigation Functions
function showSection(sectionId) {
    if (!currentUser) {
        openAuthOverlay();
        return;
    }
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Remove active class from all nav icons
    document.querySelectorAll('.nav-icon').forEach(icon => {
        icon.classList.remove('active');
    });
    
    // Show selected section
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.add('active');
    }
    
    // Update active nav icon
    const activeIcon = document.querySelector(`[onclick="showSection('${sectionId}')"]`);
    if (activeIcon) {
        activeIcon.classList.add('active');
    }
    
    // Special handling for reading section
    if (sectionId === 'reading' && currentBook) {
        displayCurrentPage();
        showAudioControls();
    } else {
        // Stop audio when leaving reading view
        if (window.audioManager) {
            window.audioManager.stop();
        }
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
        }
    }
    
    // Close mobile menu
    const sidebar = document.getElementById('navSidebar');
    sidebar.classList.remove('active');
}

// Theme Management
function toggleTheme() {
    const body = document.body;
    const themeToggle = document.getElementById('themeToggle');
    
    if (body.hasAttribute('data-theme') && body.getAttribute('data-theme') === 'dark') {
        body.removeAttribute('data-theme');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        localStorage.setItem('docmate_theme', 'light');
    } else {
        body.setAttribute('data-theme', 'dark');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        localStorage.setItem('docmate_theme', 'dark');
    }
}

function loadTheme() {
    const savedTheme = localStorage.getItem('docmate_theme');
    const themeToggle = document.getElementById('themeToggle');
    
    if (savedTheme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    } else {
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }
}

// File Upload Handlers
function handleFileUpload(event) {
    if (!currentUser) {
        openAuthOverlay();
        return;
    }
    const file = event.target.files[0];
    if (!file) return;
    
    showLoading('Processing document...');
    // Defer heavy work to allow the UI to paint immediately
    setTimeout(() => processFile(file), 0);
}

function handleFileDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        showLoading('Processing document...');
        setTimeout(() => processFile(files[0]), 0);
    }
}

function handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('dragover');
}

function handleDragLeave(event) {
    event.currentTarget.classList.remove('dragover');
}

// File Processing
async function processFile(file) {
    if (!currentUser) {
        openAuthOverlay();
        return;
    }
    try {
        const fileType = file.type;
        const fileName = file.name.toLowerCase();
        
        let content = '';
        let contentType = 'text';
        
        if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
            const result = await processPDF(file);
            content = result.text;
            contentType = 'pdf';
        } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileName.endsWith('.docx')) {
            content = await processDOCX(file);
            contentType = 'docx';
        } else if (fileType.startsWith('text/') || fileName.endsWith('.txt')) {
            content = await readAsText(file);
            contentType = 'text';
        } else {
            throw new Error('Unsupported file type');
        }
        
        if (!content.trim()) {
            throw new Error('No readable content found in the document');
        }
        
        // Create book object
        const book = {
            id: Date.now(),
            title: file.name.replace(/\.[^/.]+$/, ""),
            content: content,
            originalContent: content,
            contentType: contentType,
            pages: splitIntoPages(content),
            currentPage: 0,
            uploadDate: new Date().toISOString()
        };
        
        if (!book.pages || book.pages.length === 0) {
            throw new Error('Failed to process document pages');
        }
        
        // Save book
        currentBooks.unshift(book);
        localStorage.setItem('docmate_books', JSON.stringify(currentBooks));
        
        // Set as current book and show reading view
        currentBook = book;
        currentPage = 0;
        totalPages = book.pages.length;
        
        // Hide home section and show reading section
        showSection('reading');
        displayCurrentPage();
        
        hideLoading();
        showToast('Document uploaded successfully!', 'success');
        updateCounts();
        
    } catch (error) {
        console.error('Error processing file:', error);
        hideLoading();
        showToast('Error processing document: ' + error.message, 'error');
    }
}

async function processPDF(file) {
    return new Promise(async (resolve, reject) => {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
            let fullText = '';
            
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n\n';
            }
            
            resolve({ text: fullText });
        } catch (error) {
            reject(error);
        }
    });
}

async function processDOCX(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const arrayBuffer = e.target.result;
            mammoth.extractRawText({ arrayBuffer: arrayBuffer })
                .then(result => resolve(result.value))
                .catch(error => reject(error));
        };
        reader.onerror = () => reject(new Error('Failed to read DOCX file'));
        reader.readAsArrayBuffer(file);
    });
}

function readAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Failed to read text file'));
        reader.readAsText(file);
    });
}

function splitIntoPages(content) {
    const wordsPerPage = 500; // Increased for better flow
    const words = content.split(/\s+/).filter(w => w.length > 0);
    const pages = [];
    
    if (words.length === 0) {
        return ['No content available'];
    }
    
    for (let i = 0; i < words.length; i += wordsPerPage) {
        const pageWords = words.slice(i, i + wordsPerPage);
        let pageText = pageWords.join(' ');
        
        // Try to end on a sentence boundary for natural flow
        if (i + wordsPerPage < words.length && !pageText.match(/[.!?]$/)) {
            const lastSentenceEnd = Math.max(
                pageText.lastIndexOf('.'),
                pageText.lastIndexOf('!'),
                pageText.lastIndexOf('?')
            );
            if (lastSentenceEnd > pageText.length * 0.7) {
                pageText = pageText.substring(0, lastSentenceEnd + 1);
                const actualWords = pageText.split(/\s+/).length;
                i = i + actualWords - wordsPerPage;
            }
        }
        
        pages.push(pageText);
    }
    
    return pages.length > 0 ? pages : ['No content available'];
}

// Document Display
function displayCurrentPage() {
    if (!currentBook || !currentBook.pages || currentBook.pages.length === 0) {
        document.getElementById('documentContent').innerHTML = '<p>No content available</p>';
        document.getElementById('documentTitle').textContent = 'No Document';
        document.getElementById('pageInfo').textContent = 'Page 0 of 0';
        return;
    }
    
    const page = currentBook.pages[currentPage] || 'No content available';
    
    // Update document display with natural text flow
    document.getElementById('documentTitle').textContent = currentBook.title;
    document.getElementById('documentContent').innerHTML = formatDocumentContent(page);
    document.getElementById('pageInfo').textContent = `Page ${currentPage + 1} of ${currentBook.pages.length}`;
    
    // Update navigation buttons
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (prevBtn) prevBtn.disabled = currentPage === 0;
    if (nextBtn) nextBtn.disabled = currentPage === currentBook.pages.length - 1;
    
    // Save progress
    currentBook.currentPage = currentPage;
    localStorage.setItem('docmate_books', JSON.stringify(currentBooks));
    
    if (window.audioManager) {
        window.audioManager.prepareForCurrentPage();
    }
}

function formatDocumentContent(text) {
    if (!text || typeof text !== 'string' || text.trim() === '') {
        return '<p>No content available for this page.</p>';
    }
    
    // Natural paragraph formatting - preserve original structure
    return text
        .replace(/\n\n+/g, '</p><p>')
        .replace(/^\s*/, '<p>')
        .replace(/\s*$/, '</p>')
        .replace(/<p>\s*<\/p>/g, '');
}

function showAudioControls() {
    const audioControls = document.getElementById('audioControls');
    if (audioControls && currentBook) {
        audioControls.style.display = 'block';
        const timeline = document.getElementById('audioTimeline');
        if (timeline) {
            timeline.style.display = 'block';
        }
        if (window.audioManager) {
            window.audioManager.prepareForCurrentPage();
        }
    }
}

// Navigation
function previousPage() {
    if (currentPage > 0) {
        currentPage--;
        displayCurrentPage();
    }
}

function nextPage() {
    if (currentBook && currentPage < currentBook.pages.length - 1) {
        currentPage++;
        displayCurrentPage();
    }
}

// Library Display
function displayLibrary() {
    const grid = document.getElementById('libraryGrid');
    if (!grid) return;
    
    if (currentBooks.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-book empty-icon"></i>
                <h3 class="empty-title">No books yet</h3>
                <p class="empty-desc">Upload your first document to get started</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = currentBooks.map(book => {
        const iconClass = book.contentType === 'pdf' ? 'fas fa-file-pdf' : 
                         book.contentType === 'docx' ? 'fas fa-file-word' : 'fas fa-file-alt';
        
        return `
            <div class="book-card" onclick="openBook(${book.id})">
                <div class="card-header">
                    <div>
                        <div class="card-title">
                            <i class="${iconClass}" style="color: var(--accent-color); margin-right: 0.5rem;"></i>
                            ${book.title}
                        </div>
                        <div class="card-meta">${book.pages.length} pages • ${book.contentType.toUpperCase()}</div>
                    </div>
                    <div class="card-actions">
                        <button class="edit-btn" onclick="event.stopPropagation(); editBookTitle(${book.id})" title="Edit Title">
                            <i class="fas fa-pencil-alt"></i>
                        </button>
                        <button class="edit-btn" onclick="event.stopPropagation(); deleteBook(${book.id})" title="Delete Book">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="card-content">
                    <p>${book.content.substring(0, 150)}...</p>
                </div>
                <div class="card-meta">
                    Uploaded: ${new Date(book.uploadDate).toLocaleDateString()}
                </div>
            </div>
        `;
    }).join('');
}

function openBook(bookId) {
    currentBook = currentBooks.find(book => book.id === bookId);
    if (currentBook) {
        currentPage = currentBook.currentPage || 0;
        totalPages = currentBook.pages.length;
        showSection('reading');
        displayCurrentPage();
        showAudioControls();
    }
}

function editBookTitle(bookId) {
    const book = currentBooks.find(b => b.id === bookId);
    if (book) {
        openInputDialog('Edit book title', book.title, (newTitle) => {
            if (newTitle && newTitle.trim()) {
                book.title = newTitle.trim();
                localStorage.setItem('docmate_books', JSON.stringify(currentBooks));
                displayLibrary();
                showToast('Book title updated!', 'success');
            }
        });
    }
}

function deleteBook(bookId) {
    const book = currentBooks.find(b => b.id === bookId);
    if (!book) return;
    
    openConfirmDialog('Delete document', `Delete "${book.title}"? This cannot be undone.`, () => {
        currentBooks = currentBooks.filter(b => b.id !== bookId);
        localStorage.setItem('docmate_books', JSON.stringify(currentBooks));
        
        // If the current reading book was deleted, reset view
        if (currentBook && currentBook.id === bookId) {
            currentBook = null;
            currentPage = 0;
            totalPages = 0;
            document.getElementById('documentContent').innerHTML = '<p>No content available</p>';
            document.getElementById('documentTitle').textContent = 'No Document';
            document.getElementById('pageInfo').textContent = 'Page 0 of 0';
            showSection('library');
        }
        
        displayLibrary();
        updateCounts();
        showToast('Document deleted', 'info');
    });
}

// Notes Management
function displaySavedNotes() {
    const notesList = document.getElementById('savedNotesList');
    if (!notesList) return;
    
    if (currentNotes.length === 0) {
        notesList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-sticky-note empty-icon"></i>
                <h3 class="empty-title">No saved notes yet</h3>
                <p class="empty-desc">Start reading and add notes to your documents</p>
            </div>
        `;
        return;
    }
    
    notesList.innerHTML = currentNotes.map(note => `
        <div class="note-card">
            <div class="card-header">
                <div>
                    <div class="card-title">${note.bookTitle || 'Quick Note'}</div>
                    <div class="card-meta">${new Date(note.timestamp).toLocaleDateString()}</div>
                </div>
                <div class="card-actions">
                    <button class="edit-btn" onclick="editNote(${note.id})" title="Edit Note">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                </div>
            </div>
            <div class="card-content">
                <p>${note.content}</p>
            </div>
            ${note.bookTitle ? `<div class="card-meta">Page ${note.page + 1}</div>` : ''}
        </div>
    `).join('');
}

function addNewNote() {
    showQuickNote();
}

function editNote(noteId) {
    const note = currentNotes.find(n => n.id === noteId);
    if (note) {
        openInputDialog('Edit note', note.content, (newContent) => {
            if (newContent !== null && newContent.trim()) {
                note.content = newContent.trim();
                localStorage.setItem('docmate_notes', JSON.stringify(currentNotes));
                displaySavedNotes();
                showToast('Note updated!', 'success');
            }
        }, true);
    }
}

// Audio Notes
function displayAudioNotes() {
    const audioGrid = document.getElementById('audioNotesGrid');
    if (!audioGrid) return;
    
    if (currentAudioNotes.length === 0) {
        audioGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-microphone empty-icon"></i>
                <h3 class="empty-title">No audio notes yet</h3>
                <p class="empty-desc">Start reading and record your thoughts</p>
            </div>
        `;
        return;
    }
    
    audioGrid.innerHTML = currentAudioNotes.map(note => `
        <div class="audio-card">
            <div class="card-header">
                <div>
                    <div class="card-title">${note.bookTitle || 'Audio Note'}</div>
                    <div class="card-meta">${new Date(note.timestamp).toLocaleDateString()}</div>
                </div>
                <div class="card-actions">
                    <button class="edit-btn" onclick="playAudioNote('${note.id}')" title="Play Audio">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="edit-btn" onclick="deleteAudioNote('${note.id}')" title="Delete Audio">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="card-content">
                <p>Audio recording (${note.duration || 'Unknown'} seconds)</p>
            </div>
            ${note.bookTitle ? `<div class="card-meta">Page ${note.page + 1}</div>` : ''}
        </div>
    `).join('');
}

function playAudioNote(noteId) {
    const note = currentAudioNotes.find(n => n.id == noteId);
    if (note && note.content) {
        try {
            const audio = new Audio(note.content);
            audio.play().then(() => {
                showToast('Playing audio note...', 'info');
            }).catch(error => {
                console.error('Error playing audio:', error);
                showToast('Error playing audio note', 'error');
            });
        } catch (err) {
            console.error('Invalid audio source', err);
            showToast('Audio unavailable. Please re-record.', 'warning');
        }
    }
}

// Text-to-Speech Audio Player for current document page
const audioManager = {
    initialized: false,
    elements: {},
    currentText: '',
    totalWords: 0,
    currentWordIndex: 0,
    baseWordIndex: 0,
    estimatedDuration: 0,
    rate: 1,
    isPlaying: false,
    isPaused: false,
    currentUtterance: null,
    
    init() {
        this.elements = {
            status: document.getElementById('audioStatus'),
            timeline: document.getElementById('audioTimeline'),
            timelineBar: document.getElementById('timelineBar'),
            progress: document.getElementById('timelineProgress'),
            handle: document.getElementById('timelineHandle'),
            time: document.getElementById('timelineTime'),
            playBtn: document.getElementById('timelinePlayBtn'),
            speedSelect: document.getElementById('audioSpeed')
        };
        
        if (this.elements.speedSelect) {
            this.elements.speedSelect.value = '1';
        }
        
        this.updateTimeline(0);
        this.updateTimeDisplay(0, 0);
        this.initialized = true;
    },
    
    prepareForCurrentPage() {
        if (!this.initialized) this.init();
        if (!currentBook) return;
        
        this.currentText = (currentBook.pages[currentPage] || '').trim();
        this.totalWords = this.currentText.split(/\s+/).filter(Boolean).length;
        this.currentWordIndex = 0;
        this.baseWordIndex = 0;
        this.estimatedDuration = this.getEstimatedDuration();
        this.isPlaying = false;
        this.isPaused = false;
        this.setStatus('Ready to play');
        this.setPlayButton(false);
        this.updateTimeline(0);
        this.updateTimeDisplay(0, this.estimatedDuration);
    },
    
    supported() {
        return 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
    },
    
    getWordsPerSecond() {
        return (180 / 60) * (this.rate || 1); // approx 180 wpm baseline
    },
    
    getEstimatedDuration() {
        if (!this.totalWords) return 0;
        return Math.max(1, Math.round(this.totalWords / this.getWordsPerSecond()));
    },
    
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },
    
    setStatus(text) {
        if (this.elements.status) {
            this.elements.status.textContent = text;
        }
    },
    
    setPlayButton(isPlaying) {
        if (this.elements.playBtn) {
            this.elements.playBtn.innerHTML = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
        }
    },
    
    updateTimeline(percent) {
        if (this.elements.progress) {
            this.elements.progress.style.width = `${percent}%`;
        }
        if (this.elements.handle) {
            this.elements.handle.style.left = `${percent}%`;
        }
    },
    
    updateTimeDisplay(current, total) {
        if (this.elements.time) {
            this.elements.time.textContent = `${this.formatTime(current)} / ${this.formatTime(total || this.estimatedDuration || 0)}`;
        }
    },
    
    togglePlayback() {
        if (!this.supported()) {
            showToast('Speech synthesis is not supported in this browser.', 'error');
            return;
        }
        
        if (!this.currentText) {
            this.prepareForCurrentPage();
        }
        
        if (!this.currentText) {
            showToast('No text available to read on this page.', 'warning');
            return;
        }
        
        if (this.isPlaying) {
            this.pause();
            return;
        }
        
        if (this.isPaused && speechSynthesis.paused) {
            speechSynthesis.resume();
            this.isPlaying = true;
            this.isPaused = false;
            this.setStatus('Playing...');
            this.setPlayButton(true);
            return;
        }
        
        this.startFromWord(this.currentWordIndex || 0);
    },
    
    pause() {
        speechSynthesis.pause();
        this.isPlaying = false;
        this.isPaused = true;
        this.setStatus('Paused');
        this.setPlayButton(false);
    },
    
    stop() {
        speechSynthesis.cancel();
        this.isPlaying = false;
        this.isPaused = false;
        this.currentWordIndex = 0;
        this.baseWordIndex = 0;
        this.updateTimeline(0);
        this.updateTimeDisplay(0, this.estimatedDuration);
        this.setPlayButton(false);
        this.setStatus('Stopped');
    },
    
    startFromWord(wordIndex) {
        if (!this.supported() || !this.currentText) return;
        
        this.rate = this.elements.speedSelect ? parseFloat(this.elements.speedSelect.value) : 1;
        this.currentWordIndex = Math.max(0, Math.min(wordIndex, Math.max(this.totalWords - 1, 0)));
        this.baseWordIndex = this.currentWordIndex;
        
        const remainingText = this.sliceTextFromWord(this.currentWordIndex);
        if (!remainingText) {
            this.stop();
            return;
        }
        
        speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(remainingText);
        utterance.rate = this.rate;
        const langCfg = languageConfig[currentLanguage] || languageConfig['en'];
        if (langCfg && langCfg.lang) {
            utterance.lang = langCfg.lang;
        }
        
        const selectedVoice = this.getVoiceFromSelector();
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }
        
        utterance.onboundary = (event) => {
            if (event.name === 'word' || event.charIndex >= 0) {
                this.updateProgressFromChar(event.charIndex);
            }
        };
        
        utterance.onend = () => {
            this.isPlaying = false;
            this.isPaused = false;
            this.currentWordIndex = this.totalWords;
            this.updateTimeline(100);
            this.updateTimeDisplay(this.estimatedDuration, this.estimatedDuration);
            this.setPlayButton(false);
            this.setStatus('Finished');
        };
        
        this.currentUtterance = utterance;
        speechSynthesis.speak(utterance);
        this.isPlaying = true;
        this.isPaused = false;
        this.setPlayButton(true);
        this.setStatus('Playing...');
    },
    
    updateProgressFromChar(charIndex) {
        const remainingText = this.sliceTextFromWord(this.baseWordIndex);
        if (!remainingText) return;
        
        const spokenSoFar = remainingText.substring(0, charIndex || 0);
        const wordsSpoken = spokenSoFar.split(/\s+/).filter(Boolean).length;
        this.currentWordIndex = Math.min(this.baseWordIndex + wordsSpoken, this.totalWords);
        
        const percent = this.totalWords ? (this.currentWordIndex / this.totalWords) * 100 : 0;
        this.updateTimeline(percent);
        
        const currentSeconds = this.currentWordIndex / this.getWordsPerSecond();
        this.updateTimeDisplay(currentSeconds, this.estimatedDuration);
    },
    
    handleSeek(event) {
        if (!this.totalWords || !this.elements.timelineBar) return;
        const rect = this.elements.timelineBar.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const targetWord = Math.floor(ratio * this.totalWords);
        this.startFromWord(targetWord);
    },
    
    skip(seconds) {
        if (!this.totalWords) return;
        const deltaWords = Math.round(seconds * this.getWordsPerSecond());
        const targetWord = Math.max(0, Math.min(this.currentWordIndex + deltaWords, this.totalWords));
        this.startFromWord(targetWord);
    },
    
    setSpeed() {
        const newRate = this.elements.speedSelect ? parseFloat(this.elements.speedSelect.value) : 1;
        this.rate = newRate || 1;
        if (this.isPlaying || this.isPaused) {
            this.startFromWord(this.currentWordIndex);
        }
        this.setStatus(`Speed: ${this.rate}x`);
    },
    
    switchVoice() {
        // Restart at the current word with the newly selected voice
        this.startFromWord(this.currentWordIndex || 0);
        this.setStatus('Voice updated');
    },
    
    getVoiceFromSelector() {
        if (!this.elements || !this.elements.speedSelect) return null;
        const preferred = document.getElementById('voiceSelector')?.value;
        const voices = speechSynthesis.getVoices();
        if (!voices || voices.length === 0) return null;
        
        const voiceMatchers = {
            american_male: (v) => v.lang?.toLowerCase().startsWith('en-us') && /david|guy|male|us/i.test(v.name),
            american_female: (v) => v.lang?.toLowerCase().startsWith('en-us') && /zira|aria|jenny|female|us/i.test(v.name),
            british_male: (v) => v.lang?.toLowerCase().startsWith('en-gb') && /george|ryan|male|uk|gb/i.test(v.name),
            british_female: (v) => v.lang?.toLowerCase().startsWith('en-gb') && /hazel|emma|libby|female|uk|gb/i.test(v.name),
            nigerian_male: (v) => v.lang?.toLowerCase().startsWith('en-ng') && /male|nigeria|ng/i.test(v.name),
            nigerian_female: (v) => v.lang?.toLowerCase().startsWith('en-ng') && /female|nigeria|ng/i.test(v.name)
        };
        
        const matcher = voiceMatchers[preferred];
        if (matcher) {
            const exact = voices.find(matcher);
            if (exact) return exact;
        }
        
        // Fallbacks by locale
        const localeFallbacks = {
            american_male: 'en-US',
            american_female: 'en-US',
            british_male: 'en-GB',
            british_female: 'en-GB',
            nigerian_male: 'en-NG',
            nigerian_female: 'en-NG'
        };
        const locale = localeFallbacks[preferred];
        if (locale) {
            const localeVoice = voices.find(v => v.lang?.toLowerCase().startsWith(locale.toLowerCase()));
            if (localeVoice) return localeVoice;
        }
        
        // Final fallback
        return voices[0] || null;
    },
    
    sliceTextFromWord(wordIndex) {
        if (!this.currentText) return '';
        const words = this.currentText.split(/\s+/);
        return words.slice(wordIndex).join(' ');
    }
};

window.audioManager = audioManager;

function toggleAudioPanel() {
    const timeline = document.getElementById('audioTimeline');
    if (!timeline) return;
    
    // Always reveal controls
    timeline.style.display = 'block';
    
    if (window.audioManager) {
        // If already playing or paused, stop; otherwise start
        if (window.audioManager.isPlaying || window.audioManager.isPaused) {
            window.audioManager.stop();
        } else {
            window.audioManager.prepareForCurrentPage();
            window.audioManager.togglePlayback();
        }
    }
}

function togglePlayback() {
    if (window.audioManager) {
        window.audioManager.togglePlayback();
    }
}

function seekAudio(event) {
    if (window.audioManager) {
        window.audioManager.handleSeek(event);
    }
}

function skipAudio(seconds) {
    if (window.audioManager) {
        window.audioManager.skip(seconds);
    }
}

function changeAudioSpeed() {
    if (window.audioManager) {
        window.audioManager.setSpeed();
    }
}

function onVoiceChange() {
    if (!window.audioManager) return;
    
    // If audio is active, restart at the current position with the new voice
    if (window.audioManager.isPlaying || window.audioManager.isPaused) {
        window.audioManager.switchVoice();
    } else {
        window.audioManager.prepareForCurrentPage();
        window.audioManager.setStatus('Voice selected');
    }
}

// Quick Note Panel
function showQuickNote() {
    if (!currentUser) {
        openAuthOverlay();
        return;
    }
    const panel = document.getElementById('quickNotePanel');
    if (panel) {
        panel.style.display = 'block';
        document.getElementById('quickNoteInput').focus();
    }
}

function closeQuickNote() {
    const panel = document.getElementById('quickNotePanel');
    if (panel) {
        panel.style.display = 'none';
        document.getElementById('quickNoteInput').value = '';
    }
}

function saveQuickNote() {
    const input = document.getElementById('quickNoteInput');
    const content = input.value.trim();
    
    if (!content) {
        showToast('Please enter some content for the note', 'warning');
        return;
    }
    
    const note = {
        id: Date.now(),
        content: content,
        type: 'text',
        bookId: currentBook ? currentBook.id : null,
        bookTitle: currentBook ? currentBook.title : null,
        page: currentPage || 0,
        timestamp: new Date().toISOString()
    };
    
    currentNotes.unshift(note);
    localStorage.setItem('docmate_notes', JSON.stringify(currentNotes));
    
    closeQuickNote();
    showSection('saved-notes');
    displaySavedNotes();
    updateCounts();
    showToast('Note saved successfully!', 'success');
}

// Recording Functions
async function toggleRecording() {
    if (!currentUser) {
        openAuthOverlay();
        return;
    }
    const recordFab = document.getElementById('recordFab');
    
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            const startTime = Date.now();
            
            mediaRecorder.ondataavailable = event => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };
            
    mediaRecorder.onstop = () => {
        const duration = Math.round((Date.now() - startTime) / 1000);
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });

        // Persist as data URL so it survives reloads and plays reliably
        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = reader.result;
            saveAudioNote(dataUrl, duration);
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
    };
            
            mediaRecorder.start();
            isRecording = true;
            recordFab.classList.add('recording');
            recordFab.innerHTML = '<i class="fas fa-stop"></i>';
            showToast('Recording started...', 'info');
            
        } catch (error) {
            console.error('Microphone access error:', error);
            showToast('Could not access microphone. Please check permissions.', 'error');
        }
    } else {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
        isRecording = false;
        recordFab.classList.remove('recording');
        recordFab.innerHTML = '<i class="fas fa-microphone"></i>';
        showToast('Recording stopped', 'info');
    }
}

function saveAudioNote(audioUrl, duration) {
    const note = {
        id: Date.now(),
        content: audioUrl,
        type: 'audio',
        duration: duration,
        bookId: currentBook ? currentBook.id : null,
        bookTitle: currentBook ? currentBook.title : 'General Recording',
        page: currentPage || 0,
        timestamp: new Date().toISOString()
    };
    
    currentAudioNotes.unshift(note);
    localStorage.setItem('docmate_audio_notes', JSON.stringify(currentAudioNotes));
    displayAudioNotes();
    updateCounts();
    showToast('Audio note saved successfully!', 'success');
}

function deleteAudioNote(noteId) {
    const note = currentAudioNotes.find(n => n.id == noteId);
    if (!note) return;
    openConfirmDialog('Delete audio note', 'Delete this recording? This cannot be undone.', () => {
        currentAudioNotes = currentAudioNotes.filter(n => n.id != noteId);
        localStorage.setItem('docmate_audio_notes', JSON.stringify(currentAudioNotes));
        displayAudioNotes();
        updateCounts();
        showToast('Audio note deleted', 'info');
    });
}

// Search Functions
function searchLibrary() {
    const query = document.getElementById('librarySearchInput').value.toLowerCase().trim();
    
    if (!query) {
        displayLibrary();
        return;
    }
    
    const filteredBooks = currentBooks.filter(book => 
        book.title.toLowerCase().includes(query) ||
        book.content.toLowerCase().includes(query)
    );
    
    displayFilteredBooks(filteredBooks);
}

function searchNotes() {
    const query = document.getElementById('notesSearchInput').value.toLowerCase().trim();
    
    if (!query) {
        displaySavedNotes();
        return;
    }
    
    const filteredNotes = currentNotes.filter(note => 
        note.content.toLowerCase().includes(query) ||
        (note.bookTitle && note.bookTitle.toLowerCase().includes(query))
    );
    
    displayFilteredNotes(filteredNotes);
}

function searchAudioNotes() {
    const query = document.getElementById('audioSearchInput').value.toLowerCase().trim();
    
    if (!query) {
        displayAudioNotes();
        return;
    }
    
    const filteredAudio = currentAudioNotes.filter(note => 
        (note.bookTitle && note.bookTitle.toLowerCase().includes(query))
    );
    
    displayFilteredAudioNotes(filteredAudio);
}

function displayFilteredBooks(books) {
    const grid = document.getElementById('libraryGrid');
    if (!grid) return;
    
    if (books.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search empty-icon"></i>
                <h3 class="empty-title">No matching books found</h3>
                <p class="empty-desc">Try different search terms</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = books.map(book => {
        const iconClass = book.contentType === 'pdf' ? 'fas fa-file-pdf' : 
                         book.contentType === 'docx' ? 'fas fa-file-word' : 'fas fa-file-alt';
        
        return `
            <div class="book-card highlighted" onclick="openBook(${book.id})">
                <div class="card-header">
                    <div>
                        <div class="card-title">
                            <i class="${iconClass}" style="color: var(--accent-color); margin-right: 0.5rem;"></i>
                            ${book.title}
                        </div>
                        <div class="card-meta">${book.pages.length} pages • ${book.contentType.toUpperCase()}</div>
                    </div>
                    <div class="card-actions">
                        <button class="edit-btn" onclick="event.stopPropagation(); editBookTitle(${book.id})" title="Edit Title">
                            <i class="fas fa-pencil-alt"></i>
                        </button>
                        <button class="edit-btn" onclick="event.stopPropagation(); deleteBook(${book.id})" title="Delete Book">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="card-content">
                    <p>${book.content.substring(0, 150)}...</p>
                </div>
                <div class="card-meta">
                    Uploaded: ${new Date(book.uploadDate).toLocaleDateString()}
                </div>
            </div>
        `;
    }).join('');
}

function displayFilteredNotes(notes) {
    const notesList = document.getElementById('savedNotesList');
    if (!notesList) return;
    
    if (notes.length === 0) {
        notesList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search empty-icon"></i>
                <h3 class="empty-title">No matching notes found</h3>
                <p class="empty-desc">Try different search terms</p>
            </div>
        `;
        return;
    }
    
    notesList.innerHTML = notes.map(note => `
        <div class="note-card highlighted">
            <div class="card-header">
                <div>
                    <div class="card-title">${note.bookTitle || 'Quick Note'}</div>
                    <div class="card-meta">${new Date(note.timestamp).toLocaleDateString()}</div>
                </div>
                <div class="card-actions">
                    <button class="edit-btn" onclick="editNote(${note.id})" title="Edit Note">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                </div>
            </div>
            <div class="card-content">
                <p>${note.content}</p>
            </div>
            ${note.bookTitle ? `<div class="card-meta">Page ${note.page + 1}</div>` : ''}
        </div>
    `).join('');
}

function displayFilteredAudioNotes(notes) {
    const audioGrid = document.getElementById('audioNotesGrid');
    if (!audioGrid) return;
    
    if (notes.length === 0) {
        audioGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search empty-icon"></i>
                <h3 class="empty-title">No matching audio notes found</h3>
                <p class="empty-desc">Try different search terms</p>
            </div>
        `;
        return;
    }
    
    audioGrid.innerHTML = notes.map(note => `
        <div class="audio-card highlighted">
            <div class="card-header">
                <div>
                    <div class="card-title">${note.bookTitle || 'Audio Note'}</div>
                    <div class="card-meta">${new Date(note.timestamp).toLocaleDateString()}</div>
                </div>
                <div class="card-actions">
                    <button class="edit-btn" onclick="playAudioNote('${note.id}')" title="Play Audio">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="edit-btn" onclick="deleteAudioNote('${note.id}')" title="Delete Audio">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="card-content">
                <p>Audio recording (${note.duration || 'Unknown'} seconds)</p>
            </div>
            ${note.bookTitle ? `<div class="card-meta">Page ${note.page + 1}</div>` : ''}
        </div>
    `).join('');
}

function clearLibrarySearch() {
    document.getElementById('librarySearchInput').value = '';
    displayLibrary();
}

function openConfirmDialog(title, message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'card-modal-overlay';
    const card = document.createElement('div');
    card.className = 'card-modal';
    card.innerHTML = `
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="card-modal-actions">
            <button class="btn-secondary" type="button">Cancel</button>
            <button class="btn-primary" type="button">Confirm</button>
        </div>
    `;
    
    const [cancelBtn, confirmBtn] = card.querySelectorAll('button');
    cancelBtn.onclick = () => overlay.remove();
    confirmBtn.onclick = () => {
        overlay.remove();
        if (typeof onConfirm === 'function') onConfirm();
    };
    
    overlay.appendChild(card);
    document.body.appendChild(overlay);
}

function openInputDialog(title, defaultValue, onConfirm, multiline = false) {
    const overlay = document.createElement('div');
    overlay.className = 'card-modal-overlay';
    const card = document.createElement('div');
    card.className = 'card-modal';
    
    const inputField = multiline ? 
        `<textarea rows="4">${defaultValue || ''}</textarea>` :
        `<input type="text" value="${defaultValue || ''}" />`;
    
    card.innerHTML = `
        <h3>${title}</h3>
        ${inputField}
        <div class="card-modal-actions">
            <button class="btn-secondary" type="button">Cancel</button>
            <button class="btn-primary" type="button">Save</button>
        </div>
    `;
    
    const [cancelBtn, saveBtn] = card.querySelectorAll('button');
    const inputEl = card.querySelector('input, textarea');
    
    cancelBtn.onclick = () => overlay.remove();
    saveBtn.onclick = () => {
        const val = inputEl.value;
        overlay.remove();
        if (typeof onConfirm === 'function') onConfirm(val);
    };
    
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    inputEl.focus();
}

// Authentication (Supabase)
async function initAuth() {
    if (window.supabase && window.apiConfig && window.apiConfig.SUPABASE_URL) {
        supabaseClient = window.supabase.createClient(window.apiConfig.SUPABASE_URL, window.apiConfig.SUPABASE_ANON_KEY);
        await restoreSession();
    }
}

async function restoreSession() {
    if (!supabaseClient) return;
    const { data } = await supabaseClient.auth.getSession();
    currentUser = data?.session?.user || null;
    if (!currentUser) {
        openAuthOverlay();
    } else {
        closeAuthOverlay();
    }
}

function openAuthOverlay() {
    const overlay = document.getElementById('authOverlay');
    if (overlay) overlay.classList.remove('hidden');
    document.body.classList.add('auth-open');
}

function closeAuthOverlay() {
    const overlay = document.getElementById('authOverlay');
    if (overlay) overlay.classList.add('hidden');
    document.body.classList.remove('auth-open');
}

function switchAuthMode() {
    authMode = authMode === 'signup' ? 'login' : 'signup';
    document.getElementById('authHeading').textContent = authMode === 'signup' ? 'Sign up' : 'Sign in';
    document.getElementById('authSubtitle').textContent = authMode === 'signup' ? 'Create your DOCMAETE account.' : 'Welcome back to DOCMAETE.';
    document.getElementById('authSubmitBtn').textContent = authMode === 'signup' ? 'Create account' : 'Sign in';
    document.getElementById('authModePrompt').textContent = authMode === 'signup' ? 'Already have an account?' : "Don't have an account?";
    document.getElementById('authSwitchBtn').textContent = authMode === 'signup' ? 'Sign in' : 'Sign up';
    document.getElementById('authHint').textContent = 'We require email verification before access.';
    setAuthStatus('');
}

async function submitAuth() {
    if (!supabaseClient) {
        showToast('Auth not ready', 'error');
        return;
    }
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value.trim();
    const remember = document.getElementById('authRemember').checked;
    if (!email || !password) {
        showToast('Email and password required', 'warning');
        setAuthStatus('Email and password required.');
        return;
    }
    const strength = passwordStrength(password);
    if (strength.score < 2) {
        setAuthStatus('Password is too weak. Use at least 8 chars with letters and numbers.');
        return;
    }
    showLoading('Authenticating...');
    try {
        if (authMode === 'signup') {
            const { error } = await supabaseClient.auth.signUp({ email, password, options: { emailRedirectTo: window.location.href } });
            if (error) throw error;
            showToast('Check your email to confirm before logging in.', 'info');
            setAuthStatus('Confirmation email sent. Please check your inbox/spam.');
        } else {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            currentUser = data.user;
            if (!remember) {
                // If not remembering, sign out on tab close
                window.addEventListener('beforeunload', signOut, { once: true });
            }
            closeAuthOverlay();
            showToast('Logged in', 'success');
            setAuthStatus('');
            showSection('home');
        }
    } catch (err) {
        console.error(err);
        showToast(err.message || 'Auth failed', 'error');
        setAuthStatus(err.message || 'Auth failed');
    } finally {
        hideLoading();
    }
}

async function signOut() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    currentUser = null;
    openAuthOverlay();
}

async function handlePasswordReset() {
    if (!supabaseClient) return;
    const email = document.getElementById('authEmail').value.trim();
    if (!email) {
        showToast('Enter your email to reset password', 'warning');
        return;
    }
    showLoading('Sending reset link...');
    try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
        if (error) throw error;
        showToast('Reset link sent. Check your email.', 'success');
    } catch (err) {
        console.error(err);
        showToast(err.message || 'Could not send reset email', 'error');
    } finally {
        hideLoading();
    }
}

async function signInWithProvider(provider) {
    if (!supabaseClient) return;
    showLoading('Redirecting to provider...');
    try {
        const { data, error } = await supabaseClient.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: window.location.href
            }
        });
        if (error) throw error;
        if (data?.url) {
            window.location.href = data.url;
        }
    } catch (err) {
        console.error(err);
        showToast(err.message || 'Provider sign-in failed', 'error');
        setAuthStatus(err.message || 'Provider sign-in failed');
    } finally {
        hideLoading();
    }
}

function passwordStrength(pwd) {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    return { score };
}

function updatePasswordStrength() {
    const pwd = document.getElementById('authPassword').value;
    const strengthEl = document.getElementById('authStrength');
    if (!strengthEl) return;
    const { score } = passwordStrength(pwd);
    const labels = ['Very weak', 'Weak', 'OK', 'Good', 'Strong'];
    strengthEl.textContent = `Strength: ${labels[Math.min(score, labels.length - 1)] || '—'}`;
}

function setAuthStatus(message) {
    const statusEl = document.getElementById('authStatus');
    if (statusEl) {
        statusEl.textContent = message || '';
    }
}

window.authManager = { openAuthOverlay, closeAuthOverlay, switchAuthMode, submitAuth, signOut };

function clearNotesSearch() {
    document.getElementById('notesSearchInput').value = '';
    displaySavedNotes();
}

function clearAudioSearch() {
    document.getElementById('audioSearchInput').value = '';
    displayAudioNotes();
}

// Analysis and Search with Real APIs
async function analyzeDocument(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    showLoading('Analyzing document...');
    
    try {
        let content = '';
        const fileType = file.type;
        const fileName = file.name.toLowerCase();
        
        if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
            const result = await processPDF(file);
            content = result.text;
        } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileName.endsWith('.docx')) {
            content = await processDOCX(file);
        } else {
            content = await readAsText(file);
        }
        
        const analysis = await performAnalysis(content, file.name);
        displayAnalysis(analysis);
        hideLoading();
        
    } catch (error) {
        console.error('Analysis error:', error);
        hideLoading();
        showToast('Error analyzing document: ' + error.message, 'error');
    }
}

async function performAnalysis(content, fileName) {
    const words = content.split(/\s+/).filter(w => w.length > 0);
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    // Generate comprehensive summary
    const summary = generateDocumentSummary(content);
    
    // Extract key points
    const keyPoints = extractKeyPoints(content);
    
    // Get main topics
    const mainTopics = extractKeywords(content);
    
    return {
        fileName,
        stats: {
            words: words.length,
            sentences: sentences.length,
            paragraphs: paragraphs.length,
            readingTime: Math.ceil(words.length / 200),
            difficulty: assessDifficulty(content)
        },
        summary,
        keyPoints,
        mainTopics
    };
}

function generateDocumentSummary(content) {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 30);
    
    if (sentences.length === 0) {
        return 'No substantial content found in the document.';
    }
    
    // Create a comprehensive summary from key sentences
    let summary = '';
    
    // Introduction
    if (sentences.length > 0) {
        summary += sentences[0].trim() + '. ';
    }
    
    // Middle content
    if (sentences.length > 5) {
        const midIndex = Math.floor(sentences.length / 2);
        summary += sentences[midIndex].trim() + '. ';
    }
    
    // Conclusion
    if (sentences.length > 2) {
        summary += sentences[sentences.length - 1].trim() + '.';
    }
    
    return summary || 'Document contains limited analyzable content.';
}

function extractKeyPoints(content) {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 50);
    
    // Look for sentences that might be key points
    const keyPoints = sentences
        .filter(s => {
            const lower = s.toLowerCase();
            return lower.includes('important') || 
                   lower.includes('key') || 
                   lower.includes('main') || 
                   lower.includes('significant') ||
                   lower.includes('conclusion') ||
                   lower.includes('result') ||
                   (s.length > 80 && s.length < 200);
        })
        .slice(0, 5)
        .map(s => s.trim());
    
    return keyPoints.length > 0 ? keyPoints : sentences.slice(0, 3).map(s => s.trim());
}

function extractKeywords(content) {
    const words = content.toLowerCase().split(/\s+/);
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'shall', 'this', 'that', 'these', 'those']);
    
    const wordFreq = {};
    words.forEach(word => {
        word = word.replace(/[^\w]/g, '');
        if (word.length > 3 && !stopWords.has(word)) {
            wordFreq[word] = (wordFreq[word] || 0) + 1;
        }
    });
    
    return Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([word]) => word);
}

function assessDifficulty(text) {
    const words = text.split(/\s+/);
    const sentences = text.split(/[.!?]+/);
    
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    const avgSentenceLength = words.length / sentences.length;
    
    if (avgWordLength > 6 && avgSentenceLength > 20) return 'Advanced';
    if (avgWordLength > 5 && avgSentenceLength > 15) return 'Intermediate';
    return 'Beginner';
}

function displayAnalysis(analysis) {
    const resultsDiv = document.getElementById('analysisResults');
    if (!resultsDiv) return;
    
    resultsDiv.innerHTML = `
        <div class="analysis-card">
            <h3 class="card-title">Analysis of: ${analysis.fileName}</h3>
            
            <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1rem; margin: 2rem 0;">
                <div class="stat-item" style="text-align: center;">
                    <div style="font-size: 2rem; font-weight: bold; color: var(--accent-color);">${analysis.stats.words.toLocaleString()}</div>
                    <div style="font-size: 0.875rem; color: var(--text-secondary);">Words</div>
                </div>
                <div class="stat-item" style="text-align: center;">
                    <div style="font-size: 2rem; font-weight: bold; color: var(--accent-color);">${analysis.stats.sentences}</div>
                    <div style="font-size: 0.875rem; color: var(--text-secondary);">Sentences</div>
                </div>
                <div class="stat-item" style="text-align: center;">
                    <div style="font-size: 2rem; font-weight: bold; color: var(--accent-color);">${analysis.stats.paragraphs}</div>
                    <div style="font-size: 0.875rem; color: var(--text-secondary);">Paragraphs</div>
                </div>
                <div class="stat-item" style="text-align: center;">
                    <div style="font-size: 2rem; font-weight: bold; color: var(--accent-color);">${analysis.stats.readingTime}</div>
                    <div style="font-size: 0.875rem; color: var(--text-secondary);">Min Read</div>
                </div>
                <div class="stat-item" style="text-align: center;">
                    <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent-color);">${analysis.stats.difficulty}</div>
                    <div style="font-size: 0.875rem; color: var(--text-secondary);">Level</div>
                </div>
            </div>
            
            <div class="analysis-section">
                <h4 style="font-family: 'Michroma', monospace; margin-bottom: 1rem;">Document Summary</h4>
                <div class="analysis-summary">
                    <p>${analysis.summary}</p>
                </div>
            </div>
            
            <div class="analysis-section">
                <h4 style="font-family: 'Michroma', monospace; margin-bottom: 1rem;">Key Points</h4>
                <ul class="analysis-points">
                    ${analysis.keyPoints.map(point => `<li>${point}</li>`).join('')}
                </ul>
            </div>
            
            <div class="analysis-section">
                <h4 style="font-family: 'Michroma', monospace; margin-bottom: 1rem;">Main Topics</h4>
                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                    ${analysis.mainTopics.map(topic => `
                        <span style="background-color: var(--hover-bg); color: var(--text-primary); padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.875rem; border: 1px solid var(--border-color);">
                            ${topic}
                        </span>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

// Real Web Search with APIs
async function searchWebAnswer() {
    const query = document.getElementById('searchInput').value.trim();
    
    if (!query) {
        showToast('Please enter a topic to search for', 'warning');
        return;
    }
    
    showLoading('Searching the web...');
    
    try {
        const results = await searchWithRealAPIs(query);
        displaySearchResults(results, query);
        hideLoading();
    } catch (error) {
        console.error('Search error:', error);
        hideLoading();
        showToast('Error searching for answer', 'error');
    }
}

async function searchWithRealAPIs(query) {
    try {
        if (window.apiServices && window.apiServices.SearchService) {
            const webResults = await window.apiServices.SearchService.searchWeb(query);
            const ddgResults = await searchDuckDuckGo(query);
            const merged = mergeResults(webResults?.results || [], ddgResults);
            return {
                summary: merged.length ? `Top results for "${query}":` : `No web results for "${query}"`,
                results: merged
            };
        }
        
        const duckduckgoResults = await searchDuckDuckGo(query);
        return {
            summary: duckduckgoResults.length ? `Top results for "${query}":` : `No web results for "${query}"`,
            results: duckduckgoResults
        };
    } catch (error) {
        console.error('API search error:', error);
        return {
            summary: `Couldn't fetch results for "${query}".`,
            results: []
        };
    }
}

function mergeResults(primary, secondary) {
    const seen = new Set();
    const combined = [];
    
    const add = (item) => {
        if (!item || !item.url) return;
        const key = item.url.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        combined.push(item);
    };
    
    primary.forEach(add);
    secondary.forEach(add);
    return combined;
}

async function searchDuckDuckGo(query) {
    const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`);
    const data = await response.json();
    
    const results = [];
    
    if (data.AbstractText) {
        results.push({
            title: data.Heading || query,
            snippet: data.AbstractText,
            url: data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
            source: 'DuckDuckGo'
        });
    }
    
    if (Array.isArray(data.RelatedTopics)) {
        data.RelatedTopics.slice(0, 5).forEach(item => {
            if (item.Text && item.FirstURL) {
                results.push({
                    title: item.Text.split(' - ')[0],
                    snippet: item.Text,
                    url: item.FirstURL,
                    source: 'DuckDuckGo'
                });
            }
        });
    }
    
    return results;
}

function getEducationalResources(query) {
    return [];
}

function displaySearchResults(results, query) {
    const resultsDiv = document.getElementById('analysisResults');
    if (!resultsDiv) return;
    
    resultsDiv.innerHTML = `
        <div class="analysis-card">
            <h3 class="card-title">Search Results for: "${query}"</h3>
            
            <div class="analysis-summary">
                <p>${results.summary}</p>
            </div>
            
            <div class="search-results" style="margin-top: 2rem;">
                ${results.results.length === 0 ? `
                    <div class="empty-state">
                        <i class="fas fa-search empty-icon"></i>
                        <h3 class="empty-title">No results found</h3>
                        <p class="empty-desc">Try another search term.</p>
                    </div>
                ` : results.results.map(result => `
                    <div class="search-result-item" style="background-color: var(--hover-bg); padding: 1.5rem; border-radius: 8px; margin-bottom: 1rem;">
                        <h4 style="margin-bottom: 0.5rem;">
                            <a href="${result.url}" target="_blank" class="source-link">${result.title}</a>
                        </h4>
                        <p style="margin-bottom: 1rem;">${result.snippet}</p>
                        <div style="font-size: 0.875rem; color: var(--text-secondary);">
                            Source: <a href="${result.url}" target="_blank" class="source-link">${result.source}</a>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function handleSearchEnter(event) {
    if (event.key === 'Enter') {
        searchWebAnswer();
    }
}

// Dictionary Functions
function showDictionary() {
    const panel = document.getElementById('dictionaryPanel');
    if (panel) {
        panel.classList.add('active');
        document.getElementById('dictionaryInput').focus();
    }
}

function closeDictionary() {
    const panel = document.getElementById('dictionaryPanel');
    if (panel) {
        panel.classList.remove('active');
        document.getElementById('dictionaryInput').value = '';
        document.getElementById('dictionaryResults').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-book-open empty-icon"></i>
                <h3 class="empty-title">Enter a word to search</h3>
                <p class="empty-desc">Get definitions, pronunciations, and more</p>
            </div>
        `;
    }
}

async function lookupWord() {
    const word = document.getElementById('dictionaryInput').value.trim();
    
    if (!word) {
        showToast('Please enter a word to look up', 'warning');
        return;
    }
    
    showLoading('Looking up word...');
    
    try {
        const definition = await searchWordDefinition(word);
        displayWordDefinition(definition);
        hideLoading();
    } catch (error) {
        console.error('Dictionary lookup error:', error);
        hideLoading();
        showToast('Error looking up word', 'error');
    }
}

async function searchWordDefinition(word) {
    try {
        // Try Wikipedia API for word definition
        const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`);
        const data = await response.json();
        
        if (data.extract) {
            return {
                word: data.title || word,
                definition: data.extract,
                source: 'Wikipedia',
                url: data.content_urls?.desktop?.page
            };
        }
        
        // Fallback definition
        return {
            word: word,
            definition: `No definition found for "${word}". Try checking the spelling or search for related terms.`,
            source: 'DOCMATE'
        };
        
    } catch (error) {
        console.error('Dictionary API error:', error);
        return {
            word: word,
            definition: `Error looking up "${word}". Please try again.`,
            source: 'Error'
        };
    }
}

function displayWordDefinition(definition) {
    const resultsDiv = document.getElementById('dictionaryResults');
    if (!resultsDiv) return;
    
    resultsDiv.innerHTML = `
        <div class="definition-card">
            <h3 class="word-title">${definition.word}</h3>
            <div class="definition-text">
                ${definition.definition}
            </div>
            <div class="definition-source">
                Source: ${definition.source}
                ${definition.url ? `<br><a href="${definition.url}" target="_blank" class="source-link">Read more</a>` : ''}
            </div>
        </div>
    `;
}

function handleDictionaryEnter(event) {
    if (event.key === 'Enter') {
        lookupWord();
    }
}

// Language and Translation
async function onLanguageChange() {
    const newLanguage = document.getElementById('languageSelector').value;
    
    if (currentBook && newLanguage !== currentLanguage) {
        showLoading('Translating document...');
        try {
            await translateCurrentDocument(newLanguage);
            hideLoading();
        } catch (error) {
            console.error('Translation error:', error);
            hideLoading();
            showToast('Translation failed. Please try again.', 'error');
        }
    }
    
    currentLanguage = newLanguage;
    showToast(`Language changed to ${languageConfig[newLanguage].name}`, 'info');
}

async function translateCurrentDocument(targetLanguage) {
    if (!currentBook) return;
    
    try {
        const originalContent = currentBook.originalContent || currentBook.content;
        
        if (!currentBook.originalContent) {
            currentBook.originalContent = currentBook.content;
        }

        if (targetLanguage === 'en') {
            currentBook.content = originalContent;
            currentBook.pages = splitIntoPages(originalContent);
        } else {
            const translatedContent = await translateText(originalContent, targetLanguage);
            currentBook.content = translatedContent;
            currentBook.pages = splitIntoPages(translatedContent);
        }

        const bookIndex = currentBooks.findIndex(book => book.id === currentBook.id);
        if (bookIndex !== -1) {
            currentBooks[bookIndex] = currentBook;
            localStorage.setItem('docmate_books', JSON.stringify(currentBooks));
        }

        displayCurrentPage();
        showToast(`Document translated to ${languageConfig[targetLanguage].name}`, 'success');
        
    } catch (error) {
        throw error;
    }
}

async function translateText(text, targetLanguage) {
    // This would integrate with real translation APIs
    // For now, return the original text with a note
    console.log(`Translating to ${targetLanguage}:`, text.substring(0, 100));
    return text; // In real implementation, this would return translated text
}

// Quiz Functions
function showQuiz() {
    showSection('quiz');
    // Quiz is marked as "Coming Soon"
    showToast('Quiz feature coming soon! Stay tuned for updates.', 'info');
}

// Utility Functions
function updateCounts() {
    const notesCount = document.getElementById('notesCount');
    const audioCount = document.getElementById('audioCount');
    
    if (notesCount) notesCount.textContent = `${currentNotes.length} notes`;
    if (audioCount) audioCount.textContent = `${currentAudioNotes.length} recordings`;
}

function showLoading(message = 'Loading...') {
    const overlay = document.getElementById('loadingOverlay');
    const text = document.getElementById('loadingText');
    
    if (overlay && text) {
        text.textContent = message;
        overlay.style.display = 'flex';
    }
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    toast.innerHTML = `<span>${message}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 100);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

function handleKeyboardShortcuts(event) {
    if (event.ctrlKey || event.metaKey) {
        switch(event.key) {
            case 'h':
                event.preventDefault();
                showSection('home');
                break;
            case 'l':
                event.preventDefault();
                showSection('library');
                break;
            case 'n':
                event.preventDefault();
                showSection('saved-notes');
                break;
            case 'a':
                event.preventDefault();
                showSection('analysis');
                break;
        }
    }
    
    // Reading navigation
    if (document.getElementById('reading').classList.contains('active')) {
        switch(event.key) {
            case 'ArrowLeft':
                event.preventDefault();
                previousPage();
                break;
            case 'ArrowRight':
                event.preventDefault();
                nextPage();
                break;
        }
    }
}

// Auto-save functionality
setInterval(() => {
    if (currentBook) {
        currentBook.currentPage = currentPage;
        localStorage.setItem('docmate_books', JSON.stringify(currentBooks));
    }
}, 30000); // Save every 30 seconds
