/*
 * ╔══════════════════════════════════════════════════════════════╗
 * ║                  AMPER IoT — ESP32 Firmware                  ║
 * ║                       Version 1.0.0                          ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  • DS18B20 (1-Wire) — Temperature                            ║
 * ║  • HC-SR04 / Pressure sensor — Fuel level                    ║
 * ║  • SCT-013-030 (CT clamp via ADC) — Current                  ║
 * ║  • WiFi Captive Portal for setup (no code editing needed)    ║
 * ║  • HTTPS POST telemetry every 60s                            ║
 * ║  • Heartbeat every 5 minutes                                 ║
 * ║                                                              ║
 * ║  Required libraries (Arduino Library Manager):               ║
 * ║    - WiFiManager (tzapu)                                     ║
 * ║    - OneWire                                                 ║
 * ║    - DallasTemperature                                       ║
 * ║    - ArduinoJson (v6+)                                       ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>     // For HTTPS
#include <WiFiManager.h>          // tzapu/WiFiManager
#include <HTTPClient.h>
#include <Preferences.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>

// ═══════════ CONFIGURATION ═══════════
#define SERVER_URL          "https://amper-manager-epzq.onrender.com"
#define FIRMWARE_VERSION    "1.0.0"

// Pin assignments
#define PIN_TEMP_DATA       4    // DS18B20 1-Wire data
#define PIN_FUEL_TRIG       5    // HC-SR04 trigger
#define PIN_FUEL_ECHO       18   // HC-SR04 echo
#define PIN_CURRENT_ADC     34   // SCT-013-030 via ADC
#define PIN_VOLTAGE_ADC     35   // ZMPT101B via ADC (AC voltage sensor)
#define PIN_LED             2    // Built-in LED (status)
#define PIN_RESET_BUTTON    0    // Boot button — hold 5s to reset WiFi

// Intervals (milliseconds)
#define TELEMETRY_INTERVAL  60000UL    // 1 minute
#define HEARTBEAT_INTERVAL  300000UL   // 5 minutes
#define HOLD_RESET_MS       5000UL     // 5 seconds

// ═══════════ GLOBALS ═══════════
Preferences prefs;
OneWire oneWire(PIN_TEMP_DATA);
DallasTemperature tempSensor(&oneWire);

String deviceToken = "";
String pairingCode = "";
String engineId    = "";   // Single engine for v1; can be expanded
unsigned long lastTelemetry = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastConfigFetch = 0;
unsigned long resetButtonHeldSince = 0;

// Calibration (fetched from server, with safe defaults)
float TANK_EMPTY_CM = 100.0;
float TANK_FULL_CM  = 10.0;

// Offline buffer (RAM only — survives WiFi drops, not reboots)
#define BUFFER_SIZE 60
struct Reading {
  float temp;
  float fuel;
  float current;
  float voltage;
  unsigned long uptime_ms;
};
Reading buffer[BUFFER_SIZE];
int bufferHead = 0;
int bufferCount = 0;

void bufferPush(float t, float f, float c, float v) {
  buffer[bufferHead] = { t, f, c, v, millis() };
  bufferHead = (bufferHead + 1) % BUFFER_SIZE;
  if (bufferCount < BUFFER_SIZE) bufferCount++;
}

// ═══════════ HELPERS ═══════════
void blink(int count, int ms = 100) {
  for (int i = 0; i < count; i++) {
    digitalWrite(PIN_LED, HIGH); delay(ms);
    digitalWrite(PIN_LED, LOW);  delay(ms);
  }
}

void factoryReset() {
  Serial.println("[RESET] Wiping all settings");
  prefs.begin("amper", false);
  prefs.clear();
  prefs.end();
  WiFiManager wm;
  wm.resetSettings();
  blink(10, 50);
  ESP.restart();
}

// ═══════════ SENSOR READINGS ═══════════
float readTemperature() {
  tempSensor.requestTemperatures();
  float c = tempSensor.getTempCByIndex(0);
  if (c == DEVICE_DISCONNECTED_C || c < -50 || c > 200) return NAN;
  return c;
}

float readFuelPercent() {
  // HC-SR04 ultrasonic — measures distance to fuel surface
  digitalWrite(PIN_FUEL_TRIG, LOW);  delayMicroseconds(2);
  digitalWrite(PIN_FUEL_TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(PIN_FUEL_TRIG, LOW);
  long duration = pulseIn(PIN_FUEL_ECHO, HIGH, 30000UL);
  if (duration == 0) return NAN;
  float distance = duration * 0.0343f / 2.0f;  // cm

  // Calibration values come from /api/iot/config (fetched at startup)
  float pct = (TANK_EMPTY_CM - distance) / (TANK_EMPTY_CM - TANK_FULL_CM) * 100.0;
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return pct;
}

float readCurrent() {
  // SCT-013-030 outputs analog 0-1V proportional to current 0-30A
  // Take 100 samples and average for stability
  long sum = 0;
  for (int i = 0; i < 100; i++) {
    sum += analogRead(PIN_CURRENT_ADC);
    delayMicroseconds(200);
  }
  float avgRaw = sum / 100.0f;
  float voltage = (avgRaw / 4095.0f) * 3.3f;       // ESP32 ADC: 0-3.3V
  float current = voltage * 30.0f;                  // 1V = 30A
  if (current < 0.1f) current = 0;                  // Noise floor
  return current;
}

// Read AC voltage via ZMPT101B sensor
// Sample for 200ms (~10 mains cycles at 50Hz) to compute true RMS
float readVoltage() {
  const int SAMPLES = 1000;
  const float CALIBRATION = 0.27f;   // Adjust on real hardware vs reference voltmeter

  unsigned long sumSq = 0;
  int dcOffset = 0;

  // First pass: find DC offset (~1.65V at zero crossing)
  for (int i = 0; i < SAMPLES; i++) {
    dcOffset += analogRead(PIN_VOLTAGE_ADC);
    delayMicroseconds(200);
  }
  dcOffset /= SAMPLES;

  // Second pass: sum squared deviations
  for (int i = 0; i < SAMPLES; i++) {
    int raw = analogRead(PIN_VOLTAGE_ADC);
    int delta = raw - dcOffset;
    sumSq += (unsigned long)(delta * delta);
    delayMicroseconds(200);
  }

  float rmsRaw = sqrt(sumSq / (float)SAMPLES);
  float vrms = rmsRaw * CALIBRATION;
  if (vrms < 5.0f) vrms = 0;        // No signal
  return vrms;
}

// ═══════════ NETWORK ═══════════

// Helper: create a configured HTTPS client
// We use setInsecure() since ESP32 doesn't have a system cert store.
// Security relies on: short-lived pairing codes + per-device tokens + HTTPS encryption itself.
WiFiClientSecure& secureClient() {
  static WiFiClientSecure client;
  static bool initialized = false;
  if (!initialized) {
    client.setInsecure();  // Skip cert validation (acceptable for IoT telemetry)
    initialized = true;
  }
  return client;
}

// Pair with the server using the 6-digit code (one-time)
bool pairDevice(const String& code) {
  HTTPClient http;
  String url = String(SERVER_URL) + "/api/iot/pair";
  http.begin(secureClient(), url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<128> body;
  body["pairing_code"] = code;
  String bodyStr;
  serializeJson(body, bodyStr);

  Serial.printf("[PAIR] POST %s body=%s\n", url.c_str(), bodyStr.c_str());
  int code_resp = http.POST(bodyStr);
  Serial.printf("[PAIR] HTTP %d\n", code_resp);

  if (code_resp != 200) {
    String resp = http.getString();
    Serial.printf("[PAIR] FAILED: %s\n", resp.c_str());
    http.end();
    return false;
  }

  String resp = http.getString();
  http.end();
  Serial.println("[PAIR] " + resp);

  StaticJsonDocument<1024> doc;
  if (deserializeJson(doc, resp)) {
    Serial.println("[PAIR] JSON parse failed");
    return false;
  }

  deviceToken = doc["device_token"].as<String>();
  // Pick the first engine if available
  if (doc["engines"].is<JsonArray>() && doc["engines"].size() > 0) {
    engineId = doc["engines"][0]["engine_id"].as<String>();
  }

  // Save permanently
  prefs.begin("amper", false);
  prefs.putString("token", deviceToken);
  prefs.putString("engine", engineId);
  prefs.end();

  Serial.println("[PAIR] ✓ Token saved");
  blink(5, 100);
  return true;
}

// Fetch calibration + engine config from server
void fetchConfig() {
  if (deviceToken.isEmpty()) return;
  HTTPClient http;
  http.begin(secureClient(), String(SERVER_URL) + "/api/iot/config");
  http.addHeader("Authorization", "Bearer " + deviceToken);

  int code = http.GET();
  if (code != 200) {
    Serial.printf("[CONFIG] HTTP %d\n", code);
    http.end();
    return;
  }
  String resp = http.getString();
  http.end();

  StaticJsonDocument<1024> doc;
  if (deserializeJson(doc, resp)) {
    Serial.println("[CONFIG] JSON parse failed");
    return;
  }

  if (doc["tank"]["empty_distance_cm"].is<float>()) {
    TANK_EMPTY_CM = doc["tank"]["empty_distance_cm"].as<float>();
  }
  if (doc["tank"]["full_distance_cm"].is<float>()) {
    TANK_FULL_CM = doc["tank"]["full_distance_cm"].as<float>();
  }
  // Update engine ID in case admin changed it
  if (doc["engines"].is<JsonArray>() && doc["engines"].size() > 0) {
    String newEngineId = doc["engines"][0]["engine_id"].as<String>();
    if (newEngineId != engineId) {
      engineId = newEngineId;
      prefs.begin("amper", false);
      prefs.putString("engine", engineId);
      prefs.end();
    }
  }
  Serial.printf("[CONFIG] ✓ tank empty=%.1f full=%.1f\n", TANK_EMPTY_CM, TANK_FULL_CM);
}

// Try to flush any buffered readings (called when WiFi is back)
void flushBuffer() {
  if (bufferCount == 0 || deviceToken.isEmpty()) return;
  Serial.printf("[BUFFER] Flushing %d readings\n", bufferCount);

  HTTPClient http;
  http.begin(secureClient(), String(SERVER_URL) + "/api/iot/telemetry");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + deviceToken);

  StaticJsonDocument<4096> body;
  JsonArray arr = body["readings"].to<JsonArray>();
  int start = (bufferHead - bufferCount + BUFFER_SIZE) % BUFFER_SIZE;
  for (int i = 0; i < bufferCount; i++) {
    int idx = (start + i) % BUFFER_SIZE;
    JsonObject r = arr.add<JsonObject>();
    if (!engineId.isEmpty()) r["engine_id"] = engineId;
    if (!isnan(buffer[idx].temp))  r["temperature_c"] = buffer[idx].temp;
    if (!isnan(buffer[idx].fuel))  r["fuel_pct"]      = buffer[idx].fuel;
    r["current_a"] = buffer[idx].current;
    if (buffer[idx].voltage > 5.0f) r["voltage_v"] = buffer[idx].voltage;
    r["run_status"] = (buffer[idx].current > 1.0f);
  }

  String bodyStr;
  serializeJson(body, bodyStr);
  int code = http.POST(bodyStr);
  Serial.printf("[BUFFER] flush HTTP %d\n", code);
  http.end();

  if (code == 200) {
    bufferCount = 0;
    bufferHead = 0;
  }
}

void sendHeartbeat() {
  if (deviceToken.isEmpty()) return;
  HTTPClient http;
  http.begin(secureClient(), String(SERVER_URL) + "/api/iot/heartbeat");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + deviceToken);

  StaticJsonDocument<128> body;
  body["firmware"] = FIRMWARE_VERSION;
  String bodyStr;
  serializeJson(body, bodyStr);

  int code = http.POST(bodyStr);
  Serial.printf("[HEARTBEAT] HTTP %d\n", code);
  http.end();
}

void sendTelemetry() {
  if (deviceToken.isEmpty()) return;

  float temp = readTemperature();
  float fuel = readFuelPercent();
  float curr = readCurrent();
  float volt = readVoltage();

  Serial.printf("[TELEMETRY] T=%.1f°C F=%.0f%% I=%.2fA V=%.0fV\n", temp, fuel, curr, volt);

  HTTPClient http;
  http.begin(secureClient(), String(SERVER_URL) + "/api/iot/telemetry");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + deviceToken);

  StaticJsonDocument<256> body;
  if (!engineId.isEmpty()) body["engine_id"] = engineId;
  if (!isnan(temp)) body["temperature_c"] = temp;
  if (!isnan(fuel)) body["fuel_pct"]      = fuel;
  body["current_a"] = curr;
  if (volt > 5.0f) body["voltage_v"] = volt;
  body["run_status"] = (curr > 1.0f);

  String bodyStr;
  serializeJson(body, bodyStr);

  int code = http.POST(bodyStr);
  Serial.printf("[TELEMETRY] HTTP %d\n", code);
  http.end();

  // If failed, buffer for later
  if (code != 200) {
    bufferPush(temp, fuel, curr, volt);
    Serial.printf("[BUFFER] Stored — total=%d\n", bufferCount);
  }

  blink(1, 30);
}

// ═══════════ WiFi Captive Portal ═══════════
void startCaptivePortal() {
  WiFiManager wm;

  // Custom field for the Amper pairing code
  WiFiManagerParameter pairingParam("pairing", "رمز الإقران Amper (6 خانات)", "", 7);
  wm.addParameter(&pairingParam);

  String apName = "Amper-Setup-" + String((uint32_t)ESP.getEfuseMac(), HEX);
  Serial.println("[WIFI] Starting captive portal: " + apName);
  Serial.println("[WIFI] Connect to that WiFi from your phone, then open http://192.168.4.1");

  blink(3, 200);
  wm.setConfigPortalTimeout(300);  // 5 minutes
  wm.setTitle("Amper IoT Setup");

  if (!wm.startConfigPortal(apName.c_str())) {
    Serial.println("[WIFI] Portal timeout — restarting");
    delay(2000);
    ESP.restart();
  }

  // Got WiFi! Now try pairing
  pairingCode = String(pairingParam.getValue());
  pairingCode.trim();
  Serial.println("[WIFI] Connected. Pairing code = " + pairingCode);

  if (pairingCode.length() != 6) {
    Serial.println("[PAIR] Invalid code length — restarting setup");
    delay(2000);
    ESP.restart();
  }

  if (!pairDevice(pairingCode)) {
    Serial.println("[PAIR] Failed — restarting setup in 10s");
    delay(10000);
    factoryReset();
  }
}

// ═══════════ SETUP ═══════════
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n╔════════════════════════╗");
  Serial.println("║   Amper IoT v" FIRMWARE_VERSION "    ║");
  Serial.println("╚════════════════════════╝");

  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_RESET_BUTTON, INPUT_PULLUP);
  pinMode(PIN_FUEL_TRIG, OUTPUT);
  pinMode(PIN_FUEL_ECHO, INPUT);
  pinMode(PIN_CURRENT_ADC, INPUT);
  pinMode(PIN_VOLTAGE_ADC, INPUT);
  analogReadResolution(12);

  tempSensor.begin();

  // Load saved token
  prefs.begin("amper", true);
  deviceToken = prefs.getString("token", "");
  engineId    = prefs.getString("engine", "");
  prefs.end();

  if (deviceToken.isEmpty()) {
    Serial.println("[BOOT] No token — entering setup mode");
    startCaptivePortal();
  } else {
    Serial.println("[BOOT] Token loaded — connecting to WiFi");
    WiFi.mode(WIFI_STA);
    WiFi.begin();
    int tries = 0;
    while (WiFi.status() != WL_CONNECTED && tries < 30) {
      delay(500); Serial.print(".");
      tries++;
    }
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("\n[BOOT] WiFi failed — entering setup mode");
      startCaptivePortal();
    } else {
      Serial.println("\n[BOOT] ✓ Online");
      blink(2, 100);
      fetchConfig();
      sendHeartbeat();
    }
  }
}

// ═══════════ LOOP ═══════════
void loop() {
  // Check reset button (hold 5s for factory reset)
  if (digitalRead(PIN_RESET_BUTTON) == LOW) {
    if (resetButtonHeldSince == 0) {
      resetButtonHeldSince = millis();
    } else if (millis() - resetButtonHeldSince > HOLD_RESET_MS) {
      factoryReset();
    }
  } else {
    resetButtonHeldSince = 0;
  }

  // Auto-reconnect WiFi
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI] Lost — reconnecting");
    WiFi.reconnect();
    delay(5000);
    return;
  }

  unsigned long now = millis();

  // Try to flush buffer if WiFi just came back
  if (bufferCount > 0) flushBuffer();

  if (now - lastTelemetry >= TELEMETRY_INTERVAL || lastTelemetry == 0) {
    sendTelemetry();
    lastTelemetry = now;
  }

  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL || lastHeartbeat == 0) {
    sendHeartbeat();
    lastHeartbeat = now;
  }

  // Refetch config every hour (in case admin changed calibration)
  if (now - lastConfigFetch >= 3600000UL || lastConfigFetch == 0) {
    fetchConfig();
    lastConfigFetch = now;
  }

  delay(100);
}
