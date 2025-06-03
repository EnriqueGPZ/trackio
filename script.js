const DB_NAME = 'TrakioDB_Direct'; 
const DB_VERSION = 2;
const PROFILE_STORE_NAME = 'userProfileStore';
const SESSION_LOG_STORE_NAME = 'sessionLogsStore';
let db;
let currentChartInstance = null;
const USER_PROFILE_DB_KEY = 1;

let appState = {
    isProfileSaved: false, isBleDeviceConnected: false, bleDevice: null, heartRateCharacteristic: null,
    profileData: { userAge: null, calibrationData: { phases: {}, lastCalibrated: null } }
};
let calibrationSession = { activePhaseIndex: -1, isRunning: false, timerId: null, timeLeft: 0, pulseReadings: [] };

const CALIBRATION_PHASES = [
    { name: "Reposo / Relajado", id: "absoluteRelaxation", duration: 180, instructions: "Acuéstate en un lugar tranquilo, cierra los ojos, relájate completamente en silencio. Intenta no pensar en nada." },
    { name: "En Calma Activa (Concentración Cognitiva)", id: "activeCalm", duration: 300, instructions: "Siéntate cómodamente frente a tu ordenador. Durante los próximos 5 minutos, realiza una actividad que requiera tu concentración pero que sea calmada. Por ejemplo: escribe un texto, navega por tus canales de video favoritos y mira algo que te interese, busca información sobre algo que necesites comprar online, o realiza alguna tarea similar que mantenga tu mente ocupada de forma tranquila." },
    { name: "Estrés o Agitación (Ejercicio Ligero)", id: "aerobicExercise", duration: 60, instructions: "De pie, realiza un ejercicio aeróbico ligero como saltos de tijera (jumping jacks) o levantar las rodillas alternativamente. Mantén un ritmo constante." }
];
const AGE_BASED_HR_RANGES = [
    { ageMin: 15, ageMax: 25, reposo: [60, 70], concentrado: [65, 75], estres: [85, 100] }, { ageMin: 26, ageMax: 35, reposo: [60, 70], concentrado: [65, 78], estres: [85, 105] },
    { ageMin: 36, ageMax: 45, reposo: [62, 72], concentrado: [68, 80], estres: [90, 110] }, { ageMin: 46, ageMax: 55, reposo: [65, 75], concentrado: [70, 82], estres: [90, 115] },
    { ageMin: 56, ageMax: 65, reposo: [65, 78], concentrado: [72, 85], estres: [90, 115] }, { ageMin: 66, ageMax: 120, reposo: [66, 80], concentrado: [72, 86], estres: [90, 110] }
];
const ANALYSIS_BLOCK_DURATION_S = 120;
const PROCESS_BLOCK_INTERVAL_MS = 10000;
const MIN_HR_READINGS_FOR_BLOCK = Math.floor(ANALYSIS_BLOCK_DURATION_S * 0.8);
let hrBufferForBlock = [];
let analysisIntervalTimerId = null;
let dailySessionLog = [];

const ui = {
    userProfileForm: document.getElementById('userProfileForm'), btnSaveProfile: document.getElementById('btnSaveProfile'), btnOpenConnectBleModal: document.getElementById('btnOpenConnectBleModal'),
    btnStartCalibration: document.getElementById('btnStartCalibration'), btnShowHelp: document.getElementById('btnShowHelp'), btnStartStopRealtimeAnalysis: document.getElementById('btnStartStopRealtimeAnalysis'),
    realtimeAnalysisIconPlay: document.getElementById('realtimeAnalysisIconPlay'), realtimeAnalysisIconStop: document.getElementById('realtimeAnalysisIconStop'),
    btnStartStopRealtimeAnalysisText: document.getElementById('btnStartStopRealtimeAnalysisText'), realtimeAnalysisPrerequisites: document.getElementById('realtimeAnalysisPrerequisites'),
    realtimeAnalysisStatus: document.getElementById('realtimeAnalysisStatus'), btnShowSessionChart: document.getElementById('btnShowSessionChart'), btnShowHistory: document.getElementById('btnShowHistory'),
    helpModal: document.getElementById('helpModal'), helpModalClose: document.getElementById('helpModalClose'), bleConnectModal: document.getElementById('bleConnectModal'),
    bleConnectModalClose: document.getElementById('bleConnectModalClose'), btnScanBleDevice: document.getElementById('btnScanBleDevice'), bleScanStatus: document.getElementById('bleScanStatus'),
    bleDeviceInfo: document.getElementById('bleDeviceInfo'), bleError: document.getElementById('bleError'), bleGlobalStatus: document.getElementById('bleGlobalStatus'),
    currentPulseInModal: document.getElementById('currentPulseInModal'), realtimePulseWidget: document.getElementById('realtimePulseWidget'),
    pulseValueDisplay: document.getElementById('pulseValueDisplay'), heartbeatPath: document.getElementById('heartbeatPath'), calibrationModal: document.getElementById('calibrationModal'),
    calibrationModalClose: document.getElementById('calibrationModalClose'), calibrationModalTitle: document.getElementById('calibrationModalTitle'),
    calibrationMethodSelectionView: document.getElementById('calibrationMethodSelectionView'), btnGoToManualCalibration: document.getElementById('btnGoToManualCalibration'),
    btnGoToEstimatedCalibration: document.getElementById('btnGoToEstimatedCalibration'), ageWarningForEstimation: document.getElementById('ageWarningForEstimation'),
    calibrationPhaseSelectionView: document.getElementById('calibrationPhaseSelectionView'), calibrationPhaseButtonsContainer: document.getElementById('calibrationPhaseButtonsContainer'),
    calibrationOverallStatus: document.getElementById('calibrationOverallStatus'), btnBackToMethodSelectionFromManual: document.getElementById('btnBackToMethodSelectionFromManual'),
    calibrationEstimatedValuesView: document.getElementById('calibrationEstimatedValuesView'), userAgeForEstimationDisplay: document.getElementById('userAgeForEstimationDisplay'),
    estimatedValuesDisplayContainer: document.getElementById('estimatedValuesDisplayContainer'), btnApplyEstimatedValues: document.getElementById('btnApplyEstimatedValues'),
    btnBackToMethodSelectionFromEstimated: document.getElementById('btnBackToMethodSelectionFromEstimated'), calibrationPhaseRunnerView: document.getElementById('calibrationPhaseRunnerView'),
    calibrationPhaseInstructions: document.getElementById('calibrationPhaseInstructions'), calibrationTimerDisplay: document.getElementById('calibrationTimerDisplay'),
    calibrationLivePulse: document.getElementById('calibrationLivePulse'), btnRunSelectedPhase: document.getElementById('btnRunSelectedPhase'),
    btnCancelCurrentPhase: document.getElementById('btnCancelCurrentPhase'), calibrationResultsArea: document.getElementById('calibrationResultsArea'),
    btnSaveCalibration: document.getElementById('btnSaveCalibration'), btnCloseCalibrationModal: document.getElementById('btnCloseCalibrationModal'),
    lastCalibratedText: document.getElementById('lastCalibratedText'), realtimeUserStatusDisplayContainer: document.getElementById('realtimeUserStatusDisplayContainer'),
    realtimeUserStatusText: document.getElementById('realtimeUserStatusText'), sessionChartModal: document.getElementById('sessionChartModal'),
    sessionChartModalClose: document.getElementById('sessionChartModalClose'), sessionStateChartCanvas: document.getElementById('sessionStateChart'),
    btnSaveSessionData: document.getElementById('btnSaveSessionData'), btnCloseChartModal: document.getElementById('btnCloseChartModal'),
    historyModal: document.getElementById('historyModal'), historyModalClose: document.getElementById('historyModalClose'),
    sessionHistoryListContainer: document.getElementById('sessionHistoryListContainer'), noHistoryMessage: document.getElementById('noHistoryMessage'),
    btnCloseHistoryModal: document.getElementById('btnCloseHistoryModal'),
};

function initDB() { return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = e => { console.error("DB error:", e.target.error); reject(e.target.error); };
    request.onsuccess = e => { db = e.target.result; resolve(db); };
    request.onupgradeneeded = e => {
        const tempDb = e.target.result;
        if (!tempDb.objectStoreNames.contains(PROFILE_STORE_NAME)) tempDb.createObjectStore(PROFILE_STORE_NAME, { keyPath: 'id' });
        if (!tempDb.objectStoreNames.contains(SESSION_LOG_STORE_NAME)) tempDb.createObjectStore(SESSION_LOG_STORE_NAME, { keyPath: 'sessionId' });
    };
});}
function saveUserProfile(profileData) { return new Promise(async (resolve, reject) => {
    if (!db) { try { await initDB(); } catch(e) { reject(e); return; } }
    const tx = db.transaction([PROFILE_STORE_NAME], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = e => { console.error("Save profile error:", e.target.error); reject(e.target.error); };
    tx.objectStore(PROFILE_STORE_NAME).put(profileData);
});}
function getUserProfile(profileKey) { return new Promise(async (resolve, reject) => {
    if (!db) { try { await initDB(); } catch(e) { reject(e); return; } }
    const request = db.transaction([PROFILE_STORE_NAME], 'readonly').objectStore(PROFILE_STORE_NAME).get(profileKey);
    request.onsuccess = () => resolve(request.result);
    request.onerror = e => { console.error("Read profile error:", e.target.error); reject(e.target.error); };
});}
function saveSessionLog(sessionData) { return new Promise(async (resolve, reject) => {
    if (!db) { try { await initDB(); } catch(e) { reject(e); return; } }
    if (!sessionData || !sessionData.log || sessionData.log.length === 0) return reject("No hay datos de sesión para guardar.");
    const tx = db.transaction([SESSION_LOG_STORE_NAME], 'readwrite');
    tx.oncomplete = () => { console.log("Datos de sesión guardados:", sessionData.sessionId); resolve(); };
    tx.onerror = e => { console.error("Error guardando datos de sesión:", e.target.error); reject(e.target.error); };
    tx.objectStore(SESSION_LOG_STORE_NAME).put(sessionData);
});}
function getSessionLogById(sessionId) { return new Promise(async (resolve, reject) => {
    if (!db) { try { await initDB(); } catch (e) { reject(e); return; } }
    const request = db.transaction([SESSION_LOG_STORE_NAME], 'readonly').objectStore(SESSION_LOG_STORE_NAME).get(sessionId);
    request.onsuccess = () => request.result ? resolve(request.result) : reject(`No se encontró la sesión: ${sessionId}`);
    request.onerror = e => { console.error("Error obteniendo sesión por ID:", e.target.error); reject(e.target.error); };
});}
function getAllSessionLogs() { return new Promise(async (resolve, reject) => {
    if (!db) { try { await initDB(); } catch (e) { reject(e); return; } }
    const request = db.transaction([SESSION_LOG_STORE_NAME], 'readonly').objectStore(SESSION_LOG_STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
    request.onerror = e => { console.error("Error obteniendo todos los logs:", e.target.error); reject(e.target.error); };
});}
function deleteSessionLogById(sessionId) { return new Promise(async (resolve, reject) => {
    if (!db) { try { await initDB(); } catch (e) { reject(e); return; } }
    const tx = db.transaction([SESSION_LOG_STORE_NAME], 'readwrite');
    tx.objectStore(SESSION_LOG_STORE_NAME).delete(sessionId);
    tx.oncomplete = () => { console.log(`Sesión ${sessionId} eliminada.`); resolve(); };
    tx.onerror = e => { console.error(`Error eliminando sesión ${sessionId}:`, e.target.error); reject(e.target.error); };
});}

function showModal(modalElement) { modalElement.style.display = 'flex'; }
function closeModal(modalElement) { modalElement.style.display = 'none'; }
function formatTime(seconds) { const m=Math.floor(seconds/60),s=seconds%60; return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }

function updateControlButtonsState() {
    const profileReady = appState.isProfileSaved, bleReady = appState.isBleDeviceConnected;
    let calib = appState.profileData.calibrationData?.phases || {};
    const allCalibDone = calib.absoluteRelaxation?.avg && calib.activeCalm?.avg && calib.aerobicExercise?.avg &&
                         calib.absoluteRelaxation.avg !== "N/A" && calib.activeCalm.avg !== "N/A" && calib.aerobicExercise.avg !== "N/A";
    ui.btnStartCalibration.disabled = !profileReady;
    ui.btnStartCalibration.classList.toggle('btn-primary', profileReady); ui.btnStartCalibration.classList.toggle('btn-secondary', !profileReady);
    const analysisCanStart = profileReady && bleReady && allCalibDone;
    ui.btnStartStopRealtimeAnalysis.disabled = !analysisCanStart;
    ui.realtimeAnalysisPrerequisites.classList.toggle('hidden', analysisCanStart);
    const isAnalyzing = !!analysisIntervalTimerId;
    ui.btnStartStopRealtimeAnalysis.classList.toggle('btn-success', isAnalyzing);
    ui.btnStartStopRealtimeAnalysis.classList.toggle('btn-primary', !isAnalyzing && analysisCanStart);
    ui.btnStartStopRealtimeAnalysis.classList.toggle('btn-secondary', !isAnalyzing && !analysisCanStart);
    ui.btnStartStopRealtimeAnalysisText.textContent = isAnalyzing ? "Detener Seguimiento" : "Iniciar Seguimiento de Estado";
    ui.realtimeAnalysisIconPlay.classList.toggle('hidden', isAnalyzing);
    ui.realtimeAnalysisIconStop.classList.toggle('hidden', !isAnalyzing);
    ui.realtimeAnalysisStatus.textContent = `Seguimiento: ${isAnalyzing ? 'Activo' : 'Detenido'}`;
    ui.realtimeAnalysisStatus.className = `text-sm text-center mt-2 ${isAnalyzing ? 'text-green-600' : 'text-gray-500'}`;
    ui.btnShowSessionChart.classList.toggle('hidden', isAnalyzing || dailySessionLog.length === 0);
}

async function loadProfileFromDB() {
    try {
        const profile = await getUserProfile(USER_PROFILE_DB_KEY);
        if (profile) {
            appState.isProfileSaved = true;
            appState.profileData = { ...appState.profileData, ...profile };
            if (!appState.profileData.calibrationData) appState.profileData.calibrationData = { phases: {}, lastCalibrated: null };
            else if (!appState.profileData.calibrationData.phases) appState.profileData.calibrationData.phases = {};
            ['userName', 'userAge', 'userWeight', 'userHeight', 'userGender'].forEach(key => {
                if (ui.userProfileForm[key]) ui.userProfileForm[key].value = profile[key] ?? (key === 'userGender' ? '' : null);
            });
            ui.btnSaveProfile.textContent = 'Actualizar Perfil';
        } else {
            appState.isProfileSaved = false; ui.btnSaveProfile.textContent = 'Guardar Perfil';
        }
    } catch (e) { console.error("Error cargando perfil:", e); appState.isProfileSaved = false; }
    updateLastCalibratedDisplay(); updateControlButtonsState();
}
ui.userProfileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(ui.userProfileForm);
    const pData = { id: USER_PROFILE_DB_KEY, userName: fd.get('userName')?.trim(), userAge: fd.get('userAge') ? parseInt(fd.get('userAge')) : null,
        userWeight: fd.get('userWeight') ? parseFloat(fd.get('userWeight')) : null, userHeight: fd.get('userHeight') ? parseFloat(fd.get('userHeight')) : null,
        userGender: fd.get('userGender') || null, createdAt: appState.profileData.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(), calibrationData: appState.profileData.calibrationData };
    if (!pData.userName) return alert("El nombre es obligatorio.");
    try {
        await saveUserProfile(pData);
        alert(appState.isProfileSaved ? 'Perfil actualizado.' : 'Perfil guardado.');
        appState.isProfileSaved = true; appState.profileData = { ...pData };
        ui.btnSaveProfile.textContent = 'Actualizar Perfil'; updateControlButtonsState();
    } catch (error) { alert("Error al guardar perfil."); }
});

const HEART_RATE_SERVICE_UUID = 'heart_rate', HEART_RATE_MEASUREMENT_CHARACTERISTIC_UUID = 'heart_rate_measurement';
ui.btnOpenConnectBleModal.addEventListener('click', () => {
    if (!navigator.bluetooth) return alert("Web Bluetooth no es compatible con este navegador.");
    showModal(ui.bleConnectModal); 
    ui.bleConnectModal.querySelector('h3').textContent = 'Conectar Dispositivo BLE';
    ui.bleConnectModal.querySelector('#bleModalContent p:first-child').textContent = 'Asegúrate de que tu dispositivo de medición cardíaca (pulsera, banda pectoral, etc.) con Bluetooth Low Energy (BLE) esté encendido y cerca.';
    ui.bleDeviceInfo.textContent = ''; ui.bleError.textContent = ''; ui.currentPulseInModal.textContent = '-- BPM';
});
ui.btnScanBleDevice.addEventListener('click', async () => {
    ui.bleDeviceInfo.textContent = ''; ui.bleError.textContent = ''; ui.bleScanStatus.innerHTML = '<div class="spinner"></div><p>Buscando...</p>';
    try {
        appState.bleDevice = await navigator.bluetooth.requestDevice({ filters: [{ services: [HEART_RATE_SERVICE_UUID] }] });
        ui.bleScanStatus.innerHTML = ''; ui.bleDeviceInfo.textContent = `Conectando a: ${appState.bleDevice.name || 'Dispositivo BLE'}`;
        appState.bleDevice.addEventListener('gattserverdisconnected', onDisconnected);
        const server = await appState.bleDevice.gatt.connect();
        ui.bleDeviceInfo.textContent = `Conectado a: ${appState.bleDevice.name || 'Dispositivo BLE'} ✅`;
        const service = await server.getPrimaryService(HEART_RATE_SERVICE_UUID);
        appState.heartRateCharacteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT_CHARACTERISTIC_UUID);
        await appState.heartRateCharacteristic.startNotifications();
        appState.heartRateCharacteristic.addEventListener('characteristicvaluechanged', handleHeartRateMeasurement);
        appState.isBleDeviceConnected = true;
        ui.bleGlobalStatus.textContent = `Dispositivo BLE: Conectado (${appState.bleDevice.name || 'dispositivo'})`;
        ui.bleGlobalStatus.className = 'text-sm text-center text-green-600';
        ui.btnOpenConnectBleModal.innerHTML = `<svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.136 12.001a8.25 8.25 0 0113.728 0M1.987 8.965A11.25 11.25 0 0122.013 8.965" /></svg>Dispositivo BLE Conectado`;
        ui.btnOpenConnectBleModal.disabled = true;
        ui.realtimePulseWidget.classList.add('visible'); closeModal(ui.bleConnectModal);
    } catch (error) {
        ui.bleScanStatus.innerHTML = ''; console.error('BLE Error:', error);
        ui.bleError.textContent = error.name === 'NotFoundError' ? 'No se encontraron dispositivos BLE.' : `Error: ${error.message}.`;
        appState.isBleDeviceConnected = false;
    }
    updateControlButtonsState();
});
function handleHeartRateMeasurement(event) {
    const val = event.target.value, flags = val.getUint8(0), hr = (flags & 0x1) ? val.getUint16(1, true) : val.getUint8(1);
    if (analysisIntervalTimerId) addHrToBuffer(hr, Date.now());
    ui.currentPulseInModal.textContent = `${hr} BPM`; ui.pulseValueDisplay.textContent = hr;
    if (ui.calibrationModal.style.display === 'flex' && ui.calibrationPhaseRunnerView.style.display !== 'none') {
        ui.calibrationLivePulse.textContent = `${hr} BPM`;
        if (calibrationSession.isRunning && calibrationSession.activePhaseIndex !== -1) calibrationSession.pulseReadings.push(hr);
    }
    ui.heartbeatPath.classList.remove('heartbeat-animation'); void ui.heartbeatPath.offsetWidth; ui.heartbeatPath.classList.add('heartbeat-animation');
}
function onDisconnected() {
    if (appState.bleDevice) alert(`Dispositivo BLE ${appState.bleDevice.name || ''} desconectado.`);
    stopRealtimeAnalysis(); appState.isBleDeviceConnected = false; appState.bleDevice = null; appState.heartRateCharacteristic = null;
    ui.bleGlobalStatus.textContent = 'Dispositivo BLE: Desconectado'; ui.bleGlobalStatus.className = 'text-sm text-center text-red-600';
    ui.btnOpenConnectBleModal.innerHTML = `<svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.136 12.001a8.25 8.25 0 0113.728 0M1.987 8.965A11.25 11.25 0 0122.013 8.965" /></svg>Conectar Dispositivo BLE`;
    ui.btnOpenConnectBleModal.disabled = false;
    ui.currentPulseInModal.textContent = '-- BPM'; ui.realtimePulseWidget.classList.remove('visible'); ui.pulseValueDisplay.textContent = '--';
    ui.realtimeUserStatusDisplayContainer.style.display = 'none';
    if (calibrationSession.isRunning) { alert("Conexión perdida. Fase de calibración manual detenida."); finishCalibrationPhaseMeasurement(true); }
    updateControlButtonsState();
};

[ui.helpModalClose, ui.bleConnectModalClose, ui.calibrationModalClose, ui.btnCloseCalibrationModal, ui.sessionChartModalClose, ui.btnCloseChartModal, ui.historyModalClose, ui.btnCloseHistoryModal].forEach(btn => {
    if(btn) btn.addEventListener('click', () => closeModal(btn.closest('.modal')));
});
ui.btnShowHelp.addEventListener('click', () => showModal(ui.helpModal));
window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal')) closeModal(event.target);
});

function resetCalibrationSession() { if (calibrationSession.timerId) clearInterval(calibrationSession.timerId); calibrationSession = { activePhaseIndex: -1, isRunning: false, timerId: null, timeLeft: 0, pulseReadings: [] }; }
function showCalibrationMethodSelection() {
    ui.calibrationModalTitle.textContent = "Calibración de Pulso";
    ['calibrationPhaseSelectionView', 'calibrationPhaseRunnerView', 'calibrationEstimatedValuesView'].forEach(v => ui[v].classList.add('hidden'));
    ui.calibrationMethodSelectionView.classList.remove('hidden'); ui.ageWarningForEstimation.classList.add('hidden');
    ui.calibrationMethodSelectionView.querySelector('#btnGoToManualCalibration').innerHTML = `<svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" /></svg>Calibrar Manualmente con Dispositivo BLE (Recomendado)`;
    ui.calibrationMethodSelectionView.querySelector('p:first-of-type').textContent = 'Puedes calibrar tus valores de pulso de referencia manualmente usando un dispositivo de medición cardíaca Bluetooth Low Energy (BLE) (recomendado para mayor precisión) o usar valores estimados basados en tu edad si tienes prisa o no dispones de dispositivo BLE.';
    resetCalibrationSession(); renderCalibrationPhaseButtons(); displayOverallCalibrationResults();
}
ui.btnGoToManualCalibration.addEventListener('click', () => {
    if (!appState.isBleDeviceConnected) return alert("Conecta tu dispositivo BLE para calibración manual.");
    ui.calibrationMethodSelectionView.classList.add('hidden'); ui.calibrationPhaseSelectionView.classList.remove('hidden');
    ui.calibrationPhaseSelectionView.querySelector('#calibrationIntroText p:first-child').textContent = 'Este módulo te permite registrar tus patrones de pulso en diferentes situaciones para personalizar las recomendaciones de la aplicación. Asegúrate de que tu dispositivo BLE esté conectado para la calibración manual.';
    ui.calibrationModalTitle.textContent = "Calibración Manual"; renderCalibrationPhaseButtons(); displayOverallCalibrationResults();
});
ui.btnGoToEstimatedCalibration.addEventListener('click', () => {
    if (appState.profileData.userAge == null || appState.profileData.userAge === '') return ui.ageWarningForEstimation.classList.remove('hidden');
    ui.ageWarningForEstimation.classList.add('hidden'); ui.calibrationMethodSelectionView.classList.add('hidden');
    ui.calibrationEstimatedValuesView.classList.remove('hidden'); ui.calibrationModalTitle.textContent = "Valores Estimados por Edad";
    displayEstimatedValuesForUser();
});
[ui.btnBackToMethodSelectionFromManual, ui.btnBackToMethodSelectionFromEstimated].forEach(btn => btn.addEventListener('click', showCalibrationMethodSelection));
function displayEstimatedValuesForUser() {
    const age = appState.profileData.userAge; ui.userAgeForEstimationDisplay.textContent = age;
    const estimates = getHrEstimatesByAge(age); ui.estimatedValuesDisplayContainer.innerHTML = '';
    if (!estimates) { ui.estimatedValuesDisplayContainer.innerHTML = `<p class="text-red-500">No se pudieron obtener estimaciones para la edad ${age}.</p>`; ui.btnApplyEstimatedValues.disabled = true; return; }
    ui.btnApplyEstimatedValues.disabled = false;
    CALIBRATION_PHASES.forEach(pI => { const est = estimates[pI.id]; if(est) ui.estimatedValuesDisplayContainer.innerHTML += `<div class="p-3 border rounded-md"><strong class="text-blue-600">${pI.name}:</strong><br>Rango: <span class="font-semibold">${est.min}-${est.max} BPM</span>, Media: <span class="font-semibold">${est.avg} BPM</span></div>`; });
}
ui.btnApplyEstimatedValues.addEventListener('click', async () => {
    const estimates = getHrEstimatesByAge(appState.profileData.userAge);
    if (!estimates) return alert("No se pudieron aplicar valores estimados. Verifica tu edad.");
    if (!appState.profileData.calibrationData.phases) appState.profileData.calibrationData.phases = {};
    let changes = false;
    CALIBRATION_PHASES.forEach(pI => { const est = estimates[pI.id]; if(est){ appState.profileData.calibrationData.phases[pI.id] = {avg:est.avg,min:est.min,max:est.max,rango:est.max-est.min,timestamp:new Date().toISOString(),source:'estimated'}; changes=true;}});
    if (changes) { await handleSaveCalibration("Valores estimados aplicados."); showCalibrationMethodSelection(); } else alert("No se aplicaron cambios.");
});
function renderCalibrationPhaseButtons() {
    ui.calibrationPhaseButtonsContainer.innerHTML = '';
    CALIBRATION_PHASES.forEach((phase, index) => {
        const r = appState.profileData.calibrationData.phases[phase.id];
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'phase-button w-full flex justify-between items-center';
        let sTxt = (r && r.source) ? (r.source === 'estimated' ? ' (Estimado)' : ' (Manual)') : '';
        if (r && r.avg !== "N/A") btn.classList.add('completed');
        let txt = (r && r.avg !== "N/A") ? `Media:${r.avg}, Mín:${r.min}, Máx:${r.max}, Rango:${r.rango}${sTxt}` : 'Pendiente';
        btn.innerHTML = `<div><span class="font-semibold text-gray-800">${phase.name}</span><span class="block text-xs text-gray-500">${phase.duration/60} min - ${txt}</span></div><svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>`;
        btn.onclick = () => preparePhaseForCalibration(index); ui.calibrationPhaseButtonsContainer.appendChild(btn);
    });
    updateOverallCalibrationStatus();
}
function updateOverallCalibrationStatus() {
    const phases = appState.profileData.calibrationData.phases || {}; const count = Object.values(phases).filter(p=>p&&p.avg!=="N/A").length;
    let txt="Ninguna fase con valores.", cls="text-gray-600";
    if(count===CALIBRATION_PHASES.length){txt="¡Todas las fases tienen valores!";cls="text-green-600 font-medium";}
    else if(count>0){txt=`${count} de ${CALIBRATION_PHASES.length} fases con valores.`;cls="text-yellow-700";}
    ui.calibrationOverallStatus.textContent=txt; ui.calibrationOverallStatus.className=`text-sm text-center ${cls} mb-4`;
}
function preparePhaseForCalibration(idx) {
    resetCalibrationSession(); calibrationSession.activePhaseIndex = idx; const phase = CALIBRATION_PHASES[idx];
    ui.calibrationModalTitle.textContent = `Calibrar Manualmente: ${phase.name}`;
    ui.calibrationPhaseInstructions.innerHTML = `<p class="font-semibold">Preparado para: ${phase.name}</p><p>${phase.instructions}</p><p class="mt-2 text-sm text-blue-600">Pulsa "Iniciar Medición" con el dispositivo BLE conectado.</p>${!appState.isBleDeviceConnected ? '<p class="mt-2 text-red-500 font-semibold">Dispositivo BLE no conectado.</p>' : ''}`;
    ui.calibrationTimerDisplay.textContent = formatTime(phase.duration);
    ui.calibrationLivePulse.textContent = ui.pulseValueDisplay.textContent !== '--' ? `${ui.pulseValueDisplay.textContent} BPM` : "-- BPM";
    ui.btnRunSelectedPhase.textContent = "Iniciar Medición"; ui.btnRunSelectedPhase.disabled = !appState.isBleDeviceConnected; ui.btnCancelCurrentPhase.disabled = false;
    ui.calibrationPhaseSelectionView.classList.add('hidden'); ui.calibrationPhaseRunnerView.classList.remove('hidden');
}
function runSelectedPhaseMeasurement() {
    if (calibrationSession.activePhaseIndex === -1 || !appState.isBleDeviceConnected) return alert("Selecciona fase y conecta tu dispositivo BLE.");
    const phase = CALIBRATION_PHASES[calibrationSession.activePhaseIndex];
    calibrationSession.isRunning = true; calibrationSession.timeLeft = phase.duration; calibrationSession.pulseReadings = [];
    ui.calibrationPhaseInstructions.innerHTML = `<p class="font-semibold text-yellow-700">En curso: ${phase.name}</p><p>${phase.instructions}</p><p class="mt-2 text-sm text-yellow-600 bg-yellow-50 p-2 rounded">Mantén la actividad.</p>`;
    ui.btnRunSelectedPhase.textContent = "Medición en Progreso..."; ui.btnRunSelectedPhase.disabled = true;
    calibrationSession.timerId = setInterval(() => {
        calibrationSession.timeLeft--; ui.calibrationTimerDisplay.textContent = formatTime(calibrationSession.timeLeft);
        if (calibrationSession.timeLeft <= 0) finishCalibrationPhaseMeasurement(false);
    }, 1000);
}
function finishCalibrationPhaseMeasurement(premature = false) {
    if(calibrationSession.timerId) clearInterval(calibrationSession.timerId); calibrationSession.timerId = null; calibrationSession.isRunning = false;
    const idx = calibrationSession.activePhaseIndex; if(idx === -1) return; const phase = CALIBRATION_PHASES[idx];
    let msg = premature ? `Medición de "${phase.name}" detenida.` : `Medición de "${phase.name}" completada.`;
    if (calibrationSession.pulseReadings.length > 0) {
        const min = Math.min(...calibrationSession.pulseReadings), max = Math.max(...calibrationSession.pulseReadings),
              avg = Math.round(calibrationSession.pulseReadings.reduce((s,v)=>s+v,0)/calibrationSession.pulseReadings.length), rango = max - min;
        if(!appState.profileData.calibrationData.phases) appState.profileData.calibrationData.phases={};
        appState.profileData.calibrationData.phases[phase.id] = {avg,min,max,rango,timestamp:new Date().toISOString(), source: 'manual'};
        msg += ` Resultados: Media ${avg}, Mín ${min}, Máx ${max}, Rango ${rango}. Guarda los cambios.`;
    } else if (!premature) msg += " No se registraron pulsaciones.";
    alert(msg);
    ui.calibrationModalTitle.textContent = "Calibración Manual"; ui.calibrationPhaseRunnerView.classList.add('hidden'); 
    ui.calibrationPhaseSelectionView.classList.remove('hidden'); resetCalibrationSession();
    renderCalibrationPhaseButtons(); displayOverallCalibrationResults();
}
function displayOverallCalibrationResults() {
    ui.calibrationResultsArea.innerHTML = ''; const phases = appState.profileData.calibrationData.phases || {};
    if(!Object.values(phases).some(p=>p&&p.avg!=="N/A")) return ui.calibrationResultsArea.innerHTML='<p class="text-center text-gray-500">No hay datos de calibración.</p>';
    let html = '<h4 class="text-lg font-medium mb-2 text-gray-700">Valores de Referencia:</h4><ul class="space-y-2">';
    CALIBRATION_PHASES.forEach(pI => { const r=phases[pI.id]; let sTxt=(r&&r.source)?(r.source==='estimated'?' <span class="text-xs bg-blue-100 text-blue-700 px-1 rounded">Est.</span>':' <span class="text-xs bg-green-100 text-green-700 px-1 rounded">Man.</span>'):'';
        html += `<li class="p-3 bg-gray-50 rounded-md shadow-sm"><strong class="text-blue-600">${pI.name}:</strong>${sTxt}<br>`;
        html += (r&&r.avg!=="N/A")?`M:${r.avg},m:${r.min},X:${r.max},R:${r.rango}<span class="block text-xs text-gray-400">Act: ${new Date(r.timestamp).toLocaleDateString()}</span>`:`<span class="text-gray-400">N/E</span>`; html += `</li>`;});
    html += '</ul>'; ui.calibrationResultsArea.innerHTML = html;
}
async function handleSaveCalibration(msg = "Cambios de calibración guardados.") {
    if(!appState.profileData || !Object.values(appState.profileData.calibrationData.phases||{}).some(p=>p&&p.avg!=="N/A")) return alert("Realiza/aplica al menos una medición válida.");
    appState.profileData.calibrationData.lastCalibrated = new Date().toISOString();
    try { await saveUserProfile(appState.profileData); alert(msg); updateLastCalibratedDisplay(); updateControlButtonsState(); renderCalibrationPhaseButtons(); displayOverallCalibrationResults(); }
    catch (e) { alert("Error guardando calibración.");}
}
function updateLastCalibratedDisplay() {
    const cd = appState.profileData.calibrationData;
    if(cd && cd.lastCalibrated) { const d=new Date(cd.lastCalibrated); ui.lastCalibratedText.textContent = `Val. Ref. Act: ${d.toLocaleDateString()} ${d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`; ui.lastCalibratedText.className='text-sm text-green-700 font-medium';}
    else { ui.lastCalibratedText.textContent = "Calibración/Estimación: No realizada."; ui.lastCalibratedText.className='text-sm text-gray-600';}
}
ui.btnStartCalibration.addEventListener('click', () => { if(ui.btnStartCalibration.disabled) return; showCalibrationMethodSelection(); showModal(ui.calibrationModal); });
ui.btnRunSelectedPhase.addEventListener('click', runSelectedPhaseMeasurement);
ui.btnCancelCurrentPhase.addEventListener('click', () => { if(calibrationSession.isRunning && !confirm("¿Cancelar medición manual?")) return; finishCalibrationPhaseMeasurement(true); });
ui.btnSaveCalibration.addEventListener('click', () => handleSaveCalibration());

function getHrEstimatesByAge(age) { // Helper function to get estimates
    const range = AGE_BASED_HR_RANGES.find(r => age >= r.ageMin && age <= r.ageMax);
    if (!range) return null;
    return {
        absoluteRelaxation: { avg: Math.round((range.reposo[0] + range.reposo[1]) / 2), min: range.reposo[0], max: range.reposo[1] },
        activeCalm: { avg: Math.round((range.concentrado[0] + range.concentrado[1]) / 2), min: range.concentrado[0], max: range.concentrado[1] },
        aerobicExercise: { avg: Math.round((range.estres[0] + range.estres[1]) / 2), min: range.estres[0], max: range.estres[1] }
    };
}

function mapStateToNumeric(s){const l=s.split(" ")[0].toLowerCase();if(l.includes("relajado"))return 1;if(l.includes("concentrado"))return 2;if(l.includes("estresado"))return 3;return 0;}
function generateSessionChart(logData = dailySessionLog) {
    if (!logData || logData.length === 0) { alert("No hay datos de sesión para mostrar."); if (ui.sessionChartModal.style.display === 'flex' && logData !== dailySessionLog) closeModal(ui.sessionChartModal); return; }
    if (currentChartInstance) currentChartInstance.destroy();
    const labels=[],dataPoints=[],pointColors=[], ssc={'relajado':'rgba(75,192,192,1)','concentrado':'rgba(54,162,235,1)','estresado':'rgba(255,99,132,1)','indeterminado':'rgba(201,203,207,1)'};
    let sT=new Date(logData[0].timestamp).getTime();
    logData.forEach(e=>{const tOff=Math.round((new Date(e.timestamp).getTime()-sT)/(1000*60));labels.push(`${tOff} min`);dataPoints.push(mapStateToNumeric(e.estado_detectado));const sK=e.estado_detectado.split(" ")[0].toLowerCase();pointColors.push(ssc[sK]||ssc.indeterminado);});
    const data={labels,datasets:[{label:'Estado Fisiológico',data:dataPoints,borderColor:pointColors,backgroundColor:pointColors.map(c=>c.replace('1)','0.3)')),tension:0.1,fill:true,pointRadius:5,pointBackgroundColor:pointColors}]};
    const config={type:'line',data,options:{responsive:true,maintainAspectRatio:false,scales:{y:{min:0,max:4,ticks:{stepSize:1,callback:v=>{if(v===1)return 'Relajado';if(v===2)return 'Concentrado';if(v===3)return 'Estresado';if(v===0)return 'Indeterminado';return null;}},title:{display:true,text:'Estado Detectado'}},x:{title:{display:true,text:'Tiempo (min)'}}},plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>{let l='';const y=ctx.parsed.y;if(y===1)l+='Relajado';else if(y===2)l+='Concentrado';else if(y===3)l+='Estresado';else l+='Indeterminado';const oDP=logData[ctx.dataIndex];if(oDP){if(oDP.iee!==null)l+=` (IEE:${oDP.iee})`;if(oDP.si_baevsky!==null)l+=` (SI:${oDP.si_baevsky})`;}return l;}}}}}};
    currentChartInstance=new Chart(ui.sessionStateChartCanvas,config);showModal(ui.sessionChartModal);
    const isCurrent=(logData===dailySessionLog);ui.btnSaveSessionData.disabled=!isCurrent;ui.btnSaveSessionData.classList.toggle('hidden',!isCurrent);
}
function renderSessionHistoryUI(sessions) {
    ui.sessionHistoryListContainer.innerHTML = ''; ui.noHistoryMessage.classList.toggle('hidden', sessions && sessions.length > 0);
    if (!sessions || sessions.length === 0) return;
    sessions.forEach(s => {
        const div=document.createElement('div');div.className='p-3 border rounded-lg shadow-sm bg-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2';
        const info=document.createElement('div'),date=new Date(s.timestamp);info.innerHTML=`<p class="font-semibold text-gray-700">ID: <span class="font-normal">${s.sessionId.slice(-6)}</span></p><p class="text-sm text-gray-500">Fecha: ${date.toLocaleDateString()} ${date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</p>${s.profileUsed?.userName?`<p class="text-xs text-gray-400">Perfil: ${s.profileUsed.userName}</p>`:''}<p class="text-xs text-gray-400">Bloques: ${s.log.length}</p>`;
        const acts=document.createElement('div');acts.className='flex space-x-2 mt-2 sm:mt-0';
        const vBtn=document.createElement('button');vBtn.className='btn btn-sm btn-outline';vBtn.innerHTML=`<svg class="icon w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>Ver`;vBtn.onclick=()=>handleViewSessionChart(s.sessionId,s.log);
        const dBtn=document.createElement('button');dBtn.className='btn btn-sm btn-danger';dBtn.innerHTML=`<svg class="icon w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12.56 0c.342.052.682.107 1.022.166m0 0l-.346 9m4.788-9l-.346 9m0 0a2.25 2.25 0 002.244 2.077h3.164a2.25 2.25 0 002.244-2.077L19.25 5.79m-14.456 0a48.108 48.108 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>Elim.`;dBtn.onclick=()=>handleDeleteSession(s.sessionId);
        acts.appendChild(vBtn);acts.appendChild(dBtn);div.appendChild(info);div.appendChild(acts);ui.sessionHistoryListContainer.appendChild(div);
    });
}
async function openHistoryModal() { try { const sessions = await getAllSessionLogs(); renderSessionHistoryUI(sessions); showModal(ui.historyModal); } catch (e) { alert("Error al cargar historial: " + e); }}
async function handleViewSessionChart(sessionId, log) { if (log && log.length > 0) { closeModal(ui.historyModal); generateSessionChart(log); } else { try { const s = await getSessionLogById(sessionId); if (s && s.log) { closeModal(ui.historyModal); generateSessionChart(s.log); } else alert("No se pudieron cargar datos."); } catch (e) { alert("Error al cargar sesión: " + e); }}}
async function handleDeleteSession(sessionId) { if (confirm(`¿Eliminar sesión ${sessionId.slice(-6)}?`)) { try { await deleteSessionLogById(sessionId); alert("Sesión eliminada."); openHistoryModal(); } catch (e) { alert("Error eliminando sesión: " + e); }}}
ui.btnShowSessionChart.addEventListener('click', () => generateSessionChart(dailySessionLog));
ui.btnSaveSessionData.addEventListener('click', async () => {
    if (dailySessionLog.length === 0) return alert("No hay datos de sesión activos para guardar.");
    const sId = `session_${Date.now()}`, sToSave = {sessionId:sId, timestamp:new Date().toISOString(), profileUsed:{userName:appState.profileData.userName,userAge:appState.profileData.userAge,calibrationData:JSON.parse(JSON.stringify(appState.profileData.calibrationData))}, log:[...dailySessionLog]};
    try { await saveSessionLog(sToSave); alert(`Datos de sesión (ID:${sId.slice(-6)}) guardados.`); closeModal(ui.sessionChartModal); } catch (e) { alert("Error guardando datos: " + e); }
});

function calculateMean(a){return a&&a.length>0?a.reduce((s,v)=>s+v,0)/a.length:0;}
function calculateStdDev(a,m){if(!a||a.length<2)return 0;const mV=m!==undefined?m:calculateMean(a);return Math.sqrt(a.reduce((s,v)=>s+Math.pow(v-mV,2),0)/a.length);}
function estimateRRIntervals(hV){if(!hV||hV.length===0)return[];return hV.map(h=>h>0?60000/h:0).filter(rr=>rr>0);}
function calculateMode(a){if(!a||a.length===0)return null;const f={};let mF=0,m=null;a.forEach(i=>{const rI=Math.round(i);f[rI]=(f[rI]||0)+1;if(f[rI]>mF){mF=f[rI];m=rI;}});return m;}
function calculateRMSSD(rI){if(!rI||rI.length<2)return null;let sSD=0;for(let i=0;i<rI.length-1;i++)sSD+=Math.pow(rI[i+1]-rI[i],2);return Math.sqrt(sSD/(rI.length-1));}
function getBaevskyParameters(rI){if(!rI||rI.length<2)return null;const Mo=calculateMode(rI);if(Mo===null)return null;const cMo=rI.filter(rr=>Math.round(rr)===Mo).length,AMo=(cMo/rI.length)*100,rrMin=Math.min(...rI),rrMax=Math.max(...rI),MxDMn=rrMax-rrMin;if(MxDMn===0)return{Mo,AMo,MxDMn,si_problematic:true};return{Mo,AMo,MxDMn};}
function calculateBaevskySI(p){if(!p||p.si_problematic||p.Mo===null||p.MxDMn===0)return null;const Mo_s=p.Mo/1000,MxDMn_s=p.MxDMn/1000;if(Mo_s===0||MxDMn_s===0)return null;return parseFloat((p.AMo/(2*Mo_s*MxDMn_s)).toFixed(2));}
function calculateIEE(cMH){const c=appState.profileData.calibrationData.phases,hR=c.absoluteRelaxation?.avg&&c.absoluteRelaxation.avg!=="N/A"?c.absoluteRelaxation.avg:null,hF=c.activeCalm?.avg&&c.activeCalm.avg!=="N/A"?c.activeCalm.avg:null,hS=c.aerobicExercise?.avg&&c.aerobicExercise.avg!=="N/A"?c.aerobicExercise.avg:null;if(hR===null||hF===null||hS===null)return null;const den=hS-hR;if(den===0)return null;return parseFloat(((cMH-hF)/den).toFixed(2));}
function classifyUserStateAdvanced(iee,si){if(iee===null&&si===null)return"Indeterminado";const SIL=150,SIH=500;if(si!==null&&si>SIH)return"Estresado (SI Alto)";if(si!==null&&si>SIL&&(iee===null||iee>0.2))return"Estresado (SI Moderado)";if(iee!==null){if(iee<-0.1)return"Relajado";if(iee>=-0.1&&iee<=0.15){if(si!==null&&si<SIL*0.75)return"Concentrado (IEE y SI)";return"Concentrado (IEE)";}if(iee>0.15)return"Estresado (IEE Alto)";}if(si!==null){if(si<SIL*0.5)return"Relajado (SI Bajo)";if(si<SIL)return"Concentrado (SI Normal-Bajo)";}return"Indeterminado";}
function addHrToBuffer(hr,ts){if(typeof hr!=='number'||hr<=30||hr>=220)return;hrBufferForBlock.push({hr,ts});}
function processActivityBlock(){const now=Date.now();if(hrBufferForBlock.length===0)return;const bST=hrBufferForBlock[0].ts;if(now-bST>=ANALYSIS_BLOCK_DURATION_S*1000){if(hrBufferForBlock.length>=MIN_HR_READINGS_FOR_BLOCK){const bTA=[...hrBufferForBlock],hVIB=bTA.map(i=>i.hr),hM=parseFloat(calculateMean(hVIB).toFixed(1)),sH=parseFloat(calculateStdDev(hVIB,hM).toFixed(2)),rRs=estimateRRIntervals(hVIB),eR=rRs.length>1?parseFloat(calculateRMSSD(rRs).toFixed(2)):null,bP=getBaevskyParameters(rRs),sB=bP?calculateBaevskySI(bP):null,iee=calculateIEE(hM),eD=classifyUserStateAdvanced(iee,sB);const bR={timestamp:new Date(bST).toISOString(),hrMedia:hM,sdhr:sH,eRMSSD:eR,iee,si_baevsky:sB,estado_detectado:eD,_rawHrCount:hVIB.length};dailySessionLog.push(bR);updateRealtimeStatusDisplay(eD,iee,sB);}else console.log(`Bloque de ${ANALYSIS_BLOCK_DURATION_S}s no analizado, lecturas insuficientes: ${hrBufferForBlock.length}`);hrBufferForBlock=[];}}

function updateRealtimeStatusDisplay(estado, iee, si, tiempoEstimado = null) {
    let statusTextContent = `Estado: ${estado}`;
    const lowerCaseEstado = estado.toLowerCase();
    if (tiempoEstimado) { statusTextContent += ` (Estimado en: ${tiempoEstimado}s)`; }
    else if (lowerCaseEstado !== "analizando..." && lowerCaseEstado !== "esperando datos..." && lowerCaseEstado !== "seguimiento finalizado") {
        if (iee !== null) statusTextContent += ` (IEE: ${iee})`; if (si !== null) statusTextContent += ` (SI: ${si})`;
    }
    ui.realtimeUserStatusText.textContent = statusTextContent;
    const container = ui.realtimeUserStatusDisplayContainer;
    let baseClasses = 'fixed bottom-[130px] right-5 p-2 px-4 rounded-lg shadow-md z-[99] text-sm transition-all duration-300';
    let stateClasses = (lowerCaseEstado === "analizando..." || lowerCaseEstado === "esperando datos..." || lowerCaseEstado === "seguimiento finalizado") ? 'bg-gray-300 text-gray-800 border-4 border-gray-500'
        : (estado.split(" ")[0] === "Relajado" ? 'bg-green-500 text-white border-4 border-green-700'
        : (estado.split(" ")[0] === "Concentrado" ? 'bg-blue-500 text-white border-4 border-blue-700'
        : (estado.split(" ")[0] === "Estresado" ? 'bg-red-500 text-white border-4 border-red-700'
        : 'bg-gray-300 text-gray-800 border-4 border-gray-500')));
    container.className = `${baseClasses} ${stateClasses}`;
    if (analysisIntervalTimerId || lowerCaseEstado === "analizando..." || lowerCaseEstado === "esperando datos..." || lowerCaseEstado === "seguimiento finalizado") {
        if (container.style.display === 'none') container.style.display = 'block';
    }
}

function startRealtimeAnalysis() {
    if (analysisIntervalTimerId) return;
    if (!appState.isBleDeviceConnected) return alert("Dispositivo BLE no conectado.");
    const calib = appState.profileData.calibrationData.phases;
    if (!(calib.absoluteRelaxation?.avg && calib.activeCalm?.avg && calib.aerobicExercise?.avg && calib.absoluteRelaxation.avg!=="N/A"&&calib.activeCalm.avg!=="N/A"&&calib.aerobicExercise.avg!=="N/A")) return alert("Calibración completa requerida.");
    dailySessionLog = []; ui.btnShowSessionChart.classList.add('hidden'); hrBufferForBlock = [];
    updateRealtimeStatusDisplay("Analizando...", null, null, ANALYSIS_BLOCK_DURATION_S);
    ui.realtimeUserStatusDisplayContainer.style.display = 'block';
    analysisIntervalTimerId = setInterval(processActivityBlock, PROCESS_BLOCK_INTERVAL_MS);
    updateControlButtonsState();
}

function stopRealtimeAnalysis() {
    if (analysisIntervalTimerId) {
        clearInterval(analysisIntervalTimerId); analysisIntervalTimerId = null;
        let finalStateProcessed = false;
        if (hrBufferForBlock.length >= MIN_HR_READINGS_FOR_BLOCK / 4) {
            const bTA = [...hrBufferForBlock], bST = bTA.length > 0 ? new Date(bTA[0].ts).toISOString() : new Date().toISOString(), hVIB = bTA.map(i => i.hr);
            if (hVIB.length > 0) {
                const hM=parseFloat(calculateMean(hVIB).toFixed(1)),sH=parseFloat(calculateStdDev(hVIB,hM).toFixed(2)),rRs=estimateRRIntervals(hVIB),eR=rRs.length>1?parseFloat(calculateRMSSD(rRs).toFixed(2)):null,bP=getBaevskyParameters(rRs),sB=bP?calculateBaevskySI(bP):null,iee=calculateIEE(hM),eD=classifyUserStateAdvanced(iee,sB);
                dailySessionLog.push({timestamp:bST,hrMedia:hM,sdhr:sH,eRMSSD:eR,iee,si_baevsky:sB,estado_detectado:eD,_rawHrCount:hVIB.length,_isPartial:true});
                updateRealtimeStatusDisplay(eD,iee,sB); finalStateProcessed=true;
            }
        }
        if (!finalStateProcessed) {
            if (dailySessionLog.length > 0) { const lLE = dailySessionLog[dailySessionLog.length - 1]; updateRealtimeStatusDisplay(lLE.estado_detectado, lLE.iee, lLE.si_baevsky); }
            else { updateRealtimeStatusDisplay("Seguimiento finalizado", null, null); }
        }
        hrBufferForBlock = []; updateControlButtonsState();
        if (dailySessionLog.length > 0) console.log("Resumen sesión:", dailySessionLog);
    }
}
ui.btnStartStopRealtimeAnalysis.addEventListener('click', () => analysisIntervalTimerId ? stopRealtimeAnalysis() : startRealtimeAnalysis());

document.addEventListener('DOMContentLoaded', async () => {
    try { await initDB(); await loadProfileFromDB(); } catch (e) { console.error("Error crítico al iniciar:", e); alert("Error crítico. Revisa consola."); }
    ui.btnShowSessionChart.classList.add('hidden');
    if (ui.btnShowHistory) ui.btnShowHistory.addEventListener('click', openHistoryModal);
    if (ui.historyModalClose) ui.historyModalClose.addEventListener('click', () => closeModal(ui.historyModal));
    if (ui.btnCloseHistoryModal) ui.btnCloseHistoryModal.addEventListener('click', () => closeModal(ui.historyModal));
    window.addEventListener('beforeunload', () => { if (analysisIntervalTimerId) stopRealtimeAnalysis(); });
    
    ui.btnOpenConnectBleModal.innerHTML = `<svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.136 12.001a8.25 8.25 0 0113.728 0M1.987 8.965A11.25 11.25 0 0122.013 8.965" /></svg>Conectar Dispositivo BLE`;
    ui.bleGlobalStatus.textContent = 'Dispositivo BLE: No conectado';
});