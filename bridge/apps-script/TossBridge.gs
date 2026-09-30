/**
 * Toss bridge — forwards every basket payload that reaches the Google Sheet webhook
 * to the Toss cloud ingest endpoint, so DynamoDB fills up without reflashing the ESP32.
 *
 * Setup (Apps Script editor → Project Settings → Script properties):
 *   TOSS_INGEST_URL = <deviceIngestUrl from amplify_outputs.json>
 *   TOSS_BRIDGE_KEY = <the DEVICE_BRIDGE_KEY secret you set in Amplify>
 *
 * Then, inside your existing doPost(e), right after you parse the JSON:
 *
 *   const data = JSON.parse(e.postData.contents);
 *   forwardToToss_(data);          // <-- add this line
 *   ... your existing Sheet logic ...
 *
 * Forwarding failures are logged and never break the Sheet write.
 */
function forwardToToss_(payload) {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('TOSS_INGEST_URL');
  const key = props.getProperty('TOSS_BRIDGE_KEY');
  if (!url || !key) {
    console.warn('Toss bridge not configured: set TOSS_INGEST_URL and TOSS_BRIDGE_KEY');
    return;
  }
  try {
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-device-key': key },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    if (code >= 300) console.warn('Toss ingest returned ' + code + ': ' + res.getContentText());
  } catch (err) {
    console.warn('Toss ingest failed: ' + err);
  }
}

/** Run once from the editor to check the connection (sends nothing that creates data). */
function testTossBridge() {
  const props = PropertiesService.getScriptProperties();
  const res = UrlFetchApp.fetch(props.getProperty('TOSS_INGEST_URL'), {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-device-key': props.getProperty('TOSS_BRIDGE_KEY') },
    payload: JSON.stringify({ type: 'ping' }),
    muteHttpExceptions: true,
  });
  // Expect 400 "Invalid deviceId": auth passed, payload rejected. 401 means the key is wrong.
  console.log(res.getResponseCode() + ' ' + res.getContentText());
}
