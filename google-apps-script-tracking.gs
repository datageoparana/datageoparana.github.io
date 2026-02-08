/**
 * Google Apps Script para tracking do Portal Datageo Parana
 *
 * PASSO A PASSO PARA CONFIGURACAO:
 * 1. Cole TODO este codigo no Google Apps Script
 * 2. Substitua 'SEU_SPREADSHEET_ID_AQUI' pelo ID da sua planilha
 * 3. Salve o projeto
 * 4. Execute a funcao setupSheet() para criar as abas e cabecalhos
 * 5. Implante como Web App:
 *    - Tipo: Aplicativo da Web
 *    - Executar como: Eu
 *    - Acesso: Qualquer pessoa
 * 6. Copie a URL gerada
 * 7. Atualize TRACKING_URL no index.html
 *
 * ABAS CRIADAS:
 * - "Tracking Data": registros de visita (page views, device info, etc.)
 * - "Emails": registros de e-mail coletados pelo gate de acesso
 * - "Bug Reports": relatos de problemas enviados pelos usuarios
 */

const SPREADSHEET_ID = 'SEU_SPREADSHEET_ID_AQUI';
const SHEET_NAME = 'Tracking Data';
const EMAIL_SHEET_NAME = 'Emails';

// ─── Seguranca ──────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://datageoparana.github.io',
  'http://localhost',
  'http://127.0.0.1',
];

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_SEC = 60;
const MAX_PAYLOAD_SIZE = 10000;

function isAllowedOrigin_(data) {
  var origin = data.origin || '';
  if (!origin) return false;  // Rejeitar requisicoes sem origin
  return ALLOWED_ORIGINS.indexOf(origin) !== -1;  // Match exato
}

function checkRateLimit_(sessionId) {
  if (!sessionId) return true;
  var cache = CacheService.getScriptCache();
  var key = 'rl_' + sessionId;
  var current = cache.get(key);
  var count = current ? parseInt(current, 10) : 0;
  if (count >= RATE_LIMIT_MAX) return false;
  cache.put(key, String(count + 1), RATE_LIMIT_WINDOW_SEC);
  return true;
}

function validatePayload_(raw) {
  if (!raw || raw.length > MAX_PAYLOAD_SIZE) return null;
  try {
    var data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch (e) {
    return null;
  }
}

const COLUMNS = [
  'URL',
  'Caminho',
  'Referrer',
  'Timezone',
  'Session ID',
  'User Agent',
  'Sistema Operacional',
  'Navegador',
  'Dispositivo',
  'Returning Visitor',
  'page',
  'referrer',
  'userAgent',
  'language',
  'screenWidth',
  'screenHeight',
  'platform',
  'timezone',
  'sessionId',
  'timestamp',
  'returningVisitor',
  'colorDepth',
  'pixelRatio',
  'viewportWidth',
  'viewportHeight',
  'touchSupport',
  'cpuCores',
  'deviceMemory',
  'vendor',
  'cookiesEnabled',
  'doNotTrack',
  'onlineStatus',
  'connectionType',
  'connectionSpeed',
  'saveDataMode',
  'protocol',
  'hostname',
  'pathname',
  'queryString',
  'pageTitle',
  'loadTime',
  'screenOrientation',
  'timezoneOffset',
  'dnsLookupTime',
  'tcpConnectionTime',
  'serverResponseTime',
  'domContentLoadedTime',
  'domInteractiveTime',
  'firstPaint',
  'firstContentfulPaint',
  'transferSize',
  'encodedBodySize',
  'decodedBodySize',
  'connectionRTT',
  'connectionDownlinkMax',
  'languages',
  'localStorageEnabled',
  'sessionStorageEnabled',
  'indexedDBEnabled',
  'serviceWorkerEnabled',
  'webGLSupported',
  'webRTCSupported',
  'notificationPermission',
  'pluginsCount',
  'mimeTypesCount',
  'pdfViewerEnabled',
  'maxTouchPoints',
  'batteryLevel',
  'batteryCharging',
  'historyLength',
  'isIframe',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmTerm',
  'utmContent',
  'sessionStartTime',
  'pageViewsInSession',
  'isMobile',
  'isTablet',
  'isDesktop',
  'secureContext',
  'crossOriginIsolated',
  'canvasSupported',
  'svgSupported',
  'storageQuota',
  'storageUsage',
  'storageUsagePercent',
  'availScreenWidth',
  'availScreenHeight',
  'displayMode',
  'prefersColorScheme',
  'prefersReducedMotion',
  'prefersReducedTransparency',
  'prefersContrast'
];

const EMAIL_COLUMNS = [
  'Email',
  'Data/Hora',
  'Session ID',
  'Hostname'
];

const BUG_SHEET_NAME = 'Bug Reports';
const BUG_COLUMNS = [
  'Página',
  'Descrição',
  'Email do usuário',
  'Data/Hora',
  'Session ID',
  'Hostname'
];

// ─── Endpoints ───────────────────────────────────

function doPost(e) {
  try {
    var raw = e.postData.contents;
    var data = validatePayload_(raw);

    if (!data) {
      return jsonError_('invalid payload');
    }

    if (!isAllowedOrigin_(data)) {
      return jsonError_('forbidden');
    }

    if (!checkRateLimit_(data.sessionId || '')) {
      return jsonError_('rate limited');
    }

    if (data.page === 'email-gate' && data.email) {
      saveEmail(data);
    } else if (data.page === 'bug-report') {
      saveBugReport(data);
    } else {
      saveToSheet(data);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Dados salvos com sucesso'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function jsonError_(msg) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'error',
    message: msg
  })).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    message: 'Datageo Parana Tracking API funcionando',
    totalFields: COLUMNS.length,
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

// ─── Salvar visita (aba Tracking Data) ───────────

function saveToSheet(data) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = createTrackingSheet_(spreadsheet);
  }

  const enriched = enrichAliases(data);
  const rowData = COLUMNS.map((column) => {
    const value = enriched[column];
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'object') return JSON.stringify(value);
    return value;
  });

  const nextRow = sheet.getLastRow() + 1;
  sheet.getRange(nextRow, 1, 1, rowData.length).setValues([rowData]);
}

// ─── Salvar email (aba Emails) ───────────────────

function saveEmail(data) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(EMAIL_SHEET_NAME);

  if (!sheet) {
    sheet = createEmailSheet_(spreadsheet);
  }

  const row = [
    data.email || '',
    data.timestamp || new Date().toISOString(),
    data.sessionId || '',
    data.hostname || ''
  ];

  const nextRow = sheet.getLastRow() + 1;
  sheet.getRange(nextRow, 1, 1, row.length).setValues([row]);
}

// ─── Salvar bug report (aba Bug Reports) ─────────

function saveBugReport(data) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(BUG_SHEET_NAME);

  if (!sheet) {
    sheet = createBugSheet_(spreadsheet);
  }

  const row = [
    data.bugPage || '',
    data.bugDescription || '',
    data.email || '',
    data.timestamp || new Date().toISOString(),
    data.sessionId || '',
    data.hostname || ''
  ];

  const nextRow = sheet.getLastRow() + 1;
  sheet.getRange(nextRow, 1, 1, row.length).setValues([row]);
}

// ─── Enriquecimento de dados ─────────────────────

function enrichAliases(data) {
  const result = Object.assign({}, data);
  const url = data.url || data.URL || data.page || buildUrl(data) || '';
  const pathname = data.pathname || extractPath(url) || '';
  const ua = data.userAgent || data['User Agent'] || '';
  const parsed = parseUserAgent(ua);

  result['URL'] = url;
  result['Caminho'] = pathname;
  result['Referrer'] = data.referrer || data.Referrer || '';
  result['Timezone'] = data.timezone || data.Timezone || '';
  result['Session ID'] = data.sessionId || data['Session ID'] || '';
  result['User Agent'] = ua;
  result['Sistema Operacional'] = parsed.os;
  result['Navegador'] = parsed.browser;
  result['Dispositivo'] = parsed.deviceType;
  result['Returning Visitor'] = data.returningVisitor;

  return result;
}

function buildUrl(data) {
  if (!data.protocol || !data.hostname) return '';
  const path = data.pathname || '';
  const query = data.queryString || '';
  return data.protocol + '//' + data.hostname + path + query;
}

function extractPath(url) {
  if (!url) return '';
  try {
    return url.split('?')[0].replace(/^https?:\/\/[^/]+/i, '');
  } catch (err) {
    return '';
  }
}

function parseUserAgent(ua) {
  const value = String(ua || '').toLowerCase();
  var os = '';
  var browser = '';
  var deviceType = 'Desktop';

  if (value.includes('android')) os = 'Android';
  else if (value.includes('iphone') || value.includes('ipad')) os = 'iOS';
  else if (value.includes('mac os')) os = 'macOS';
  else if (value.includes('windows')) os = 'Windows';
  else if (value.includes('linux')) os = 'Linux';

  if (value.includes('edg/')) browser = 'Edge';
  else if (value.includes('chrome') && !value.includes('chromium')) browser = 'Chrome';
  else if (value.includes('safari') && !value.includes('chrome')) browser = 'Safari';
  else if (value.includes('firefox')) browser = 'Firefox';

  if (value.includes('ipad') || value.includes('tablet')) deviceType = 'Tablet';
  else if (value.includes('mobi') || value.includes('android') || value.includes('iphone')) deviceType = 'Mobile';

  return { os: os, browser: browser, deviceType: deviceType };
}

// ─── Setup (executar manualmente uma vez) ────────

function setupSheet() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Aba de tracking
  var trackingSheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (trackingSheet) {
    spreadsheet.deleteSheet(trackingSheet);
  }
  createTrackingSheet_(spreadsheet);

  // Aba de emails
  var emailSheet = spreadsheet.getSheetByName(EMAIL_SHEET_NAME);
  if (emailSheet) {
    spreadsheet.deleteSheet(emailSheet);
  }
  createEmailSheet_(spreadsheet);

  // Aba de bug reports
  var bugSheet = spreadsheet.getSheetByName(BUG_SHEET_NAME);
  if (bugSheet) {
    spreadsheet.deleteSheet(bugSheet);
  }
  createBugSheet_(spreadsheet);
}

// ─── Criacao de abas ─────────────────────────────

function createTrackingSheet_(spreadsheet) {
  var sheet = spreadsheet.insertSheet(SHEET_NAME);

  sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);

  var headerRange = sheet.getRange(1, 1, 1, COLUMNS.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#0ea5e9');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setWrap(false);
  headerRange.setVerticalAlignment('middle');
  sheet.setFrozenRows(1);

  if (COLUMNS.length <= 20) {
    sheet.autoResizeColumns(1, COLUMNS.length);
  } else {
    sheet.autoResizeColumns(1, 20);
    for (var i = 21; i <= COLUMNS.length; i++) {
      sheet.setColumnWidth(i, 120);
    }
  }

  return sheet;
}

function createEmailSheet_(spreadsheet) {
  var sheet = spreadsheet.insertSheet(EMAIL_SHEET_NAME);

  sheet.getRange(1, 1, 1, EMAIL_COLUMNS.length).setValues([EMAIL_COLUMNS]);

  var headerRange = sheet.getRange(1, 1, 1, EMAIL_COLUMNS.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#0f766e');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setWrap(false);
  headerRange.setVerticalAlignment('middle');
  sheet.setFrozenRows(1);

  sheet.setColumnWidth(1, 280);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 220);
  sheet.setColumnWidth(4, 200);

  return sheet;
}

function createBugSheet_(spreadsheet) {
  var sheet = spreadsheet.insertSheet(BUG_SHEET_NAME);

  sheet.getRange(1, 1, 1, BUG_COLUMNS.length).setValues([BUG_COLUMNS]);

  var headerRange = sheet.getRange(1, 1, 1, BUG_COLUMNS.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#dc2626');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setWrap(false);
  headerRange.setVerticalAlignment('middle');
  sheet.setFrozenRows(1);

  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 400);
  sheet.setColumnWidth(3, 250);
  sheet.setColumnWidth(4, 200);
  sheet.setColumnWidth(5, 220);
  sheet.setColumnWidth(6, 200);

  return sheet;
}
