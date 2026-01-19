/* ===============================
   CONSTANTS & CONFIG
================================ */
const IMG_EXT = ".png";
const SOUND_EXT = ".mp3";
const FLIP_TIMEOUT = 600;
const TRAINING_MODE_DURATION = 3000;
const RESIZE_DEBOUNCE = 250;

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
    kidsMode: false,
    selectedBack: "",
    
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
    sound: null
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
            <input type="checkbox" class="category" value="${cat}" checked>
            ${cat}
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
    
    const [cols, rows] = DOM.size.value.split("x").map(Number);
    setupGameGrid(cols, rows);
    
    const totalCards = cols * rows;
    GameState.totalPairs = totalCards / 2;
    
    // ИЗМЕНЕНИЕ: Получаем пары карточек
    const cardPairs = getRandomCardPairs(GameState.totalPairs);
    
    // Создаем карточки с указанием, какая из пары (A или B)
    const cards = [];
    cardPairs.forEach(pair => {
        // Первая карточка пары (например, mebel1.png)
        cards.push(createCard({
            id: pair.id,
            name: pair.name,
            category: pair.category,
            img: pair.imgA,
            pairType: 'A'
        }));
        // Вторая карточка пары (например, mebel1_pair.png)
        cards.push(createCard({
            id: pair.id,
            name: pair.name,
            category: pair.category,
            img: pair.imgB,
            pairType: 'B'
        }));
    });
    
    // Перемешиваем и добавляем на поле
    shuffleArray(cards).forEach(c => DOM.game.appendChild(c));
    
    if (GameState.kidsMode) {
        showAllCardsTemporarily();
    }
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

function resetGameState() {
    DOM.game.innerHTML = "";
    GameState.firstCard = null;
    GameState.secondCard = null;
    GameState.lock = false;
    GameState.matchedPairs = 0;
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
   CARD PAIRS LOGIC (ОСНОВНОЕ ИЗМЕНЕНИЕ)
================================ */
function getRandomCardPairs(count) {
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
                // Определяем имена папок на основе категории
                const folderName = getFolderName(cat);
                
                pool.push({
                    id: `${cat}_${name}`,  // Уникальный ID пары
                    name: name,
                    category: cat,
                    // Первая карточка пары (например, mebel1.png)
                    imgA: `cards/${folderName}/${name}${IMG_EXT}`,
                    // Вторая карточка пары (например, mebel1_pair.png)
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
    
    // Проверяем, что есть достаточно пар
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

// Функция для преобразования русских названий в имена папок
function getFolderName(category) {
    const folderMap = {
        "Мебель": "mebel",
        "Одежда": "odyag"
    };
    return folderMap[category] || category.toLowerCase();
}

function createCard(data) {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.id = data.id;  // Одинаковый для обеих карточек пары
    card.dataset.name = data.name;
    card.dataset.pairType = data.pairType || 'A'; // 'A' или 'B'
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
    
    checkMatch();
}

function checkMatch() {
    // Сравниваем по id пары (независимо от pairType)
    const isMatch = GameState.firstCard.dataset.id === GameState.secondCard.dataset.id;
    
    if (isMatch) {
        handleMatch();
    } else {
        handleMismatch();
    }
}

function handleMatch() {
    // Воспроизводим звук совпадения, если есть
    if (GameState.firstCard.dataset.sound) {
        playMatchSound(GameState.firstCard.dataset.sound);
    } else {
        // Или стандартный звук
        playSound("flip");
    }
    
    GameState.firstCard.classList.add("matched");
    GameState.secondCard.classList.add("matched");
    GameState.matchedPairs++;
    
    resetTurn();
    
    if (GameState.matchedPairs === GameState.totalPairs) {
        GameState.flipTimer = setTimeout(() => {
            playSound("win");
            alert(`🎉 Победа! Найдены все ${GameState.totalPairs} пар!`);
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

function setCardSize(cols) {
    if (!cols || cols <= 0) return;
    
    const maxWidth = Math.min(window.innerWidth, 1400) - 40;
    const gap = 10;
    const availableWidth = maxWidth - gap * (cols - 1);
    const calculatedSize = availableWidth / cols;
    
    const size = Math.max(60, Math.min(calculatedSize, 160));
    document.documentElement.style.setProperty("--card-size", `${size}px`);
}

function handleResize() {
    clearTimeout(GameState.resizeTimer);
    
    GameState.resizeTimer = setTimeout(() => {
        const size = DOM.size?.value;
        if (!size) return;
        
        const cols = parseInt(size.split("x")[0]);
        setCardSize(cols);
    }, RESIZE_DEBOUNCE);
}

/* ===============================
   INITIALIZE GAME
================================ */
document.addEventListener("DOMContentLoaded", init);