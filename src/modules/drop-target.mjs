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
    pathBuffer: ctypes.jschar.array(32768)()
  };
  return cachedCtypes;
}

export function closeDropTargetCtypes() {
  if (!cachedCtypes) return;
  const { user32, kernel32 } = cachedCtypes;
  cachedCtypes = null;
  try { kernel32?.close(); } catch { }
  try { user32?.close(); } catch { }
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
    return executable === "winword.exe" ? "word-confirmed" : "non-word";
  } catch (error) {
    // A failed or unsupported native lookup must never insert into whichever
    // Word document happens to be active in the background.
    return "unknown";
  } finally {
    if (processHandle && closeHandle) try { closeHandle(processHandle); } catch { }
  }
}
