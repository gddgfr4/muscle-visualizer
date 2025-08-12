import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- 基本設定 ---
let scene, camera, renderer, controls;
let model;
const canvasContainer = document.getElementById('canvas-container');

// --- 状態管理 ---
let currentLang = 'ja';
let currentDate = new Date();
let painData = {}; // { 'YYYY-MM-DD': { 'muscleName': level, ... }, ... }
let selectedMuscle = null;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// --- UI要素 ---
const loaderElement = document.getElementById('loader');
const langToggleButton = document.getElementById('lang-toggle');
const saveImageButton = document.getElementById('save-image');
const resetViewFrontButton = document.getElementById('reset-view-front');
const resetViewBackButton = document.getElementById('reset-view-back');
const painLevelPanel = document.getElementById('pain-level-panel');
const muscleNameLabel = document.getElementById('muscle-name-label');
const closePanelButton = document.getElementById('close-panel');

// --- 定数 ---
const MUSCLE_NAMES = { ja: '右腕', en: 'Right Arm' }; // TODO: モデルに合わせて実際の筋肉名を追加
const PAIN_LEVEL_COLORS = {
    0: new THREE.Color(0x888888), // Default
    1: new THREE.Color(0xF9E79F), // Weak
    2: new THREE.Color(0xF5B041), // Medium
    3: new THREE.Color(0xE67E22), // Strong
};
const MODEL_PATH = './assets/muscle_model.glb';

// --- 初期化処理 ---
init();

function init() {
    // シーン
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x34495E);

    // カメラ
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1, 3.5);

    // レンダラー
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    canvasContainer.appendChild(renderer.domElement);

    // ライト
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // コントロール
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.9, 0);

    // 3Dモデル読み込み
    const loader = new GLTFLoader();
    loader.load(MODEL_PATH, (gltf) => {
        model = gltf.scene;
        model.scale.set(1.5, 1.5, 1.5);
        model.position.y = -1.5;
        scene.add(model);
        
        // 元のマテリアルを保存
        model.traverse((node) => {
            if (node.isMesh) {
                node.userData.originalMaterial = node.material;
            }
        });
        
        loaderElement.style.display = 'none';
        loadDataForDate(currentDate);

    }, undefined, (error) => {
        console.error(error);
        loaderElement.innerHTML = 'モデルの読み込みに失敗しました。<br>READMEの指示に従ってモデルを配置したか確認してください。';
    });

    // カレンダーとイベントリスナー
    initCalendar();
    initEventListeners();

    // アニメーションループ
    animate();
}

// --- カレンダー関連 ---
const monthYearElement = document.getElementById('month-year');
const calendarBody = document.getElementById('calendar-body');
const weekdaysContainer = document.getElementById('weekdays');

function initCalendar() {
    const weekdays = currentLang === 'ja' ? ['日', '月', '火', '水', '木', '金', '土'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    weekdaysContainer.innerHTML = weekdays.map(day => `<div>${day}</div>`).join('');
    loadPainDataFromStorage();
    generateCalendar(currentDate.getFullYear(), currentDate.getMonth());
}

function generateCalendar(year, month) {
    monthYearElement.textContent = currentLang === 'ja' ? `${year}年 ${month + 1}月` : `${new Date(year, month).toLocaleString('en-US', { month: 'long' })} ${year}`;
    calendarBody.innerHTML = '';
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    
    for (let i = 0; i < firstDay; i++) {
        calendarBody.insertAdjacentHTML('beforeend', '<div class="empty"></div>');
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = document.createElement('div');
        dayElement.textContent = day;
        dayElement.classList.add('calendar-day');
        
        const date = new Date(year, month, day);
        if (date.toDateString() === today.toDateString()) dayElement.classList.add('today');
        if (date.toDateString() === currentDate.toDateString()) dayElement.classList.add('selected');
        
        const dateKey = formatDate(date);
        if (painData[dateKey]) dayElement.classList.add('has-data');
        
        dayElement.addEventListener('click', () => {
            currentDate = date;
            generateCalendar(year, month);
            loadDataForDate(date);
        });
        calendarBody.appendChild(dayElement);
    }
}

// --- イベントリスナー ---
function initEventListeners() {
    window.addEventListener('resize', onWindowResize);
    canvasContainer.addEventListener('click', onPointerClick);

    langToggleButton.addEventListener('click', toggleLanguage);
    saveImageButton.addEventListener('click', saveAsImage);
    resetViewFrontButton.addEventListener('click', () => resetView(true));
    resetViewBackButton.addEventListener('click', () => resetView(false));
    
    document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
    document.getElementById('next-month').addEventListener('click', () => changeMonth(1));
    
    document.querySelectorAll('.pain-level-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const level = parseInt(e.target.dataset.level);
            setPainLevel(level);
        });
    });
    closePanelButton.addEventListener('click', () => painLevelPanel.classList.add('hidden'));
}

// --- 機能関数 ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onPointerClick(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
        const intersectedObject = intersects[0].object;
        if (intersectedObject.isMesh && model.children.includes(intersectedObject.parent.parent)) {
            selectedMuscle = intersectedObject;
            // TODO: より良い筋肉名マッピングを実装
            muscleNameLabel.textContent = selectedMuscle.name || '選択された部位'; 
            painLevelPanel.classList.remove('hidden');
        }
    }
}

function setPainLevel(level) {
    if (!selectedMuscle) return;

    const dateKey = formatDate(currentDate);
    if (!painData[dateKey]) painData[dateKey] = {};

    const muscleName = selectedMuscle.name;
    if (level === 0) {
        delete painData[dateKey][muscleName];
    } else {
        painData[dateKey][muscleName] = level;
    }

    updateMuscleAppearance(selectedMuscle, level);
    savePainDataToStorage();
    generateCalendar(currentDate.getFullYear(), currentDate.getMonth());
    painLevelPanel.classList.add('hidden');
}

function updateMuscleAppearance(muscle, level) {
    if (!muscle) return;
    if (level === 0) {
        muscle.material = muscle.userData.originalMaterial;
    } else {
        const newMaterial = muscle.userData.originalMaterial.clone();
        newMaterial.color.set(PAIN_LEVEL_COLORS[level]);
        // TODO: ここでストライプなどの表現を追加できる
        muscle.material = newMaterial;
    }
}

function updateAllMusclesForDate(dateKey) {
    const dataForDate = painData[dateKey] || {};
    model.traverse((node) => {
        if (node.isMesh) {
            const level = dataForDate[node.name] || 0;
            updateMuscleAppearance(node, level);
        }
    });
}

function changeMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    generateCalendar(currentDate.getFullYear(), currentDate.getMonth());
}

function resetView(isFront) {
    controls.enabled = false;
    const targetPos = isFront ? new THREE.Vector3(0, 1, 3.5) : new THREE.Vector3(0, 1, -3.5);
    const startPos = camera.position.clone();
    
    let t = 0;
    const duration = 0.5;
    function animateView() {
        t += 1 / (duration * 60); // Assuming 60fps
        camera.position.lerpVectors(startPos, targetPos, Math.min(t, 1));
        controls.update();
        if (t < 1) {
            requestAnimationFrame(animateView);
        } else {
            controls.enabled = true;
        }
    }
    animateView();
}

function toggleLanguage() {
    currentLang = currentLang === 'ja' ? 'en' : 'ja';
    langToggleButton.textContent = currentLang === 'ja' ? 'English' : '日本語';
    // TODO: UIの他のテキストも変更
    initCalendar();
}

function saveAsImage() {
    const link = document.createElement('a');
    link.download = `muscle-pain-${formatDate(currentDate)}.png`;
    link.href = renderer.domElement.toDataURL('image/png');
    link.click();
}

// --- データ永続化 ---
const STORAGE_KEY = 'musclePainVisualizerData';

function savePainDataToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(painData));
}

function loadPainDataFromStorage() {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
        painData = JSON.parse(data);
    }
}

function loadDataForDate(date) {
    const dateKey = formatDate(date);
    updateAllMusclesForDate(dateKey);
}

// --- ヘルパー関数 ---
function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// --- アニメーションループ ---
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
