// Resolve the process directly under the native cursor while dragend is still
// being dispatched. Gecko's dropEffect is "none" after a successful Word drop
// with CiteFlow's empty payload, so it cannot identify the target.
let cachedCtypes = null;

function getDropTargetCtypes() {
  if (cachedCtypes) return cachedCtypes;
  const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
  const POINT = new ctypes.StructType("CiteFlowDropPoint", [
    { x: ctypes.long }, { y: ctypes.long }
  ]);
  const user32 = ctypes.open("user32.dll");
  const kernel32 = ctypes.open("kernel32.dll");
  cachedCtypes = {
    ctypes,
    POINT,
    user32,
    kernel32,
    getCursorPos: user32.declare("GetCursorPos", ctypes.winapi_abi,
      ctypes.int32_t, POINT.ptr),
    windowFromPoint: user32.declare("WindowFromPoint", ctypes.winapi_abi,
      ctypes.voidptr_t, POINT),
    getWindowThreadProcessId: user32.declare("GetWindowThreadProcessId", ctypes.winapi_abi,
      ctypes.uint32_t, ctypes.voidptr_t, ctypes.uint32_t.ptr),
    openProcess: kernel32.declare("OpenProcess", ctypes.winapi_abi,
      ctypes.voidptr_t, ctypes.uint32_t, ctypes.int32_t, ctypes.uint32_t),
    queryFullProcessImageName: kernel32.declare("QueryFullProcessImageNameW", ctypes.winapi_abi,
      ctypes.int32_t, ctypes.voidptr_t, ctypes.uint32_t, ctypes.jschar.ptr, ctypes.uint32_t.ptr),
    closeHandle: kernel32.declare("CloseHandle", ctypes.winapi_abi,
      ctypes.int32_t, ctypes.voidptr_t),
    getAncestor: user32.declare("GetAncestor", ctypes.winapi_abi,
      ctypes.voidptr_t, ctypes.voidptr_t, ctypes.uint32_t),
    getForegroundWindow: user32.declare("GetForegroundWindow", ctypes.winapi_abi,
      ctypes.voidptr_t),
    findWindowEx: user32.declare("FindWindowExW", ctypes.winapi_abi,
      ctypes.voidptr_t, ctypes.voidptr_t, ctypes.voidptr_t, ctypes.jschar.ptr, ctypes.voidptr_t),
    isWindowVisible: user32.declare("IsWindowVisible", ctypes.winapi_abi,
      ctypes.int32_t, ctypes.voidptr_t),
    getWindowText: user32.declare("GetWindowTextW", ctypes.winapi_abi,
      ctypes.int32_t, ctypes.voidptr_t, ctypes.jschar.ptr, ctypes.int32_t),
    pathBuffer: ctypes.jschar.array(32768)(),
    titleBuffer: ctypes.jschar.array(1024)()
  };
  return cachedCtypes;
}

function readWindowTitle(api, hwnd) {
  if (!hwnd || hwnd.isNull()) return "";
  const len = api.getWindowText(hwnd, api.titleBuffer, api.titleBuffer.length);
  return len > 0 ? api.titleBuffer.readString() : "";
}

function isWinWordWindow(api, hwnd) {
  if (!hwnd || hwnd.isNull()) return false;
  let processHandle;
  try {
    const processID = api.ctypes.uint32_t();
    if (!api.getWindowThreadProcessId(hwnd, processID.address()) || !processID.value) return false;
    processHandle = api.openProcess(0x1000, false, processID.value);
    if (processHandle.isNull()) return false;
    const pathLength = api.ctypes.uint32_t(api.pathBuffer.length);
    if (!api.queryFullProcessImageName(processHandle, 0, api.pathBuffer, pathLength.address())) return false;
    return api.pathBuffer.readString().split(/[\\/]/).pop().toLowerCase() === "winword.exe";
  } catch {
    return false;
  } finally {
    if (processHandle && !processHandle.isNull()) try { api.closeHandle(processHandle); } catch {}
  }
}

export function closeDropTargetCtypes() {
  if (!cachedCtypes) return;
  const { user32, kernel32 } = cachedCtypes;
  cachedCtypes = null;
  try { kernel32?.close(); } catch { }
  try { user32?.close(); } catch { }
}

export function probeWordWindowTitles() {
  if (typeof Zotero === "undefined" || !Zotero.isWin) return { foregroundTitle: "", visibleTitles: [] };
  try {
    const api = getDropTargetCtypes();
    let foregroundTitle = "";
    const fg = api.getForegroundWindow();
    if (fg && !fg.isNull()) {
      const rootFg = api.getAncestor(fg, 2);
      const targetFg = rootFg && !rootFg.isNull() ? rootFg : fg;
      if (isWinWordWindow(api, targetFg)) {
        foregroundTitle = readWindowTitle(api, targetFg);
      }
    }
    const visibleTitles = [];
    let current = null;
    for (let i = 0; i < 32; i++) {
      current = api.findWindowEx(null, current, "OpusApp", null);
      if (!current || current.isNull()) break;
      if (!api.isWindowVisible(current)) continue;
      const title = readWindowTitle(api, current);
      if (title) visibleTitles.push(title);
    }
    return { foregroundTitle, visibleTitles };
  } catch {
    return { foregroundTitle: "", visibleTitles: [] };
  }
}

export function resolveWordDropTarget() {
  if (!Zotero.isWin) return "unknown";
  let processHandle;
  let closeHandle;
  try {
    const api = getDropTargetCtypes();
    closeHandle = api.closeHandle;
    const point = api.POINT();
    if (!api.getCursorPos(point.address())) return "unknown";
    const targetWindow = api.windowFromPoint(point);
    if (targetWindow.isNull()) return "unknown";
    const processID = api.ctypes.uint32_t();
    if (!api.getWindowThreadProcessId(targetWindow, processID.address()) || !processID.value) return "unknown";
    processHandle = api.openProcess(0x1000, false, processID.value); // PROCESS_QUERY_LIMITED_INFORMATION
    if (processHandle.isNull()) return "unknown";
    const pathLength = api.ctypes.uint32_t(api.pathBuffer.length);
    if (!api.queryFullProcessImageName(processHandle, 0, api.pathBuffer, pathLength.address())) return "unknown";
    const executable = api.pathBuffer.readString().split(/[\\/]/).pop().toLowerCase();
    const isWord = executable === "winword.exe";
    if (isWord) {
      try {
        const rootWindow = api.getAncestor(targetWindow, 2);
        const title = readWindowTitle(api, rootWindow) || readWindowTitle(api, targetWindow);
        if (title && typeof addon !== "undefined" && addon?.data) {
          addon.data.lastDroppedWordWindow = { title, at: Date.now() };
        }
      } catch {}
    }
    return isWord ? "word-confirmed" : "non-word";
  } catch (error) {
    // A failed or unsupported native lookup must never insert into whichever
    // Word document happens to be active in the background.
    return "unknown";
  } finally {
    if (processHandle && closeHandle) try { closeHandle(processHandle); } catch { }
  }
}
