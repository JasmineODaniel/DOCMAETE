// DOCMATE - API Integration
// Handles external API calls for translation, search, and other services

// API Configuration
const API_CONFIG = {
    // Google APIs
    GOOGLE_TRANSLATE_API_KEY: 'YOUR_GOOGLE_TRANSLATE_API_KEY',
    GOOGLE_SEARCH_API_KEY: 'AIzaSyAetvv0JFuqZ3sOZLT0JelFEto0-hkfmDQ',
    GOOGLE_SEARCH_ENGINE_ID: '9680d3496cc254522',

    // Supabase
    SUPABASE_URL: 'https://retuztroeeeogugoskoy.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJldHV6dHJvZWVlb2d1Z29za295Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2Mzk5MzMsImV4cCI6MjA4MDIxNTkzM30.SbHydNVZY7N_VZTH6aWYd9dZKY0BC6dHuYIVvLapxxc',
    
    // Microsoft Azure
    AZURE_TRANSLATOR_KEY: 'YOUR_AZURE_TRANSLATOR_KEY',
    AZURE_TRANSLATOR_REGION: 'YOUR_AZURE_REGION',
    
    // OpenAI (for enhanced analysis)
    OPENAI_API_KEY: 'YOUR_OPENAI_API_KEY',
    
    // DeepL Translation
    DEEPL_API_KEY: 'YOUR_DEEPL_API_KEY',
    
    // Other APIs
    WIKIPEDIA_API_BASE: 'https://en.wikipedia.org/api/rest_v1',
    DUCKDUCKGO_API_BASE: 'https://api.duckduckgo.com'
};

// Translation Services
class TranslationService {
    static async translateText(text, targetLanguage, sourceLanguage = 'en') {
        try {
            // Try Google Translate first
            const googleResult = await this.translateWithGoogle(text, targetLanguage, sourceLanguage);
            if (googleResult) return googleResult;
            
            // Fallback to Azure Translator
            const azureResult = await this.translateWithAzure(text, targetLanguage, sourceLanguage);
            if (azureResult) return azureResult;
            
            // Fallback to DeepL
            const deeplResult = await this.translateWithDeepL(text, targetLanguage, sourceLanguage);
            if (deeplResult) return deeplResult;
            
            throw new Error('All translation services failed');
            
        } catch (error) {
            console.error('Translation error:', error);
            throw error;
        }
    }
    
    static async translateWithGoogle(text, targetLanguage, sourceLanguage) {
        if (!API_CONFIG.GOOGLE_TRANSLATE_API_KEY || API_CONFIG.GOOGLE_TRANSLATE_API_KEY === 'YOUR_GOOGLE_TRANSLATE_API_KEY') {
            return null;
        }
        
        try {
            const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${API_CONFIG.GOOGLE_TRANSLATE_API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    q: text,
                    target: targetLanguage,
                    source: sourceLanguage,
                    format: 'text'
                })
            });
            
            const data = await response.json();
            if (data.data && data.data.translations && data.data.translations[0]) {
                return data.data.translations[0].translatedText;
            }
            
            return null;
        } catch (error) {
            console.error('Google Translate error:', error);
            return null;
        }
    }
    
    static async translateWithAzure(text, targetLanguage, sourceLanguage) {
        if (!API_CONFIG.AZURE_TRANSLATOR_KEY || API_CONFIG.AZURE_TRANSLATOR_KEY === 'YOUR_AZURE_TRANSLATOR_KEY') {
            return null;
        }
        
        try {
            const response = await fetch(`https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=${sourceLanguage}&to=${targetLanguage}`, {
                method: 'POST',
                headers: {
                    'Ocp-Apim-Subscription-Key': API_CONFIG.AZURE_TRANSLATOR_KEY,
                    'Ocp-Apim-Subscription-Region': API_CONFIG.AZURE_TRANSLATOR_REGION,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify([{ text: text }])
            });
            
            const data = await response.json();
            if (data && data[0] && data[0].translations && data[0].translations[0]) {
                return data[0].translations[0].text;
            }
            
            return null;
        } catch (error) {
            console.error('Azure Translator error:', error);
            return null;
        }
    }
    
    static async translateWithDeepL(text, targetLanguage, sourceLanguage) {
        if (!API_CONFIG.DEEPL_API_KEY || API_CONFIG.DEEPL_API_KEY === 'YOUR_DEEPL_API_KEY') {
            return null;
        }
        
        try {
            const response = await fetch('https://api-free.deepl.com/v2/translate', {
                method: 'POST',
                headers: {
                    'Authorization': `DeepL-Auth-Key ${API_CONFIG.DEEPL_API_KEY}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    'text': text,
                    'target_lang': targetLanguage.toUpperCase(),
                    'source_lang': sourceLanguage.toUpperCase()
                })
            });
            
            const data = await response.json();
            if (data.translations && data.translations[0]) {
                return data.translations[0].text;
            }
            
            return null;
        } catch (error) {
            console.error('DeepL error:', error);
            return null;
        }
    }
}

// Search Services
class SearchService {
    static async searchWeb(query) {
        const results = {
            summary: `Search results for "${query}":`,
            results: []
        };
        
        try {
            // Google Custom Search only (requires API key + cx)
            const googleResults = await this.searchGoogle(query);
            if (googleResults && googleResults.length) {
                results.results.push(...googleResults);
            }
            return results;
            
        } catch (error) {
            console.error('Search error:', error);
            return {
                summary: `Couldn't fetch results for "${query}".`,
                results: []
            };
        }
    }
    
    static async searchGoogle(query) {
        if (!API_CONFIG.GOOGLE_SEARCH_API_KEY || API_CONFIG.GOOGLE_SEARCH_API_KEY === 'YOUR_GOOGLE_SEARCH_API_KEY') {
            return [];
        }
        
        try {
            const response = await fetch(`https://www.googleapis.com/customsearch/v1?key=${API_CONFIG.GOOGLE_SEARCH_API_KEY}&cx=${API_CONFIG.GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=3`);
            const data = await response.json();
            
            if (data.items) {
                return data.items.map(item => ({
                    title: item.title,
                    snippet: item.snippet,
                    url: item.link,
                    source: 'Google Search'
                }));
            }
            
            return [];
        } catch (error) {
            console.error('Google search error:', error);
            return [];
        }
    }
}

// Dictionary Service
class DictionaryService {
    static async lookupWord(word) {
        try {
            // Try multiple dictionary sources
            const [duckduckgoResult, wikipediaResult] = await Promise.allSettled([
                this.lookupWithDuckDuckGo(word),
                this.lookupWithWikipedia(word)
            ]);
            
            if (duckduckgoResult.status === 'fulfilled' && duckduckgoResult.value) {
                return duckduckgoResult.value;
            }
            
            if (wikipediaResult.status === 'fulfilled' && wikipediaResult.value) {
                return wikipediaResult.value;
            }
            
            return {
                word: word,
                definition: `No definition found for "${word}". Try checking the spelling or search for related terms.`,
                source: 'DOCMATE'
            };
            
        } catch (error) {
            console.error('Dictionary lookup error:', error);
            return {
                word: word,
                definition: `Error looking up "${word}". Please try again.`,
                source: 'Error'
            };
        }
    }
    
    static async lookupWithDuckDuckGo(word) {
        try {
            const response = await fetch(`${API_CONFIG.DUCKDUCKGO_API_BASE}/?q=${encodeURIComponent(word)}&format=json&no_html=1&skip_disambig=1`);
            const data = await response.json();
            
            if (data.AbstractText) {
                return {
                    word: word,
                    definition: data.AbstractText,
                    source: 'DuckDuckGo',
                    url: data.AbstractURL
                };
            }
            
            return null;
        } catch (error) {
            console.error('DuckDuckGo lookup error:', error);
            return null;
        }
    }
    
    static async lookupWithWikipedia(word) {
        try {
            const response = await fetch(`${API_CONFIG.WIKIPEDIA_API_BASE}/page/summary/${encodeURIComponent(word)}`);
            const data = await response.json();
            
            if (data.extract) {
                return {
                    word: data.title || word,
                    definition: data.extract,
                    source: 'Wikipedia',
                    url: data.content_urls?.desktop?.page
                };
            }
            
            return null;
        } catch (error) {
            console.error('Wikipedia lookup error:', error);
            return null;
        }
    }
}

// Text-to-Speech Service
class TTSService {
    static async getVoicesForLanguage(languageCode) {
        if ('speechSynthesis' in window) {
            const voices = speechSynthesis.getVoices();
            return voices.filter(voice => 
                voice.lang.startsWith(languageCode) || 
                voice.lang.toLowerCase().includes(languageCode)
            );
        }
        return [];
    }
    
    static async speakText(text, options = {}) {
        if (!('speechSynthesis' in window)) {
            throw new Error('Text-to-speech not supported');
        }
        
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Apply options
        if (options.lang) utterance.lang = options.lang;
        if (options.pitch) utterance.pitch = options.pitch;
        if (options.rate) utterance.rate = options.rate;
        if (options.volume) utterance.volume = options.volume;
        if (options.voice) utterance.voice = options.voice;
        
        return new Promise((resolve, reject) => {
            utterance.onend = resolve;
            utterance.onerror = reject;
            speechSynthesis.speak(utterance);
        });
    }
}

// Export services
window.apiServices = {
    TranslationService,
    SearchService,
    DictionaryService,
    TTSService
};

// Expose config for auth init
window.apiConfig = API_CONFIG;

// Utility functions for API integration
window.apiUtils = {
    // Check if API key is configured
    isConfigured: (service) => {
        const key = API_CONFIG[service];
        return key && !key.startsWith('YOUR_');
    },
    
    // Rate limiting for API calls
    rateLimiter: (() => {
        const limits = new Map();
        return {
            canMakeRequest: (service, maxRequests = 10, windowMs = 60000) => {
                const now = Date.now();
                const key = service;
                
                if (!limits.has(key)) {
                    limits.set(key, []);
                }
                
                const requests = limits.get(key);
                const validRequests = requests.filter(time => now - time < windowMs);
                
                if (validRequests.length >= maxRequests) {
                    return false;
                }
                
                validRequests.push(now);
                limits.set(key, validRequests);
                return true;
            }
        };
    })(),
    
    // Error handling for API calls
    handleApiError: (error, service) => {
        console.error(`${service} API Error:`, error);
        
        if (error.status === 429) {
            return 'Rate limit exceeded. Please try again later.';
        } else if (error.status === 401) {
            return 'API authentication failed. Please check your API keys.';
        } else if (error.status === 403) {
            return 'API access forbidden. Please check your permissions.';
        } else {
            return `${service} service temporarily unavailable. Please try again.`;
        }
    }
};
