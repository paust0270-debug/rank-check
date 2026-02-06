/**
 * IP Rotation Module
 *
 * IP 로테이션 기능 (ADB 우선, 네트워크 어댑터 fallback)
 * - ADB: USB 연결된 휴대폰의 모바일 데이터 on/off
 * - Adapter: Windows 네트워크 어댑터 enable/disable
 *
 * 환경변수:
 * - IP_ROTATION_METHOD: adb | adapter | auto | disabled (기본: auto)
 */

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// ============ 설정 ============
const ADB_DATA_OFF_DELAY = 5000;   // 데이터 끄고 5초 대기
const ADB_DATA_ON_DELAY = 5000;    // 데이터 켜고 5초 대기
const ADAPTER_OFF_DELAY = 3000;    // 어댑터 끄고 3초 대기
const ADAPTER_ON_DELAY = 5000;     // 어댑터 켜고 5초 대기
const IP_CHECK_RETRY = 3;
const IP_CHECK_RETRY_DELAY = 2000;
const RECOVERY_DAEMON_INTERVAL = 5000;  // 복구 데몬 주기 (5초)
const NO_RESPONSE_RECOVERY_INTERVAL = 10000;  // 10초 반응 없을 시 데이터 재활성화 주기
const NO_RESPONSE_ADB_TIMEOUT = 15000;  // 반응 없을 때 ADB 타임아웃 (15초)

// ============ 복구 데몬 상태 ============
let recoveryDaemonRunning = false;
let recoveryDaemonInterval: NodeJS.Timeout | null = null;
let noResponseRecoveryInterval: NodeJS.Timeout | null = null;

// ============ 주기적 IP 로테이션 (10분마다) ============
let periodicRotationInterval: NodeJS.Timeout | null = null;

// ============ 타입 정의 ============
export interface IPRotationResult {
  success: boolean;
  oldIP: string;
  newIP: string;
  method?: "adb" | "adapter" | "skipped";
  error?: string;
}

type RotationMethod = "adb" | "adapter" | "auto" | "disabled";

// ============ 유틸 ============
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(msg: string): void {
  console.log(`[IPRotation] ${msg}`);
}

function logError(msg: string): void {
  console.error(`[IPRotation] [ERROR] ${msg}`);
}

// ============ 설정 로드 ============
function getRotationMethod(): RotationMethod {
  const method = (process.env.IP_ROTATION_METHOD || "auto").toLowerCase();
  if (["adb", "adapter", "auto", "disabled"].includes(method)) {
    return method as RotationMethod;
  }
  return "auto";
}

// ============ IP 확인 ============
export async function getCurrentIP(): Promise<string> {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const data = (await response.json()) as { ip: string };
    return data.ip;
  } catch {
    try {
      const response = await fetch("https://ifconfig.me/ip");
      return (await response.text()).trim();
    } catch {
      throw new Error("IP 확인 실패: 네트워크 연결 확인 필요");
    }
  }
}

// ============ 복구 데몬 ============

/**
 * ADB 복구 데몬 시작
 * - 5초마다 모바일 데이터 활성화 명령 실행
 * - 데이터가 꺼져있으면 켜지고, 이미 켜져있으면 무시됨
 * - 프로그램 시작 시 한 번만 호출
 */
export function startRecoveryDaemon(): void {
  if (recoveryDaemonRunning) {
    log("[RecoveryDaemon] 이미 실행 중");
    return;
  }

  if (getRotationMethod() === "disabled") {
    return;
  }

  recoveryDaemonRunning = true;
  log("[RecoveryDaemon] 시작 - 5초마다 모바일 데이터 자동 복구");

  recoveryDaemonInterval = setInterval(async () => {
    try {
      await execAsync("adb shell svc data enable", {
        encoding: "utf8",
        timeout: 5000,
        windowsHide: true,
      });
    } catch {
      // 실패해도 무시 (ADB 연결 안됐을 때 등)
    }
  }, RECOVERY_DAEMON_INTERVAL);

  // 10초 반응 없을 시 데이터 재활성화 (백업용 - 핸드폰 응답 없을 때)
  startNoResponseRecoveryDaemon();
}

/**
 * 10초 반응 없을 시 데이터 재활성화 데몬 (핸드폰 응답 없을 때 백업)
 */
function startNoResponseRecoveryDaemon(): void {
  if (noResponseRecoveryInterval) {
    return;
  }
  log(`[NoResponseRecovery] 시작 - ${NO_RESPONSE_RECOVERY_INTERVAL / 1000}초마다 데이터 재활성화 (응답 없을 시)`);

  noResponseRecoveryInterval = setInterval(async () => {
    try {
      await execAsync("adb shell svc data enable", {
        encoding: "utf8",
        timeout: NO_RESPONSE_ADB_TIMEOUT,
        windowsHide: true,
      });
    } catch (e: unknown) {
      log(`[NoResponseRecovery] 10초 반응 없음 - 데이터 재활성화 재시도: ${(e as Error).message?.substring(0, 60) || ""}`);
    }
  }, NO_RESPONSE_RECOVERY_INTERVAL);
}

function stopNoResponseRecoveryDaemon(): void {
  if (noResponseRecoveryInterval) {
    clearInterval(noResponseRecoveryInterval);
    noResponseRecoveryInterval = null;
    log("[NoResponseRecovery] 중지됨");
  }
}

/**
 * 복구 데몬 중지
 */
export function stopRecoveryDaemon(): void {
  stopNoResponseRecoveryDaemon();
  if (recoveryDaemonInterval) {
    clearInterval(recoveryDaemonInterval);
    recoveryDaemonInterval = null;
    recoveryDaemonRunning = false;
    log("[RecoveryDaemon] 중지됨");
  }
}

/**
 * 복구 데몬 실행 여부 확인
 */
export function isRecoveryDaemonRunning(): boolean {
  return recoveryDaemonRunning;
}

// ============ 주기적 IP 로테이션 (10분마다 데이터 껐다 켰다) ============

/**
 * 주기적 IP 로테이션 데몬 시작
 * - N분마다 rotateIP() 실행 (데이터 껐다 켰다)
 * - IP_ROTATION_METHOD=disabled면 시작하지 않음
 */
export function startPeriodicRotationDaemon(intervalMinutes: number = 10): void {
  if (periodicRotationInterval) {
    log("[PeriodicRotation] 이미 실행 중");
    return;
  }

  if (getRotationMethod() === "disabled") {
    return;
  }

  const intervalMs = intervalMinutes * 60 * 1000;
  log(`[PeriodicRotation] 시작 - ${intervalMinutes}분마다 IP 로테이션 (데이터 껐다 켰다)`);

  periodicRotationInterval = setInterval(async () => {
    try {
      log(`[PeriodicRotation] ${intervalMinutes}분 경과 - IP 로테이션 실행`);
      const result = await rotateIP();
      if (result.success && result.oldIP !== result.newIP) {
        console.log(`📡 [주기] IP 변경 완료: ${result.oldIP} -> ${result.newIP}`);
      } else if (result.method === "skipped") {
        log("[PeriodicRotation] IP 로테이션 스킵 (disabled 또는 기기 없음)");
      }
    } catch (err: unknown) {
      logError(`[PeriodicRotation] IP 로테이션 실패: ${(err as Error).message}`);
    }
  }, intervalMs);
}

/**
 * 주기적 IP 로테이션 데몬 중지
 */
export function stopPeriodicRotationDaemon(): void {
  if (periodicRotationInterval) {
    clearInterval(periodicRotationInterval);
    periodicRotationInterval = null;
    log("[PeriodicRotation] 중지됨");
  }
}

// ============ ADB 관련 ============

async function checkAdbDeviceStatus(): Promise<"device" | "unauthorized" | null> {
  try {
    const { stdout } = await execAsync("adb devices", {
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true,
    });

    const lines = stdout.trim().split("\n").slice(1);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        const status = parts[1];
        if (status === "device") {
          log(`ADB device connected: ${parts[0]}`);
          return "device";
        } else if (status === "unauthorized") {
          log(`ADB device unauthorized: ${parts[0]} - Please allow USB debugging`);
          return "unauthorized";
        }
      }
    }

    log("No ADB device found");
    return null;
  } catch (e: unknown) {
    const errMsg = (e as Error).message || "";
    if (errMsg.includes("not recognized") || errMsg.includes("not found") || errMsg.includes("ENOENT")) {
      logError("ADB not installed or not in PATH");
    } else {
      logError(`ADB check failed: ${errMsg.substring(0, 100)}`);
    }
    return null;
  }
}

async function setMobileData(enable: boolean): Promise<boolean> {
  try {
    const action = enable ? "ON" : "OFF";
    log(`[ADB] Mobile data ${action}...`);

    const cmd = enable ? "adb shell svc data enable" : "adb shell svc data disable";
    await execAsync(cmd, {
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true,
    });
    log(`[ADB] Mobile data ${action} - OK`);
    return true;
  } catch (e: unknown) {
    logError(`Mobile data ${enable ? "ON" : "OFF"} failed: ${(e as Error).message}`);
    return false;
  }
}

async function rotateIPWithAdb(oldIP: string): Promise<IPRotationResult> {
  log("Method: ADB (Mobile Data)");

  if (!(await setMobileData(false))) {
    return {
      success: false,
      oldIP,
      newIP: "",
      method: "adb",
      error: "ADB control failed",
    };
  }

  log(`Waiting ${ADB_DATA_OFF_DELAY / 1000}s...`);
  await sleep(ADB_DATA_OFF_DELAY);

  if (recoveryDaemonRunning) {
    log("[RecoveryDaemon] 자동 복구 대기 중...");
    await sleep(RECOVERY_DAEMON_INTERVAL + 1000);
  } else {
    log("Mobile Data ON...");
    if (!(await setMobileData(true))) {
      return {
        success: false,
        oldIP,
        newIP: "",
        method: "adb",
        error: "ADB control failed",
      };
    }
  }

  log(`Waiting for network (${ADB_DATA_ON_DELAY / 1000}s)...`);
  await sleep(ADB_DATA_ON_DELAY);

  let newIP = "";
  for (let i = 0; i < IP_CHECK_RETRY; i++) {
    try {
      newIP = await getCurrentIP();
      break;
    } catch {
      log(`IP 확인 재시도 ${i + 1}/${IP_CHECK_RETRY}...`);
      await sleep(IP_CHECK_RETRY_DELAY);
    }
  }

  if (!newIP) {
    return {
      success: false,
      oldIP,
      newIP: "",
      method: "adb",
      error: "새 IP 확인 실패",
    };
  }

  if (oldIP === newIP) {
    console.log(`\n${"!".repeat(50)}`);
    console.log(`  [ADB] IP NOT CHANGED: ${oldIP}`);
    console.log(`${"!".repeat(50)}\n`);
    return {
      success: false,
      oldIP,
      newIP,
      method: "adb",
      error: "IP NOT CHANGED",
    };
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`  [ADB] IP CHANGED: ${oldIP} -> ${newIP}`);
  console.log(`${"=".repeat(50)}\n`);
  return {
    success: true,
    oldIP,
    newIP,
    method: "adb",
  };
}

// ============ 네트워크 어댑터 관련 ============

export async function getTetheringAdapter(): Promise<string | null> {
  try {
    const { stdout: keywordResult } = await execAsync(
      `powershell -NoProfile -Command "Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and ($_.InterfaceDescription -like '*NDIS*' -or $_.InterfaceDescription -like '*USB*' -or $_.InterfaceDescription -like '*Android*' -or $_.InterfaceDescription -like '*SAMSUNG*' -or $_.InterfaceDescription -like '*Tethering*') } | Select-Object -First 1 -ExpandProperty ifIndex"`,
      { encoding: "utf8", windowsHide: true, timeout: 15000 }
    );

    if (keywordResult.trim()) {
      const ifIndex = keywordResult.trim();
      log(`테더링 어댑터 감지 (IfIndex: ${ifIndex})`);
      return ifIndex;
    }

    const { stdout: ethernetResult } = await execAsync(
      `powershell -NoProfile -Command "$adapters = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' }; $tethering = $adapters | Where-Object { $_.Name -match '^.+\\s*[2-9]$|^.+\\s*[1-9][0-9]+$' -and $_.Name -notmatch 'Wi-Fi|WiFi|Wireless' }; if ($tethering) { $tethering | Select-Object -First 1 -ExpandProperty ifIndex }"`,
      { encoding: "utf8", windowsHide: true, timeout: 15000 }
    );

    if (ethernetResult.trim()) {
      const ifIndex = ethernetResult.trim();
      log(`테더링 어댑터 감지 (IfIndex: ${ifIndex})`);
      return ifIndex;
    }

    log("테더링 어댑터를 찾을 수 없음");
    return null;
  } catch (error: unknown) {
    logError(`어댑터 감지 실패: ${(error as Error).message}`);
    return null;
  }
}

async function disableAdapter(ifIndex: string): Promise<boolean> {
  try {
    log(`어댑터 비활성화 (IfIndex: ${ifIndex})`);
    await execAsync(
      `powershell -NoProfile -Command "Get-NetAdapter -InterfaceIndex ${ifIndex} | Disable-NetAdapter -Confirm:$false"`,
      { encoding: "utf8", windowsHide: true, timeout: 15000 }
    );
    return true;
  } catch (error: unknown) {
    if (!(error as Error).message.includes("already")) {
      logError(`어댑터 비활성화 실패: ${(error as Error).message}`);
      return false;
    }
    return true;
  }
}

async function enableAdapter(ifIndex: string): Promise<boolean> {
  try {
    log(`어댑터 활성화 (IfIndex: ${ifIndex})`);
    await execAsync(
      `powershell -NoProfile -Command "Get-NetAdapter -InterfaceIndex ${ifIndex} | Enable-NetAdapter -Confirm:$false"`,
      { encoding: "utf8", windowsHide: true, timeout: 15000 }
    );
    return true;
  } catch (error: unknown) {
    if (!(error as Error).message.includes("already")) {
      logError(`어댑터 활성화 실패: ${(error as Error).message}`);
      return false;
    }
    return true;
  }
}

async function rotateIPWithAdapter(oldIP: string, adapterIndex?: string): Promise<IPRotationResult> {
  log("방식: 네트워크 어댑터");

  const adapter = adapterIndex || (await getTetheringAdapter());
  if (!adapter) {
    return {
      success: false,
      oldIP,
      newIP: "",
      method: "adapter",
      error: "테더링 어댑터를 찾을 수 없음",
    };
  }

  if (!(await disableAdapter(adapter))) {
    return {
      success: false,
      oldIP,
      newIP: "",
      method: "adapter",
      error: "어댑터 비활성화 실패",
    };
  }

  log(`${ADAPTER_OFF_DELAY / 1000}초 대기...`);
  await sleep(ADAPTER_OFF_DELAY);

  if (!(await enableAdapter(adapter))) {
    return {
      success: false,
      oldIP,
      newIP: "",
      method: "adapter",
      error: "어댑터 활성화 실패",
    };
  }

  log(`네트워크 재연결 대기 (${ADAPTER_ON_DELAY / 1000}초)...`);
  await sleep(ADAPTER_ON_DELAY);

  let newIP = "";
  for (let i = 0; i < IP_CHECK_RETRY; i++) {
    try {
      newIP = await getCurrentIP();
      break;
    } catch {
      log(`IP 확인 재시도 ${i + 1}/${IP_CHECK_RETRY}...`);
      await sleep(IP_CHECK_RETRY_DELAY);
    }
  }

  if (!newIP) {
    return {
      success: false,
      oldIP,
      newIP: "",
      method: "adapter",
      error: "새 IP 확인 실패",
    };
  }

  if (oldIP === newIP) {
    log(`[RESULT] IP NOT CHANGED: ${oldIP}`);
    return {
      success: false,
      oldIP,
      newIP,
      method: "adapter",
      error: "IP NOT CHANGED",
    };
  }

  log(`[RESULT] IP CHANGED: ${oldIP} -> ${newIP}`);
  return {
    success: true,
    oldIP,
    newIP,
    method: "adapter",
  };
}

// ============ 통합 IP 로테이션 ============

/**
 * IP 로테이션 (ADB 우선, 어댑터 fallback)
 * @param adapterIndex 네트워크 어댑터 IfIndex (옵션)
 */
export async function rotateIP(adapterIndex?: string): Promise<IPRotationResult> {
  const method = getRotationMethod();

  if (method === "disabled") {
    log("IP 로테이션 비활성화됨 (IP_ROTATION_METHOD=disabled)");
    const currentIP = await getCurrentIP().catch(() => "");
    return {
      success: true,
      oldIP: currentIP,
      newIP: currentIP,
      method: "skipped",
    };
  }

  let oldIP: string;
  try {
    oldIP = await getCurrentIP();
    log(`현재 IP: ${oldIP}`);
  } catch (error: unknown) {
    return {
      success: false,
      oldIP: "",
      newIP: "",
      error: `현재 IP 확인 실패: ${(error as Error).message}`,
    };
  }

  if (method === "auto" || method === "adb") {
    const adbStatus = await checkAdbDeviceStatus();

    if (adbStatus === "device") {
      const result = await rotateIPWithAdb(oldIP);
      if (result.success) {
        return result;
      }
      if (method === "auto") {
        log("ADB 실패, 어댑터 방식으로 전환...");
      } else {
        return result;
      }
    } else if (adbStatus === "unauthorized") {
      log("ADB 권한 미허용 - 휴대폰에서 USB 디버깅을 허용해주세요");
      if (method === "adb") {
        return {
          success: true,
          oldIP,
          newIP: oldIP,
          method: "skipped",
          error: "ADB 권한 미허용",
        };
      }
      log("어댑터 방식으로 전환...");
    } else {
      if (method === "adb") {
        log("ADB 기기 없음 - IP 로테이션 스킵");
        return {
          success: true,
          oldIP,
          newIP: oldIP,
          method: "skipped",
          error: "ADB 기기 없음",
        };
      }
    }
  }

  if (method === "auto" || method === "adapter") {
    const result = await rotateIPWithAdapter(oldIP, adapterIndex);
    if (result.success) {
      return result;
    }

    if (method === "auto") {
      log("모든 IP 로테이션 방식 실패 - 현재 IP로 계속 진행");
      return {
        success: true,
        oldIP,
        newIP: oldIP,
        method: "skipped",
        error: "모든 방식 실패",
      };
    }

    return result;
  }

  return {
    success: false,
    oldIP,
    newIP: "",
    error: "알 수 없는 오류",
  };
}
