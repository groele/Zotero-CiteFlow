"""Build an isolated legacy comparison XPI; never publish this probe."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
source = root / "dist/zotero-citation-40.0.3.xpi"
target = root / "dist/PROBE-40.0.3-word-nullfix.xpi"
start = '    const cite = Zotero.Integration.Session.prototype.cite;'
finish = '    } finally {\n      if (Zotero.Integration.Session.prototype.cite === patchedCite) {'
shim = '''
    // Zotero 10.0.6 calls getDocument(null) from getActiveDocument(),
    // but getDocument() assumes a string. Use its empty-name active path.
    const integration = Zotero.Integration;
    const getApplication = integration.getApplication;
    const wrappedGetApplication = function(...args) {
      const application = Reflect.apply(getApplication, this, args);
      if (args[0] === "WinWord" && typeof application?.getDocument === "function"
        && typeof application.getActiveDocument === "function") {
        application.getActiveDocument = function() { return this.getDocument(""); };
      }
      return application;
    };
    integration.getApplication = wrappedGetApplication;
'''
with ZipFile(source) as src, ZipFile(target, "w", ZIP_DEFLATED) as out:
    for info in src.infolist():
        data = src.read(info.filename)
        if info.filename == "chrome/content/scripts/index.js":
            code = data.decode("utf-8").replace("\r\n", "\n")
            assert code.count(start) == code.count(finish) == 1
            code = code.replace(start, start + shim)
            code = code.replace(finish, '    } finally {\n      if (integration.getApplication === wrappedGetApplication) integration.getApplication = getApplication;\n      if (Zotero.Integration.Session.prototype.cite === patchedCite) {')
            data = code.encode("utf-8")
        out.writestr(info, data)
print(target)
