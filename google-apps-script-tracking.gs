/**
 * Google Apps Script para tracking do Portal Datageo Parana
 *
 * PASSO A PASSO PARA CONFIGURACAO:
 * 1. Cole TODO este codigo no Google Apps Script
 * 2. Substitua 'SEU_SPREADSHEET_ID_AQUI' pelo ID da sua planilha
 * 3. Salve o projeto
 * 4. Execute a funcao setupSheet()
 * 5. Implante como Web App:
 *    - Tipo: Aplicativo da Web
 *    - Executar como: Eu
 *    - Acesso: Qualquer pessoa
 * 6. Copie a URL gerada
 * 7. Atualize TRACKING_URL no index.html
 */

const SPREADSHEET_ID = 'SEU_SPREADSHEET_ID_AQUI';
const SHEET_NAME = 'Tracking Data';

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

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    saveToSheet(data);
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

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    message: 'Datageo Parana Tracking API funcionando',
    totalFields: COLUMNS.length,
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function saveToSheet(data) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
    const headerRange = sheet.getRange(1, 1, 1, COLUMNS.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#0ea5e9');
    headerRange.setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
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
  return `${data.protocol}//${data.hostname}${path}${query}`;
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
  let os = '';
  let browser = '';
  let deviceType = 'Desktop';

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

  return { os, browser, deviceType };
}

function setupSheet() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (sheet) {
    spreadsheet.deleteSheet(sheet);
  }

  sheet = spreadsheet.insertSheet(SHEET_NAME);
  sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);

  const headerRange = sheet.getRange(1, 1, 1, COLUMNS.length);
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
    for (let i = 21; i <= COLUMNS.length; i++) {
      sheet.setColumnWidth(i, 120);
    }
  }
}
