// ==========================================
// 1. ANA SUNUM VE ZOOM AYARLARI (KODUN EN TEPESİNDE)
// ==========================================
const INITIAL_FONT_SIZE = 28; // Başlangıç font boyutu

// 🌟 GÜNCELLEME: İlk açılışta hafızada kayıtlı zoom varsa onu alır, yoksa %100 başlatır
let currentZoomPercentage = getSavedZoomPercentage(); 

let currentSlideIndex = 0;
let currentStep = 0; // Slayt içindeki aktif animasyon adımını tutar

const slides = document.querySelectorAll('.slide');
const pageIndicator = document.getElementById('page-indicator');
const totalSlides = slides.length;

// ==========================================
// 2. HAFİZA VE NAVİGASYON SİSTEMİ
// ==========================================

// HAFİZA SİSTEMİ: Tarayıcıda kayıtlı kalmış bir sayfa var mı kontrol et
function getSavedSlideIndex() {
    const savedIndex = localStorage.getItem('currentSlideIndex');
    return savedIndex ? parseInt(savedIndex, 10) : 0;
}

function saveSlideIndex(index) {
    localStorage.setItem('currentSlideIndex', index);
}

// 🌟 YENİ: Zoom hafıza fonksiyonları
function getSavedZoomPercentage() {
    const savedZoom = localStorage.getItem('currentZoomPercentage');
    return savedZoom ? parseInt(savedZoom, 10) : 100;
}

function saveZoomPercentage(percentage) {
    localStorage.setItem('currentZoomPercentage', percentage);
}

function showSlide(index, mode = 'start') {
    if (index >= totalSlides || index < 0) return;

    currentSlideIndex = index;
    
    // Slaytları temizle
    slides.forEach(slide => {
        slide.classList.remove('active');
        slide.querySelectorAll('.fade-item').forEach(item => {
            item.classList.remove('visible');
        });
    });
    
    const activeSlide = slides[currentSlideIndex];
    activeSlide.classList.add('active');

    // AKILLI ADIM AYARLAMA: 
    if (mode === 'end') {
        const fadeItems = activeSlide.querySelectorAll('.fade-item[data-step]');
        let maxStep = 0;
        fadeItems.forEach(item => {
            const step = parseInt(item.getAttribute('data-step'), 10);
            if (step > maxStep) maxStep = step;
        });
        currentStep = maxStep;
        
        activeSlide.querySelectorAll('.fade-item').forEach(item => {
            const step = item.getAttribute('data-step');
            if (!step || parseInt(step, 10) <= currentStep) {
                item.classList.add('visible');
            }
        });
    } else {
        currentStep = 0;
        
        activeSlide.querySelectorAll('.fade-item:not([data-step])').forEach(item => {
            item.classList.add('visible');
        });
    }

    // Her başarılı sayfa değişiminde hafızayı güncelle
    saveSlideIndex(currentSlideIndex);

    if (pageIndicator) {
        pageIndicator.textContent = `${currentSlideIndex + 1} / ${totalSlides}`;
    }
}

// Gelişmiş İleri Navigasyon
function navigateNext() {
    const activeSlide = slides[currentSlideIndex];
    const fadeItems = activeSlide.querySelectorAll('.fade-item[data-step]');
    
    let maxStep = 0;
    fadeItems.forEach(item => {
        const step = parseInt(item.getAttribute('data-step'), 10);
        if (step > maxStep) maxStep = step;
    });

    if (currentStep < maxStep) {
        currentStep++;
        activeSlide.querySelectorAll(`.fade-item[data-step="${currentStep}"]`).forEach(item => {
            item.classList.add('visible');
        });
    } else {
        if (currentSlideIndex < totalSlides - 1) {
            showSlide(currentSlideIndex + 1, 'start');
        }
    }
}

function skipToNextSlide() {
    if (currentSlideIndex < totalSlides - 1) {
        showSlide(currentSlideIndex + 1, 'start');
    }
}

// Gelişmiş Geri Navigasyon
function navigatePrev() {
    const activeSlide = slides[currentSlideIndex];

    if (currentStep > 0) {
        activeSlide.querySelectorAll(`.fade-item[data-step="${currentStep}"]`).forEach(item => {
            item.classList.remove('visible');
        });
        currentStep--;
    } else {
        if (currentSlideIndex > 0) {
            showSlide(currentSlideIndex - 1, 'end');
        }
    }
}

function skipToPrevSlide() {
    if (currentSlideIndex > 0) {
        showSlide(currentSlideIndex - 1, 'end');
    }
}

function navigate(direction) {
    if (direction === 1) skipToNextSlide();
    else skipToPrevSlide();
}

// ==========================================
// 3. OLAY DİNLEYİCİLERİ (TIKLAMA, DOKUNMA, KLAVYE)
// ==========================================

document.addEventListener('click', function(event) {
    if (event.target.closest('.nav-arrow')) return;
    if (event.target.closest('#fullscreen-toggle')) return; 
    if (event.target.closest('.zoom-fixed-panel')) return;

    navigateNext();
});

document.addEventListener('keydown', function(event) {
    switch(event.key) {
        case 'ArrowRight':
        case ' ': 
            event.preventDefault();
            navigateNext();
            break;
        case 'ArrowLeft':
            event.preventDefault();
            navigatePrev();
            break;
        case 'Enter': 
            event.preventDefault();
            skipToNextSlide();
            break;
        case 'Backspace': 
            event.preventDefault();
            skipToPrevSlide();
            break;
        case 'f':
        case 'F':
            event.preventDefault();
            toggleFullscreen();
            break;
        case '+':
        case '=':
            event.preventDefault();
            zoomPresentation(2); 
            break;
        case '-':
            event.preventDefault();
            zoomPresentation(-2); 
            break;
        case '0':
            event.preventDefault();
            resetZoom(); 
            break;
    }
});

// ==========================================
// 4. TAM EKRAN VE KURŞUNGEÇİRMEZ ZOOM FONKSİYONLARI
// ==========================================

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log(`Hata: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
}

document.addEventListener('fullscreenchange', () => {
    const btn = document.getElementById('fullscreen-toggle');
    if (!btn) return;
    if (document.fullscreenElement) {
        btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6m10-6h-6v6M4 10h6V4m10 6h-6V4"/></svg>`;
    } else {
        btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
    }
});

function zoomPresentation(direction) {
    let nextPercentage = currentZoomPercentage + (direction > 0 ? 10 : -10);
    
    if (nextPercentage >= 30 && nextPercentage <= 300) {
        currentZoomPercentage = nextPercentage;
        
        // 🌟 YENİ: Yeni yüzdeyi hafızaya kaydet
        saveZoomPercentage(currentZoomPercentage);
        
        let calculatedSize = INITIAL_FONT_SIZE * (currentZoomPercentage / 100);
        document.documentElement.style.setProperty('font-size', calculatedSize + 'px', 'important');
        
        updateZoomLabel();
    }
}

function resetZoom() {
    currentZoomPercentage = 100;
    // 🌟 YENİ: Sıfırlanınca hafızayı da %100 yap
    saveZoomPercentage(currentZoomPercentage); 
    
    document.documentElement.style.setProperty('font-size', INITIAL_FONT_SIZE + 'px', 'important');
    updateZoomLabel();
}

function updateZoomLabel() {
    const label = document.querySelector('.zoom-label');
    if (label) {
        label.textContent = currentZoomPercentage + '%';
    }
}

// ==========================================
// 5. BAŞLANGIÇ TETİKLEYİCİSİ (DOM READY)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const startSlide = getSavedSlideIndex();
    showSlide(startSlide, 'start');
    
    // 🌟 GÜNCELLEME: Sayfa yüklendiğinde artık 100 değil, hafızadan gelen kayıtlı yüzde kullanılır
    let calculatedSize = INITIAL_FONT_SIZE * (currentZoomPercentage / 100);
    document.documentElement.style.setProperty('font-size', calculatedSize + 'px', 'important');
    updateZoomLabel(); 
});
