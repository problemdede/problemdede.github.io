let questions = []; 
let index = 0;
let timer;
let timeLeft;
let correctCount = 0;
let totalCount = 0;

const quizEl = document.getElementById("quiz");
const feedbackEl = document.getElementById("feedback");
const nextBtn = document.getElementById("nextBtn");
const currentEl = document.getElementById("current");
const totalEl = document.getElementById("total");
const timeFill = document.getElementById("timeFill");

// ******************************************************
// JSON'DAN VERİ YÜKLEME VE BAŞLATMA FONKSİYONLARI
// ******************************************************

async function loadQuestionsData(retries = 3) {
    const urlParams = new URLSearchParams(window.location.search);
    const jsonFileName = urlParams.get('quiz');
    
    // ... (Hata kontrolü ve diğer kodlar aynı kalır) ...

    for (let i = 0; i < retries; i++) {
        try {
            const timestamp = new Date().getTime();
            const urlWithCacheBuster = `${jsonFileName}?t=${timestamp}`; 
            
            const response = await fetch(urlWithCacheBuster);
            
            if (response.ok) {
                questions = await response.json();
                startQuiz();
                return; // Başarılıysa fonksiyonu sonlandır
            }
            
            // Eğer response.ok değilse, bir sonraki döngüde tekrar deneyecek
            throw new Error(`Dosya bulunamadı veya sunucu hatası: ${response.status}`);
            
        } catch (error) {
            console.warn(`Veri yükleme denemesi ${i + 1} başarısız oldu.`, error.message);
            if (i === retries - 1) {
                // Son deneme de başarısızsa genel hata mesajını göster
                quizEl.innerHTML = `
                    <p style="color: red; font-weight: bold;">Veri yükleme hatası (${jsonFileName}):</p>
                    <p>Sunucuya erişilemiyor veya dosya yayımlanmadı. Lütfen tekrar deneyin.</p>
                `;
                console.error('Tüm yükleme denemeleri başarısız oldu.', error);
                return;
            }
            // Kısa bir bekleme yap (örn: 500ms)
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
}

function startQuiz() {
    totalEl.innerHTML = questions.length;
    index = 0;
    correctCount = 0;
    totalCount = 0;
    loadQuestion();
}

// ******************************************************
// YARDIMCI VE QUIZ MANTIK FONKSİYONLARI (ORİJİNAL KOD)
// ******************************************************

function normalize(text) {
  return text.toLowerCase().replace(/\s+/g, "");
}

function startTimer(seconds) {
  clearInterval(timer);
  timeLeft = seconds;
  updateBar(seconds);
  timer = setInterval(() => {
    timeLeft--;
    updateBar(seconds);
    if (timeLeft <= 0) {
      clearInterval(timer);
      showFeedback(false, "⏰ Süre doldu! Doğru cevap verilemedi.");
    }
  }, 1000);
}

function updateBar(total) {
  timeFill.style.width = (timeLeft / total) * 100 + "%";
}

function showFeedback(correct, text) {
  if (correct !== null) {
    totalCount++;
    if (correct) correctCount++;
  }
  feedbackEl.innerHTML = text;
  const feedbackClass = correct === true ? "correct" : (correct === false ? "wrong" : "note");
  feedbackEl.className = "feedback " + feedbackClass;
  nextBtn.style.display = "block";
}

function loadQuestion() {
  quizEl.innerHTML = "";
  feedbackEl.innerHTML = "";
  feedbackEl.className = "feedback";
  nextBtn.style.display = "none";

  const q = questions[index];
  currentEl.innerHTML = index + 1;

  startTimer(q.time);

  const title = document.createElement("div");
  title.className = "question";
  title.innerHTML = q.question;
  quizEl.appendChild(title);

  // ÇOKTAN SEÇMELİ - CEVAP DEĞERİ VE RASTGELE SIRALAMA İLE
  if (q.type === "multiple") {
    const correctAnswer = q.correct_answer; 
    
    // 2. Seçenekleri rastgele karıştır
    const shuffledOptions = [...q.options];
    for (let i = shuffledOptions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
    }
    
    // 3. Karıştırılmış seçenekleri DOM'a ekle
    shuffledOptions.forEach(opt => {
        const btn = document.createElement("div");
        btn.className = "option";
        btn.innerHTML = opt; // img tagları burada render edilir
        
        // Cevabı butonun kendisine kaydet
        const isCorrect = opt === correctAnswer;
        btn.dataset.correct = isCorrect; 
        
        btn.onclick = (e) => {
            clearInterval(timer);
            
            // Tüm butonların tıklama özelliğini kapat
            Array.from(quizEl.querySelectorAll('.option')).forEach(o => o.onclick = null);

            // KRİTİK DÜZELTME: e.target yerine e.currentTarget kullanıyoruz
            const currentButton = e.currentTarget;
            const clickedIsCorrect = currentButton.dataset.correct === "true";
            
            currentButton.classList.add(clickedIsCorrect ? "correct" : "wrong");
            
            // Doğru cevabı işaretle (Eğer yanlış cevaplandıysa)
            if (!clickedIsCorrect) {
                const allButtons = Array.from(quizEl.querySelectorAll('.option'));
                const correctButton = allButtons.find(o => o.dataset.correct === "true");
                if (correctButton) {
                    correctButton.classList.add("correct");
                }
            }
            
            const feedbackMessage = clickedIsCorrect 
                ? "✅ Doğru!" 
                : `❌ Yanlış cevap.`; // Resim yolları uzun olduğu için mesajı sade tutmak iyidir
            
            showFeedback(clickedIsCorrect, feedbackMessage);
        };
        quizEl.appendChild(btn);
    });
  }

  // KISA CEVAP (Short Answer)
  if (q.type === "short") {
    const input = document.createElement("input");
    input.placeholder = "Kısa cevabınızı yazın";
    const btn = document.createElement("button");
    btn.innerHTML = "Cevabı Onayla";
    btn.onclick = () => {
      clearInterval(timer);
      const userAnswer = normalize(input.value);
      const isCorrect = q.answers.some(a => normalize(a) === userAnswer);
      
      btn.disabled = true;
      
      const feedbackMessage = isCorrect 
          ? "✅ Doğru!" 
          : `❌ Yanlış. Doğru cevap: ${q.answers[0]}`;
      
      showFeedback(isCorrect, feedbackMessage);
    };
    quizEl.append(input, btn);
  }

  // SIRALAMA (Order)
  if (q.type === "order") {
    const list = document.createElement("ul");
    list.className = "drag-list";
    const items = q.items.sort(() => Math.random() - 0.5); 

    items.forEach(item => {
      const li = document.createElement("li");
      li.innerHTML = item;
      li.className = "option draggable";
      li.draggable = true;
      li.style.marginBottom = "8px";

      li.addEventListener("dragstart", e => {
        e.dataTransfer.setData("text/plain", e.target.innerHTML);
        li.classList.add("dragging");
      });
      li.addEventListener("dragend", e => {
        li.classList.remove("dragging");
      });
      list.addEventListener("dragover", e => { e.preventDefault(); });
      li.addEventListener("dragover", e => {
        e.preventDefault();
        const dragging = document.querySelector(".dragging");
        if (dragging && dragging !== li) {
          const rect = li.getBoundingClientRect();
          const next = (e.clientY - rect.top) / rect.height > 0.5;
          li.parentNode.insertBefore(dragging, next ? li.nextSibling : li);
        }
      });

      list.appendChild(li);
    });

    quizEl.appendChild(list);

    const btn = document.createElement("button");
    btn.innerHTML = "Sıralamayı Onayla";
    btn.onclick = () => {
      clearInterval(timer);
      btn.disabled = true;
      const userOrder = Array.from(list.children).map(li => li.innerHTML);
      const ok = JSON.stringify(userOrder) === JSON.stringify(q.correct);
      
      list.style.pointerEvents = 'none'; 

      const feedbackMessage = ok 
          ? "✅ Doğru sıralama!" 
          : `❌ Yanlış. Doğru sıralama: ${q.correct.join(" → ")}`;

      showFeedback(ok, feedbackMessage);
    };
    quizEl.appendChild(btn);
  }

// EŞLEŞTİRME (Geleneksel Selectbox) 
  if (q.type === "match") {
    
    // Sağ taraftaki tüm cevapları al ve rastgele karıştır
    const rightOptions = q.pairs.map(p => p.right).sort(() => Math.random() - 0.5);

    q.pairs.forEach(pair => {
      const wrap = document.createElement("div");
      wrap.className = "match-item"; 
      
      // 1. Sol Metin Kapsayıcısı (Hizalama için)
      const leftContainer = document.createElement("div");
      leftContainer.className = "match-item-left";
      
      const leftText = document.createElement("span");
      leftText.innerHTML = pair.left + " → ";
      
      leftContainer.appendChild(leftText); 
      
      // 2. Seçim Kutusu Oluşturma
      const select = document.createElement("select");
      
      const defaultOption = document.createElement("option");
      defaultOption.innerHTML = "Seçiniz...";
      defaultOption.value = "";
      select.appendChild(defaultOption);

      // Karıştırılmış tüm seçenekleri seçim kutusuna ekle
      rightOptions.forEach(r => {
        const o = document.createElement("option");
        o.innerHTML = r;
        o.value = r; 
        select.appendChild(o);
      });
      
      wrap.appendChild(leftContainer); // Sabit genişlikli sol metin
      wrap.appendChild(select);
      quizEl.appendChild(wrap);
    });
    
    const btn = document.createElement("button");
    btn.innerHTML = "Eşleştirmeyi Onayla"; 
    btn.onclick = () => {
      clearInterval(timer);
      btn.disabled = true;
      const selects = quizEl.querySelectorAll("select");
      let allMatched = true;
      
      selects.forEach((s, i) => { 
        const isCorrect = s.value === q.pairs[i].right;
        if (!isCorrect) {
          allMatched = false;
        }
        
        s.style.backgroundColor = isCorrect ? '#d4edda' : '#f8d7da';
        s.style.border = isCorrect ? '1px solid #c3e6cb' : '1px solid #f5c6cb';
        s.disabled = true; 
      });
      
      const feedbackMessage = allMatched 
          ? "✅ Tüm eşleştirmeler doğru!" 
          : "❌ Bazı eşleştirmeler yanlış. Yanlış olanları düzeltmeniz gerekir.";
      
      showFeedback(allMatched, feedbackMessage);
    };
    quizEl.appendChild(btn);
  }
  
  // SÜRKLE-BIRAK EŞLEŞTİRME (Drag Match)
  if (q.type === "drag-match") {
    const draggableItems = q.pairs.map(p => p.left).sort(() => Math.random() - 0.5);
    const dropTargets = q.pairs.map(p => p.right).sort(() => Math.random() - 0.5);

    const container = document.createElement("div");
    container.className = "drag-match-container";
    
    const leftCol = document.createElement("div");
    leftCol.className = "left-column";
    
    const rightCol = document.createElement("ul");
    rightCol.className = "right-column";

    const targetMap = {}; 
    
    // Sol Sütun Görsel İpuçları
    leftCol.addEventListener("dragover", e => {
        e.preventDefault();
        leftCol.style.backgroundColor = '#e0e4f1'; 
    });

    leftCol.addEventListener("dragleave", e => {
        leftCol.style.backgroundColor = 'transparent';
    });


    // 1. Sol Kolonu (Sürüklenen Öğeler) Oluştur
    draggableItems.forEach(item => {
        const dragItem = document.createElement("div");
        dragItem.innerHTML = item;
        dragItem.className = "match-item-drag";
        dragItem.draggable = true;
        dragItem.dataset.value = item;
        dragItem.id = `drag-${item}`; 

        dragItem.addEventListener("dragstart", e => {
            const dragItem = e.target;
            e.dataTransfer.setData("text/plain", item);
            
            const parentTarget = dragItem.parentNode;

            // Öğeyi direkt sol sütuna geri taşıma 
            if (parentTarget.classList.contains("drop-target")) {
                parentTarget.classList.remove("filled");
                parentTarget.innerHTML = parentTarget.dataset.targetName;
            }
            leftCol.appendChild(dragItem);
            dragItem.style.display = 'block'; 
            
            // Sürükleme Resmini Ayarlama
            const itemRect = dragItem.getBoundingClientRect();
            e.dataTransfer.setDragImage(dragItem, itemRect.width / 2, itemRect.height / 2);

            // Sürükleme sırasında öğeyi anlık gizle
            setTimeout(() => dragItem.style.display = 'none', 0); 
        });
        
        dragItem.addEventListener("dragend", e => {
            // Sürükleme iptal edilirse, öğenin görünürlüğünü geri getir.
             if (e.target.style.display === 'none') {
                 e.target.style.display = 'block';
             }
        });

        leftCol.appendChild(dragItem);
    });

    // 2. Sağ Kolonu (Bırakma Hedefleri) Oluştur
    dropTargets.forEach(targetName => {
        const li = document.createElement("li");
        
        const targetEl = document.createElement("div");
        targetEl.className = "drop-target";
        targetEl.innerHTML = targetName;
        targetEl.dataset.targetName = targetName; 
        
        targetMap[targetName] = targetEl; 
        
        targetEl.addEventListener("dragover", e => {
            e.preventDefault();
            if (!targetEl.classList.contains("filled")) {
                 targetEl.classList.add("drag-over");
            }
        });
        
        targetEl.addEventListener("dragleave", e => {
            targetEl.classList.remove("drag-over");
        });
        
        targetEl.addEventListener("drop", e => {
            e.preventDefault();
            targetEl.classList.remove("drag-over");
            
            const draggedText = e.dataTransfer.getData("text/plain");
            const draggedItem = document.getElementById(`drag-${draggedText}`);
            
            // Hedef doluysa geri çevir
            if (targetEl.classList.contains("filled")) {
                return;
            }

            // Öğeyi hedefin içine taşı
            targetEl.innerHTML = "";
            targetEl.appendChild(draggedItem);
            targetEl.classList.add("filled");
            
            // Öğeyi görünür yap
            draggedItem.style.display = 'block'; 
        });

        li.appendChild(targetEl);
        rightCol.appendChild(li);
    });
    
    container.append(leftCol, rightCol);
    quizEl.appendChild(container);
    
    const btn = document.createElement("button");
    btn.innerHTML = "Eşleştirmeyi Onayla";
    btn.onclick = () => {
        clearInterval(timer);
        btn.disabled = true;

        let allCorrect = true;
        
        // Eşleştirmeleri Kontrol Et
        q.pairs.forEach(pair => {
        const dropTarget = targetMap[pair.right];
    
        if (dropTarget && dropTarget.classList.contains("filled")) {
            const draggedItem = dropTarget.querySelector(".match-item-drag");
        
            const draggedValue = draggedItem ? draggedItem.dataset.value : null;

            if (draggedItem && draggedValue === pair.left) { 
            
                draggedItem.style.backgroundColor = '#1e7e34'; 
            } else {
                allCorrect = false;
                if (draggedItem) draggedItem.style.backgroundColor = '#b71c1c';
                else dropTarget.style.backgroundColor = '#f8d7da';
            }
        } else {
            allCorrect = false;
            if (dropTarget) dropTarget.style.backgroundColor = '#f8d7da';
        }
    });

        const feedbackMessage = allCorrect 
          ? "✅ Tüm eşleştirmeler doğru!" 
          : "❌ Bazı eşleştirmeler yanlış. Yanlış eşleşmeler kırmızı ile gösterildi."; 

      showFeedback(allCorrect, feedbackMessage);
    };
    quizEl.appendChild(btn);
  }
  renderMath(quizEl);
}
  
// Orijinal Fare Sürükleme Mantığını Mobil Dokunmatiğe Uyarlar
function addTouchSupport(root) {
    let activeItem = null;
    let dragMode = null; // 'match' | 'order'
    let offsetX = 0, offsetY = 0;
    let lastX = 0, lastY = 0;
    let placeholder = null;
    let originalParent = null;
    let originalNextSibling = null;
    // =========================
    // TOUCH START
    // =========================
    root.addEventListener('touchstart', (e) => {
        const target = e.target;

        if (target.classList.contains('match-item-drag')) {
            dragMode = 'match';
        } else if (target.classList.contains('draggable')) {
            dragMode = 'order';
        } else {
            return;
        }

        e.preventDefault();
        activeItem = target;

        const touch = e.touches[0];
        const rect = activeItem.getBoundingClientRect();

        offsetX = touch.clientX - rect.left;
        offsetY = touch.clientY - rect.top;
        lastX = touch.clientX;
        lastY = touch.clientY;

        activeItem.classList.add('touch-dragging');
        activeItem.style.position = 'fixed';
        activeItem.style.zIndex = '1000';
        activeItem.style.width = rect.width + 'px';
        activeItem.style.height = rect.height + 'px';
        activeItem.style.left = rect.left + 'px';
        activeItem.style.top = rect.top + 'px';
        activeItem.style.opacity = '0.85';
        activeItem.style.transform = 'scale(1.05)';

        // Orijinal konumu sakla
        originalParent = activeItem.parentElement;
        originalNextSibling = activeItem.nextSibling;

        // MATCH ise eski drop’u temizle (KRİTİK: Öğeyi şimdilik taşımıyoruz, sadece hedefi temizliyoruz)
        if (dragMode === 'match' && originalParent?.classList.contains('drop-target')) {
            const parent = originalParent;
            parent.classList.remove('filled');
            parent.innerHTML = parent.dataset.targetName;
            
            // Sol kolonu bul ve öğeyi oraya geri taşı
            const leftCol = document.querySelector('.left-column');
            if (leftCol) {
                leftCol.appendChild(activeItem);
                
                // Öğe fixed konumda olduğu için, orijinal parent'i leftCol olarak ayarlıyoruz
                originalParent = leftCol;
                // Sürükle-bırakta taşınan öğe fixed olduğu için, bu taşıma sadece touchend'deki geri dönüş yeri için anlamlıdır.
            }
        }
        // KRİTİK NOT: Eğer öğe drop-target'tan alındıysa, bu noktada parent'ını Sol Kolon olarak güncelledik. 
        // Aksi takdirde (başlangıçta Sol Kolondaysa), zaten originalParent = leftCol.

        // ORDER için placeholder oluştur
        if (dragMode === 'order') {
            placeholder = document.createElement('div');
            placeholder.className = 'placeholder';
            placeholder.style.height = rect.height + 'px';
            placeholder.style.marginBottom = window.getComputedStyle(activeItem).marginBottom;
            activeItem.parentElement.insertBefore(placeholder, activeItem.nextSibling);
        }
    }, { passive: false });

    // =========================
    // TOUCH MOVE (Değişiklik Yok)
    // =========================
    root.addEventListener('touchmove', (e) => {
        if (!activeItem) return;
        e.preventDefault();

        const touch = e.touches[0];
        lastX = touch.clientX;
        lastY = touch.clientY;

        activeItem.style.left = (lastX - offsetX) + 'px';
        activeItem.style.top = (lastY - offsetY) + 'px';

        // ORDER SÜRÜKLEME
        if (dragMode === 'order' && placeholder) {
            const siblings = [...activeItem.parentElement.children].filter(el => el !== activeItem && el !== placeholder);
            for (let sibling of siblings) {
                const rect = sibling.getBoundingClientRect();
                const middleY = rect.top + rect.height / 2;
                if (lastY < middleY) {
                    activeItem.parentElement.insertBefore(placeholder, sibling);
                    break;
                } else {
                    activeItem.parentElement.appendChild(placeholder);
                }
            }
        }

        // MATCH SÜRÜKLEME
        if (dragMode === 'match') {
            document.querySelectorAll('.drop-target').forEach(target => {
                const rect = target.getBoundingClientRect();
                const tolerance = 8;

                const hit =
                    lastX >= rect.left - tolerance &&
                    lastX <= rect.right + tolerance &&
                    lastY >= rect.top - tolerance &&
                    lastY <= rect.bottom + tolerance &&
                    !target.classList.contains('filled');

                target.classList.toggle('drag-over', hit);
            });
        }
    }, { passive: false });

    // =========================
    // TOUCH END
    // =========================
    root.addEventListener('touchend', () => {
        if (!activeItem) return;

        let dropTarget = null;
        let droppedSuccessfully = false; // Yeni başarılı bırakma bayrağı

        if (dragMode === 'match') {
            // 1. Bırakma Hedefi Tespiti
            document.querySelectorAll('.drop-target').forEach(target => {
                const rect = target.getBoundingClientRect();
                const tolerance = 8;

                if (
                    lastX >= rect.left - tolerance &&
                    lastX <= rect.right + tolerance &&
                    lastY >= rect.top - tolerance &&
                    lastY <= rect.bottom + tolerance &&
                    !target.classList.contains('filled')
                ) {
                    dropTarget = target;
                }

                target.classList.remove('drag-over');
            });
            
            // 2. Taşıma İşlemi
            if (dropTarget) {
                // BAŞARILI DROP
                dropTarget.innerHTML = '';
                dropTarget.appendChild(activeItem);
                dropTarget.classList.add('filled');
                droppedSuccessfully = true;
            } else {
                // BAŞARISIZ DROP / Geri Sol Kolon'a Dönüş
                // KRİTİK: Öğeyi Sol Kolon'a geri taşıyoruz (çünkü touchstart'ta zaten oraya taşınmıştı)
                const leftCol = document.querySelector('.left-column');
                if (leftCol) {
                    // Öğeyi DOM'a geri yerleştir
                    leftCol.appendChild(activeItem);
                }
                // Başarısız drop'ta dropTarget'ı temizlemeye gerek yok, çünkü touchstart'ta temizlendi.
            }
        }

        // ORDER için placeholder kaldır
        if (dragMode === 'order' && placeholder) {
            // Placeholder'ı kaldırıp activeItem'i yerine koy
            placeholder.parentElement.insertBefore(activeItem, placeholder);
            placeholder.remove();
            placeholder = null;
        }

        // Stil ve sınıf sıfırlama (Fixed konumu kaldırır)
        resetStyles(activeItem);
        activeItem.classList.remove('touch-dragging');

        // Sürükleme değişkenlerini temizle
        activeItem = null;
        dragMode = null;
        originalParent = null;
        originalNextSibling = null;
    });

    // =========================
    // YARDIMCI: STİL SIFIRLAMA (Değişiklik Yok)
    // =========================
    function resetStyles(el) {
        el.style.position = '';
        el.style.left = '';
        el.style.top = '';
        el.style.zIndex = '';
        el.style.width = '';
        el.style.height = '';
        el.style.opacity = '';
        el.style.transform = '';
    }
}

nextBtn.onclick = () => {
    index++;
    if (index < questions.length) {
        loadQuestion();
    } else {
        clearInterval(timer);
        const successRate = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;
        
        // Hata Düzeltmesi: displayRate değişkenini burada tanımla
        const displayRate = successRate.toFixed(1); 
        
        quizEl.innerHTML = `
            <h2>Quiz Bitti 🎉</h2>
            <p>Toplam <strong>${questions.length}</strong> soru vardı.</p>
            <p>Değerlendirilen <strong>${totalCount}</strong> sorudan 
            <strong>${correctCount}</strong> tanesini doğru yaptın.</p>
            <div class="result-bar">
                <div class="result-correct" style="width:${displayRate}%"></div>
            </div>
            <p style="text-align:center; font-weight:700; margin-top:20px;">Başarı Oranın: ${displayRate}%</p>
        `;
        feedbackEl.innerHTML = "";
        feedbackEl.className = "feedback";
        nextBtn.style.display = "none";
        timeFill.style.display = "none";
    }
};

function renderMath(container = document.body) {
    if (!window.MathJax) return;

    // MathJax henüz hazır değilse bekle
    if (MathJax.startup?.promise) {
        MathJax.startup.promise.then(() => {
            MathJax.typesetPromise([container]);
        });
    } else {
        MathJax.typesetPromise([container]);
    }
}

// Uygulamayı Başlat
loadQuestionsData();
addTouchSupport(quizEl);
