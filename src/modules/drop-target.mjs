// Resolve the process directly under the native cursor while dragend is still
// being dispatched. Gecko's dropEffect is "none" after a successful Word drop
// with CiteFlow's empty payload, so it cannot identify the target.
export function resolveWordDropTarget() {
  if (!Zotero.isWin) return "unknown";
  let user32;
  let kernel32;
  let processHandle;
  let closeHandle;
  try {
    const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
    const POINT = new ctypes.StructType("CiteFlowDropPoint", [
      { x: ctypes.long }, { y: ctypes.long }
    ]);
    user32 = ctypes.open("user32.dll");
    kernel32 = ctypes.open("kernel32.dll");
    const getCursorPos = user32.declare("GetCursorPos", ctypes.winapi_abi,
      ctypes.int32_t, POINT.ptr);
    const windowFromPoint = user32.declare("WindowFromPoint", ctypes.winapi_abi,
      ctypes.voidptr_t, POINT);
    const getWindowThreadProcessId = user32.declare("GetWindowThreadProcessId", ctypes.winapi_abi,
      ctypes.uint32_t, ctypes.voidptr_t, ctypes.uint32_t.ptr);
    const openProcess = kernel32.declare("OpenProcess", ctypes.winapi_abi,
      ctypes.voidptr_t, ctypes.uint32_t, ctypes.int32_t, ctypes.uint32_t);
    const queryFullProcessImageName = kernel32.declare("QueryFullProcessImageNameW", ctypes.winapi_abi,
      ctypes.int32_t, ctypes.voidptr_t, ctypes.uint32_t, ctypes.jschar.ptr, ctypes.uint32_t.ptr);
    closeHandle = kernel32.declare("CloseHandle", ctypes.winapi_abi,
      ctypes.int32_t, ctypes.voidptr_t);
    const point = POINT();
    if (!getCursorPos(point.address())) return "unknown";
    const targetWindow = windowFromPoint(point);
    if (targetWindow.isNull()) return "unknown";
    const processID = ctypes.uint32_t();
    if (!getWindowThreadProcessId(targetWindow, processID.address()) || !processID.value) return "unknown";
    processHandle = openProcess(0x1000, false, processID.value); // PROCESS_QUERY_LIMITED_INFORMATION
    if (processHandle.isNull()) return "unknown";
    const path = ctypes.jschar.array(32768)();
    const pathLength = ctypes.uint32_t(path.length);
    if (!queryFullProcessImageName(processHandle, 0, path, pathLength.address())) return "unknown";
    const executable = path.readString().split(/[\\/]/).pop().toLowerCase();
    return executable === "winword.exe" ? "word-confirmed" : "non-word";
  } catch (error) {
    // A failed or unsupported native lookup must never insert into whichever
    // Word document happens to be active in the background.
    return "unknown";
  } finally {
    if (processHandle && closeHandle) try { closeHandle(processHandle); } catch { }
    try { kernel32?.close(); } catch { }
    try { user32?.close(); } catch { }
  }
}
