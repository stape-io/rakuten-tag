const encodeUriComponent = require('encodeUriComponent');
const getAllEventData = require('getAllEventData');
const getContainerVersion = require('getContainerVersion');
const getCookieValues = require('getCookieValues');
const getEventData = require('getEventData');
const getRequestHeader = require('getRequestHeader');
const getTimestampMillis = require('getTimestampMillis');
const getType = require('getType');
const JSON = require('JSON');
const logToConsole = require('logToConsole');
const makeString = require('makeString');
const makeTableMap = require('makeTableMap');
const Math = require('Math');
const parseUrl = require('parseUrl');
const setCookie = require('setCookie');
const sendHttpRequest = require('sendHttpRequest');

/*==============================================================================
==============================================================================*/

const eventData = getAllEventData();

if (!isConsentGivenOrNotRequired(data, eventData)) {
  return data.gtmOnSuccess();
}

const isLoggingEnabled = determinateIsLoggingEnabled();
const traceId = getRequestHeader('trace-id');

if (data.type === 'page_view') {
  const url = getEventData('page_location') || getRequestHeader('referer');

  if (url) {
    const siteIdValue = parseUrl(url).searchParams.siteID;
    const ranMidValue = parseUrl(url).searchParams.ranMID;
    const ranEaidValue = parseUrl(url).searchParams.ranEAID;
    const ranSiteIdValue = parseUrl(url).searchParams.ranSiteID;
    const rakutenSiteIdValue = siteIdValue || ranSiteIdValue;

    const options = {
      domain: 'auto',
      path: '/',
      secure: true,
      httpOnly: false,
      'max-age': 63072000 // 2 years
    };

    if (rakutenSiteIdValue) {
      setCookie('rakuten_site_id', makeString(rakutenSiteIdValue), options, false);
      setCookie(
        'rakuten_time_entered',
        makeString(Math.round(getTimestampMillis() / 1000)),
        options,
        false
      );
    }

    if (ranMidValue) setCookie('rakuten_ran_mid', makeString(ranMidValue), options, false);
    if (ranEaidValue) setCookie('rakuten_ran_eaid', makeString(ranEaidValue), options, false);
    if (ranSiteIdValue)
      setCookie('rakuten_ran_site_id', makeString(ranSiteIdValue), options, false);
  }

  data.gtmOnSuccess();
} else {
  const containerIdentifier = getRequestHeader('x-gtm-identifier');
  const defaultDomain = getRequestHeader('x-gtm-default-domain');
  const containerApiKey = getRequestHeader('x-gtm-api-key');

  let requestUrl =
    'https://' +
    enc(containerIdentifier) +
    '.' +
    enc(defaultDomain) +
    '/stape-api/' +
    enc(containerApiKey) +
    '/v1/rakuten/auth-proxy';

  let requestBody = {
    auth: {
      affiliate_key: data.affiliateKey,
      mid: data.mid
    },
    sku_order: {
      siteid: getCookieValues('rakuten_site_id')[0] || '',
      time_entered: getCookieValues('rakuten_time_entered')[0] || '',
      orderid: data.orderId,
      currency: data.currency,
      trans_date: Math.round(getTimestampMillis() / 1000),
      optional_data: data.optionalData ? makeTableMap(data.optionalData, 'name', 'value') : {},
      items: data.items ? data.items : getItems()
    }
  };

  if (isLoggingEnabled) {
    logToConsole(
      JSON.stringify({
        Name: 'Rakuten',
        Type: 'Request',
        TraceId: traceId,
        EventName: 'Conversion',
        RequestMethod: 'POST',
        RequestUrl: requestUrl,
        RequestBody: requestBody
      })
    );
  }

  sendHttpRequest(
    requestUrl,
    (statusCode, headers, body) => {
      if (isLoggingEnabled) {
        logToConsole(
          JSON.stringify({
            Name: 'Rakuten',
            Type: 'Response',
            TraceId: traceId,
            EventName: 'Conversion',
            ResponseStatusCode: statusCode,
            ResponseHeaders: headers,
            ResponseBody: body
          })
        );
      }

      if (statusCode >= 200 && statusCode < 300) {
        data.gtmOnSuccess();
      } else {
        data.gtmOnFailure();
      }
    },
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    JSON.stringify(requestBody)
  );
}

/*==============================================================================
Vendor related functions
==============================================================================*/

function getItems() {
  let items = [];

  if (eventData.items && eventData.items[0]) {
    eventData.items.forEach((d, i) => {
      let item = {};

      if (d.name) item.product_name = d.name;
      else if (d.item_name) item.product_name = d.item_name;
      else if (d.title) item.product_name = d.title;

      if (d.sku) item.sku = d.sku;
      else if (d.item_sku) item.sku = d.item_sku;
      else if (d.item_id) item.sku = d.item_id;
      else if (d.id) item.sku = d.id;

      if (d.quantity) item.quantity = d.quantity;
      else if (d.item_quantity) item.quantity = d.item_quantity;
      else if (d.qty) item.quantity = d.qty;

      if (d.price) item.amount = d.price;
      else if (d.item_price) item.amount = d.item_price;

      if (item.amount && item.quantity) {
        item.amount = item.amount * item.quantity;
      }

      items.push(item);
    });
  }

  return items;
}

/*==============================================================================
Helpers
==============================================================================*/

function enc(data) {
  if (['null', 'undefined'].indexOf(getType(data)) !== -1) data = '';
  return encodeUriComponent(makeString(data));
}

function isConsentGivenOrNotRequired(data, eventData) {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
}

function determinateIsLoggingEnabled() {
  const containerVersion = getContainerVersion();
  const isDebug = !!(
    containerVersion &&
    (containerVersion.debugMode || containerVersion.previewMode)
  );

  if (!data.logType) {
    return isDebug;
  }

  if (data.logType === 'no') {
    return false;
  }

  if (data.logType === 'debug') {
    return isDebug;
  }

  return data.logType === 'always';
}
