/* ===============================
   CONSTANTS & CONFIG
================================ */
const IMG_EXT = ".png";
const SOUND_EXT = ".mp3";
const FLIP_TIMEOUT = 600;
const TRAINING_MODE_DURATION = 3000;
const RESIZE_DEBOUNCE = 250;

const CONFIG = {
    MIN_CARD_SIZE: 80,
    MAX_CARD_SIZE: 160,
    GAP: 10,
    MAX_COLS: 6,
    MIN_COLS: 2,
    TARGET_PAIRS: {
        mobile: 8,
        tablet: 12,
        desktop: 18
    }
};

/* ===============================
   GAME STATE
================================ */
const GameState = {
    CARD_LIBRARY: {},
    BACKS: [],
    dataLoaded: false,
    
    firstCard: null,
    secondCard: null,
    lock: false,
    matchedPairs: 0,
    totalPairs: 0,
    currentTurn: 0,
    kidsMode: false,
    selectedBack: "",
    currentGrid: { cols: 0, rows: 0 },
    
    sounds: {
        flip: new Audio("sounds/flip.mp3"),
        wrong: new Audio("sounds/wrong.mp3"),
        win: new Audio("sounds/win.mp3")
    },
    
    currentMatchSound: null,
    
    trainingTimer: null,
    flipTimer: null,
    resizeTimer: null
};

/* ===============================
   DOM ELEMENTS
================================ */
const DOM = {
    game: null,
    categories: null,
    size: null,
    back: null,
    kids: null,
    sound: null,
    customCols: null,
    customRows: null
};

/* ===============================
   INITIALIZATION
================================ */
function init() {
    cacheDOM();
    loadGameData();
    setupEventListeners();
}

function cacheDOM() {
    DOM.game = document.getElementById("game");
    DOM.categories = document.getElementById("categories");
    DOM.size = document.getElementById("size");
    DOM.back = document.getElementById("back");
    DOM.kids = document.getElementById("kids");
    DOM.sound = document.getElementById("sound");
    DOM.customCols = document.getElementById("custom-cols");
    DOM.customRows = document.getElementById("custom-rows");
}

function loadGameData() {
    Promise.all([
        fetch("cards.json").then(r => r.json()),
        fetch("backs.json").then(r => r.json())
    ])
    .then(([cards, backs]) => {
        GameState.CARD_LIBRARY = cards;
        GameState.BACKS = backs;
        initMenu();
        preloadSounds();
        GameState.dataLoaded = true;
        console.log("Данные игры загружены успешно");
    })
    .catch(err => {
        console.error("Ошибка загрузки данных:", err);
        alert("Не удалось загрузить данные игры. Проверьте наличие файлов cards.json и backs.json");
    });
}

function preloadSounds() {
    Object.values(GameState.sounds).forEach(audio => {
        audio.volume = 0.3;
        audio.load();
    });
}

function setupEventListeners() {
    window.addEventListener("resize", handleResize);
    
    // Слушатель для изменения режима игры
    DOM.size?.addEventListener('change', function() {
        const customControls = document.getElementById('custom-size-controls');
        if (this.value === 'custom') {
            customControls.style.display = 'block';
        } else {
            customControls.style.display = 'none';
        }
    });
}

/* ===============================
   MENU INITIALIZATION
================================ */
function initMenu() {
    initCategories();
    initBacks();
}

function initCategories() {
    if (!DOM.categories) return;
    
    const categories = Object.keys(GameState.CARD_LIBRARY);
    if (categories.length === 0) {
        DOM.categories.innerHTML = '<p style="color:#f00;">Нет доступных категорий</p>';
        return;
    }
    
    DOM.categories.innerHTML = "";
    
    categories.forEach(cat => {
        const label = document.createElement("label");
        label.style.display = "block";
        label.style.margin = "3px 0";
        label.innerHTML = `
            <input type="checkbox" class="category" value="${escapeHtml(cat)}" checked>
            ${escapeHtml(cat)}
        `;
        DOM.categories.appendChild(label);
    });
}

function initBacks() {
    if (!DOM.back || GameState.BACKS.length === 0) return;
    
    DOM.back.innerHTML = "";
    
    GameState.BACKS.forEach(b => {
        const opt = document.createElement("option");
        opt.value = b;
        opt.textContent = b;
        DOM.back.appendChild(opt);
    });
    
    GameState.selectedBack = GameState.BACKS[0];
}

/* ===============================
   GAME START
================================ */
function startGame() {
    if (!validateGameStart()) return;
    
    resetGameState();
    clearTimers();
    
    GameState.kidsMode = DOM.kids.checked;
    GameState.selectedBack = DOM.back.value;
    
    // Автоматический расчет размера поля
    const { cols, rows, totalCards } = calculateOptimalGrid();
    GameState.currentGrid = { cols, rows };
    
    setupGameGrid(cols, rows);
    GameState.totalPairs = totalCards / 2;
    
    // Обновляем статистику
    updateStats();
    
    // Показываем статистику
    document.getElementById('stats').style.display = 'flex';
    
    // Показываем информацию о выбранном размере
    showGridInfo(cols, rows);
    
    const cardsData = getRandomCards(GameState.totalPairs);
    if (cardsData.length < GameState.totalPairs) {
        alert(`Недостаточно карточек в выбранных категориях. Нужно: ${GameState.totalPairs}, доступно: ${cardsData.length}`);
        return;
    }
    
    const cards = createCardSet(cardsData);
    shuffleArray(cards).forEach(c => DOM.game.appendChild(c));
    
    if (GameState.kidsMode) {
        showAllCardsTemporarily();
    }
    
    // Активируем кнопку "Начать заново"
    document.getElementById('resetBtn').disabled = false;
}

function validateGameStart() {
    if (!GameState.dataLoaded) {
        alert("Данные игры ещё загружаются, пожалуйста, подождите...");
        return false;
    }
    
    if (!DOM.game) {
        console.error("Игровое поле не найдено");
        return false;
    }
    
    return true;
}

function resetCurrentGame() {
    startGame();
}

function resetGameState() {
    DOM.game.innerHTML = "";
    GameState.firstCard = null;
    GameState.secondCard = null;
    GameState.lock = false;
    GameState.matchedPairs = 0;
    GameState.currentTurn = 0;
    stopAllSounds();
}

function clearTimers() {
    if (GameState.trainingTimer) clearTimeout(GameState.trainingTimer);
    if (GameState.flipTimer) clearTimeout(GameState.flipTimer);
    if (GameState.resizeTimer) clearTimeout(GameState.resizeTimer);
}

function setupGameGrid(cols, rows) {
    DOM.game.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    DOM.game.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    setCardSize(cols);
}

/* ===============================
   GRID CALCULATION
================================ */
function calculateOptimalGrid() {
    const selectedMode = DOM.size?.value || 'auto';
    
    if (selectedMode === 'custom') {
        // Ручной режим
        const cols = parseInt(DOM.customCols?.value) || 3;
        const rows = parseInt(DOM.customRows?.value) || 4;
        let totalCards = cols * rows;
        
        // Проверяем четность
        if (totalCards % 2 !== 0) {
            console.log('Количество карт нечетное, добавляем еще одну...');
            totalCards += 1;
        }
        
        return { cols, rows, totalCards };
    }
    
    // Автоматические режимы
    switch(selectedMode) {
        case 'easy':
            return calculateGridForMode('easy');
        case 'medium':
            return calculateGridForMode('medium');
        case 'hard':
            return calculateGridForMode('hard');
        case 'auto':
        default:
            return calculateAutoGrid();
    }
}

function calculateGridForMode(mode) {
    let targetPairs;
    switch(mode) {
        case 'easy':
            targetPairs = 6;
            break;
        case 'medium':
            targetPairs = 12;
            break;
        case 'hard':
            targetPairs = 18;
            break;
        default:
            targetPairs = 12;
    }
    
    const screenWidth = window.innerWidth;
    const deviceType = getDeviceType(screenWidth);
    const cols = calculateOptimalCols(screenWidth, deviceType, mode);
    
    // Рассчитываем строки для получения нужного количества пар
    let rows = Math.ceil((targetPairs * 2) / cols);
    
    // Корректируем для четности
    let totalCards = cols * rows;
    if (totalCards % 2 !== 0) {
        rows += 1;
        totalCards = cols * rows;
    }
    
    // Проверяем, помещается ли по высоте
    const maxRows = calculateMaxRows();
    if (rows > maxRows) {
        rows = maxRows;
        if (rows % 2 !== 0) rows -= 1;
        totalCards = cols * rows;
    }
    
    return { cols, rows, totalCards };
}

function calculateAutoGrid() {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    const deviceType = getDeviceType(screenWidth);
    let targetPairs = CONFIG.TARGET_PAIRS[deviceType];
    
    // Учитываем доступные пары
    const selectedCats = getSelectedCategories();
    const availablePairs = countAvailablePairs(selectedCats);
    targetPairs = Math.min(targetPairs, availablePairs);
    
    // Рассчитываем оптимальное количество колонок
    let cols = calculateOptimalCols(screenWidth, deviceType, 'auto');
    
    // Рассчитываем строки
    let rows = Math.ceil((targetPairs * 2) / cols);
    
    // Проверяем четность
    let totalCards = cols * rows;
    if (totalCards % 2 !== 0) {
        rows += 1;
        totalCards = cols * rows;
    }
    
    // Проверяем высоту
    const maxRows = calculateMaxRows();
    if (rows > maxRows) {
        rows = maxRows;
        if (rows % 2 !== 0) rows -= 1;
        totalCards = cols * rows;
    }
    
    return { cols, rows, totalCards };
}

function calculateOptimalCols(screenWidth, deviceType, mode = 'auto') {
    let cols;
    
    switch(deviceType) {
        case 'mobile':
            // Для мобильных: 2-3 колонки
            const maxColsMobile = mode === 'hard' ? 3 : 3;
            cols = Math.floor((screenWidth - 40) / (CONFIG.MIN_CARD_SIZE + CONFIG.GAP));
            cols = Math.max(CONFIG.MIN_COLS, Math.min(cols, maxColsMobile));
            break;
            
        case 'tablet':
            // Для планшетов: 3-4 колонки
            const maxColsTablet = mode === 'hard' ? 4 : 4;
            cols = Math.floor((screenWidth - 60) / (CONFIG.MIN_CARD_SIZE + CONFIG.GAP));
            cols = Math.max(3, Math.min(cols, maxColsTablet));
            break;
            
        case 'desktop':
        default:
            // Для десктопа: 4-6 колонок
            const maxColsDesktop = mode === 'hard' ? 6 : 5;
            cols = Math.floor((screenWidth - 80) / (CONFIG.MIN_CARD_SIZE + CONFIG.GAP));
            cols = Math.max(4, Math.min(cols, maxColsDesktop));
            break;
    }
    
    return cols;
}

function calculateMaxRows() {
    const screenHeight = window.innerHeight;
    const estimatedCardHeight = CONFIG.MIN_CARD_SIZE + CONFIG.GAP;
    const availableHeight = screenHeight * 0.6; // 60% высоты экрана
    return Math.floor(availableHeight / estimatedCardHeight);
}

function getDeviceType(screenWidth) {
    if (screenWidth <= 768) return 'mobile';
    if (screenWidth <= 1024) return 'tablet';
    return 'desktop';
}

function countAvailablePairs(categories) {
    let total = 0;
    categories.forEach(cat => {
        const cards = GameState.CARD_LIBRARY[cat];
        if (cards) {
            total += cards.length;
        }
    });
    return total === 0 ? 12 : total;
}

/* ===============================
   CARD PAIRS LOGIC
================================ */
function getRandomCards(count) {
    const selectedCats = getSelectedCategories();
    if (selectedCats.length === 0) {
        console.warn("Не выбрано ни одной категории, выбираем все");
        return getAllCardPairs().slice(0, count);
    }
    
    let pool = [];
    selectedCats.forEach(cat => {
        const cards = GameState.CARD_LIBRARY[cat];
        if (cards && cards.length > 0) {
            cards.forEach(name => {
                const folderName = getFolderName(cat);
                
                pool.push({
                    id: `${cat}_${name}`,
                    name: name,
                    category: cat,
                    imgA: `cards/${folderName}/${name}${IMG_EXT}`,
                    imgB: `cards/${folderName}/${name}_pair${IMG_EXT}`,
                    sound: `sounds/${folderName}/${name}${SOUND_EXT}`
                });
            });
        }
    });
    
    if (pool.length === 0) {
        console.warn("Все выбранные категории пустые");
        return [];
    }
    
    if (pool.length < count) {
        console.warn(`Недостаточно пар карточек (нужно: ${count}, есть: ${pool.length})`);
        return pool.slice(0, Math.min(count, pool.length));
    }
    
    return shuffleArray(pool).slice(0, count);
}

function getAllCardPairs() {
    let pool = [];
    Object.entries(GameState.CARD_LIBRARY).forEach(([cat, cards]) => {
        const folderName = getFolderName(cat);
        cards.forEach(name => {
            pool.push({
                id: `${cat}_${name}`,
                name: name,
                category: cat,
                imgA: `cards/${folderName}/${name}${IMG_EXT}`,
                imgB: `cards/${folderName}/${name}_pair${IMG_EXT}`,
                sound: `sounds/${folderName}/${name}${SOUND_EXT}`
            });
        });
    });
    return pool;
}

function getFolderName(category) {
    const folderMap = {
        "Мебель": "mebel",
        "Одежда": "odyag"
    };
    return folderMap[category] || category.toLowerCase();
}

function createCardSet(cardsData) {
    const cards = [];
    cardsData.forEach(pair => {
        cards.push(createCard({
            id: pair.id,
            name: pair.name,
            category: pair.category,
            img: pair.imgA,
            pairType: 'A',
            sound: pair.sound
        }));
        cards.push(createCard({
            id: pair.id,
            name: pair.name,
            category: pair.category,
            img: pair.imgB,
            pairType: 'B',
            sound: pair.sound
        }));
    });
    return cards;
}

function createCard(data) {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.id = data.id;
    card.dataset.name = data.name;
    card.dataset.pairType = data.pairType || 'A';
    card.dataset.sound = data.sound || "";
    
    const inner = document.createElement("div");
    inner.className = "inner";
    
    const face = document.createElement("div");
    face.className = "face";
    const faceImg = document.createElement("img");
    faceImg.src = data.img;
    faceImg.alt = `${data.name} (${data.pairType === 'A' ? 'вариант 1' : 'вариант 2'})`;
    faceImg.loading = "lazy";
    face.appendChild(faceImg);
    
    const back = document.createElement("div");
    back.className = "back";
    const backImg = document.createElement("img");
    backImg.src = `backs/${GameState.selectedBack}`;
    backImg.alt = "Рубашка карты";
    back.appendChild(backImg);
    
    inner.appendChild(face);
    inner.appendChild(back);
    card.appendChild(inner);
    
    card.addEventListener("click", () => flipCard(card));
    
    return card;
}

/* ===============================
   GAME LOGIC
================================ */
function flipCard(card) {
    if (GameState.lock || 
        card === GameState.firstCard || 
        card.classList.contains("matched") ||
        card.classList.contains("open")) {
        return;
    }
    
    card.classList.add("open");
    playSound("flip");
    
    if (!GameState.firstCard) {
        GameState.firstCard = card;
        return;
    }
    
    GameState.secondCard = card;
    GameState.lock = true;
    GameState.currentTurn++;
    updateStats();
    
    checkMatch();
}

function checkMatch() {
    const isMatch = GameState.firstCard.dataset.id === GameState.secondCard.dataset.id;
    
    if (isMatch) {
        handleMatch();
    } else {
        handleMismatch();
    }
}

function handleMatch() {
    if (GameState.firstCard.dataset.sound) {
        playMatchSound(GameState.firstCard.dataset.sound);
    } else {
        playSound("flip");
    }
    
    GameState.firstCard.classList.add("matched");
    GameState.secondCard.classList.add("matched");
    GameState.matchedPairs++;
    updateStats();
    
    resetTurn();
    
    if (GameState.matchedPairs === GameState.totalPairs) {
        GameState.flipTimer = setTimeout(() => {
            playSound("win");
            alert(`🎉 Победа! Вы нашли все ${GameState.totalPairs} пар за ${GameState.currentTurn} ходов!`);
        }, 500);
    }
}

function handleMismatch() {
    playSound("wrong");
    
    GameState.flipTimer = setTimeout(() => {
        GameState.firstCard.classList.remove("open");
        GameState.secondCard.classList.remove("open");
        resetTurn();
    }, FLIP_TIMEOUT);
}

function resetTurn() {
    GameState.firstCard = null;
    GameState.secondCard = null;
    GameState.lock = false;
}

/* ===============================
   TRAINING MODE
================================ */
function showAllCardsTemporarily() {
    document.querySelectorAll(".card").forEach(c => c.classList.add("open"));
    
    GameState.trainingTimer = setTimeout(() => {
        document.querySelectorAll(".card").forEach(c => c.classList.remove("open"));
    }, TRAINING_MODE_DURATION);
}

/* ===============================
   STATISTICS
================================ */
function updateStats() {
    document.getElementById('foundPairs').textContent = GameState.matchedPairs;
    document.getElementById('totalPairs').textContent = GameState.totalPairs;
    document.getElementById('currentTurn').textContent = GameState.currentTurn;
    document.getElementById('gridSize').textContent = `${GameState.currentGrid.cols}×${GameState.currentGrid.rows}`;
}

/* ===============================
   SOUND MANAGEMENT
================================ */
function playSound(name) {
    if (!DOM.sound?.checked) return;
    
    const sound = GameState.sounds[name];
    if (!sound) return;
    
    try {
        sound.currentTime = 0;
        sound.play().catch(e => console.warn("Не удалось воспроизвести звук:", e));
    } catch (e) {
        console.warn("Ошибка воспроизведения звука:", e);
    }
}

function playMatchSound(src) {
    if (!DOM.sound?.checked) return;
    
    if (GameState.currentMatchSound) {
        GameState.currentMatchSound.pause();
        GameState.currentMatchSound.currentTime = 0;
    }
    
    try {
        GameState.currentMatchSound = new Audio(src);
        GameState.currentMatchSound.volume = 0.3;
        GameState.currentMatchSound.play().catch(e => console.warn("Не удалось воспроизвести звук совпадения:", e));
    } catch (e) {
        console.warn("Ошибка воспроизведения звука совпадения:", e);
    }
}

function stopAllSounds() {
    Object.values(GameState.sounds).forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
    });
    
    if (GameState.currentMatchSound) {
        GameState.currentMatchSound.pause();
        GameState.currentMatchSound.currentTime = 0;
        GameState.currentMatchSound = null;
    }
}

/* ===============================
   CARD SIZE MANAGEMENT
================================ */
function setCardSize(cols) {
    if (!cols || cols <= 0) return;
    
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const isMobile = screenWidth <= 768;
    
    // Рассчитываем доступную ширину
    const horizontalPadding = isMobile ? 20 : 40;
    const availableWidth = Math.min(screenWidth, 1400) - horizontalPadding;
    
    // Рассчитываем размер карточки
    const gap = isMobile ? CONFIG.GAP - 2 : CONFIG.GAP;
    const calculatedWidth = (availableWidth - gap * (cols - 1)) / cols;
    
    // Учитываем высоту экрана
    const availableHeight = screenHeight * (isMobile ? 0.5 : 0.6);
    const calculatedHeight = availableHeight / 6;
    
    // Используем минимальное из значений
    const calculatedSize = Math.min(calculatedWidth, calculatedHeight);
    
    // Применяем ограничения
    const minSize = isMobile ? CONFIG.MIN_CARD_SIZE : CONFIG.MIN_CARD_SIZE - 10;
    const maxSize = isMobile ? CONFIG.MAX_CARD_SIZE + 20 : CONFIG.MAX_CARD_SIZE;
    
    const finalSize = Math.max(minSize, Math.min(calculatedSize, maxSize));
    
    document.documentElement.style.setProperty("--card-size", `${finalSize}px`);
    
    // Центрируем игровое поле
    const gameEl = document.getElementById('game');
    if (gameEl) {
        const totalWidth = (finalSize * cols) + (gap * (cols - 1));
        gameEl.style.width = `${totalWidth}px`;
        gameEl.style.margin = '0 auto';
    }
}

/* ===============================
   UI UTILITIES
================================ */
function showGridInfo(cols, rows) {
    let infoEl = document.getElementById('grid-info');
    if (!infoEl) {
        infoEl = document.createElement('div');
        infoEl.id = 'grid-info';
        infoEl.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            padding: 8px 15px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: bold;
            z-index: 1000;
            display: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            border: 2px solid white;
        `;
        document.body.appendChild(infoEl);
    }
    
    const deviceType = getDeviceType(window.innerWidth);
    const deviceNames = {
        mobile: '📱 Смартфон',
        tablet: '📟 Планшет', 
        desktop: '🖥 Компьютер'
    };
    
    infoEl.textContent = `${deviceNames[deviceType]} | Поле: ${cols}×${rows}`;
    infoEl.style.display = 'block';
    
    setTimeout(() => {
        infoEl.style.display = 'none';
    }, 3000);
}

/* ===============================
   UTILITY FUNCTIONS
================================ */
function shuffleArray(arr) {
    if (!Array.isArray(arr) || arr.length <= 1) return [...arr];
    
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function getSelectedCategories() {
    const checkboxes = document.querySelectorAll(".category:checked");
    return Array.from(checkboxes).map(cb => cb.value);
}

function handleResize() {
    clearTimeout(GameState.resizeTimer);
    
    GameState.resizeTimer = setTimeout(() => {
        if (DOM.game && DOM.game.children.length > 0) {
            const cols = getComputedStyle(DOM.game)
                .gridTemplateColumns
                .split(' ').length;
            setCardSize(cols);
        }
    }, RESIZE_DEBOUNCE);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/* ===============================
   INITIALIZE GAME
================================ */
document.addEventListener("DOMContentLoaded", init);
