// pdf-editor.js
const { jsPDF } = window.jspdf;

function initializePdfEditor(pdfUrl, containerId = "container") {
    
    // Konteyner ve ilgili elementleri bul
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`PDF editör konteyneri #${containerId} bulunamadı.`);
        return;
    }

    // Kütüphane Ayarı
    pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    // DOM Elementleri
    const pdfCanvas = container.querySelector("#pdfCanvas");
    const pdfCtx = pdfCanvas.getContext("2d");
    const drawCanvas = container.querySelector("#drawCanvas");
    const drawCtx = drawCanvas.getContext("2d");
    const pageInfo = document.getElementById("pageInfo");
    const overlay = document.getElementById("loadingOverlay");
    const pageNumberInput = document.getElementById("pageNumberInput");
    const goToPageBtn = document.getElementById("goToPageBtn");


    // Durum Değişkenleri
    let pdfDoc = null, currentPage = 1, totalPages = 1;
    let baseScale = 1, userScale = 1, totalScale = 1;
    let currentTool = "pen", penColor = "#ff0000", penSize = 2, eraserSize = 4;
    let isDrawing = false, lastX = 0, lastY = 0;
    let paths = {}; // Çizim verileri
    let isPanning = false, startX = 0, startY = 0;
    let isDrawingShape = false;
    let currentShapePath = null;
    let isFilled = true;
    let fillColor = "rgba(255, 0, 0, 0.5)";

    // YENİ: Geri Al/Yinele Değişkenleri
    let history = {};        // Tüm sayfaların geçmiş kopyalarını tutar
    let historyIndex = 0;    // Geçmişteki mevcut konumu gösterir
    const MAX_HISTORY = 50;  // Geçmişte tutulacak maksimum adım sayısı
    

    // Helper: Hex rengi rgba'ya çevirir
    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.substring(1, 3), 16);
        const g = parseInt(hex.substring(3, 5), 16);
        const b = parseInt(hex.substring(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // Akıcı çizim için noktaları eğrilerle birleştiren fonksiyon (Bezier eğrileri)
    function drawSmoothedPath(ctx, path, scale) {
        if (path.length < 3) {
            ctx.beginPath();
            if (path.length > 0) ctx.moveTo(path[0].x * scale, path[0].y * scale);
            for (let i = 1; i < path.length; i++) {
                ctx.lineTo(path[i].x * scale, path[i].y * scale);
            }
            ctx.stroke();
            return;
        }

        ctx.beginPath();
        ctx.moveTo(path[0].x * scale, path[0].y * scale);

        for (let i = 1; i < path.length - 1; i++) {
            const p1 = path[i];
            const p2 = path[i + 1];
            
            const xc = (p1.x + p2.x) / 2 * scale;
            const yc = (p1.y + p2.y) / 2 * scale;
            
            ctx.quadraticCurveTo(p1.x * scale, p1.y * scale, xc, yc);
        }
        
        if (path.length > 1) {
            const lastPoint = path[path.length - 1];
            const penultimatePoint = path[path.length - 2];
            ctx.quadraticCurveTo(penultimatePoint.x * scale, penultimatePoint.y * scale, lastPoint.x * scale, lastPoint.y * scale);
        }

        ctx.stroke();
    }


    // Şekil çizim fonksiyonu (Dolgu dahil)
    function drawShape(ctx, path, scale) {
        const start = path[0];
        const end = path[1];
        const color = start.color;
        const width = start.width * scale;
        const tool = start.tool;
        const filled = start.filled;
        const fColor = start.fillColor;

        if (!end || tool === "pen" || tool === "eraser" || tool === "hand") return;

        ctx.beginPath();
        ctx.globalCompositeOperation = "source-over";

        const x1 = start.x * scale;
        const y1 = start.y * scale;
        const x2 = end.x * scale;
        const y2 = end.y * scale;

        // Stil ayarları
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = "round";

        if (tool === "line") {
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
        } else if (tool === "rect") {
            const w = x2 - x1;
            const h = y2 - y1;
            
            if (filled) {
                ctx.fillStyle = fColor;
                ctx.fillRect(x1, y1, w, h);
            }
            ctx.strokeRect(x1, y1, w, h); 
            
        } else if (tool === "circle") {
            const dx = x2 - x1;
            const dy = y2 - y1;
            const radius = Math.sqrt(dx * dx + dy * dy); 
            
            ctx.arc(x1, y1, radius, 0, 2 * Math.PI);
            
            if (filled) {
                ctx.fillStyle = fColor;
                ctx.fill();
            }
        }
        
        ctx.stroke();
    }

    function redrawPaths(){
        drawCtx.clearRect(0,0,drawCanvas.width,drawCanvas.height);
        const pagePaths = paths[currentPage] || [];
        for(let path of pagePaths){
            if(path[0].tool === "line" || path[0].tool === "rect" || path[0].tool === "circle") {
                drawShape(drawCtx, path, totalScale);
                continue;
            }

            drawCtx.strokeStyle=path[0].tool==="pen"?path[0].color:"rgba(0,0,0,1)";
            drawCtx.lineWidth=path[0].tool==="pen"?path[0].width*totalScale:eraserSize*totalScale;
            drawCtx.lineCap="round";
            drawCtx.globalCompositeOperation=path[0].tool==="pen"?"source-over":"destination-out";
            
            if (path[0].tool === "pen") {
                drawSmoothedPath(drawCtx, path, totalScale); 
            } else if (path[0].tool === "eraser") {
                drawCtx.beginPath();
                drawCtx.moveTo(path[0].x*totalScale,path[0].y*totalScale); 
                for(let i=1;i<path.length;i++){
                    drawCtx.lineTo(path[i].x*totalScale,path[i].y*totalScale);
                }
                drawCtx.stroke();
            }
        }
        drawCtx.globalCompositeOperation="source-over";
    }

    function renderPage(){
        if (!pdfDoc) return;

        pdfDoc.getPage(currentPage).then(page=>{
            const viewport = page.getViewport({scale:1});
            baseScale = container.clientWidth / viewport.width; 
            totalScale = baseScale * userScale;

            const scaledViewport = page.getViewport({scale: totalScale});
            pdfCanvas.width = scaledViewport.width; pdfCanvas.height = scaledViewport.height;
            drawCanvas.width = scaledViewport.width; drawCanvas.height = scaledViewport.height;
            
            pdfCtx.clearRect(0,0,pdfCanvas.width,pdfCanvas.height);
            page.render({canvasContext: pdfCtx, viewport: scaledViewport}).promise.then(()=>{ redrawPaths(); });
            pageInfo.textContent=`${currentPage} / ${totalPages}`;
        });
    }

    // GEÇMİŞ YÖNETİMİ FONKSİYONLARI

    /**
     * Mevcut çizim durumunu (paths) geçmişe kaydeder.
     */
    function saveHistory() {
        // Mevcut indeksi aşan her şeyi sil (Yinele geçmişini temizle)
        if (history[currentPage] && historyIndex < history[currentPage].length - 1) {
            history[currentPage].splice(historyIndex + 1);
        }

        // Derin kopya alarak mevcut path'leri kaydet
        const currentPathsCopy = paths[currentPage] ? paths[currentPage].map(p => [...p]) : [];
        
        if (!history[currentPage]) {
            history[currentPage] = [];
        }

        history[currentPage].push(currentPathsCopy);
        historyIndex = history[currentPage].length - 1;

        // Maksimum geçmiş sınırını aşarsa, en eski öğeyi sil
        if (history[currentPage].length > MAX_HISTORY) {
            history[currentPage].shift();
            historyIndex--;
        }
        updateUndoRedoButtons();
    }

    /**
     * Geçmişte bir adım geri gider (Undo).
     */
    function undo() {
        // 1. Sayfa geçmişinin varlığını ve geçmiş dizininin 0'dan büyük olduğunu kontrol et
        if (history[currentPage] && historyIndex > 0) {
            historyIndex--;
            
            // 2. Yeni historyIndex'in geçerli bir kaydı işaret ettiğini kontrol et
            if (history[currentPage][historyIndex] !== undefined) {
                // Geçmişten ilgili adımı yükle (Derin kopya alınmalı)
                paths[currentPage] = history[currentPage][historyIndex].map(p => [...p]);
                
                redrawPaths();
            } else {
                // Eğer kayıt undefined ise (nadiren olur), indeksi tekrar artırıp logla
                historyIndex++;
                console.error("Hata: Geçmiş indeksi bulunamadı. historyIndex sıfırlandı.");
            }
            updateUndoRedoButtons();
        }
    }

    /**
     * Geçmişte bir adım ileri gider (Redo).
     */
    function redo() {
        if (history[currentPage] && historyIndex < history[currentPage].length - 1) {
            historyIndex++;
            paths[currentPage] = history[currentPage][historyIndex].map(p => [...p]);
            redrawPaths();
            updateUndoRedoButtons();
        }
    }

    /**
     * Geri Al/Yinele düğmelerinin durumunu günceller (aktif/pasif).
     */
    function updateUndoRedoButtons() {
        const undoBtn = document.getElementById("undoBtn");
        const redoBtn = document.getElementById("redoBtn");
        
        // Eğer o sayfa için hiç geçmiş yoksa (undefined veya boş dizi)
        if (!history[currentPage] || history[currentPage].length === 0) {
            undoBtn.disabled = true;
            redoBtn.disabled = true;
            return;
        }

        undoBtn.disabled = historyIndex <= 0;
        redoBtn.disabled = historyIndex >= history[currentPage].length - 1;
    }

    // Mevcut: Tüm çizimleri siler
    function clearAllDrawings() {
        if (confirm("Tüm sayfalardaki çizimleri silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.")) {
            paths = {}; // paths nesnesini sıfırla
            redrawPaths(); // Çizim canvas'ını temizle
            saveHistory(); // Boş durumu geçmişe kaydet
        }
    }

    function setActiveTool(tool){
        currentTool=tool;
        // Tüm araç düğmelerini güncelle
        document.getElementById("pen").classList.toggle("active",tool==="pen");
        document.getElementById("eraser").classList.toggle("active",tool==="eraser");
        document.getElementById("lineTool").classList.toggle("active",tool==="line");
        document.getElementById("rectTool").classList.toggle("active",tool==="rect");
        document.getElementById("circleTool").classList.toggle("active",tool==="circle");
        document.getElementById("handTool").classList.toggle("active",tool==="hand"); 
        
        isDrawingShape = (tool === "line" || tool === "rect" || tool === "circle");
        isDrawing = false; 

        // Kaydırma aracı seçiliyse 'grab' (yakalama) imleci kullan
        drawCanvas.style.cursor = tool === "hand" ? "grab" : "default";
    }

    function goToPage(pageNumber) {
        // Sayısal tipte olduğundan emin ol ve tamsayıya çevir
        pageNumber = parseInt(pageNumber, 10);

        // Geçerlilik Kontrolü: Sayı, 1'den küçük veya toplam sayfa sayısından büyük olamaz.
        if (isNaN(pageNumber) || pageNumber < 1 || pageNumber > totalPages) {
            console.warn(`Geçersiz sayfa numarası: ${pageNumber}. Geçerli aralık 1 - ${totalPages}.`);
            return false;
        }

        if (pageNumber !== currentPage) {
            currentPage = pageNumber;
            renderPage();
            updateUndoRedoButtons();
        }
        return true;
    }

    goToPageBtn.onclick = () => {
        const pageNum = pageNumberInput.value;
        goToPage(pageNum);
    };

    // Enter tuşuna basıldığında da gitme işlemini tetiklemek için
    pageNumberInput.addEventListener("keyup", (e) => {
        if (e.key === "Enter") {
            goToPageBtn.click();
        }
    });

    // Dropdown ve Boyut Ayarları (Kodun okunurluğu için burada tekrarlanmadı, aynı kalır)
    const penSizes = [0.5, 1, 2, 4, 6];
    const penOptionsContainer = document.getElementById("penOptions");
    const penSizeBtn = document.getElementById("penSizeBtn");
    const eraserOptionsContainer = document.getElementById("eraserOptions");
    const eraserSizeBtn = document.getElementById("eraserSizeBtn");

    function createDropdownOptions(){
        const scalingFactor = 4;
        
        penSizeBtn.querySelector(".circle").style.width = `${penSize * scalingFactor}px`;
        penSizeBtn.querySelector(".circle").style.height = `${penSize * scalingFactor}px`;

        eraserSizeBtn.querySelector(".circle").style.width = `${eraserSize * scalingFactor}px`;
        eraserSizeBtn.querySelector(".circle").style.height = `${eraserSize * scalingFactor}px`;
        
        penOptionsContainer.innerHTML = ''; 
        penSizes.forEach(size=>{
            const optionContainer = document.createElement("div");
            optionContainer.classList.add("circle-option");

            const circle=document.createElement("span");
            circle.classList.add("circle");
            const visualSize = size * scalingFactor; 
            circle.style.width = `${visualSize}px`;
            circle.style.height = `${visualSize}px`;
            circle.style.background = penColor;
            
            optionContainer.appendChild(circle);
            optionContainer.addEventListener("click", ()=>{
                penSize=size;
                penSizeBtn.querySelector(".circle").style.width=`${size * scalingFactor}px`;
                penSizeBtn.querySelector(".circle").style.height=`${size * scalingFactor}px`;
                penOptionsContainer.style.display="none";
            });
            penOptionsContainer.appendChild(optionContainer);
        });
        
        eraserOptionsContainer.innerHTML = ''; 
        penSizes.forEach(size=>{
            const optionContainer = document.createElement("div");
            optionContainer.classList.add("circle-option");
            
            const circle=document.createElement("span");
            circle.classList.add("circle");
            const visualSize = size * scalingFactor;
            circle.style.width = `${visualSize}px`;
            circle.style.height = `${visualSize}px`;
            circle.style.background = "#aaa";

            optionContainer.appendChild(circle);
            optionContainer.addEventListener("click", ()=>{
                eraserSize=size;
                eraserSizeBtn.querySelector(".circle").style.width=`${size * scalingFactor}px`;
                eraserSizeBtn.querySelector(".circle").style.height=`${size * scalingFactor}px`;
                eraserOptionsContainer.style.display="none";
            });
            eraserOptionsContainer.appendChild(optionContainer);
        });
    }

    // Dropdown aç/kapa
    function toggleDropdown(dropdown){
        const isHidden = dropdown.style.display === "none" || dropdown.style.display === "";
        dropdown.style.display = isHidden ? "flex" : "none"; 
    }

    // --- EVENT LISTENERS ---

    // Araç Çubuğu Dinleyicileri
    document.getElementById("pen").onclick=()=>setActiveTool("pen");
    document.getElementById("eraser").onclick=()=>setActiveTool("eraser");
    document.getElementById("lineTool").onclick=()=>setActiveTool("line");
    document.getElementById("rectTool").onclick=()=>setActiveTool("rect");
    document.getElementById("circleTool").onclick=()=>setActiveTool("circle");
    document.getElementById("handTool").onclick=()=>setActiveTool("hand"); 
    document.getElementById("clearAll").onclick = clearAllDrawings;

    // YENİ: Geri Al/Yinele Dinleyicileri
    document.getElementById("undoBtn").onclick = undo;
    document.getElementById("redoBtn").onclick = redo;

    document.getElementById("fillToggle").onclick = function() {
        isFilled = !isFilled;
        this.classList.toggle('active', isFilled);
    };

    document.getElementById("colorPicker").oninput=e=>{
        penColor=e.target.value;
        document.querySelector("#penSizeBtn .circle").style.background = penColor; 
        fillColor = hexToRgba(penColor, 0.5); 
        
        const scalingFactor = 4;
        penSizes.forEach((size, index) => {
            const option = penOptionsContainer.children[index];
            if (option) {
                option.querySelector(".circle").style.background = penColor;
            }
        });
    };

    // Boyut Dropdown Dinleyicileri
    penSizeBtn.addEventListener("click", e=>{
        e.stopPropagation();
        toggleDropdown(penOptionsContainer);
        eraserOptionsContainer.style.display = "none";
    });
    eraserSizeBtn.addEventListener("click", e=>{
        e.stopPropagation();
        toggleDropdown(eraserOptionsContainer);
        penOptionsContainer.style.display = "none";
    });
    document.body.addEventListener("click", ()=>{
        penOptionsContainer.style.display="none";
        eraserOptionsContainer.style.display="none";
    });

    // Sayfa ve Zoom Dinleyicileri
    function zoom(f){ userScale*=f; renderPage(); }
    document.getElementById("zoomIn").onclick=()=>zoom(1.2);
    document.getElementById("zoomOut").onclick=()=>zoom(0.8);

    // Not: Sayfa değişimi historyIndex'i sıfırlamaz, her sayfanın kendi geçmişi korunur.
    document.getElementById("prevPage").onclick=()=>{ if(currentPage>1) { currentPage--; renderPage(); updateUndoRedoButtons(); } };
    document.getElementById("nextPage").onclick=()=>{ if(currentPage<totalPages) { currentPage++; renderPage(); updateUndoRedoButtons(); } };

    // Tam Ekran Dinleyicileri
    const fsBtn=document.getElementById("fullscreen");
    fsBtn.onclick=()=>{ if(!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); };
    document.addEventListener("fullscreenchange", ()=>{
        fsBtn.innerHTML = document.fullscreenElement?'<i class="fa-solid fa-compress"></i>':'<i class="fa-solid fa-expand"></i>';
    });

    // --- CANVAS ETKİLEŞİMLERİ ---

    // DÜZELTME: Dokunmatik cihazlarda varsayılan kaydırma hareketini engeller
    drawCanvas.addEventListener("touchstart", e => {
        // Eğer 'hand' aracı seçili değilse (yani çizim araçlarından biri seçiliyse) kaydırmayı engelle.
        if (currentTool !== "hand") {
            e.preventDefault();
        }
    }, { passive: false }); // passive: false, preventDefault() çağrısı yapabilmek için kritiktir.

    drawCanvas.addEventListener("pointerdown", e=>{
        const rect=drawCanvas.getBoundingClientRect();
        const x=(e.clientX-rect.left)/totalScale; 
        const y=(e.clientY-rect.top)/totalScale;

        if (currentTool === "hand") {
            isPanning = true;
            drawCanvas.style.cursor = "grabbing";
            startX = e.clientX;
            startY = e.clientY;
            return;
        }
        
        if (isDrawingShape) {
            isDrawing = true;
            currentShapePath = [{
                x:x, 
                y:y, 
                tool:currentTool, 
                color:penColor, 
                width:penSize,
                filled: isFilled,          
                fillColor: fillColor         
            }];
            if(!paths[currentPage]) paths[currentPage]=[];
            paths[currentPage].push(currentShapePath);
        } else {
            isDrawing=true;
            lastX=x;
            lastY=y;
            if(!paths[currentPage]) paths[currentPage]=[];
            paths[currentPage].push([{x:lastX,y:lastY,tool:currentTool,color:penColor,width:penSize}]);
        }
    });

    drawCanvas.addEventListener("pointermove", e=>{
        const rect=drawCanvas.getBoundingClientRect();
        const x=(e.clientX-rect.left)/totalScale;
        const y=(e.clientY-rect.top)/totalScale;

        if (currentTool === "hand" && isPanning) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            container.scrollLeft -= dx;
            container.scrollTop -= dy;
            startX = e.clientX; 
            startY = e.clientY;
            return;
        }

        if (!isDrawing) return;

        if (isDrawingShape && currentShapePath) {
            redrawPaths(); 
            drawShape(drawCtx, [currentShapePath[0], {x:x, y:y}], totalScale); 
            return;
        }
        
        let currentPath=paths[currentPage][paths[currentPage].length-1];

        const distSq = (x - lastX) * (x - lastX) + (y - lastY) * (y - lastY);
        if (distSq < 0.2) { 
            return; 
        }

        currentPath.push({x:x,y:y,tool:currentTool,color:penColor,width:penSize});

        drawCtx.beginPath();
        drawCtx.moveTo(lastX*totalScale,lastY*totalScale);
        drawCtx.lineTo(x*totalScale,y*totalScale);
        drawCtx.strokeStyle=currentTool==="pen"?penColor:"rgba(0,0,0,1)";
        drawCtx.lineWidth=currentTool==="pen"?penSize*totalScale:eraserSize*totalScale;
        drawCtx.lineCap="round";
        drawCtx.globalCompositeOperation=currentTool==="pen"?"source-over":"destination-out";
        drawCtx.stroke();
        drawCtx.globalCompositeOperation="source-over";

        lastX=x; lastY=y;
    });

    drawCanvas.addEventListener("pointerup",e=>{
        if (currentTool === "hand") {
            isPanning = false;
            drawCanvas.style.cursor = "grab"; 
            return;
        }

        if (isDrawing && isDrawingShape && currentShapePath) {
            const rect=drawCanvas.getBoundingClientRect();
            const x=(e.clientX-rect.left)/totalScale;
            const y=(e.clientY-rect.top)/totalScale;
            
            currentShapePath.push({x:x, y:y}); 
            redrawPaths(); 
            currentShapePath = null;
            
            // Çizim bittiğinde geçmişi kaydet
            saveHistory();
            
        } else if (isDrawing && (currentTool === "pen" || currentTool === "eraser")) {
            redrawPaths();
            
            // Çizim bittiğinde geçmişi kaydet
            saveHistory();
        }
        isDrawing=false
    });

    drawCanvas.addEventListener("pointerleave",()=>{
        if (isDrawing && (currentTool === "pen" || currentTool === "eraser")) {
                   redrawPaths();
                   saveHistory(); // Bitmemiş çizgiyi geçmişe kaydet
        }
        isDrawing=false;
        
        // DÜZELTME: Hand aracı aktifken tuvalden ayrıldığında panning'i sıfırla ve imleci düzelt
        if (isPanning) {
            isPanning = false;
            drawCanvas.style.cursor = "grab"; 
        }
    });

    // PDF kaydetme (worker) - Bu kısım değiştirilmedi.
    document.getElementById("savePDF").onclick=()=>{
        overlay.style.display="flex";
        
        const workerCode=`onmessage=async function(e){importScripts('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');const { jsPDF } = self.jspdf;const {pdfData}=e.data;
        
        let firstPage = pdfData[0].imgData;
        let img = new Image();
        img.src = firstPage;
        
        await new Promise(resolve => img.onload = resolve);
        
        let pdf = new jsPDF({
            orientation: img.width > img.height ? 'l' : 'p', 
            unit: 'px', 
            format: [img.width, img.height]
        });
        
        pdf.addImage(firstPage,'PNG',0,0,img.width,img.height);
        
        for(let i=1;i<pdfData.length;i++){
            let nextImg = new Image();
            nextImg.src = pdfData[i].imgData;
            await new Promise(resolve => nextImg.onload = resolve);

            pdf.addPage([nextImg.width, nextImg.height], nextImg.width > nextImg.height ? 'l' : 'p');
            pdf.addImage(pdfData[i].imgData,'PNG',0,0,nextImg.width,nextImg.height);
        }
        
        postMessage(pdf.output('blob'));}`;

        const blob = new Blob([workerCode], {type: 'application/javascript'});
        const worker = new Worker(URL.createObjectURL(blob));
        
        (async ()=>{
            const pdfData=[];
            for(let i=1;i<=totalPages;i++){
                const page=await pdfDoc.getPage(i);
                const viewport=page.getViewport({scale:1});
                
                const tempScale=container.clientWidth/viewport.width; 
                const scaledViewport=page.getViewport({scale:tempScale});
                
                const tempCanvas=document.createElement("canvas");
                tempCanvas.width=scaledViewport.width; tempCanvas.height=scaledViewport.height;
                const tempCtx=tempCanvas.getContext("2d");
                
                await page.render({canvasContext: tempCtx, viewport: scaledViewport}).promise;
                
                const pagePaths=paths[i]||[];
                tempCtx.globalCompositeOperation="source-over";
                
                for(let path of pagePaths){
                    if(path[0].tool === "line" || path[0].tool === "rect" || path[0].tool === "circle") {
                        drawShape(tempCtx, path, tempScale);
                        continue;
                    }
                    
                    tempCtx.strokeStyle=path[0].tool==="pen"?path[0].color:"rgba(0,0,0,1)";
                    tempCtx.lineWidth=path[0].tool==="pen"?path[0].width*tempScale:eraserSize*tempScale;
                    tempCtx.lineCap="round";
                    tempCtx.globalCompositeOperation=path[0].tool==="pen"?"source-over":"destination-out";

                    if (path[0].tool === "pen") {
                        drawSmoothedPath(tempCtx, path, tempScale);
                    } else if (path[0].tool === "eraser") {
                        tempCtx.beginPath();
                        tempCtx.moveTo(path[0].x*tempScale,path[0].y*tempScale);
                        for(let j=1;j<path.length;j++){
                            tempCtx.lineTo(path[j].x*tempScale,path[j].y*tempScale);
                        }
                        tempCtx.stroke();
                    }
                }
                pdfData.push({imgData: tempCanvas.toDataURL("image/png")});
            }
            worker.postMessage({pdfData});
        })();
        
        worker.onmessage=function(e){
            const blob = e.data;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href=url; a.download="duzenlenmis_belge.pdf";
            a.click();
            URL.revokeObjectURL(url);
            overlay.style.display="none";
            worker.terminate();
        };
    };

    // --- BAŞLANGIÇ AYARLARI ---
    
    // PDF Yükleme
    pdfjsLib.getDocument(pdfUrl).promise.then(pdf=>{
        pdfDoc=pdf; totalPages=pdf.numPages;
        if (pageInfo) pageInfo.textContent=`${currentPage} / ${totalPages}`;
        renderPage();
        saveHistory(); // Başlangıç durumunu kaydet
    }).catch(err=>console.error(`PDF yüklenirken hata oluştu: ${err}`));

    setActiveTool("pen");
    createDropdownOptions();
    updateUndoRedoButtons(); // Başlangıçta düğme durumlarını ayarla
}

// initializePdfEditor fonksiyonu, html dosyasında çağrılmaya hazır.
