# Zotero 10.0.6 / Word drag citation investigation

The supplied 40.0.3 add-on fails a real Word insertion on this machine before it can create a citation field. Its `citeItems` passes a null document name to `Zotero.Integration.execCommand("WinWord", "addEditCitation", null, 1)`. The installed Zotero 10.0.6 WinWord adapter implements `getActiveDocument()` through `getDocument(null)`, then calls `documentName.indexOf()` without a null check. An isolated run returned `TypeError: can't access property "indexOf", documentName is null` from `zoteroWinWordIntegration.mjs:243`.

A diagnostic build of the unchanged 40.0.3 insertion code, with only the active-document empty-name adapter used in CiteFlow, inserted a real `ADDIN ZOTERO_ITEM CSL_CITATION` field into Word. The result was `(Author0, 2024)`. CiteFlow 10.0.0 already carries this adapter in `src/modules/cite.mjs`, so rebasing on 40.0.3 without it would reintroduce the failure.

The original drag wrapper also reads Zotero's selection before calling the native `onDragStart`. The native handler selects the row under the pointer first. CiteFlow now follows that order so directly dragging an unselected row captures the dragged item. The regression test covers this case; 33 repository tests and 38 isolated Zotero settings checks passed. The 10.0.0 version was unchanged.

These results confirm the Word API path and the row selection fix. The desktop input tool cannot release a drag in a different application window, so a physical Zotero-to-Word drag remains the final acceptance check. Do not equate synthetic `DataTransfer` events or an API-initiated Word field with a passing physical drag.
