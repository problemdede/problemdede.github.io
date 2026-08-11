let questions = [];
let currentQIndex = 0;
let isSolutionMode = false;
let currentStep = 0;
let maxStepsInCurrentSolution = 0;

/* AKILLI URL BİLGİSİ OKUYUCU */
window.onload = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const filePath = urlParams.get('file');
  const mode = urlParams.get('mode');

  if (mode === 'local') {
    const localContent = sessionStorage.getItem('custom_md_content');
    if (localContent) {
      initPresentation(localContent);
    } else {
      alert("Yerel dosya içeriği bulunamadı.");
    }
  } else if (filePath) {
    loadPresentationFromPath(filePath);
  } else {
    const slideCard = document.getElementById('slide-card');
    if (slideCard) {
      slideCard.innerHTML = "<div class='slot'><h2>Lütfen index.html sayfasından bir sunum seçin.</h2></div>";
    }
  }
};

async function loadPresentationFromPath(filePath) {
  try {
    const response = await fetch(filePath);
    if (!response.ok) throw new Error("Sunum dosyası bulunamadı!");
    const mdText = await response.text();
    initPresentation(mdText);
  } catch (err) {
    alert("Sunum yüklenirken hata oluştu: " + err.message);
  }
}

function initPresentation(mdText) {
  questions = [];
  currentQIndex = 0;
  isSolutionMode = false;
  currentStep = 0;
  
  parseMarkdown(mdText);
  render();
  autoScalePresentation();
}

/* REVEAL.JS OTOMATİK ÖLÇEKLENDİRME MOTORU */
function autoScalePresentation() {
  const card = document.getElementById('slide-card');
  const container = document.getElementById('stage-container');
  if (!card || !container) return;

  const baseWidth = 1600;
  const baseHeight = 900;
  const availableWidth = container.clientWidth - 24;
  const availableHeight = container.clientHeight - 24;

  const scaleX = availableWidth / baseWidth;
  const scaleY = availableHeight / baseHeight;
  const scale = Math.min(scaleX, scaleY);

  card.style.transform = `scale(${scale})`;
}

window.addEventListener('resize', autoScalePresentation);

/* MARKDOWN PARSER */
function parseMarkdown(cleanMD) {
  const questionBlocks = cleanMD.split(/^===$/gm).filter(b => b.trim());

  questions = questionBlocks.map((block, idx) => {
    const parts = block.split(/^--v--$/gm);
    const qParsed = parseSlideContent(parts[0], 'split-2');
    
    let sParsed = qParsed;
    let hasSolution = false;

    if (parts.length > 1) {
      sParsed = parseSlideContent(parts[1], qParsed.layout);
      hasSolution = true;
    }

    // Slaytın içeriğinde "Soru" kelimesi geçiyor mu veya --v-- var mı?
    // Böylece giriş/kapak slaytları soru havuzundan ayrılır.
    const isRealQuestion = hasSolution || block.toLowerCase().includes('soru:');

    return {
      id: idx + 1,
      question: qParsed,
      solution: sParsed,
      hasSolution: hasSolution,
      isQuestion: isRealQuestion // Gerçek bir soru mu yoksa kapak/giriş mi?
    };
  });
}

function parseSlideContent(rawText, fallbackLayout = 'split-2') {
  let layout = fallbackLayout;
  let textToParse = rawText.trim();

  const headerMatch = textToParse.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---/);
  if (headerMatch) {
    const headerLines = headerMatch[1].split('\n');
    const layoutLine = headerLines.find(l => l.trim().startsWith('layout:'));
    if (layoutLine) {
      layout = layoutLine.replace('layout:', '').trim();
    }
    textToParse = textToParse.replace(headerMatch[0], '').trim();
  }

  const slots = [];
  const slotRegex = /:::\s*slot-\d+([\s\S]*?):::/g;
  let match;
  
  while ((match = slotRegex.exec(textToParse)) !== null) {
    slots.push(match[1].trim());
  }

  if (slots.length === 0 && textToParse.length > 0) {
    slots.push(textToParse);
  }

  return { layout, slots };
}

/* KESİN ADIM AYRIŞTIRMA VE ETİKET TEMİZLEME MOTORU */
function processStepTags(rawMD) {
  if (!rawMD.includes('[step:')) {
    return marked.parse(rawMD);
  }

  const firstStepMatch = rawMD.search(/\[step:/i);
  const introPart = rawMD.substring(0, firstStepMatch).trim();
  const stepsPart = rawMD.substring(firstStepMatch);

  let resultHTML = introPart ? marked.parse(introPart) : '';

  // Tüm [step: X] veya [step: X -> Y] bloklarını global olarak yakalayan yapı
  const stepBlockRegex = /\[step:\s*(\d+)(?:\s*->\s*(\d+))?\]([\s\S]*?)(?=\[step:|$)/gi;
  let match;

  while ((match = stepBlockRegex.exec(stepsPart)) !== null) {
    const birth = parseInt(match[1]);
    const death = match[2] ? parseInt(match[2]) : 999;
    let content = match[3].trim();

    if (content) {
      const parsedContent = marked.parse(content);
      // Aynı adım numarasına sahip birden fazla öğe DOM'a ayrı ayrı eklenir
      resultHTML += `<div class="step-item step-hidden" data-birth="${birth}" data-death="${death}">${parsedContent}</div>`;
    }
  }

  return resultHTML;
}

/* EKRAN RENDER */
function render() {
  if (!questions.length) return;

  const currentQ = questions[currentQIndex];
  const slideData = isSolutionMode ? currentQ.solution : currentQ.question;
  const card = document.getElementById('slide-card');

  if (!card) return;

  card.className = `aspect-16-9 layout-${slideData.layout}`;

  let htmlOutput = '';
  slideData.slots.forEach((slotMD) => {
    // Soru modunda olsak dahi [step:] etiketlerini temizleyip DOM'a gizli ekliyoruz
    let htmlContent = processStepTags(slotMD);
    htmlOutput += `<div class="slot">${htmlContent}</div>`;
  });

  card.innerHTML = htmlOutput;

  // KaTeX Render
  if (typeof renderMathInElement === 'function') {
    renderMathInElement(card, {
      delimiters: [
        {left: '$$', right: '$$', display: true},
        {left: '$', right: '$', display: false}
      ],
      throwOnError: false
    });
  }

  calculateMaxSteps();

  if (isSolutionMode) {
    updateStepsVisibility();
  } else {
    // Soru modundayken tüm adımları gizli tut
    document.querySelectorAll('.step-item').forEach(item => item.classList.add('step-hidden'));
    updateProgressBar(0);
  }

  updateUI();
  autoScalePresentation();
}

function calculateMaxSteps() {
  const stepItems = document.querySelectorAll('.step-item');
  let max = 0;
  stepItems.forEach(item => {
    const birth = parseInt(item.getAttribute('data-birth'));
    const death = parseInt(item.getAttribute('data-death'));
    if (birth > max) max = birth;
    if (death < 999 && death > max) max = death;
  });
  maxStepsInCurrentSolution = max;
}

function updateStepsVisibility() {
  const stepItems = document.querySelectorAll('.step-item');
  stepItems.forEach(item => {
    const birth = parseInt(item.getAttribute('data-birth'));
    const death = parseInt(item.getAttribute('data-death'));

    const isAlive = (death === 999) 
      ? (currentStep >= birth) 
      : (currentStep >= birth && currentStep < death);

    if (isAlive) {
      item.classList.remove('step-hidden');
    } else {
      item.classList.add('step-hidden');
    }
  });

  const progress = maxStepsInCurrentSolution > 0 ? (currentStep / maxStepsInCurrentSolution) * 100 : 100;
  updateProgressBar(progress);
}

function updateProgressBar(percentage) {
  const pb = document.getElementById('progress-bar');
  if (pb) pb.style.width = `${percentage}%`;
}

function updateUI() {
  const badge = document.getElementById('mode-badge');
  if (badge) {
    const currentQ = questions[currentQIndex];
    if (isSolutionMode && currentQ.hasSolution) {
      badge.className = 'badge-solution';
      badge.innerText = `ÇÖZÜM (${currentStep}/${maxStepsInCurrentSolution})`;
    } else {
      badge.className = 'badge-question';
      badge.innerText = currentQ.hasSolution ? 'SORU' : 'GİRİŞ';
    }
  }

  const scrollContainer = document.getElementById('question-scroll-container');
  if (!scrollContainer) return;
  
  scrollContainer.innerHTML = '';

  // Sadece gerçek soruları numaralandırarak alt alta/yan yana listeleyelim
  let questionCounter = 0;

  questions.forEach((q, idx) => {
    // Eğer gerçek bir soru değilse alt navigasyona hiç ekleme
    if (!q.isQuestion) return;

    questionCounter++;
    const pill = document.createElement('div');
    pill.className = `q-pill ${idx === currentQIndex ? 'active' : ''} ${isSolutionMode && idx === currentQIndex && q.hasSolution ? 'in-solution' : ''}`;
    
    // Görünen numara sırayla (1, 2, 3...) olsun
    pill.innerText = questionCounter; 
    pill.onclick = () => jumpToQuestion(idx);
    scrollContainer.appendChild(pill);

    if (idx === currentQIndex) {
      setTimeout(() => {
        pill.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }, 50);
    }
  });
}

/* ADIM VE SAYFA KONTROLLERİ */
function stepForward() {
  const currentQ = questions[currentQIndex];

  // Eğer bu slaytın çözümü/adımı yoksa, direkt sonraki soruya geç
  if (!currentQ.hasSolution) {
    nextQuestion();
    return;
  }

  if (!isSolutionMode) {
    isSolutionMode = true;
    currentStep = 1;
    render();
  } else {
    if (currentStep < maxStepsInCurrentSolution) {
      currentStep++;
      updateStepsVisibility();
      updateUI();
    } else {
      nextQuestion();
    }
  }
}

function stepBackward() {
  if (isSolutionMode) {
    if (currentStep > 1) {
      currentStep--;
      updateStepsVisibility();
      updateUI();
    } else {
      isSolutionMode = false;
      currentStep = 0;
      render();
    }
  }
}

function nextQuestion() {
  if (currentQIndex < questions.length - 1) {
    currentQIndex++;
    isSolutionMode = false;
    currentStep = 0;
    render();
  }
}

function prevQuestion() {
  if (currentQIndex > 0) {
    currentQIndex--;
    isSolutionMode = false;
    currentStep = 0;
    render();
  }
}

function jumpToQuestion(index) {
  currentQIndex = index;
  isSolutionMode = false;
  currentStep = 0;
  render();
}

/* TAM EKRAN */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.error(`Tam ekran hatası: ${err.message}`);
    });
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

document.addEventListener('fullscreenchange', () => {
  const btn = document.getElementById('fullscreen-btn');
  if (!btn) return;

  if (document.fullscreenElement) {
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>`;
  } else {
    btn.innerHTML = `<svg class="icon-expand" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
  }
  setTimeout(autoScalePresentation, 100);
});

/* KLAVYE KISAYOLLARI */
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === ' ') {
    e.preventDefault();
    stepForward();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    stepBackward();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    nextQuestion();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    prevQuestion();
  }
});


/* DOKUNMATİK KAYDIRMA (SWIPE) DESTEĞİ */
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;

// Minimum kaydırma mesafesi (yanlışlıkla dokunmaları engellemek için eşik değer)
const minSwipeDistance = 50; 

document.addEventListener('touchstart', (e) => {
  touchStartX = e.changedTouches[0].screenX;
  touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

document.addEventListener('touchend', (e) => {
  touchEndX = e.changedTouches[0].screenX;
  touchEndY = e.changedTouches[0].screenY;
  handleSwipeGesture();
}, { passive: true });

function handleSwipeGesture() {
  const diffX = touchEndX - touchStartX;
  const diffY = touchEndY - touchStartY;

  // Hangi yönde daha fazla kaydırıldığını buluyoruz (Yatay mı Dikey mi?)
  if (Math.abs(diffX) > Math.abs(diffY)) {
    // YATAY KAYDIRMA (Sola / Sağa)
    if (Math.abs(diffX) < minSwipeDistance) return;

    if (diffX < 0) {
      // Sola kaydırma -> Sonraki soruya geç (Sağ ok tuşuyla aynı işlev)
      nextQuestion();
    } else {
      // Sağa kaydırma -> Önceki soruya geç (Sol ok tuşuyla aynı işlev)
      prevQuestion();
    }
  } else {
    // DİKEY KAYDIRMA (Yukarı / Aşağı)
    if (Math.abs(diffY) < minSwipeDistance) return;

    if (diffY < 0) {
      // Yukarı kaydırma -> Adım ilerlet / Çözümü aç (Aşağı ok / Boşluk tuşuyla aynı işlev)
      stepForward();
    } else {
      // Aşağı kaydırma -> Adımı geri al (Yukarı ok tuşuyla aynı işlev)
      stepBackward();
    }
  }
}

window.onbeforeprint = () => {

    const container = document.getElementById('stage-container');
    const originalCard = document.getElementById('slide-card');

    if (!container || !originalCard) {
        console.error(
            'Print: stage-container veya slide-card bulunamadı.'
        );
        return;
    }


    /* =========================================================
       ESKİ PRINT SAYFALARINI TEMİZLE
       ========================================================= */

    document
        .querySelectorAll('.print-page')
        .forEach(el => el.remove());


    /* =========================================================
       HER SORU = 1 A4 SAYFASI
       ========================================================= */

    questions.forEach((q, index) => {

        /* =====================================================
           A4 PAGE
           ===================================================== */

        const page = document.createElement('div');

        page.className = 'print-page';

        page.dataset.slideIndex = index;


        /* =====================================================
           1600 × 900 SLAYT
           ===================================================== */

        const slide = document.createElement('div');

        /*
         * DİKKAT:
         *
         * Buraya layout-single,
         * layout-split-2,
         * layout-split-3
         * EKLENMİYOR.
         *
         * Layout sadece slide-content üzerinde olacak.
         */

        slide.className = 'print-slide-clone';


        /* =====================================================
           SLIDE CONTENT
           ===================================================== */

        const content = document.createElement('div');

        content.className = 'slide-content';


        /* =====================================================
           SLOT VERİLERİ
           ===================================================== */

        const slots = q.question?.slots || [];


        console.log(
            `PRINT ${index + 1}. SLAYT - ${slots.length} SLOT`
        );


        /* =====================================================
           LAYOUT
           ===================================================== */

        if (slots.length <= 1) {

            content.classList.add(
                'layout-single'
            );

        } else if (slots.length === 2) {

            content.classList.add(
                'layout-split-2'
            );

        } else {

            content.classList.add(
                'layout-split-3'
            );
        }


        /* =====================================================
           SLOT'LARI OLUŞTUR
           ===================================================== */

        slots.forEach((slotMD, slotIndex) => {

            const slot = document.createElement('div');

            slot.className = 'slot';

            slot.dataset.slotIndex = slotIndex;

            /*
             * Markdown → HTML
             */
            slot.innerHTML = marked.parse(slotMD);


            /*
             * Content'e ekle
             */
            content.appendChild(slot);
        });


        /* =====================================================
           CONTENT → SLIDE
           ===================================================== */

        slide.appendChild(content);


        /* =====================================================
           SLIDE → PAGE
           ===================================================== */

        page.appendChild(slide);


        /* =====================================================
           PAGE → CONTAINER
           ===================================================== */

        container.appendChild(page);

    });


    console.log(
        'PRINT TOPLAM SAYFA:',
        document.querySelectorAll('.print-page').length
    );
};


window.onafterprint = () => {

    document
        .querySelectorAll('.print-page')
        .forEach(el => el.remove());

};
