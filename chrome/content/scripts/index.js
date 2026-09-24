"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => {
    __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
    return value;
  };

  // node_modules/zotero-plugin-toolkit/dist/utils/debugBridge.js
  var _DebugBridge = class {
    get version() {
      return _DebugBridge.version;
    }
    _disableDebugBridgePassword;
    get disableDebugBridgePassword() {
      return this._disableDebugBridgePassword;
    }
    set disableDebugBridgePassword(value) {
      this._disableDebugBridgePassword = value;
    }
    get password() {
      return BasicTool.getZotero().Prefs.get(_DebugBridge.passwordPref, true);
    }
    set password(v) {
      BasicTool.getZotero().Prefs.set(_DebugBridge.passwordPref, v, true);
    }
    constructor() {
      this._disableDebugBridgePassword = false;
      this.initializeDebugBridge();
    }
    static setModule(instance) {
      if (!instance.debugBridge?.version || instance.debugBridge.version < _DebugBridge.version) {
        instance.debugBridge = new _DebugBridge();
      }
    }
    initializeDebugBridge() {
      const debugBridgeExtension = {
        noContent: true,
        doAction: async (uri) => {
          const Zotero2 = BasicTool.getZotero();
          const window2 = Zotero2.getMainWindow();
          const uriString = uri.spec.split("//").pop();
          if (!uriString) {
            return;
          }
          const params = {};
          uriString.split("?").pop()?.split("&").forEach((p) => {
            params[p.split("=")[0]] = decodeURIComponent(p.split("=")[1]);
          });
          const skipPasswordCheck = toolkitGlobal_default.getInstance()?.debugBridge.disableDebugBridgePassword;
          let allowed = false;
          if (skipPasswordCheck) {
            allowed = true;
          } else {
            if (typeof params.password === "undefined" && typeof this.password === "undefined") {
              allowed = window2.confirm(`External App ${params.app} wants to execute command without password.
Command:
${(params.run || params.file || "").slice(0, 100)}
If you do not know what it is, please click Cancel to deny.`);
            } else {
              allowed = this.password === params.password;
            }
          }
          if (allowed) {
            if (params.run) {
              try {
                const AsyncFunction = Object.getPrototypeOf(async () => {
                }).constructor;
                const f = new AsyncFunction("Zotero,window", params.run);
                await f(Zotero2, window2);
              } catch (e) {
                Zotero2.debug(e);
                window2.console.log(e);
              }
            }
            if (params.file) {
              try {
                Services.scriptloader.loadSubScript(params.file, {
                  Zotero: Zotero2,
                  window: window2
                });
              } catch (e) {
                Zotero2.debug(e);
                window2.console.log(e);
              }
            }
          }
        },
        newChannel(uri) {
          this.doAction(uri);
        }
      };
      Services.io.getProtocolHandler("zotero").wrappedJSObject._extensions["zotero://ztoolkit-debug"] = debugBridgeExtension;
    }
  };
  var DebugBridge = _DebugBridge;
  __publicField(DebugBridge, "version", 2);
  __publicField(DebugBridge, "passwordPref", "extensions.zotero.debug-bridge.password");

  // node_modules/zotero-plugin-toolkit/dist/utils/pluginBridge.js
  var _PluginBridge = class {
    get version() {
      return _PluginBridge.version;
    }
    constructor() {
      this.initializePluginBridge();
    }
    static setModule(instance) {
      if (!instance.pluginBridge?.version || instance.pluginBridge.version < _PluginBridge.version) {
        instance.pluginBridge = new _PluginBridge();
      }
    }
    initializePluginBridge() {
      const { AddonManager } = ChromeUtils.import("resource://gre/modules/AddonManager.jsm");
      const Zotero2 = BasicTool.getZotero();
      const pluginBridgeExtension = {
        noContent: true,
        doAction: async (uri) => {
          try {
            const uriString = uri.spec.split("//").pop();
            if (!uriString) {
              return;
            }
            const params = {};
            uriString.split("?").pop()?.split("&").forEach((p) => {
              params[p.split("=")[0]] = decodeURIComponent(p.split("=")[1]);
            });
            if (params.action === "install" && params.url) {
              if (params.minVersion && Services.vc.compare(Zotero2.version, params.minVersion) < 0 || params.maxVersion && Services.vc.compare(Zotero2.version, params.maxVersion) > 0) {
                throw new Error(`Plugin is not compatible with Zotero version ${Zotero2.version}.The plugin requires Zotero version between ${params.minVersion} and ${params.maxVersion}.`);
              }
              const addon2 = await AddonManager.getInstallForURL(params.url);
              if (addon2 && addon2.state === AddonManager.STATE_AVAILABLE) {
                addon2.install();
                hint("Plugin installed successfully.", true);
              } else {
                throw new Error(`Plugin ${params.url} is not available.`);
              }
            }
          } catch (e) {
            Zotero2.logError(e);
            hint(e.message, false);
          }
        },
        newChannel(uri) {
          this.doAction(uri);
        }
      };
      Services.io.getProtocolHandler("zotero").wrappedJSObject._extensions["zotero://plugin"] = pluginBridgeExtension;
    }
  };
  var PluginBridge = _PluginBridge;
  __publicField(PluginBridge, "version", 1);
  function hint(content, success) {
    const progressWindow = new Zotero.ProgressWindow({ closeOnClick: true });
    progressWindow.changeHeadline("Plugin Toolkit");
    progressWindow.progress = new progressWindow.ItemProgress(success ? "chrome://zotero/skin/tick.png" : "chrome://zotero/skin/cross.png", content);
    progressWindow.progress.setProgress(100);
    progressWindow.show();
    progressWindow.startCloseTimer(5e3);
  }

  // node_modules/zotero-plugin-toolkit/dist/managers/toolkitGlobal.js
  var ToolkitGlobal = class {
    debugBridge;
    pluginBridge;
    prompt;
    currentWindow;
    constructor() {
      initializeModules(this);
      this.currentWindow = BasicTool.getZotero().getMainWindow();
    }
    /**
     * Get the global unique instance of `class ToolkitGlobal`.
     * @returns An instance of `ToolkitGlobal`.
     */
    static getInstance() {
      let _Zotero;
      try {
        if (typeof Zotero !== "undefined") {
          _Zotero = Zotero;
        } else {
          _Zotero = BasicTool.getZotero();
        }
      } catch {
      }
      if (!_Zotero) {
        return void 0;
      }
      let requireInit = false;
      if (!("_toolkitGlobal" in _Zotero)) {
        _Zotero._toolkitGlobal = new ToolkitGlobal();
        requireInit = true;
      }
      const currentGlobal = _Zotero._toolkitGlobal;
      if (currentGlobal.currentWindow !== _Zotero.getMainWindow()) {
        checkWindowDependentModules(currentGlobal);
        requireInit = true;
      }
      if (requireInit) {
        initializeModules(currentGlobal);
      }
      return currentGlobal;
    }
  };
  function initializeModules(instance) {
    new BasicTool().log("Initializing ToolkitGlobal modules");
    setModule(instance, "prompt", {
      _ready: false,
      instance: void 0
    });
    DebugBridge.setModule(instance);
    PluginBridge.setModule(instance);
  }
  function setModule(instance, key, module) {
    if (!module) {
      return;
    }
    if (!instance[key]) {
      instance[key] = module;
    }
    for (const moduleKey in module) {
      instance[key][moduleKey] ??= module[moduleKey];
    }
  }
  function checkWindowDependentModules(instance) {
    instance.currentWindow = BasicTool.getZotero().getMainWindow();
    instance.prompt = void 0;
  }
  var toolkitGlobal_default = ToolkitGlobal;

  // node_modules/zotero-plugin-toolkit/dist/basic.js
  var BasicTool = class {
    /**
     * configurations.
     */
    _basicOptions;
    _console;
    /**
     * @deprecated Use `patcherManager` instead.
     */
    patchSign = "zotero-plugin-toolkit@3.0.0";
    get basicOptions() {
      return this._basicOptions;
    }
    /**
     *
     * @param data Pass an BasicTool instance to copy its options.
     */
    constructor(data) {
      this._basicOptions = {
        log: {
          _type: "toolkitlog",
          disableConsole: false,
          disableZLog: false,
          prefix: ""
        },
        // We will remove this in the future, for now just let it be lazy loaded.
        get debug() {
          if (this._debug) {
            return this._debug;
          }
          this._debug = toolkitGlobal_default.getInstance()?.debugBridge || {
            disableDebugBridgePassword: false,
            password: ""
          };
          return this._debug;
        },
        api: {
          pluginID: "zotero-plugin-toolkit@windingwind.com"
        },
        listeners: {
          callbacks: {
            onMainWindowLoad: /* @__PURE__ */ new Set(),
            onMainWindowUnload: /* @__PURE__ */ new Set(),
            onPluginUnload: /* @__PURE__ */ new Set()
          },
          _mainWindow: void 0,
          _plugin: void 0
        }
      };
      if (typeof globalThis.ChromeUtils?.import !== "undefined") {
        const { ConsoleAPI } = ChromeUtils.import("resource://gre/modules/Console.jsm");
        this._console = new ConsoleAPI({
          consoleID: `${this._basicOptions.api.pluginID}-${Date.now()}`
        });
      }
      this.updateOptions(data);
    }
    getGlobal(k) {
      if (typeof globalThis[k] !== "undefined") {
        return globalThis[k];
      }
      const _Zotero = BasicTool.getZotero();
      try {
        const window2 = _Zotero.getMainWindow();
        switch (k) {
          case "Zotero":
          case "zotero":
            return _Zotero;
          case "window":
            return window2;
          case "windows":
            return _Zotero.getMainWindows();
          case "document":
            return window2.document;
          case "ZoteroPane":
          case "ZoteroPane_Local":
            return _Zotero.getActiveZoteroPane();
          default:
            return window2[k];
        }
      } catch (e) {
        Zotero.logError(e);
      }
    }
    /**
     * If it's an XUL element
     * @param elem
     */
    isXULElement(elem) {
      return elem.namespaceURI === "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
    }
    /**
     * Create an XUL element
     *
     * For Zotero 6, use `createElementNS`;
     *
     * For Zotero 7+, use `createXULElement`.
     * @param doc
     * @param type
     * @example
     * Create a `<menuitem>`:
     * ```ts
     * const compat = new ZoteroCompat();
     * const doc = compat.getWindow().document;
     * const elem = compat.createXULElement(doc, "menuitem");
     * ```
     */
    createXULElement(doc, type) {
      return doc.createXULElement(type);
    }
    /**
     * Output to both Zotero.debug and console.log
     * @param data e.g. string, number, object, ...
     */
    log(...data) {
      if (data.length === 0) {
        return;
      }
      let _Zotero;
      try {
        if (typeof Zotero !== "undefined") {
          _Zotero = Zotero;
        } else {
          _Zotero = BasicTool.getZotero();
        }
      } catch {
      }
      let options;
      if (data[data.length - 1]?._type === "toolkitlog") {
        options = data.pop();
      } else {
        options = this._basicOptions.log;
      }
      try {
        if (options.prefix) {
          data.splice(0, 0, options.prefix);
        }
        if (!options.disableConsole) {
          let _console;
          if (typeof console !== "undefined") {
            _console = console;
          } else if (_Zotero) {
            _console = _Zotero.getMainWindow()?.console;
          }
          if (!_console) {
            if (!this._console) {
              return;
            }
            _console = this._console;
          }
          if (_console.groupCollapsed) {
            _console.groupCollapsed(...data);
          } else {
            _console.group(...data);
          }
          _console.trace();
          _console.groupEnd();
        }
        if (!options.disableZLog) {
          if (typeof _Zotero === "undefined") {
            return;
          }
          _Zotero.debug(data.map((d) => {
            try {
              return typeof d === "object" ? JSON.stringify(d) : String(d);
            } catch {
              _Zotero.debug(d);
              return "";
            }
          }).join("\n"));
        }
      } catch (e) {
        if (_Zotero)
          Zotero.logError(e);
        else {
          console.error(e);
        }
      }
    }
    /**
     * Patch a function
     * @deprecated Use {@link PatchHelper} instead.
     * @param object The owner of the function
     * @param funcSign The signature of the function(function name)
     * @param ownerSign The signature of patch owner to avoid patching again
     * @param patcher The new wrapper of the patched function
     */
    patch(object, funcSign, ownerSign, patcher) {
      if (object[funcSign][ownerSign]) {
        throw new Error(`${String(funcSign)} re-patched`);
      }
      this.log("patching", funcSign, `by ${ownerSign}`);
      object[funcSign] = patcher(object[funcSign]);
      object[funcSign][ownerSign] = true;
    }
    /**
     * Add a Zotero event listener callback
     * @param type Event type
     * @param callback Event callback
     */
    addListenerCallback(type, callback) {
      if (["onMainWindowLoad", "onMainWindowUnload"].includes(type)) {
        this._ensureMainWindowListener();
      }
      if (type === "onPluginUnload") {
        this._ensurePluginListener();
      }
      this._basicOptions.listeners.callbacks[type].add(callback);
    }
    /**
     * Remove a Zotero event listener callback
     * @param type Event type
     * @param callback Event callback
     */
    removeListenerCallback(type, callback) {
      this._basicOptions.listeners.callbacks[type].delete(callback);
      this._ensureRemoveListener();
    }
    /**
     * Remove all Zotero event listener callbacks when the last callback is removed.
     */
    _ensureRemoveListener() {
      const { listeners } = this._basicOptions;
      if (listeners._mainWindow && listeners.callbacks.onMainWindowLoad.size === 0 && listeners.callbacks.onMainWindowUnload.size === 0) {
        Services.wm.removeListener(listeners._mainWindow);
        delete listeners._mainWindow;
      }
      if (listeners._plugin && listeners.callbacks.onPluginUnload.size === 0) {
        Zotero.Plugins.removeObserver(listeners._plugin);
        delete listeners._plugin;
      }
    }
    /**
     * Ensure the main window listener is registered.
     */
    _ensureMainWindowListener() {
      if (this._basicOptions.listeners._mainWindow) {
        return;
      }
      const mainWindowListener = {
        onOpenWindow: (xulWindow) => {
          const domWindow = xulWindow.docShell.domWindow;
          const onload = async () => {
            domWindow.removeEventListener("load", onload, false);
            if (domWindow.location.href !== "chrome://zotero/content/zoteroPane.xhtml") {
              return;
            }
            for (const cbk of this._basicOptions.listeners.callbacks.onMainWindowLoad) {
              try {
                cbk(domWindow);
              } catch (e) {
                this.log(e);
              }
            }
          };
          domWindow.addEventListener("load", () => onload(), false);
        },
        onCloseWindow: async (xulWindow) => {
          const domWindow = xulWindow.docShell.domWindow;
          if (domWindow.location.href !== "chrome://zotero/content/zoteroPane.xhtml") {
            return;
          }
          for (const cbk of this._basicOptions.listeners.callbacks.onMainWindowUnload) {
            try {
              cbk(domWindow);
            } catch (e) {
              this.log(e);
            }
          }
        }
      };
      this._basicOptions.listeners._mainWindow = mainWindowListener;
      Services.wm.addListener(mainWindowListener);
    }
    /**
     * Ensure the plugin listener is registered.
     */
    _ensurePluginListener() {
      if (this._basicOptions.listeners._plugin) {
        return;
      }
      const pluginListener = {
        shutdown: (...args) => {
          for (const cbk of this._basicOptions.listeners.callbacks.onPluginUnload) {
            try {
              cbk(...args);
            } catch (e) {
              this.log(e);
            }
          }
        }
      };
      this._basicOptions.listeners._plugin = pluginListener;
      Zotero.Plugins.addObserver(pluginListener);
    }
    updateOptions(source) {
      if (!source) {
        return this;
      }
      if (source instanceof BasicTool) {
        this._basicOptions = source._basicOptions;
      } else {
        this._basicOptions = source;
      }
      return this;
    }
    static getZotero() {
      if (typeof Zotero !== "undefined") {
        return Zotero;
      }
      const { Zotero: _Zotero } = ChromeUtils.importESModule("chrome://zotero/content/zotero.mjs");
      return _Zotero;
    }
  };
  var ManagerTool = class extends BasicTool {
    _ensureAutoUnregisterAll() {
      this.addListenerCallback("onPluginUnload", (params, _reason) => {
        if (params.id !== this.basicOptions.api.pluginID) {
          return;
        }
        this.unregisterAll();
      });
    }
  };
  function unregister(tools) {
    Object.values(tools).forEach((tool) => {
      if (tool instanceof ManagerTool || typeof tool?.unregisterAll === "function") {
        tool.unregisterAll();
      }
    });
  }
  function makeHelperTool(cls, options) {
    return new Proxy(cls, {
      construct(target, args) {
        const _origin = new cls(...args);
        if (_origin instanceof BasicTool) {
          _origin.updateOptions(options);
        }
        return _origin;
      }
    });
  }

  // node_modules/zotero-plugin-toolkit/dist/helpers/clipboard.js
  var ClipboardHelper = class extends BasicTool {
    transferable;
    clipboardService;
    filePath = "";
    constructor() {
      super();
      this.transferable = Components.classes["@mozilla.org/widget/transferable;1"].createInstance(Components.interfaces.nsITransferable);
      this.clipboardService = Components.classes["@mozilla.org/widget/clipboard;1"].getService(Components.interfaces.nsIClipboard);
      this.transferable.init(null);
    }
    addText(source, type = "text/plain") {
      const str = Components.classes["@mozilla.org/supports-string;1"].createInstance(Components.interfaces.nsISupportsString);
      str.data = source;
      if (type === "text/unicode")
        type = "text/plain";
      this.transferable.addDataFlavor(type);
      this.transferable.setTransferData(type, str, source.length * 2);
      return this;
    }
    addImage(source) {
      const parts = source.split(",");
      if (!parts[0].includes("base64")) {
        return this;
      }
      const mime = parts[0].match(/:(.*?);/)[1];
      const bstr = this.getGlobal("window").atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const imgTools = Components.classes["@mozilla.org/image/tools;1"].getService(Components.interfaces.imgITools);
      let mimeType;
      let img;
      if (this.getGlobal("Zotero").platformMajorVersion >= 102) {
        img = imgTools.decodeImageFromArrayBuffer(u8arr.buffer, mime);
        mimeType = "application/x-moz-nativeimage";
      } else {
        mimeType = `image/png`;
        img = Components.classes["@mozilla.org/supports-interface-pointer;1"].createInstance(Components.interfaces.nsISupportsInterfacePointer);
        img.data = imgTools.decodeImageFromArrayBuffer(u8arr.buffer, mimeType);
      }
      this.transferable.addDataFlavor(mimeType);
      this.transferable.setTransferData(mimeType, img, 0);
      return this;
    }
    addFile(path) {
      const file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
      file.initWithPath(path);
      this.transferable.addDataFlavor("application/x-moz-file");
      this.transferable.setTransferData("application/x-moz-file", file);
      this.filePath = path;
      return this;
    }
    copy() {
      try {
        this.clipboardService.setData(this.transferable, null, Components.interfaces.nsIClipboard.kGlobalClipboard);
      } catch (e) {
        if (this.filePath && Zotero.isMac) {
          Zotero.Utilities.Internal.exec(`/usr/bin/osascript`, [
            `-e`,
            `set the clipboard to POSIX file "${this.filePath}"`
          ]);
        } else {
          throw e;
        }
      }
      return this;
    }
  };

  // node_modules/zotero-plugin-toolkit/dist/tools/ui.js
  var UITool = class extends BasicTool {
    get basicOptions() {
      return this._basicOptions;
    }
    /**
     * Store elements created with this instance
     *
     * @remarks
     * > What is this for?
     *
     * In bootstrap plugins, elements must be manually maintained and removed on exiting.
     *
     * This API does this for you.
     */
    elementCache;
    constructor(base) {
      super(base);
      this.elementCache = [];
      if (!this._basicOptions.ui) {
        this._basicOptions.ui = {
          enableElementRecord: true,
          enableElementJSONLog: false,
          enableElementDOMLog: true
        };
      }
    }
    /**
     * Remove all elements created by `createElement`.
     *
     * @remarks
     * > What is this for?
     *
     * In bootstrap plugins, elements must be manually maintained and removed on exiting.
     *
     * This API does this for you.
     */
    unregisterAll() {
      this.elementCache.forEach((e) => {
        try {
          e?.deref()?.remove();
        } catch (e2) {
          this.log(e2);
        }
      });
    }
    createElement(...args) {
      const doc = args[0];
      const tagName = args[1].toLowerCase();
      let props = args[2] || {};
      if (!tagName) {
        return;
      }
      if (typeof args[2] === "string") {
        props = {
          namespace: args[2],
          enableElementRecord: args[3]
        };
      }
      if (typeof props.enableElementJSONLog !== "undefined" && props.enableElementJSONLog || this.basicOptions.ui.enableElementJSONLog) {
        this.log(props);
      }
      props.properties = props.properties || props.directAttributes;
      props.children = props.children || props.subElementOptions;
      let elem;
      if (tagName === "fragment") {
        const fragElem = doc.createDocumentFragment();
        elem = fragElem;
      } else {
        let realElem = props.id && (props.checkExistenceParent ? props.checkExistenceParent : doc).querySelector(`#${props.id}`);
        if (realElem && props.ignoreIfExists) {
          return realElem;
        }
        if (realElem && props.removeIfExists) {
          realElem.remove();
          realElem = void 0;
        }
        if (props.customCheck && !props.customCheck(doc, props)) {
          return void 0;
        }
        if (!realElem || !props.skipIfExists) {
          let namespace = props.namespace;
          if (!namespace) {
            const mightHTML = HTMLElementTagNames.includes(tagName);
            const mightXUL = XULElementTagNames.includes(tagName);
            const mightSVG = SVGElementTagNames.includes(tagName);
            if (Number(mightHTML) + Number(mightXUL) + Number(mightSVG) > 1) {
              this.log(`[Warning] Creating element ${tagName} with no namespace specified. Found multiply namespace matches.`);
            }
            if (mightHTML) {
              namespace = "html";
            } else if (mightXUL) {
              namespace = "xul";
            } else if (mightSVG) {
              namespace = "svg";
            } else {
              namespace = "html";
            }
          }
          if (namespace === "xul") {
            realElem = this.createXULElement(doc, tagName);
          } else {
            realElem = doc.createElementNS({
              html: "http://www.w3.org/1999/xhtml",
              svg: "http://www.w3.org/2000/svg"
            }[namespace], tagName);
          }
          if (typeof props.enableElementRecord !== "undefined" ? props.enableElementRecord : this.basicOptions.ui.enableElementRecord) {
            this.elementCache.push(new WeakRef(realElem));
          }
        }
        if (props.id) {
          realElem.id = props.id;
        }
        if (props.styles && Object.keys(props.styles).length) {
          Object.keys(props.styles).forEach((k) => {
            const v = props.styles[k];
            typeof v !== "undefined" && (realElem.style[k] = v);
          });
        }
        if (props.properties && Object.keys(props.properties).length) {
          Object.keys(props.properties).forEach((k) => {
            const v = props.properties[k];
            typeof v !== "undefined" && (realElem[k] = v);
          });
        }
        if (props.attributes && Object.keys(props.attributes).length) {
          Object.keys(props.attributes).forEach((k) => {
            const v = props.attributes[k];
            typeof v !== "undefined" && realElem.setAttribute(k, String(v));
          });
        }
        if (props.classList?.length) {
          realElem.classList.add(...props.classList);
        }
        if (props.listeners?.length) {
          props.listeners.forEach(({ type, listener, options }) => {
            listener && realElem.addEventListener(type, listener, options);
          });
        }
        elem = realElem;
      }
      if (props.children?.length) {
        const subElements = props.children.map((childProps) => {
          childProps.namespace = childProps.namespace || props.namespace;
          return this.createElement(doc, childProps.tag, childProps);
        }).filter((e) => e);
        elem.append(...subElements);
      }
      if (typeof props.enableElementDOMLog !== "undefined" ? props.enableElementDOMLog : this.basicOptions.ui.enableElementDOMLog) {
        this.log(elem);
      }
      return elem;
    }
    /**
     * Append element(s) to a node.
     * @param properties See {@link ElementProps}
     * @param container The parent node to append to.
     * @returns A Node that is the appended child (aChild),
     *          except when aChild is a DocumentFragment,
     *          in which case the empty DocumentFragment is returned.
     */
    appendElement(properties, container) {
      return container.appendChild(this.createElement(container.ownerDocument, properties.tag, properties));
    }
    /**
     * Inserts a node before a reference node as a child of its parent node.
     * @param properties See {@link ElementProps}
     * @param referenceNode The node before which newNode is inserted.
     * @returns Node
     */
    insertElementBefore(properties, referenceNode) {
      if (referenceNode.parentNode)
        return referenceNode.parentNode.insertBefore(this.createElement(referenceNode.ownerDocument, properties.tag, properties), referenceNode);
      else
        this.log(`${referenceNode.tagName} has no parent, cannot insert ${properties.tag}`);
    }
    /**
     * Replace oldNode with a new one.
     * @param properties See {@link ElementProps}
     * @param oldNode The child to be replaced.
     * @returns The replaced Node. This is the same node as oldChild.
     */
    replaceElement(properties, oldNode) {
      if (oldNode.parentNode)
        return oldNode.parentNode.replaceChild(this.createElement(oldNode.ownerDocument, properties.tag, properties), oldNode);
      else
        this.log(`${oldNode.tagName} has no parent, cannot replace it with ${properties.tag}`);
    }
    /**
     * Parse XHTML to XUL fragment. For Zotero 6.
     *
     * To load preferences from a Zotero 7's `.xhtml`, use this method to parse it.
     * @param str xhtml raw text
     * @param entities dtd file list ("chrome://xxx.dtd")
     * @param defaultXUL true for default XUL namespace
     */
    parseXHTMLToFragment(str, entities = [], defaultXUL = true) {
      const parser = new DOMParser();
      const xulns = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
      const htmlns = "http://www.w3.org/1999/xhtml";
      const wrappedStr = `${entities.length ? `<!DOCTYPE bindings [ ${entities.reduce((preamble, url, index) => {
        return `${preamble}<!ENTITY % _dtd-${index} SYSTEM "${url}"> %_dtd-${index}; `;
      }, "")}]>` : ""}
      <html:div xmlns="${defaultXUL ? xulns : htmlns}"
          xmlns:xul="${xulns}" xmlns:html="${htmlns}">
      ${str}
      </html:div>`;
      this.log(wrappedStr, parser);
      const doc = parser.parseFromString(wrappedStr, "text/xml");
      this.log(doc);
      if (doc.documentElement.localName === "parsererror") {
        throw new Error("not well-formed XHTML");
      }
      const range = doc.createRange();
      range.selectNodeContents(doc.querySelector("div"));
      return range.extractContents();
    }
  };
  var HTMLElementTagNames = [
    "a",
    "abbr",
    "address",
    "area",
    "article",
    "aside",
    "audio",
    "b",
    "base",
    "bdi",
    "bdo",
    "blockquote",
    "body",
    "br",
    "button",
    "canvas",
    "caption",
    "cite",
    "code",
    "col",
    "colgroup",
    "data",
    "datalist",
    "dd",
    "del",
    "details",
    "dfn",
    "dialog",
    "div",
    "dl",
    "dt",
    "em",
    "embed",
    "fieldset",
    "figcaption",
    "figure",
    "footer",
    "form",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "head",
    "header",
    "hgroup",
    "hr",
    "html",
    "i",
    "iframe",
    "img",
    "input",
    "ins",
    "kbd",
    "label",
    "legend",
    "li",
    "link",
    "main",
    "map",
    "mark",
    "menu",
    "meta",
    "meter",
    "nav",
    "noscript",
    "object",
    "ol",
    "optgroup",
    "option",
    "output",
    "p",
    "picture",
    "pre",
    "progress",
    "q",
    "rp",
    "rt",
    "ruby",
    "s",
    "samp",
    "script",
    "section",
    "select",
    "slot",
    "small",
    "source",
    "span",
    "strong",
    "style",
    "sub",
    "summary",
    "sup",
    "table",
    "tbody",
    "td",
    "template",
    "textarea",
    "tfoot",
    "th",
    "thead",
    "time",
    "title",
    "tr",
    "track",
    "u",
    "ul",
    "var",
    "video",
    "wbr"
  ];
  var XULElementTagNames = [
    "action",
    "arrowscrollbox",
    "bbox",
    "binding",
    "bindings",
    "box",
    "broadcaster",
    "broadcasterset",
    "button",
    "browser",
    "checkbox",
    "caption",
    "colorpicker",
    "column",
    "columns",
    "commandset",
    "command",
    "conditions",
    "content",
    "deck",
    "description",
    "dialog",
    "dialogheader",
    "editor",
    "grid",
    "grippy",
    "groupbox",
    "hbox",
    "iframe",
    "image",
    "key",
    "keyset",
    "label",
    "listbox",
    "listcell",
    "listcol",
    "listcols",
    "listhead",
    "listheader",
    "listitem",
    "member",
    "menu",
    "menubar",
    "menuitem",
    "menulist",
    "menupopup",
    "menuseparator",
    "observes",
    "overlay",
    "page",
    "popup",
    "popupset",
    "preference",
    "preferences",
    "prefpane",
    "prefwindow",
    "progressmeter",
    "radio",
    "radiogroup",
    "resizer",
    "richlistbox",
    "richlistitem",
    "row",
    "rows",
    "rule",
    "script",
    "scrollbar",
    "scrollbox",
    "scrollcorner",
    "separator",
    "spacer",
    "splitter",
    "stack",
    "statusbar",
    "statusbarpanel",
    "stringbundle",
    "stringbundleset",
    "tab",
    "tabbrowser",
    "tabbox",
    "tabpanel",
    "tabpanels",
    "tabs",
    "template",
    "textnode",
    "textbox",
    "titlebar",
    "toolbar",
    "toolbarbutton",
    "toolbargrippy",
    "toolbaritem",
    "toolbarpalette",
    "toolbarseparator",
    "toolbarset",
    "toolbarspacer",
    "toolbarspring",
    "toolbox",
    "tooltip",
    "tree",
    "treecell",
    "treechildren",
    "treecol",
    "treecols",
    "treeitem",
    "treerow",
    "treeseparator",
    "triple",
    "vbox",
    "window",
    "wizard",
    "wizardpage"
  ];
  var SVGElementTagNames = [
    "a",
    "animate",
    "animateMotion",
    "animateTransform",
    "circle",
    "clipPath",
    "defs",
    "desc",
    "ellipse",
    "feBlend",
    "feColorMatrix",
    "feComponentTransfer",
    "feComposite",
    "feConvolveMatrix",
    "feDiffuseLighting",
    "feDisplacementMap",
    "feDistantLight",
    "feDropShadow",
    "feFlood",
    "feFuncA",
    "feFuncB",
    "feFuncG",
    "feFuncR",
    "feGaussianBlur",
    "feImage",
    "feMerge",
    "feMergeNode",
    "feMorphology",
    "feOffset",
    "fePointLight",
    "feSpecularLighting",
    "feSpotLight",
    "feTile",
    "feTurbulence",
    "filter",
    "foreignObject",
    "g",
    "image",
    "line",
    "linearGradient",
    "marker",
    "mask",
    "metadata",
    "mpath",
    "path",
    "pattern",
    "polygon",
    "polyline",
    "radialGradient",
    "rect",
    "script",
    "set",
    "stop",
    "style",
    "svg",
    "switch",
    "symbol",
    "text",
    "textPath",
    "title",
    "tspan",
    "use",
    "view"
  ];

  // node_modules/zotero-plugin-toolkit/dist/helpers/dialog.js
  var DialogHelper = class extends UITool {
    /**
     * Passed to dialog window for data-binding and lifecycle controls. See {@link DialogHelper.setDialogData}
     */
    dialogData;
    /**
     * Dialog window instance
     */
    window;
    elementProps;
    /**
     * Create a dialog helper with row \* column grids.
     * @param row
     * @param column
     */
    constructor(row, column) {
      super();
      if (row <= 0 || column <= 0) {
        throw new Error(`row and column must be positive integers.`);
      }
      this.elementProps = {
        tag: "vbox",
        attributes: { flex: 1 },
        styles: {
          width: "100%",
          height: "100%"
        },
        children: []
      };
      for (let i = 0; i < Math.max(row, 1); i++) {
        this.elementProps.children.push({
          tag: "hbox",
          attributes: { flex: 1 },
          children: []
        });
        for (let j = 0; j < Math.max(column, 1); j++) {
          this.elementProps.children[i].children.push({
            tag: "vbox",
            attributes: { flex: 1 },
            children: []
          });
        }
      }
      this.elementProps.children.push({
        tag: "hbox",
        attributes: { flex: 0, pack: "end" },
        children: []
      });
      this.dialogData = {};
    }
    /**
     * Add a cell at (row, column). Index starts from 0.
     * @param row
     * @param column
     * @param elementProps Cell element props. See {@link ElementProps}
     * @param cellFlex If the cell is flex. Default true.
     */
    addCell(row, column, elementProps, cellFlex = true) {
      if (row >= this.elementProps.children.length || column >= this.elementProps.children[row].children.length) {
        throw new Error(`Cell index (${row}, ${column}) is invalid, maximum (${this.elementProps.children.length}, ${this.elementProps.children[0].children.length})`);
      }
      this.elementProps.children[row].children[column].children = [
        elementProps
      ];
      this.elementProps.children[row].children[column].attributes.flex = cellFlex ? 1 : 0;
      return this;
    }
    /**
     * Add a control button to the bottom of the dialog.
     * @param label Button label
     * @param id Button id.
     * The corresponding id of the last button user clicks before window exit will be set to `dialogData._lastButtonId`.
     * @param options Options
     * @param [options.noClose] Don't close window when clicking this button.
     * @param [options.callback] Callback of button click event.
     */
    addButton(label, id, options = {}) {
      id = id || `${Zotero.Utilities.randomString()}-${(/* @__PURE__ */ new Date()).getTime()}`;
      this.elementProps.children[this.elementProps.children.length - 1].children.push({
        tag: "vbox",
        styles: {
          margin: "10px"
        },
        children: [
          {
            tag: "button",
            namespace: "html",
            id,
            attributes: {
              type: "button",
              "data-l10n-id": label
            },
            properties: {
              innerHTML: label
            },
            listeners: [
              {
                type: "click",
                listener: (e) => {
                  this.dialogData._lastButtonId = id;
                  if (options.callback) {
                    options.callback(e);
                  }
                  if (!options.noClose) {
                    this.window.close();
                  }
                }
              }
            ]
          }
        ]
      });
      return this;
    }
    /**
     * Dialog data.
     * @remarks
     * This object is passed to the dialog window.
     *
     * The control button id is in `dialogData._lastButtonId`;
     *
     * The data-binding values are in `dialogData`.
     * ```ts
     * interface DialogData {
     *   [key: string | number | symbol]: any;
     *   loadLock?: _ZoteroTypes.PromiseObject; // resolve after window load (auto-generated)
     *   loadCallback?: Function; // called after window load
     *   unloadLock?: _ZoteroTypes.PromiseObject; // resolve after window unload (auto-generated)
     *   unloadCallback?: Function; // called after window unload
     *   beforeUnloadCallback?: Function; // called before window unload when elements are accessable.
     * }
     * ```
     * @param dialogData
     */
    setDialogData(dialogData) {
      this.dialogData = dialogData;
      return this;
    }
    /**
     * Open the dialog
     * @param title Window title
     * @param windowFeatures
     * @param windowFeatures.width Ignored if fitContent is `true`.
     * @param windowFeatures.height Ignored if fitContent is `true`.
     * @param windowFeatures.left
     * @param windowFeatures.top
     * @param windowFeatures.centerscreen Open window at the center of screen.
     * @param windowFeatures.resizable If window is resizable.
     * @param windowFeatures.fitContent Resize the window to content size after elements are loaded.
     * @param windowFeatures.noDialogMode Dialog mode window only has a close button. Set `true` to make maximize and minimize button visible.
     * @param windowFeatures.alwaysRaised Is the window always at the top.
     */
    open(title, windowFeatures = {
      centerscreen: true,
      resizable: true,
      fitContent: true
    }) {
      this.window = openDialog(this, `${Zotero.Utilities.randomString()}-${(/* @__PURE__ */ new Date()).getTime()}`, title, this.elementProps, this.dialogData, windowFeatures);
      return this;
    }
  };
  function openDialog(dialogHelper, targetId, title, elementProps, dialogData, windowFeatures = {
    centerscreen: true,
    resizable: true,
    fitContent: true
  }) {
    const Zotero2 = dialogHelper.getGlobal("Zotero");
    dialogData = dialogData || {};
    if (!dialogData.loadLock) {
      dialogData.loadLock = Zotero2.Promise.defer();
    }
    if (!dialogData.unloadLock) {
      dialogData.unloadLock = Zotero2.Promise.defer();
    }
    let featureString = `resizable=${windowFeatures.resizable ? "yes" : "no"},`;
    if (windowFeatures.width || windowFeatures.height) {
      featureString += `width=${windowFeatures.width || 100},height=${windowFeatures.height || 100},`;
    }
    if (windowFeatures.left) {
      featureString += `left=${windowFeatures.left},`;
    }
    if (windowFeatures.top) {
      featureString += `top=${windowFeatures.top},`;
    }
    if (windowFeatures.centerscreen) {
      featureString += "centerscreen,";
    }
    if (windowFeatures.noDialogMode) {
      featureString += "dialog=no,";
    }
    if (windowFeatures.alwaysRaised) {
      featureString += "alwaysRaised=yes,";
    }
    const win = dialogHelper.getGlobal("openDialog")("about:blank", targetId || "_blank", featureString, dialogData);
    dialogData.loadLock?.promise.then(() => {
      win.document.head.appendChild(dialogHelper.createElement(win.document, "title", {
        properties: { innerText: title },
        attributes: { "data-l10n-id": title }
      }));
      let l10nFiles = dialogData.l10nFiles || [];
      if (typeof l10nFiles === "string") {
        l10nFiles = [l10nFiles];
      }
      l10nFiles.forEach((file) => {
        win.document.head.appendChild(dialogHelper.createElement(win.document, "link", {
          properties: {
            rel: "localization",
            href: file
          }
        }));
      });
      dialogHelper.appendElement({
        tag: "fragment",
        children: [
          {
            tag: "style",
            properties: {
              // eslint-disable-next-line ts/no-use-before-define
              innerHTML: style
            }
          },
          {
            tag: "link",
            properties: {
              rel: "stylesheet",
              href: "chrome://zotero-platform/content/zotero.css"
            }
          }
        ]
      }, win.document.head);
      replaceElement(elementProps, dialogHelper);
      win.document.body.appendChild(dialogHelper.createElement(win.document, "fragment", {
        children: [elementProps]
      }));
      Array.from(win.document.querySelectorAll("*[data-bind]")).forEach((elem) => {
        const bindKey = elem.getAttribute("data-bind");
        const bindAttr = elem.getAttribute("data-attr");
        const bindProp = elem.getAttribute("data-prop");
        if (bindKey && dialogData && dialogData[bindKey]) {
          if (bindProp) {
            elem[bindProp] = dialogData[bindKey];
          } else {
            elem.setAttribute(bindAttr || "value", dialogData[bindKey]);
          }
        }
      });
      if (windowFeatures.fitContent) {
        setTimeout(() => {
          win.sizeToContent();
        }, 300);
      }
      win.focus();
    }).then(() => {
      dialogData?.loadCallback && dialogData.loadCallback();
    });
    dialogData.unloadLock.promise.then(() => {
      dialogData?.unloadCallback && dialogData.unloadCallback();
    });
    win.addEventListener("DOMContentLoaded", function onWindowLoad(_ev) {
      win.arguments[0]?.loadLock?.resolve();
      win.removeEventListener("DOMContentLoaded", onWindowLoad, false);
    }, false);
    win.addEventListener("beforeunload", function onWindowBeforeUnload(_ev) {
      Array.from(win.document.querySelectorAll("*[data-bind]")).forEach((elem) => {
        const dialogData2 = this.window.arguments[0];
        const bindKey = elem.getAttribute("data-bind");
        const bindAttr = elem.getAttribute("data-attr");
        const bindProp = elem.getAttribute("data-prop");
        if (bindKey && dialogData2) {
          if (bindProp) {
            dialogData2[bindKey] = elem[bindProp];
          } else {
            dialogData2[bindKey] = elem.getAttribute(bindAttr || "value");
          }
        }
      });
      this.window.removeEventListener("beforeunload", onWindowBeforeUnload, false);
      dialogData?.beforeUnloadCallback && dialogData.beforeUnloadCallback();
    });
    win.addEventListener("unload", function onWindowUnload(_ev) {
      if (this.window.arguments[0]?.loadLock.promise.isPending()) {
        return;
      }
      this.window.arguments[0]?.unloadLock?.resolve();
      this.window.removeEventListener("unload", onWindowUnload, false);
    });
    if (win.document.readyState === "complete") {
      win.arguments[0]?.loadLock?.resolve();
    }
    return win;
  }
  function replaceElement(elementProps, uiTool) {
    let checkChildren = true;
    if (elementProps.tag === "select") {
      checkChildren = false;
      const customSelectProps = {
        tag: "div",
        classList: ["dropdown"],
        listeners: [
          {
            type: "mouseleave",
            listener: (ev) => {
              const select = ev.target.querySelector("select");
              select?.blur();
            }
          }
        ],
        children: [
          Object.assign({}, elementProps, {
            tag: "select",
            listeners: [
              {
                type: "focus",
                listener: (ev) => {
                  const select = ev.target;
                  const dropdown = select.parentElement?.querySelector(".dropdown-content");
                  dropdown && (dropdown.style.display = "block");
                  select.setAttribute("focus", "true");
                }
              },
              {
                type: "blur",
                listener: (ev) => {
                  const select = ev.target;
                  const dropdown = select.parentElement?.querySelector(".dropdown-content");
                  dropdown && (dropdown.style.display = "none");
                  select.removeAttribute("focus");
                }
              }
            ]
          }),
          {
            tag: "div",
            classList: ["dropdown-content"],
            children: elementProps.children?.map((option) => ({
              tag: "p",
              attributes: {
                value: option.properties?.value
              },
              properties: {
                innerHTML: option.properties?.innerHTML || option.properties?.textContent
              },
              classList: ["dropdown-item"],
              listeners: [
                {
                  type: "click",
                  listener: (ev) => {
                    const select = ev.target.parentElement?.previousElementSibling;
                    select && (select.value = ev.target.getAttribute("value") || "");
                    select?.blur();
                  }
                }
              ]
            }))
          }
        ]
      };
      for (const key in elementProps) {
        delete elementProps[key];
      }
      Object.assign(elementProps, customSelectProps);
    } else if (elementProps.tag === "a") {
      const href = elementProps?.properties?.href || "";
      elementProps.properties ??= {};
      elementProps.properties.href = "javascript:void(0);";
      elementProps.attributes ??= {};
      elementProps.attributes["zotero-href"] = href;
      elementProps.listeners ??= [];
      elementProps.listeners.push({
        type: "click",
        listener: (ev) => {
          const href2 = ev.target?.getAttribute("zotero-href");
          href2 && uiTool.getGlobal("Zotero").launchURL(href2);
        }
      });
      elementProps.classList ??= [];
      elementProps.classList.push("zotero-text-link");
    }
    if (checkChildren) {
      elementProps.children?.forEach((child) => replaceElement(child, uiTool));
    }
  }
  var style = `
.zotero-text-link {
  -moz-user-focus: normal;
  color: -moz-nativehyperlinktext;
  text-decoration: underline;
  border: 1px solid transparent;
  cursor: pointer;
}
.dropdown {
  position: relative;
  display: inline-block;
}
.dropdown-content {
  display: none;
  position: absolute;
  background-color: var(--material-toolbar);
  min-width: 160px;
  box-shadow: 0px 0px 5px 0px rgba(0, 0, 0, 0.5);
  border-radius: 5px;
  padding: 5px 0 5px 0;
  z-index: 999;
}
.dropdown-item {
  margin: 0px;
  padding: 5px 10px 5px 10px;
}
.dropdown-item:hover {
  background-color: var(--fill-quinary);
}
`;

  // node_modules/zotero-plugin-toolkit/dist/helpers/filePicker.js
  var FilePickerHelper = class extends BasicTool {
    title;
    mode;
    filters;
    suggestion;
    directory;
    window;
    filterMask;
    constructor(title, mode, filters, suggestion, window2, filterMask, directory) {
      super();
      this.title = title;
      this.mode = mode;
      this.filters = filters;
      this.suggestion = suggestion;
      this.directory = directory;
      this.window = window2;
      this.filterMask = filterMask;
    }
    async open() {
      const Backend = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs").FilePicker;
      const fp = new Backend();
      fp.init(this.window || this.getGlobal("window"), this.title, this.getMode(fp));
      for (const [label, ext] of this.filters || []) {
        fp.appendFilter(label, ext);
      }
      if (this.filterMask)
        fp.appendFilters(this.getFilterMask(fp));
      if (this.suggestion)
        fp.defaultString = this.suggestion;
      if (this.directory)
        fp.displayDirectory = this.directory;
      const userChoice = await fp.show();
      switch (userChoice) {
        case fp.returnOK:
        case fp.returnReplace:
          return this.mode === "multiple" ? fp.files : fp.file;
        default:
          return false;
      }
    }
    getMode(fp) {
      switch (this.mode) {
        case "open":
          return fp.modeOpen;
        case "save":
          return fp.modeSave;
        case "folder":
          return fp.modeGetFolder;
        case "multiple":
          return fp.modeOpenMultiple;
        default:
          return 0;
      }
    }
    getFilterMask(fp) {
      switch (this.filterMask) {
        case "all":
          return fp.filterAll;
        case "html":
          return fp.filterHTML;
        case "text":
          return fp.filterText;
        case "images":
          return fp.filterImages;
        case "xml":
          return fp.filterXML;
        case "apps":
          return fp.filterApps;
        case "urls":
          return fp.filterAllowURLs;
        case "audio":
          return fp.filterAudio;
        case "video":
          return fp.filterVideo;
        default:
          return 1;
      }
    }
  };

  // node_modules/zotero-plugin-toolkit/dist/helpers/guide.js
  var GuideHelper = class extends BasicTool {
    _steps = [];
    constructor() {
      super();
    }
    addStep(step) {
      this._steps.push(step);
      return this;
    }
    addSteps(steps) {
      this._steps.push(...steps);
      return this;
    }
    async show(doc) {
      if (!doc?.ownerGlobal) {
        throw new Error("Document is required.");
      }
      const guide = new Guide(doc.ownerGlobal);
      await guide.show(this._steps);
      const promise = new Promise((resolve) => {
        guide._panel.addEventListener("guide-finished", () => resolve(guide));
      });
      await promise;
      return guide;
    }
    async highlight(doc, step) {
      if (!doc?.ownerGlobal) {
        throw new Error("Document is required.");
      }
      const guide = new Guide(doc.ownerGlobal);
      await guide.show([step]);
      const promise = new Promise((resolve) => {
        guide._panel.addEventListener("guide-finished", () => resolve(guide));
      });
      await promise;
      return guide;
    }
  };
  var Guide = class {
    _window;
    _id = `guide-${Zotero.Utilities.randomString()}`;
    _panel;
    _header;
    _body;
    _footer;
    _progress;
    _closeButton;
    _prevButton;
    _nextButton;
    _steps;
    _noClose;
    _closed;
    _autoNext;
    _currentIndex;
    initialized;
    _cachedMasks = [];
    get content() {
      return this._window.MozXULElement.parseXULToFragment(`
      <panel id="${this._id}" class="guide-panel" type="arrow" align="top" noautohide="true">
          <html:div class="guide-panel-content">
              <html:div class="guide-panel-header"></html:div>
              <html:div class="guide-panel-body"></html:div>
              <html:div class="guide-panel-footer">
                  <html:div class="guide-panel-progress"></html:div>
                  <html:div class="guide-panel-buttons">
                      <button id="prev-button" class="guide-panel-button" hidden="true"></button>
                      <button id="next-button" class="guide-panel-button" hidden="true"></button>
                      <button id="close-button" class="guide-panel-button" hidden="true"></button>
                  </html:div>
              </html:div>
          </html:div>
          <html:style>
              .guide-panel {
                  background-color: var(--material-menu);
                  color: var(--fill-primary);
              }
              .guide-panel-content {
                  display: flex;
                  flex-direction: column;
                  padding: 0;
              }
              .guide-panel-header {
                  font-size: 1.2em;
                  font-weight: bold;
                  margin-bottom: 10px;
              }
              .guide-panel-header:empty {
                display: none;
              }
              .guide-panel-body {
                  align-items: center;
                  display: flex;
                  flex-direction: column;
                  white-space: pre-wrap;
              }
              .guide-panel-body:empty {
                display: none;
              }
              .guide-panel-footer {
                  display: flex;
                  flex-direction: row;
                  align-items: center;
                  justify-content: space-between;
                  margin-top: 10px;
              }
              .guide-panel-progress {
                  font-size: 0.8em;
              }
              .guide-panel-buttons {
                  display: flex;
                  flex-direction: row;
                  flex-grow: 1;
                  justify-content: flex-end;
              }
          </html:style>
      </panel>
  `);
    }
    get currentStep() {
      if (!this._steps)
        return void 0;
      return this._steps[this._currentIndex];
    }
    get currentTarget() {
      const step = this.currentStep;
      if (!step?.element)
        return void 0;
      let elem;
      if (typeof step.element === "function") {
        elem = step.element();
      } else if (typeof step.element === "string") {
        elem = document.querySelector(step.element);
      } else if (!step.element) {
        elem = document.documentElement;
      } else {
        elem = step.element;
      }
      return elem;
    }
    get hasNext() {
      return this._steps && this._currentIndex < this._steps.length - 1;
    }
    get hasPrevious() {
      return this._steps && this._currentIndex > 0;
    }
    get hookProps() {
      return {
        config: this.currentStep,
        state: {
          step: this._currentIndex,
          steps: this._steps,
          controller: this
        }
      };
    }
    get panel() {
      return this._panel;
    }
    constructor(win) {
      this._window = win;
      this._noClose = false;
      this._closed = false;
      this._autoNext = true;
      this._currentIndex = 0;
      const doc = win.document;
      const content = this.content;
      if (content) {
        doc.documentElement.append(doc.importNode(content, true));
      }
      this._panel = doc.querySelector(`#${this._id}`);
      this._header = this._panel.querySelector(".guide-panel-header");
      this._body = this._panel.querySelector(".guide-panel-body");
      this._footer = this._panel.querySelector(".guide-panel-footer");
      this._progress = this._panel.querySelector(".guide-panel-progress");
      this._closeButton = this._panel.querySelector("#close-button");
      this._prevButton = this._panel.querySelector("#prev-button");
      this._nextButton = this._panel.querySelector("#next-button");
      this._closeButton.addEventListener("click", async () => {
        if (this.currentStep?.onCloseClick) {
          await this.currentStep.onCloseClick(this.hookProps);
        }
        this.abort();
      });
      this._prevButton.addEventListener("click", async () => {
        if (this.currentStep?.onPrevClick) {
          await this.currentStep.onPrevClick(this.hookProps);
        }
        this.movePrevious();
      });
      this._nextButton.addEventListener("click", async () => {
        if (this.currentStep?.onNextClick) {
          await this.currentStep.onNextClick(this.hookProps);
        }
        this.moveNext();
      });
      this._panel.addEventListener("popupshown", this._handleShown.bind(this));
      this._panel.addEventListener("popuphidden", this._handleHidden.bind(this));
      this._window.addEventListener("resize", this._centerPanel);
    }
    async show(steps) {
      if (steps) {
        this._steps = steps;
        this._currentIndex = 0;
      }
      const index = this._currentIndex;
      this._noClose = false;
      this._closed = false;
      this._autoNext = true;
      const step = this.currentStep;
      if (!step)
        return;
      const elem = this.currentTarget;
      if (step.onBeforeRender) {
        await step.onBeforeRender(this.hookProps);
        if (index !== this._currentIndex) {
          await this.show();
          return;
        }
      }
      if (step.onMask) {
        step.onMask({ mask: (_e) => this._createMask(_e) });
      } else {
        this._createMask(elem);
      }
      let x;
      let y = 0;
      let position = step.position || "after_start";
      if (position === "center") {
        position = "overlap";
        x = window.innerWidth / 2;
        y = window.innerHeight / 2;
      }
      this._panel.openPopup(elem, step.position || "after_start", x, y, false, false);
    }
    hide() {
      this._panel.hidePopup();
    }
    abort() {
      this._closed = true;
      this.hide();
      this._steps = void 0;
    }
    moveTo(stepIndex) {
      if (!this._steps) {
        this.hide();
        return;
      }
      if (stepIndex < 0)
        stepIndex = 0;
      if (!this._steps[stepIndex]) {
        this._currentIndex = this._steps.length;
        this.hide();
        return;
      }
      this._autoNext = false;
      this._noClose = true;
      this.hide();
      this._noClose = false;
      this._autoNext = true;
      this._currentIndex = stepIndex;
      this.show();
    }
    moveNext() {
      this.moveTo(this._currentIndex + 1);
    }
    movePrevious() {
      this.moveTo(this._currentIndex - 1);
    }
    _handleShown() {
      if (!this._steps)
        return;
      const step = this.currentStep;
      if (!step)
        return;
      this._header.innerHTML = step.title || "";
      this._body.innerHTML = step.description || "";
      this._panel.querySelectorAll(".guide-panel-button").forEach((elem) => {
        elem.hidden = true;
        elem.disabled = false;
      });
      let showButtons = step.showButtons;
      if (!showButtons) {
        showButtons = [];
        if (this.hasPrevious) {
          showButtons.push("prev");
        }
        if (this.hasNext) {
          showButtons.push("next");
        } else {
          showButtons.push("close");
        }
      }
      if (showButtons?.length) {
        showButtons.forEach((btn) => {
          this._panel.querySelector(`#${btn}-button`).hidden = false;
        });
      }
      if (step.disableButtons) {
        step.disableButtons.forEach((btn) => {
          this._panel.querySelector(`#${btn}-button`).disabled = true;
        });
      }
      if (step.showProgress) {
        this._progress.hidden = false;
        this._progress.textContent = step.progressText || `${this._currentIndex + 1}/${this._steps.length}`;
      } else {
        this._progress.hidden = true;
      }
      this._closeButton.label = step.closeBtnText || "Done";
      this._nextButton.label = step.nextBtnText || "Next";
      this._prevButton.label = step.prevBtnText || "Previous";
      if (step.onRender) {
        step.onRender(this.hookProps);
      }
      if (step.position === "center") {
        this._centerPanel();
        this._window.setTimeout(this._centerPanel, 10);
      }
    }
    async _handleHidden() {
      this._removeMask();
      this._header.innerHTML = "";
      this._body.innerHTML = "";
      this._progress.textContent = "";
      if (!this._steps)
        return;
      const step = this.currentStep;
      if (step && step.onExit) {
        await step.onExit(this.hookProps);
      }
      if (!this._noClose && (this._closed || !this.hasNext)) {
        this._panel.dispatchEvent(new this._window.CustomEvent("guide-finished"));
        this._panel.remove();
        this._window.removeEventListener("resize", this._centerPanel);
        return;
      }
      if (this._autoNext) {
        this.moveNext();
      }
    }
    _centerPanel = () => {
      const win = this._window;
      this._panel.moveTo(win.screenX + win.innerWidth / 2 - this._panel.clientWidth / 2, win.screenY + win.innerHeight / 2 - this._panel.clientHeight / 2);
    };
    _createMask(targetElement) {
      const doc = targetElement?.ownerDocument || this._window.document;
      const NS = "http://www.w3.org/2000/svg";
      const svg = doc.createElementNS(NS, "svg");
      svg.id = "guide-panel-mask";
      svg.style.position = "fixed";
      svg.style.top = "0";
      svg.style.left = "0";
      svg.style.width = "100%";
      svg.style.height = "100%";
      svg.style.zIndex = "9999";
      const mask = doc.createElementNS(NS, "mask");
      mask.id = "mask";
      const fullRect = doc.createElementNS(NS, "rect");
      fullRect.setAttribute("x", "0");
      fullRect.setAttribute("y", "0");
      fullRect.setAttribute("width", "100%");
      fullRect.setAttribute("height", "100%");
      fullRect.setAttribute("fill", "white");
      mask.appendChild(fullRect);
      if (targetElement) {
        const rect = targetElement.getBoundingClientRect();
        const targetRect = doc.createElementNS(NS, "rect");
        targetRect.setAttribute("x", rect.left.toString());
        targetRect.setAttribute("y", rect.top.toString());
        targetRect.setAttribute("width", rect.width.toString());
        targetRect.setAttribute("height", rect.height.toString());
        targetRect.setAttribute("fill", "black");
        mask.appendChild(targetRect);
      }
      const maskedRect = doc.createElementNS(NS, "rect");
      maskedRect.setAttribute("x", "0");
      maskedRect.setAttribute("y", "0");
      maskedRect.setAttribute("width", "100%");
      maskedRect.setAttribute("height", "100%");
      maskedRect.setAttribute("mask", "url(#mask)");
      maskedRect.setAttribute("opacity", "0.7");
      svg.appendChild(mask);
      svg.appendChild(maskedRect);
      this._cachedMasks.push(new WeakRef(svg));
      doc.documentElement.appendChild(svg);
    }
    _removeMask() {
      this._cachedMasks.forEach((ref) => {
        const mask = ref.deref();
        if (mask) {
          mask.remove();
        }
      });
      this._cachedMasks = [];
    }
  };

  // node_modules/zotero-plugin-toolkit/dist/helpers/largePref.js
  var LargePrefHelper = class extends BasicTool {
    keyPref;
    valuePrefPrefix;
    innerObj;
    hooks;
    /**
     *
     * @param keyPref The preference name for storing the keys of the data.
     * @param valuePrefPrefix The preference name prefix for storing the values of the data.
     * @param hooks Hooks for parsing the values of the data.
     * - `afterGetValue`: A function that takes the value of the data as input and returns the parsed value.
     * - `beforeSetValue`: A function that takes the key and value of the data as input and returns the parsed key and value.
     * If `hooks` is `"default"`, no parsing will be done.
     * If `hooks` is `"parser"`, the values will be parsed as JSON.
     * If `hooks` is an object, the values will be parsed by the hooks.
     */
    constructor(keyPref, valuePrefPrefix, hooks = "default") {
      super();
      this.keyPref = keyPref;
      this.valuePrefPrefix = valuePrefPrefix;
      if (hooks === "default") {
        this.hooks = defaultHooks;
      } else if (hooks === "parser") {
        this.hooks = parserHooks;
      } else {
        this.hooks = { ...defaultHooks, ...hooks };
      }
      this.innerObj = {};
    }
    /**
     * Get the object that stores the data.
     * @returns The object that stores the data.
     */
    asObject() {
      return this.constructTempObj();
    }
    /**
     * Get the Map that stores the data.
     * @returns The Map that stores the data.
     */
    asMapLike() {
      const mapLike = {
        get: (key) => this.getValue(key),
        set: (key, value) => {
          this.setValue(key, value);
          return mapLike;
        },
        has: (key) => this.hasKey(key),
        delete: (key) => this.deleteKey(key),
        clear: () => {
          for (const key of this.getKeys()) {
            this.deleteKey(key);
          }
        },
        forEach: (callback) => {
          return this.constructTempMap().forEach(callback);
        },
        get size() {
          return this._this.getKeys().length;
        },
        entries: () => {
          return this.constructTempMap().values();
        },
        keys: () => {
          const keys = this.getKeys();
          return keys[Symbol.iterator]();
        },
        values: () => {
          return this.constructTempMap().values();
        },
        [Symbol.iterator]: () => {
          return this.constructTempMap()[Symbol.iterator]();
        },
        [Symbol.toStringTag]: "MapLike",
        _this: this
      };
      return mapLike;
    }
    /**
     * Get the keys of the data.
     * @returns The keys of the data.
     */
    getKeys() {
      const rawKeys = Zotero.Prefs.get(this.keyPref, true);
      const keys = rawKeys ? JSON.parse(rawKeys) : [];
      for (const key of keys) {
        const value = "placeholder";
        this.innerObj[key] = value;
      }
      return keys;
    }
    /**
     * Set the keys of the data.
     * @param keys The keys of the data.
     */
    setKeys(keys) {
      keys = [...new Set(keys.filter((key) => key))];
      Zotero.Prefs.set(this.keyPref, JSON.stringify(keys), true);
      for (const key of keys) {
        const value = "placeholder";
        this.innerObj[key] = value;
      }
    }
    /**
     * Get the value of a key.
     * @param key The key of the data.
     * @returns The value of the key.
     */
    getValue(key) {
      const value = Zotero.Prefs.get(`${this.valuePrefPrefix}${key}`, true);
      if (typeof value === "undefined") {
        return;
      }
      const { value: newValue } = this.hooks.afterGetValue({ value });
      this.innerObj[key] = newValue;
      return newValue;
    }
    /**
     * Set the value of a key.
     * @param key The key of the data.
     * @param value The value of the key.
     */
    setValue(key, value) {
      const { key: newKey, value: newValue } = this.hooks.beforeSetValue({
        key,
        value
      });
      this.setKey(newKey);
      Zotero.Prefs.set(`${this.valuePrefPrefix}${newKey}`, newValue, true);
      this.innerObj[newKey] = newValue;
    }
    /**
     * Check if a key exists.
     * @param key The key of the data.
     * @returns Whether the key exists.
     */
    hasKey(key) {
      return this.getKeys().includes(key);
    }
    /**
     * Add a key.
     * @param key The key of the data.
     */
    setKey(key) {
      const keys = this.getKeys();
      if (!keys.includes(key)) {
        keys.push(key);
        this.setKeys(keys);
      }
    }
    /**
     * Delete a key.
     * @param key The key of the data.
     */
    deleteKey(key) {
      const keys = this.getKeys();
      const index = keys.indexOf(key);
      if (index > -1) {
        keys.splice(index, 1);
        delete this.innerObj[key];
        this.setKeys(keys);
      }
      Zotero.Prefs.clear(`${this.valuePrefPrefix}${key}`, true);
      return true;
    }
    constructTempObj() {
      return new Proxy(this.innerObj, {
        get: (target, prop, receiver) => {
          this.getKeys();
          if (typeof prop === "string" && prop in target) {
            this.getValue(prop);
          }
          return Reflect.get(target, prop, receiver);
        },
        set: (target, p, newValue, receiver) => {
          if (typeof p === "string") {
            if (newValue === void 0) {
              this.deleteKey(p);
              return true;
            }
            this.setValue(p, newValue);
            return true;
          }
          return Reflect.set(target, p, newValue, receiver);
        },
        has: (target, p) => {
          this.getKeys();
          return Reflect.has(target, p);
        },
        deleteProperty: (target, p) => {
          if (typeof p === "string") {
            this.deleteKey(p);
            return true;
          }
          return Reflect.deleteProperty(target, p);
        }
      });
    }
    constructTempMap() {
      const map = /* @__PURE__ */ new Map();
      for (const key of this.getKeys()) {
        map.set(key, this.getValue(key));
      }
      return map;
    }
  };
  var defaultHooks = {
    afterGetValue: ({ value }) => ({ value }),
    beforeSetValue: ({ key, value }) => ({ key, value })
  };
  var parserHooks = {
    afterGetValue: ({ value }) => {
      try {
        value = JSON.parse(value);
      } catch {
        return { value };
      }
      return { value };
    },
    beforeSetValue: ({ key, value }) => {
      value = JSON.stringify(value);
      return { key, value };
    }
  };

  // node_modules/zotero-plugin-toolkit/dist/helpers/patch.js
  var PatchHelper = class extends BasicTool {
    options;
    constructor() {
      super();
      this.options = void 0;
    }
    setData(options) {
      this.options = options;
      const Zotero2 = this.getGlobal("Zotero");
      const { target, funcSign, patcher } = options;
      const origin = target[funcSign];
      this.log("patching ", funcSign);
      target[funcSign] = function(...args) {
        if (options.enabled)
          try {
            return patcher(origin).apply(this, args);
          } catch (e) {
            Zotero2.logError(e);
          }
        return origin.apply(this, args);
      };
      return this;
    }
    enable() {
      if (!this.options)
        throw new Error("No patch data set");
      this.options.enabled = true;
      return this;
    }
    disable() {
      if (!this.options)
        throw new Error("No patch data set");
      this.options.enabled = false;
      return this;
    }
  };

  // node_modules/zotero-plugin-toolkit/dist/helpers/progressWindow.js
  var icons = {
    success: "chrome://zotero/skin/tick.png",
    fail: "chrome://zotero/skin/cross.png"
  };
  var ProgressWindowHelper = class {
    win;
    lines;
    closeTime;
    /**
     *
     * @param header window header
     * @param options
     * @param options.window
     * @param options.closeOnClick
     * @param options.closeTime
     * @param options.closeOtherProgressWindows
     */
    constructor(header, options = {
      closeOnClick: true,
      closeTime: 5e3
    }) {
      this.win = new (BasicTool.getZotero()).ProgressWindow(options);
      this.lines = [];
      this.closeTime = options.closeTime || 5e3;
      this.win.changeHeadline(header);
      if (options.closeOtherProgressWindows) {
        BasicTool.getZotero().ProgressWindowSet.closeAll();
      }
    }
    /**
     * Create a new line
     * @param options
     * @param options.type
     * @param options.icon
     * @param options.text
     * @param options.progress
     * @param options.idx
     */
    createLine(options) {
      const icon = this.getIcon(options.type, options.icon);
      const line = new this.win.ItemProgress(icon || "", options.text || "");
      if (typeof options.progress === "number") {
        line.setProgress(options.progress);
      }
      this.lines.push(line);
      this.updateIcons();
      return this;
    }
    /**
     * Change the line content
     * @param options
     * @param options.type
     * @param options.icon
     * @param options.text
     * @param options.progress
     * @param options.idx
     */
    changeLine(options) {
      if (this.lines?.length === 0) {
        return this;
      }
      const idx = typeof options.idx !== "undefined" && options.idx >= 0 && options.idx < this.lines.length ? options.idx : 0;
      const icon = this.getIcon(options.type, options.icon);
      if (icon) {
        this.lines[idx].setItemTypeAndIcon(icon);
      }
      options.text && this.lines[idx].setText(options.text);
      typeof options.progress === "number" && this.lines[idx].setProgress(options.progress);
      this.updateIcons();
      return this;
    }
    show(closeTime = void 0) {
      this.win.show();
      typeof closeTime !== "undefined" && (this.closeTime = closeTime);
      if (this.closeTime && this.closeTime > 0) {
        this.win.startCloseTimer(this.closeTime);
      }
      setTimeout(this.updateIcons.bind(this), 50);
      return this;
    }
    /**
     * Set custom icon uri for progress window
     * @param key
     * @param uri
     */
    static setIconURI(key, uri) {
      icons[key] = uri;
    }
    getIcon(type, defaultIcon) {
      return type && type in icons ? icons[type] : defaultIcon;
    }
    updateIcons() {
      try {
        this.lines.forEach((line) => {
          const box = line._image;
          const icon = box.dataset.itemType;
          if (icon && icon.startsWith("chrome://") && !box.style.backgroundImage.includes("progress_arcs")) {
            box.style.backgroundImage = `url(${box.dataset.itemType})`;
          }
        });
      } catch {
      }
    }
    changeHeadline(text, icon, postText) {
      this.win.changeHeadline(text, icon, postText);
      return this;
    }
    addLines(labels, icons2) {
      this.win.addLines(labels, icons2);
      return this;
    }
    addDescription(text) {
      this.win.addDescription(text);
      return this;
    }
    startCloseTimer(ms, requireMouseOver) {
      this.win.startCloseTimer(ms, requireMouseOver);
      return this;
    }
    close() {
      this.win.close();
      return this;
    }
  };

  // node_modules/zotero-plugin-toolkit/dist/helpers/virtualizedTable.js
  var VirtualizedTableHelper = class extends BasicTool {
    props;
    localeStrings;
    containerId;
    treeInstance;
    window;
    React;
    ReactDOM;
    VirtualizedTable;
    IntlProvider;
    constructor(win) {
      super();
      this.window = win;
      const Zotero2 = this.getGlobal("Zotero");
      const _require = win.require;
      this.React = _require("react");
      this.ReactDOM = _require("react-dom");
      this.VirtualizedTable = _require("components/virtualized-table");
      this.IntlProvider = _require("react-intl").IntlProvider;
      this.props = {
        id: `${Zotero2.Utilities.randomString()}-${(/* @__PURE__ */ new Date()).getTime()}`,
        getRowCount: () => 0
      };
      this.localeStrings = Zotero2.Intl.strings;
    }
    setProp(...args) {
      if (args.length === 1) {
        Object.assign(this.props, args[0]);
      } else if (args.length === 2) {
        this.props[args[0]] = args[1];
      }
      return this;
    }
    /**
     * Set locale strings, which replaces the table header's label if matches. Default it's `Zotero.Intl.strings`
     * @param localeStrings
     */
    setLocale(localeStrings) {
      Object.assign(this.localeStrings, localeStrings);
      return this;
    }
    /**
     * Set container element id that the table will be rendered on.
     * @param id element id
     */
    setContainerId(id) {
      this.containerId = id;
      return this;
    }
    /**
     * Render the table.
     * @param selectId Which row to select after rendering
     * @param onfulfilled callback after successfully rendered
     * @param onrejected callback after rendering with error
     */
    render(selectId, onfulfilled, onrejected) {
      const refreshSelection = () => {
        this.treeInstance.invalidate();
        if (typeof selectId !== "undefined" && selectId >= 0) {
          this.treeInstance.selection.select(selectId);
        } else {
          this.treeInstance.selection.clearSelection();
        }
      };
      if (!this.treeInstance) {
        new Promise((resolve) => {
          const vtableProps = Object.assign({}, this.props, {
            ref: (ref) => {
              this.treeInstance = ref;
              resolve(void 0);
            }
          });
          if (vtableProps.getRowData && !vtableProps.renderItem) {
            Object.assign(vtableProps, {
              renderItem: this.VirtualizedTable.makeRowRenderer(vtableProps.getRowData)
            });
          }
          const elem = this.React.createElement(this.IntlProvider, { locale: Zotero.locale, messages: Zotero.Intl.strings }, this.React.createElement(this.VirtualizedTable, vtableProps));
          const container = this.window.document.getElementById(this.containerId);
          this.ReactDOM.createRoot(container).render(elem);
        }).then(() => {
          this.getGlobal("setTimeout")(() => {
            refreshSelection();
          });
        }).then(onfulfilled, onrejected);
      } else {
        refreshSelection();
      }
      return this;
    }
  };

  // node_modules/zotero-plugin-toolkit/dist/managers/fieldHook.js
  var FieldHookManager = class extends ManagerTool {
    data = {
      getField: {},
      setField: {},
      isFieldOfBase: {}
    };
    patchHelpers = {
      getField: new PatchHelper(),
      setField: new PatchHelper(),
      isFieldOfBase: new PatchHelper()
    };
    constructor(base) {
      super(base);
      const _thisHelper = this;
      for (const type of Object.keys(this.patchHelpers)) {
        const helper = this.patchHelpers[type];
        helper.setData({
          target: this.getGlobal("Zotero").Item.prototype,
          funcSign: type,
          patcher: (original) => function(field, ...args) {
            const originalThis = this;
            const handler = _thisHelper.data[type][field];
            if (typeof handler === "function") {
              try {
                return handler(field, args[0], args[1], originalThis, original);
              } catch (e) {
                return field + String(e);
              }
            }
            return original.apply(originalThis, [field, ...args]);
          },
          enabled: true
        });
      }
    }
    register(type, field, hook) {
      this.data[type][field] = hook;
    }
    unregister(type, field) {
      delete this.data[type][field];
    }
    unregisterAll() {
      this.data.getField = {};
      this.data.setField = {};
      this.data.isFieldOfBase = {};
      this.patchHelpers.getField.disable();
      this.patchHelpers.setField.disable();
      this.patchHelpers.isFieldOfBase.disable();
    }
  };

  // node_modules/zotero-plugin-toolkit/dist/utils/wait.js
  var basicTool = new BasicTool();
  function waitUntil(condition, callback, interval = 100, timeout = 1e4) {
    const start = Date.now();
    const intervalId = basicTool.getGlobal("setInterval")(() => {
      if (condition()) {
        basicTool.getGlobal("clearInterval")(intervalId);
        callback();
      } else if (Date.now() - start > timeout) {
        basicTool.getGlobal("clearInterval")(intervalId);
      }
    }, interval);
  }
  function waitUtilAsync(condition, interval = 100, timeout = 1e4) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const intervalId = basicTool.getGlobal("setInterval")(() => {
        if (condition()) {
          basicTool.getGlobal("clearInterval")(intervalId);
          resolve();
        } else if (Date.now() - start > timeout) {
          basicTool.getGlobal("clearInterval")(intervalId);
          reject(new Error("timeout"));
        }
      }, interval);
    });
  }
  async function waitForReader(reader) {
    await reader._initPromise;
    await reader._lastView.initializedPromise;
    if (reader.type === "pdf")
      await reader._lastView._iframeWindow.PDFViewerApplication.initializedPromise;
  }

  // node_modules/zotero-plugin-toolkit/dist/managers/keyboard.js
  var KeyboardManager = class extends ManagerTool {
    _keyboardCallbacks = /* @__PURE__ */ new Set();
    _cachedKey;
    id;
    constructor(base) {
      super(base);
      this.id = Zotero.Utilities.randomString();
      this._ensureAutoUnregisterAll();
      this.addListenerCallback("onMainWindowLoad", this.initKeyboardListener);
      this.addListenerCallback("onMainWindowUnload", this.unInitKeyboardListener);
      this.initReaderKeyboardListener();
      for (const win of Zotero.getMainWindows()) {
        this.initKeyboardListener(win);
      }
    }
    /**
     * Register a keyboard event listener.
     * @param callback The callback function.
     */
    register(callback) {
      this._keyboardCallbacks.add(callback);
    }
    /**
     * Unregister a keyboard event listener.
     * @param callback The callback function.
     */
    unregister(callback) {
      this._keyboardCallbacks.delete(callback);
    }
    /**
     * Unregister all keyboard event listeners.
     */
    unregisterAll() {
      this._keyboardCallbacks.clear();
      this.removeListenerCallback("onMainWindowLoad", this.initKeyboardListener);
      this.removeListenerCallback("onMainWindowUnload", this.unInitKeyboardListener);
      for (const win of Zotero.getMainWindows()) {
        this.unInitKeyboardListener(win);
      }
    }
    initKeyboardListener = this._initKeyboardListener.bind(this);
    unInitKeyboardListener = this._unInitKeyboardListener.bind(this);
    initReaderKeyboardListener() {
      Zotero.Reader.registerEventListener("renderToolbar", (event) => this.addReaderKeyboardCallback(event), this._basicOptions.api.pluginID);
      Zotero.Reader._readers.forEach((reader) => this.addReaderKeyboardCallback({ reader }));
    }
    async addReaderKeyboardCallback(event) {
      const reader = event.reader;
      const initializedKey = `_ztoolkitKeyboard${this.id}Initialized`;
      await waitForReader(reader);
      if (!reader._iframeWindow) {
        return;
      }
      if (reader._iframeWindow[initializedKey]) {
        return;
      }
      this._initKeyboardListener(reader._iframeWindow);
      waitUntil(() => !Components.utils.isDeadWrapper(reader._internalReader) && reader._internalReader?._primaryView?._iframeWindow, () => this._initKeyboardListener(reader._internalReader._primaryView?._iframeWindow));
      reader._iframeWindow[initializedKey] = true;
    }
    _initKeyboardListener(win) {
      if (!win) {
        return;
      }
      win.addEventListener("keydown", this.triggerKeydown);
      win.addEventListener("keyup", this.triggerKeyup);
    }
    _unInitKeyboardListener(win) {
      if (!win) {
        return;
      }
      win.removeEventListener("keydown", this.triggerKeydown);
      win.removeEventListener("keyup", this.triggerKeyup);
    }
    triggerKeydown = (e) => {
      if (!this._cachedKey) {
        this._cachedKey = new KeyModifier(e);
      } else {
        this._cachedKey.merge(new KeyModifier(e), { allowOverwrite: false });
      }
      this.dispatchCallback(e, {
        type: "keydown"
      });
    };
    triggerKeyup = async (e) => {
      if (!this._cachedKey) {
        return;
      }
      const currentShortcut = new KeyModifier(this._cachedKey);
      this._cachedKey = void 0;
      this.dispatchCallback(e, {
        keyboard: currentShortcut,
        type: "keyup"
      });
    };
    dispatchCallback(...args) {
      this._keyboardCallbacks.forEach((cbk) => cbk(...args));
    }
  };
  var KeyModifier = class {
    accel = false;
    shift = false;
    control = false;
    meta = false;
    alt = false;
    key = "";
    useAccel = false;
    constructor(raw, options) {
      this.useAccel = options?.useAccel || false;
      if (typeof raw === "undefined") {
      } else if (typeof raw === "string") {
        raw = raw || "";
        raw = this.unLocalized(raw);
        this.accel = raw.includes("accel");
        this.shift = raw.includes("shift");
        this.control = raw.includes("control");
        this.meta = raw.includes("meta");
        this.alt = raw.includes("alt");
        this.key = raw.replace(/(accel|shift|control|meta|alt|[ ,\-])/g, "").toLocaleLowerCase();
      } else if (raw instanceof KeyModifier) {
        this.merge(raw, { allowOverwrite: true });
      } else {
        if (options?.useAccel) {
          if (Zotero.isMac) {
            this.accel = raw.metaKey;
          } else {
            this.accel = raw.ctrlKey;
          }
        }
        this.shift = raw.shiftKey;
        this.control = raw.ctrlKey;
        this.meta = raw.metaKey;
        this.alt = raw.altKey;
        if (!["Shift", "Meta", "Ctrl", "Alt", "Control"].includes(raw.key)) {
          this.key = raw.key;
        }
      }
    }
    /**
     * Merge another KeyModifier into this one.
     * @param newMod the new KeyModifier
     * @param options
     * @param options.allowOverwrite
     * @returns KeyModifier
     */
    merge(newMod, options) {
      const allowOverwrite = options?.allowOverwrite || false;
      this.mergeAttribute("accel", newMod.accel, allowOverwrite);
      this.mergeAttribute("shift", newMod.shift, allowOverwrite);
      this.mergeAttribute("control", newMod.control, allowOverwrite);
      this.mergeAttribute("meta", newMod.meta, allowOverwrite);
      this.mergeAttribute("alt", newMod.alt, allowOverwrite);
      this.mergeAttribute("key", newMod.key, allowOverwrite);
      return this;
    }
    /**
     * Check if the current KeyModifier equals to another KeyModifier.
     * @param newMod the new KeyModifier
     * @returns true if equals
     */
    equals(newMod) {
      if (typeof newMod === "string") {
        newMod = new KeyModifier(newMod);
      }
      if (this.shift !== newMod.shift || this.alt !== newMod.alt || this.key.toLowerCase() !== newMod.key.toLowerCase()) {
        return false;
      }
      if (this.accel || newMod.accel) {
        if (Zotero.isMac) {
          if ((this.accel || this.meta) !== (newMod.accel || newMod.meta) || this.control !== newMod.control) {
            return false;
          }
        } else {
          if ((this.accel || this.control) !== (newMod.accel || newMod.control) || this.meta !== newMod.meta) {
            return false;
          }
        }
      } else {
        if (this.control !== newMod.control || this.meta !== newMod.meta) {
          return false;
        }
      }
      return true;
    }
    /**
     * Get the raw string representation of the KeyModifier.
     */
    getRaw() {
      const enabled = [];
      this.accel && enabled.push("accel");
      this.shift && enabled.push("shift");
      this.control && enabled.push("control");
      this.meta && enabled.push("meta");
      this.alt && enabled.push("alt");
      this.key && enabled.push(this.key);
      return enabled.join(",");
    }
    /**
     * Get the localized string representation of the KeyModifier.
     */
    getLocalized() {
      const raw = this.getRaw();
      if (Zotero.isMac) {
        return raw.replaceAll("control", "\u2303").replaceAll("alt", "\u2325").replaceAll("shift", "\u21E7").replaceAll("meta", "\u2318");
      } else {
        return raw.replaceAll("control", "Ctrl").replaceAll("alt", "Alt").replaceAll("shift", "Shift").replaceAll("meta", "Win");
      }
    }
    /**
     * Get the un-localized string representation of the KeyModifier.
     */
    unLocalized(raw) {
      if (Zotero.isMac) {
        return raw.replaceAll("\u2303", "control").replaceAll("\u2325", "alt").replaceAll("\u21E7", "shift").replaceAll("\u2318", "meta");
      } else {
        return raw.replaceAll("Ctrl", "control").replaceAll("Alt", "alt").replaceAll("Shift", "shift").replaceAll("Win", "meta");
      }
    }
    mergeAttribute(attribute, value, allowOverwrite) {
      if (allowOverwrite || !this[attribute]) {
        this[attribute] = value;
      }
    }
  };

  // node_modules/zotero-plugin-toolkit/dist/managers/menu.js
  var MenuManager = class extends ManagerTool {
    ui;
    constructor(base) {
      super(base);
      this.ui = new UITool(this);
    }
    /**
     * Insert an menu item/menu(with popup)/menuseprator into a menupopup
     * @remarks
     * options:
     * ```ts
     * export interface MenuitemOptions {
     *   tag: "menuitem" | "menu" | "menuseparator";
     *   id?: string;
     *   label?: string;
     *   // data url (chrome://xxx.png) or base64 url (data:image/png;base64,xxx)
     *   icon?: string;
     *   class?: string;
     *   styles?: { [key: string]: string };
     *   hidden?: boolean;
     *   disabled?: boolean;
     *   oncommand?: string;
     *   commandListener?: EventListenerOrEventListenerObject;
     *   // Attributes below are used when type === "menu"
     *   popupId?: string;
     *   onpopupshowing?: string;
     *   subElementOptions?: Array<MenuitemOptions>;
     * }
     * ```
     * @param menuPopup
     * @param options
     * @param insertPosition
     * @param anchorElement The menuitem will be put before/after `anchorElement`. If not set, put at start/end of the menupopup.
     * @example
     * Insert menuitem with icon into item menupopup
     * ```ts
     * // base64 or chrome:// url
     * const menuIcon = "chrome://addontemplate/content/icons/favicon@0.5x.png";
     * ztoolkit.Menu.register("item", {
     *   tag: "menuitem",
     *   id: "zotero-itemmenu-addontemplate-test",
     *   label: "Addon Template: Menuitem",
     *   oncommand: "alert('Hello World! Default Menuitem.')",
     *   icon: menuIcon,
     * });
     * ```
     * @example
     * Insert menu into file menupopup
     * ```ts
     * ztoolkit.Menu.register(
     *   "menuFile",
     *   {
     *     tag: "menu",
     *     label: "Addon Template: Menupopup",
     *     subElementOptions: [
     *       {
     *         tag: "menuitem",
     *         label: "Addon Template",
     *         oncommand: "alert('Hello World! Sub Menuitem.')",
     *       },
     *     ],
     *   },
     *   "before",
     *   Zotero.getMainWindow().document.querySelector(
     *     "#zotero-itemmenu-addontemplate-test"
     *   )
     * );
     * ```
     */
    register(menuPopup, options, insertPosition = "after", anchorElement) {
      let popup;
      if (typeof menuPopup === "string") {
        popup = this.getGlobal("document").querySelector(MenuSelector[menuPopup]);
      } else {
        popup = menuPopup;
      }
      if (!popup) {
        return false;
      }
      const doc = popup.ownerDocument;
      const genMenuElement = (menuitemOption) => {
        const elementOption = {
          tag: menuitemOption.tag,
          id: menuitemOption.id,
          namespace: "xul",
          attributes: {
            label: menuitemOption.label || "",
            hidden: Boolean(menuitemOption.hidden),
            disabled: Boolean(menuitemOption.disabled),
            class: menuitemOption.class || "",
            oncommand: menuitemOption.oncommand || ""
          },
          classList: menuitemOption.classList,
          styles: menuitemOption.styles || {},
          listeners: [],
          children: []
        };
        if (menuitemOption.icon) {
          if (!this.getGlobal("Zotero").isMac) {
            if (menuitemOption.tag === "menu") {
              elementOption.attributes.class += " menu-iconic";
            } else {
              elementOption.attributes.class += " menuitem-iconic";
            }
          }
          elementOption.styles["list-style-image"] = `url(${menuitemOption.icon})`;
        }
        if (menuitemOption.commandListener) {
          elementOption.listeners?.push({
            type: "command",
            listener: menuitemOption.commandListener
          });
        }
        if (menuitemOption.tag === "menuitem") {
          elementOption.attributes.type = menuitemOption.type || "";
          elementOption.attributes.checked = menuitemOption.checked || false;
        }
        const menuItem = this.ui.createElement(doc, menuitemOption.tag, elementOption);
        if (menuitemOption.isHidden || menuitemOption.getVisibility) {
          popup?.addEventListener("popupshowing", (ev) => {
            let hidden;
            if (menuitemOption.isHidden) {
              hidden = menuitemOption.isHidden(menuItem, ev);
            } else if (menuitemOption.getVisibility) {
              const visible = menuitemOption.getVisibility(menuItem, ev);
              hidden = typeof visible === "undefined" ? void 0 : !visible;
            }
            if (typeof hidden === "undefined") {
              return;
            }
            if (hidden) {
              menuItem.setAttribute("hidden", "true");
            } else {
              menuItem.removeAttribute("hidden");
            }
          });
        }
        if (menuitemOption.isDisabled) {
          popup?.addEventListener("popupshowing", (ev) => {
            const disabled = menuitemOption.isDisabled(menuItem, ev);
            if (typeof disabled === "undefined") {
              return;
            }
            if (disabled) {
              menuItem.setAttribute("disabled", "true");
            } else {
              menuItem.removeAttribute("disabled");
            }
          });
        }
        if ((menuitemOption.tag === "menuitem" || menuitemOption.tag === "menuseparator") && menuitemOption.onShowing) {
          popup?.addEventListener("popupshowing", (ev) => {
            menuitemOption.onShowing(menuItem, ev);
          });
        }
        if (menuitemOption.tag === "menu") {
          const subPopup = this.ui.createElement(doc, "menupopup", {
            id: menuitemOption.popupId,
            attributes: { onpopupshowing: menuitemOption.onpopupshowing || "" }
          });
          menuitemOption.children?.forEach((childOption) => {
            subPopup.append(genMenuElement(childOption));
          });
          menuItem.append(subPopup);
        }
        return menuItem;
      };
      const topMenuItem = genMenuElement(options);
      if (popup.childElementCount) {
        if (!anchorElement) {
          anchorElement = insertPosition === "after" ? popup.lastElementChild : popup.firstElementChild;
        }
        anchorElement[insertPosition](topMenuItem);
      } else {
        popup.appendChild(topMenuItem);
      }
    }
    unregister(menuId) {
      this.getGlobal("document").querySelector(`#${menuId}`)?.remove();
    }
    unregisterAll() {
      this.ui.unregisterAll();
    }
  };
  var MenuSelector;
  (function(MenuSelector2) {
    MenuSelector2["menuFile"] = "#menu_FilePopup";
    MenuSelector2["menuEdit"] = "#menu_EditPopup";
    MenuSelector2["menuView"] = "#menu_viewPopup";
    MenuSelector2["menuGo"] = "#menu_goPopup";
    MenuSelector2["menuTools"] = "#menu_ToolsPopup";
    MenuSelector2["menuHelp"] = "#menu_HelpPopup";
    MenuSelector2["collection"] = "#zotero-collectionmenu";
    MenuSelector2["item"] = "#zotero-itemmenu";
  })(MenuSelector || (MenuSelector = {}));

  // node_modules/zotero-plugin-toolkit/dist/managers/prompt.js
  var Prompt = class {
    ui;
    base;
    get document() {
      return this.base.getGlobal("document");
    }
    /**
     * Record the last text entered
     */
    lastInputText = "";
    /**
     * Default text
     */
    defaultText = {
      placeholder: "Select a command...",
      empty: "No commands found."
    };
    /**
     * It controls the max line number of commands displayed in `commandsNode`.
     */
    maxLineNum = 12;
    /**
     * It controls the max number of suggestions.
     */
    maxSuggestionNum = 100;
    /**
     * The top-level HTML div node of `Prompt`
     */
    promptNode;
    /**
     * The HTML input node of `Prompt`.
     */
    inputNode;
    /**
     * Save all commands registered by all addons.
     */
    commands = [];
    /**
     * Initialize `Prompt` but do not create UI.
     */
    constructor() {
      this.base = new BasicTool();
      this.ui = new UITool();
      this.initializeUI();
    }
    /**
     * Initialize `Prompt` UI and then bind events on it.
     */
    initializeUI() {
      this.addStyle();
      this.createHTML();
      this.initInputEvents();
      this.registerShortcut();
    }
    createHTML() {
      this.promptNode = this.ui.createElement(this.document, "div", {
        styles: {
          display: "none"
        },
        children: [
          {
            tag: "div",
            styles: {
              position: "fixed",
              left: "0",
              top: "0",
              backgroundColor: "transparent",
              width: "100%",
              height: "100%"
            },
            listeners: [
              {
                type: "click",
                listener: () => {
                  this.promptNode.style.display = "none";
                }
              }
            ]
          }
        ]
      });
      this.promptNode.appendChild(this.ui.createElement(this.document, "div", {
        id: `zotero-plugin-toolkit-prompt`,
        classList: ["prompt-container"],
        children: [
          {
            tag: "div",
            classList: ["input-container"],
            children: [
              {
                tag: "input",
                classList: ["prompt-input"],
                attributes: {
                  type: "text",
                  placeholder: this.defaultText.placeholder
                }
              },
              {
                tag: "div",
                classList: ["cta"]
              }
            ]
          },
          {
            tag: "div",
            classList: ["commands-containers"]
          },
          {
            tag: "div",
            classList: ["instructions"],
            children: [
              {
                tag: "div",
                classList: ["instruction"],
                children: [
                  {
                    tag: "span",
                    classList: ["key"],
                    properties: {
                      innerText: "\u2191\u2193"
                    }
                  },
                  {
                    tag: "span",
                    properties: {
                      innerText: "to navigate"
                    }
                  }
                ]
              },
              {
                tag: "div",
                classList: ["instruction"],
                children: [
                  {
                    tag: "span",
                    classList: ["key"],
                    properties: {
                      innerText: "enter"
                    }
                  },
                  {
                    tag: "span",
                    properties: {
                      innerText: "to trigger"
                    }
                  }
                ]
              },
              {
                tag: "div",
                classList: ["instruction"],
                children: [
                  {
                    tag: "span",
                    classList: ["key"],
                    properties: {
                      innerText: "esc"
                    }
                  },
                  {
                    tag: "span",
                    properties: {
                      innerText: "to exit"
                    }
                  }
                ]
              }
            ]
          }
        ]
      }));
      this.inputNode = this.promptNode.querySelector("input");
      this.document.documentElement.appendChild(this.promptNode);
    }
    /**
     * Show commands in a new `commandsContainer`
     * All other `commandsContainer` is hidden
     * @param commands Command[]
     * @param clear remove all `commandsContainer` if true
     */
    showCommands(commands, clear = false) {
      if (clear) {
        this.promptNode.querySelectorAll(".commands-container").forEach((e) => e.remove());
      }
      this.inputNode.placeholder = this.defaultText.placeholder;
      const commandsContainer = this.createCommandsContainer();
      for (const command of commands) {
        try {
          if (!command.name || command.when && !command.when()) {
            continue;
          }
        } catch {
          continue;
        }
        commandsContainer.appendChild(this.createCommandNode(command));
      }
    }
    /**
     * Create a `commandsContainer` div element, append to `commandsContainer` and hide others.
     * @returns commandsNode
     */
    createCommandsContainer() {
      const commandsContainer = this.ui.createElement(this.document, "div", {
        classList: ["commands-container"]
      });
      this.promptNode.querySelectorAll(".commands-container").forEach((e) => {
        e.style.display = "none";
      });
      this.promptNode.querySelector(".commands-containers").appendChild(commandsContainer);
      return commandsContainer;
    }
    /**
     * Return current displayed `commandsContainer`
     * @returns
     */
    getCommandsContainer() {
      return [
        ...Array.from(this.promptNode.querySelectorAll(".commands-container"))
      ].find((e) => {
        return e.style.display !== "none";
      });
    }
    /**
     * Create a command item for `Prompt` UI.
     * @param command
     * @returns
     */
    createCommandNode(command) {
      const commandNode = this.ui.createElement(this.document, "div", {
        classList: ["command"],
        children: [
          {
            tag: "div",
            classList: ["content"],
            children: [
              {
                tag: "div",
                classList: ["name"],
                children: [
                  {
                    tag: "span",
                    properties: {
                      innerText: command.name
                    }
                  }
                ]
              },
              {
                tag: "div",
                classList: ["aux"],
                children: command.label ? [
                  {
                    tag: "span",
                    classList: ["label"],
                    properties: {
                      innerText: command.label
                    }
                  }
                ] : []
              }
            ]
          }
        ],
        listeners: [
          {
            type: "mousemove",
            listener: () => {
              this.selectItem(commandNode);
            }
          },
          {
            type: "click",
            listener: async () => {
              await this.execCallback(command.callback);
            }
          }
        ]
      });
      commandNode.command = command;
      return commandNode;
    }
    /**
     * Called when `enter` key is pressed.
     */
    trigger() {
      [
        ...Array.from(this.promptNode.querySelectorAll(".commands-container"))
      ].find((e) => e.style.display !== "none").querySelector(".selected").click();
    }
    /**
     * Called when `escape` key is pressed.
     */
    exit() {
      this.inputNode.placeholder = this.defaultText.placeholder;
      if (this.promptNode.querySelectorAll(".commands-containers .commands-container").length >= 2) {
        this.promptNode.querySelector(".commands-container:last-child").remove();
        const commandsContainer = this.promptNode.querySelector(".commands-container:last-child");
        commandsContainer.style.display = "";
        commandsContainer.querySelectorAll(".commands").forEach((e) => e.style.display = "flex");
        this.inputNode.focus();
      } else {
        this.promptNode.style.display = "none";
      }
    }
    async execCallback(callback) {
      if (Array.isArray(callback)) {
        this.showCommands(callback);
      } else {
        await callback(this);
      }
    }
    /**
     * Match suggestions for user's entered text.
     */
    async showSuggestions(inputText) {
      const _w = /[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,\-./:;<=>?@[\]^_`{|}~]/;
      const jw = /\s/;
      const Ww = /[\u0F00-\u0FFF\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF66-\uFF9F]/;
      function Yw(e2, t, n, i) {
        if (e2.length === 0)
          return 0;
        let r = 0;
        r -= Math.max(0, e2.length - 1), r -= i / 10;
        const o = e2[0][0];
        return r -= (e2[e2.length - 1][1] - o + 1 - t) / 100, r -= o / 1e3, r -= n / 1e4;
      }
      function $w(e2, t, n, i) {
        if (e2.length === 0)
          return null;
        for (var r = n.toLowerCase(), o = 0, a = 0, s = [], l = 0; l < e2.length; l++) {
          const c = e2[l];
          const u = r.indexOf(c, a);
          if (u === -1)
            return null;
          const h = n.charAt(u);
          if (u > 0 && !_w.test(h) && !Ww.test(h)) {
            const p = n.charAt(u - 1);
            if (h.toLowerCase() !== h && p.toLowerCase() !== p || h.toUpperCase() !== h && !_w.test(p) && !jw.test(p) && !Ww.test(p))
              if (i) {
                if (u !== a) {
                  a += c.length, l--;
                  continue;
                }
              } else
                o += 1;
          }
          if (s.length === 0)
            s.push([u, u + c.length]);
          else {
            const d = s[s.length - 1];
            d[1] < u ? s.push([u, u + c.length]) : d[1] = u + c.length;
          }
          a = u + c.length;
        }
        return {
          matches: s,
          score: Yw(s, t.length, r.length, o)
        };
      }
      function Gw(e2) {
        for (var t = e2.toLowerCase(), n = [], i = 0, r = 0; r < t.length; r++) {
          const o = t.charAt(r);
          jw.test(o) ? (i !== r && n.push(t.substring(i, r)), i = r + 1) : (_w.test(o) || Ww.test(o)) && (i !== r && n.push(t.substring(i, r)), n.push(o), i = r + 1);
        }
        return i !== t.length && n.push(t.substring(i, t.length)), {
          query: e2,
          tokens: n,
          fuzzy: t.split("")
        };
      }
      function Xw(e2, t) {
        if (e2.query === "")
          return {
            score: 0,
            matches: []
          };
        const n = $w(e2.tokens, e2.query, t, false);
        return n || $w(e2.fuzzy, e2.query, t, true);
      }
      const e = Gw(inputText);
      let container = this.getCommandsContainer();
      if (container.classList.contains("suggestions")) {
        this.exit();
      }
      if (inputText.trim() == "") {
        return true;
      }
      const suggestions = [];
      this.getCommandsContainer().querySelectorAll(".command").forEach((commandNode) => {
        const spanNode = commandNode.querySelector(".name span");
        const spanText = spanNode.innerText;
        const res = Xw(e, spanText);
        if (res) {
          commandNode = this.createCommandNode(commandNode.command);
          let spanHTML = "";
          let i = 0;
          for (let j = 0; j < res.matches.length; j++) {
            const [start, end] = res.matches[j];
            if (start > i) {
              spanHTML += spanText.slice(i, start);
            }
            spanHTML += `<span class="highlight">${spanText.slice(start, end)}</span>`;
            i = end;
          }
          if (i < spanText.length) {
            spanHTML += spanText.slice(i, spanText.length);
          }
          commandNode.querySelector(".name span").innerHTML = spanHTML;
          suggestions.push({ score: res.score, commandNode });
        }
      });
      if (suggestions.length > 0) {
        suggestions.sort((a, b) => b.score - a.score).slice(this.maxSuggestionNum);
        container = this.createCommandsContainer();
        container.classList.add("suggestions");
        suggestions.forEach((suggestion) => {
          container.appendChild(suggestion.commandNode);
        });
        return true;
      } else {
        const anonymousCommand = this.commands.find((c) => !c.name && (!c.when || c.when()));
        if (anonymousCommand) {
          await this.execCallback(anonymousCommand.callback);
        } else {
          this.showTip(this.defaultText.empty);
        }
        return false;
      }
    }
    /**
     * Bind events of pressing `keydown` and `keyup` key.
     */
    initInputEvents() {
      this.promptNode.addEventListener("keydown", (event) => {
        if (["ArrowUp", "ArrowDown"].includes(event.key)) {
          event.preventDefault();
          let selectedIndex;
          const allItems = [
            ...Array.from(this.getCommandsContainer().querySelectorAll(".command"))
          ].filter((e) => e.style.display != "none");
          selectedIndex = allItems.findIndex((e) => e.classList.contains("selected"));
          if (selectedIndex != -1) {
            allItems[selectedIndex].classList.remove("selected");
            selectedIndex += event.key == "ArrowUp" ? -1 : 1;
          } else {
            if (event.key == "ArrowUp") {
              selectedIndex = allItems.length - 1;
            } else {
              selectedIndex = 0;
            }
          }
          if (selectedIndex == -1) {
            selectedIndex = allItems.length - 1;
          } else if (selectedIndex == allItems.length) {
            selectedIndex = 0;
          }
          allItems[selectedIndex].classList.add("selected");
          const commandsContainer = this.getCommandsContainer();
          commandsContainer.scrollTo(0, commandsContainer.querySelector(".selected").offsetTop - commandsContainer.offsetHeight + 7.5);
          allItems[selectedIndex].classList.add("selected");
        }
      });
      this.promptNode.addEventListener("keyup", async (event) => {
        if (event.key == "Enter") {
          this.trigger();
        } else if (event.key == "Escape") {
          if (this.inputNode.value.length > 0) {
            this.inputNode.value = "";
          } else {
            this.exit();
          }
        } else if (["ArrowUp", "ArrowDown"].includes(event.key)) {
          return;
        }
        const currentInputText = this.inputNode.value;
        if (currentInputText == this.lastInputText) {
          return;
        }
        this.lastInputText = currentInputText;
        window.setTimeout(async () => {
          await this.showSuggestions(currentInputText);
        });
      });
    }
    /**
     * Create a commandsContainer and display a text
     */
    showTip(text) {
      const tipNode = this.ui.createElement(this.document, "div", {
        classList: ["tip"],
        properties: {
          innerText: text
        }
      });
      const container = this.createCommandsContainer();
      container.classList.add("suggestions");
      container.appendChild(tipNode);
      return tipNode;
    }
    /**
     * Mark the selected item with class `selected`.
     * @param item HTMLDivElement
     */
    selectItem(item) {
      this.getCommandsContainer().querySelectorAll(".command").forEach((e) => e.classList.remove("selected"));
      item.classList.add("selected");
    }
    addStyle() {
      const style2 = this.ui.createElement(this.document, "style", {
        namespace: "html",
        id: "prompt-style"
      });
      style2.innerText = `
      .prompt-container * {
        box-sizing: border-box;
      }
      .prompt-container {
        ---radius---: 10px;
        position: fixed;
        left: 25%;
        top: 10%;
        width: 50%;
        border-radius: var(---radius---);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        font-size: 18px;
        box-shadow: 0px 1.8px 7.3px rgba(0, 0, 0, 0.071),
                    0px 6.3px 24.7px rgba(0, 0, 0, 0.112),
                    0px 30px 90px rgba(0, 0, 0, 0.2);
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Microsoft YaHei Light", sans-serif;
        background-color: var(--material-background) !important;
        border: var(--material-border-quarternary) !important;
      }
      
      /* input */
      .prompt-container .input-container  {
        width: 100%;
      }

      .input-container input {
        width: -moz-available;
        height: 40px;
        padding: 24px;
        border: none;
        outline: none;
        font-size: 18px;
        margin: 0 !important;
        border-radius: var(---radius---);
        background-color: var(--material-background);
      }
      
      .input-container .cta {
        border-bottom: var(--material-border-quarternary);
        margin: 5px auto;
      }
      
      /* results */
      .commands-containers {
        width: 100%;
        height: 100%;
      }
      .commands-container {
        max-height: calc(${this.maxLineNum} * 35.5px);
        width: calc(100% - 12px);
        margin-left: 12px;
        margin-right: 0%;
        overflow-y: auto;
        overflow-x: hidden;
      }
      
      .commands-container .command {
        display: flex;
        align-content: baseline;
        justify-content: space-between;
        border-radius: 5px;
        padding: 6px 12px;
        margin-right: 12px;
        margin-top: 2px;
        margin-bottom: 2px;
      }
      .commands-container .command .content {
        display: flex;
        width: 100%;
        justify-content: space-between;
        flex-direction: row;
        overflow: hidden;
      }
      .commands-container .command .content .name {
        white-space: nowrap; 
        text-overflow: ellipsis;
        overflow: hidden;
      }
      .commands-container .command .content .aux {
        display: flex;
        align-items: center;
        align-self: center;
        flex-shrink: 0;
      }
      
      .commands-container .command .content .aux .label {
        font-size: 15px;
        color: var(--fill-primary);
        padding: 2px 6px;
        background-color: var(--color-background);
        border-radius: 5px;
      }
      
      .commands-container .selected {
          background-color: var(--material-mix-quinary);
      }

      .commands-container .highlight {
        font-weight: bold;
      }

      .tip {
        color: var(--fill-primary);
        text-align: center;
        padding: 12px 12px;
        font-size: 18px;
      }

      /* instructions */
      .instructions {
        display: flex;
        align-content: center;
        justify-content: center;
        font-size: 15px;
        height: 2.5em;
        width: 100%;
        border-top: var(--material-border-quarternary);
        color: var(--fill-secondary);
        margin-top: 5px;
      }
      
      .instructions .instruction {
        margin: auto .5em;  
      }
      
      .instructions .key {
        margin-right: .2em;
        font-weight: 600;
      }
    `;
      this.document.documentElement.appendChild(style2);
    }
    registerShortcut() {
      this.document.addEventListener("keydown", (event) => {
        if (event.shiftKey && event.key.toLowerCase() == "p") {
          if (event.originalTarget.isContentEditable || "value" in event.originalTarget || this.commands.length == 0) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          if (this.promptNode.style.display == "none") {
            this.promptNode.style.display = "flex";
            if (this.promptNode.querySelectorAll(".commands-container").length == 1) {
              this.showCommands(this.commands, true);
            }
            this.promptNode.focus();
            this.inputNode.focus();
          } else {
            this.promptNode.style.display = "none";
          }
        }
      }, true);
    }
  };
  var PromptManager = class extends ManagerTool {
    prompt;
    /**
     * Save the commands registered from this manager
     */
    commands = [];
    constructor(base) {
      super(base);
      const globalCache = toolkitGlobal_default.getInstance()?.prompt;
      if (!globalCache) {
        throw new Error("Prompt is not initialized.");
      }
      if (!globalCache._ready) {
        globalCache._ready = true;
        globalCache.instance = new Prompt();
      }
      this.prompt = globalCache.instance;
    }
    /**
     * Register commands. Don't forget to call `unregister` on plugin exit.
     * @param commands Command[]
     * @example
     * ```ts
     * let getReader = () => {
     *   return BasicTool.getZotero().Reader.getByTabID(
     *     (Zotero.getMainWindow().Zotero_Tabs).selectedID
     *   )
     * }
     *
     * register([
     *   {
     *     name: "Split Horizontally",
     *     label: "Zotero",
     *     when: () => getReader() as boolean,
     *     callback: (prompt: Prompt) => getReader().menuCmd("splitHorizontally")
     *   },
     *   {
     *     name: "Split Vertically",
     *     label: "Zotero",
     *     when: () => getReader() as boolean,
     *     callback: (prompt: Prompt) => getReader().menuCmd("splitVertically")
     *   }
     * ])
     * ```
     */
    register(commands) {
      commands.forEach((c) => c.id ??= c.name);
      this.prompt.commands = [...this.prompt.commands, ...commands];
      this.commands = [...this.commands, ...commands];
      this.prompt.showCommands(this.commands, true);
    }
    /**
     * You can delete a command registed before by its name.
     * @remarks
     * There is a premise here that the names of all commands registered by a single plugin are not duplicated.
     * @param id Command.name
     */
    unregister(id) {
      this.prompt.commands = this.prompt.commands.filter((c) => c.id != id);
      this.commands = this.commands.filter((c) => c.id != id);
    }
    /**
     * Call `unregisterAll` on plugin exit.
     */
    unregisterAll() {
      this.prompt.commands = this.prompt.commands.filter((c) => {
        return this.commands.every((_c) => _c.id != c.id);
      });
      this.commands = [];
    }
  };

  // node_modules/zotero-plugin-toolkit/dist/tools/extraField.js
  var ExtraFieldTool = class extends BasicTool {
    /**
     * Get all extra fields
     * @param item
     */
    getExtraFields(item, backend = "custom") {
      const extraFiledRaw = item.getField("extra");
      if (backend === "default") {
        return this.getGlobal("Zotero").Utilities.Internal.extractExtraFields(extraFiledRaw).fields;
      } else {
        const map = /* @__PURE__ */ new Map();
        const nonStandardFields = [];
        extraFiledRaw.split("\n").forEach((line) => {
          const split = line.split(": ");
          if (split.length >= 2 && split[0]) {
            map.set(split[0], split.slice(1).join(": "));
          } else {
            nonStandardFields.push(line);
          }
        });
        map.set("__nonStandard__", nonStandardFields.join("\n"));
        return map;
      }
    }
    /**
     * Get extra field value by key. If it does not exists, return undefined.
     * @param item
     * @param key
     */
    getExtraField(item, key) {
      const fields = this.getExtraFields(item);
      return fields.get(key);
    }
    /**
     * Replace extra field of an item.
     * @param item
     * @param fields
     */
    async replaceExtraFields(item, fields) {
      const kvs = [];
      if (fields.has("__nonStandard__")) {
        kvs.push(fields.get("__nonStandard__"));
        fields.delete("__nonStandard__");
      }
      fields.forEach((v, k) => {
        kvs.push(`${k}: ${v}`);
      });
      item.setField("extra", kvs.join("\n"));
      await item.saveTx();
    }
    /**
     * Set an key-value pair to the item's extra field
     * @param item
     * @param key
     * @param value
     */
    async setExtraField(item, key, value) {
      const fields = this.getExtraFields(item);
      if (value === "" || typeof value === "undefined") {
        fields.delete(key);
      } else {
        fields.set(key, value);
      }
      await this.replaceExtraFields(item, fields);
    }
  };

  // node_modules/zotero-plugin-toolkit/dist/tools/reader.js
  var ReaderTool = class extends BasicTool {
    /**
     * Get the selected tab reader.
     * @param waitTime Wait for n MS until the reader is ready
     */
    async getReader(waitTime = 5e3) {
      const Zotero_Tabs2 = this.getGlobal("Zotero_Tabs");
      if (Zotero_Tabs2.selectedType !== "reader") {
        return void 0;
      }
      let reader = Zotero.Reader.getByTabID(Zotero_Tabs2.selectedID);
      let delayCount = 0;
      const checkPeriod = 50;
      while (!reader && delayCount * checkPeriod < waitTime) {
        await Zotero.Promise.delay(checkPeriod);
        reader = Zotero.Reader.getByTabID(Zotero_Tabs2.selectedID);
        delayCount++;
      }
      await reader?._initPromise;
      return reader;
    }
    /**
     * Get all window readers.
     */
    getWindowReader() {
      const Zotero_Tabs2 = this.getGlobal("Zotero_Tabs");
      const windowReaders = [];
      const tabs = Zotero_Tabs2._tabs.map((e) => e.id);
      for (let i = 0; i < Zotero.Reader._readers.length; i++) {
        let flag = false;
        for (let j = 0; j < tabs.length; j++) {
          if (Zotero.Reader._readers[i].tabID === tabs[j]) {
            flag = true;
            break;
          }
        }
        if (!flag) {
          windowReaders.push(Zotero.Reader._readers[i]);
        }
      }
      return windowReaders;
    }
    /**
     * Get Reader tabpanel deck element.
     * @deprecated - use item pane api
     * @alpha
     */
    getReaderTabPanelDeck() {
      const deck = this.getGlobal("window").document.querySelector(".notes-pane-deck")?.previousElementSibling;
      return deck;
    }
    /**
     * Add a reader tabpanel deck selection change observer.
     * @deprecated - use item pane api
     * @alpha
     * @param callback
     */
    async addReaderTabPanelDeckObserver(callback) {
      await waitUtilAsync(() => !!this.getReaderTabPanelDeck());
      const deck = this.getReaderTabPanelDeck();
      const observer = new (this.getGlobal("MutationObserver"))(async (mutations) => {
        mutations.forEach(async (mutation) => {
          const target = mutation.target;
          if (target.classList.contains("zotero-view-tabbox") || target.tagName === "deck") {
            callback();
          }
        });
      });
      observer.observe(deck, {
        attributes: true,
        attributeFilter: ["selectedIndex"],
        subtree: true
      });
      return observer;
    }
    /**
     * Get the selected annotation data.
     * @param reader Target reader
     * @returns The selected annotation data.
     */
    getSelectedAnnotationData(reader) {
      const annotation = (
        // @ts-expect-error _selectionPopup
        reader?._internalReader._lastView._selectionPopup?.annotation
      );
      return annotation;
    }
    /**
     * Get the text selection of reader.
     * @param reader Target reader
     * @returns The text selection of reader.
     */
    getSelectedText(reader) {
      return this.getSelectedAnnotationData(reader)?.text ?? "";
    }
  };

  // node_modules/zotero-plugin-toolkit/dist/ztoolkit.js
  var ZoteroToolkit = class extends BasicTool {
    UI = new UITool(this);
    Reader = new ReaderTool(this);
    ExtraField = new ExtraFieldTool(this);
    FieldHooks = new FieldHookManager(this);
    Keyboard = new KeyboardManager(this);
    Prompt = new PromptManager(this);
    Menu = new MenuManager(this);
    Clipboard = makeHelperTool(ClipboardHelper, this);
    FilePicker = makeHelperTool(FilePickerHelper, this);
    Patch = makeHelperTool(PatchHelper, this);
    ProgressWindow = makeHelperTool(ProgressWindowHelper, this);
    VirtualizedTable = makeHelperTool(VirtualizedTableHelper, this);
    Dialog = makeHelperTool(DialogHelper, this);
    LargePrefObject = makeHelperTool(LargePrefHelper, this);
    Guide = makeHelperTool(GuideHelper, this);
    constructor() {
      super();
    }
    /**
     * Unregister everything created by managers.
     */
    unregisterAll() {
      unregister(this);
    }
  };

  // package.json
  var config = {
    addonName: "Easier Citation",
    addonID: "zoterocitation@polygon.org",
    addonRef: "zoterocitation",
    addonInstance: "ZoteroCitation"
  };

  // src/modules/locale.ts
  function initLocale() {
    const l10n = new (ztoolkit.getGlobal("Localization"))([`${config.addonRef}-addon.ftl`], true);
    addon.data.locale = {
      current: l10n
    };
  }
  function getString(...inputs) {
    if (inputs.length === 1) {
      return _getString(inputs[0]);
    } else if (inputs.length === 2) {
      if (typeof inputs[1] === "string") {
        return _getString(inputs[0], { branch: inputs[1] });
      } else {
        return _getString(inputs[0], inputs[1]);
      }
    } else {
      throw new Error("Invalid arguments");
    }
  }
  function _getString(localString, options = {}) {
    const localStringWithPrefix = `${config.addonRef}-${localString}`;
    const { branch, args } = options;
    const pattern = addon.data.locale?.current.formatMessagesSync([{ id: localStringWithPrefix, args }])[0];
    if (!pattern) {
      return localStringWithPrefix;
    }
    if (branch && pattern.attributes) {
      return pattern.attributes[branch] || localStringWithPrefix;
    } else {
      return pattern.value || localStringWithPrefix;
    }
  }

  // src/modules/citation.ts
  var TEMP_COLLECTION_RELATION = "dc:relation";
  var TEMP_COLLECTION_MARKER = "https://github.com/MuiseDestiny/zotero-citation#temporary-collection";
  var TEMP_COLLECTION_KEYS_PREF = "zotero-citation.temporaryCollectionKeys";
  var TEMP_SEARCH_KEYS_PREF = "zotero-citation.managedSearchKeys";
  var MANAGED_TAG_IDS_PREF = "zotero-citation.managedCitationTagIDs";
  var Citation = class {
    constructor() {
      this.sessions = {};
      Zotero.ZoteroCitation.api.sessions = this.sessions;
      Zotero.ZoteroCitation.api.updateCitations = this.updateCitations.bind(this);
      Zotero.ZoteroCitation.api.refreshSessionCitations = this.refreshSessionCitations.bind(this);
      Zotero.ZoteroCitation.api.getSortedItemIDs = this.getSortedItemIDs.bind(this);
      Zotero.ZoteroCitation.api.syncCitationTags = this.syncCitationTags.bind(this);
      Zotero.ZoteroCitation.api.scheduleCitationTagSync = this.scheduleCitationTagSync.bind(this);
      Zotero.ZoteroCitation.api.getDebugStats = this.getDebugStats.bind(this);
      Zotero.ZoteroCitation.api.resetDebugStats = this.resetDebugStats.bind(this);
      Zotero.ZoteroCitation.api.assertHealth = this.assertHealth.bind(this);
      Zotero.ZoteroCitation.api.getHealthSummary = this.getHealthSummary.bind(this);
      Zotero.ZoteroCitation.api.runHealthCheck = this.runHealthCheck.bind(this);
      Zotero.ZoteroCitation.api.runHealthSummaryCheck = this.runHealthSummaryCheck.bind(this);
      Zotero.ZoteroCitation.api.getPerformanceStats = this.getPerformanceStats.bind(this);
      Zotero.ZoteroCitation.api.resetPerformanceStats = this.resetPerformanceStats.bind(this);
      Zotero.ZoteroCitation.api.runPerformanceCheck = this.runPerformanceCheck.bind(this);
      // Performance helpers
      this._debugEnabled = this._getBoolPref("extensions.zotero.zoterocitation.debug", false);
      try {
        addon.data.citationDebugEnabled = this._debugEnabled;
      } catch (e) {
      }
      this._citationTagName = "/Citations";
      this._lastTagSyncSig = {};
      this._sessionCitedIDs = {};
      this._managedCitationTagIDs = this._loadManagedTagIDs();
      this._temporaryCollectionKeys = this._loadKeySet(TEMP_COLLECTION_KEYS_PREF);
      this._managedSearchKeys = this._loadKeySet(TEMP_SEARCH_KEYS_PREF);
      this._tagSyncInFlightBySession = {};
      this._pendingTagSyncIDsBySession = {};
      this._tagSyncTimerBySession = {};
      this._sessionUpdateQueue = {};
      this._sessionUpdateRevision = {};
      this._emptyReadCountBySession = {};
      this._refreshRetryTimerBySession = {};
      this._missingSessionCountBySession = {};
      this._docIdBySession = {};
      this.activeSessionID = null;
      this._execCommandBindings = new Map();
      this._execCommandSerial = 0;
      this._collectionRenameRetryTimerBySession = {};
      this._collectionRenameRetryCountBySession = {};
      this._tagSyncDebounceMs = 150;
      this._itemsViewRefreshTimer = null;
      this._itemsViewRefreshDebounceMs = 120;
      this._execCommandWaitTimeoutMs = 6000;
      this._execCommandPollIntervalMs = 25;
      this._healthWarnTimeoutCount = 1;
      this._healthErrorTimeoutCount = 3;
      this._healthWindowMs = 300000;
      this._perfSlowThresholdMs = 50;
      this._tagSyncDebounceMs = this._getClampedIntPref("extensions.zotero.zoterocitation.citationTagDebounceMs", this._tagSyncDebounceMs, 0, 2000);
      this._itemsViewRefreshDebounceMs = this._getClampedIntPref("extensions.zotero.zoterocitation.itemsViewRefreshDebounceMs", this._itemsViewRefreshDebounceMs, 0, 2000);
      this._execCommandWaitTimeoutMs = this._getClampedIntPref("extensions.zotero.zoterocitation.execCommandWaitTimeoutMs", this._execCommandWaitTimeoutMs, 500, 30000);
      this._execCommandPollIntervalMs = this._getClampedIntPref("extensions.zotero.zoterocitation.execCommandPollIntervalMs", this._execCommandPollIntervalMs, 5, 1000);
      this._healthWarnTimeoutCount = this._getClampedIntPref("extensions.zotero.zoterocitation.healthWarnTimeoutCount", this._healthWarnTimeoutCount, 0, 1000);
      this._healthErrorTimeoutCount = this._getClampedIntPref("extensions.zotero.zoterocitation.healthErrorTimeoutCount", this._healthErrorTimeoutCount, this._healthWarnTimeoutCount, 1000);
      this._healthWindowMs = this._getClampedIntPref("extensions.zotero.zoterocitation.healthWindowMs", this._healthWindowMs, 10000, 3600000);
      this._perfSlowThresholdMs = this._getClampedIntPref("extensions.zotero.zoterocitation.perfSlowThresholdMs", this._perfSlowThresholdMs, 5, 5000);
      // 修复：将全局缓存改为按 session 隔离，防止缓存污染
      this._sortedCacheBySession = {};
      this._lastRefreshAt = {};
      this._minRefreshInterval = 500; // ms, throttle refreshes per session
      // 缓存清理计时器，防止长期运行时内存泄漏
      this._cacheCleanupTimer = null;
      this._listenerTimer = null;
      this._listenerStopped = false;
      this._onWindowClose = null;
      this._originalExecCommand = null;
      this._execCommandWrapper = null;
      this._isExecCommandHooked = false;
      this._isExecCommandRunning = false;
      this._execCommandDepth = 0;
      this._debugCounters = {
        listenerStarted: 0,
        windowCloseHandlerBound: 0,
        windowCloseHandlerUnbound: 0,
        execHookInstalled: 0,
        execHookRestored: 0,
        execCommandCalls: 0,
        execWaitSessionTimeout: 0,
        execWaitSearchTimeout: 0,
        syncCitationTagsRuns: 0,
        syncCitationTagsTouched: 0,
        syncCitationTagsFailures: 0
      };
      this._healthEvents = {
        execWaitSessionTimeout: [],
        execWaitSearchTimeout: []
      };
      this._perfStats = {
        getSortedItemIDs: { count: 0, totalMs: 0, maxMs: 0, lastMs: 0, slowCount: 0 },
        refreshSessionCitations: { count: 0, totalMs: 0, maxMs: 0, lastMs: 0, slowCount: 0 },
        syncCitationTags: { count: 0, totalMs: 0, maxMs: 0, lastMs: 0, slowCount: 0 }
      };
      this.debugLog = (...args) => {
        if (this._debugEnabled)
          ztoolkit.log(...args);
      };
      // 优化：启动定期缓存清理（每分钟清理一次过期缓存）
      this._cacheCleanupTimer = window.setInterval(() => {
        try {
          const now = Date.now();
          const maxCacheAge = 5 * 60 * 1000;
          for (const sessionID in this._lastRefreshAt) {
            if (now - this._lastRefreshAt[sessionID] > maxCacheAge) {
              delete this._lastRefreshAt[sessionID];
            }
          }
        } catch (e) {
        }
      }, 60000);
    }
    /**
     * Remove artifacts that V30 or the older collection-based implementation
     * explicitly marked as plugin-owned. Unknown user searches are never
     * deleted automatically.
     */
    _loadKeySet(prefKey) {
      try {
        let raw = Zotero.Prefs.get(prefKey);
        if (!raw) {
          const legacyRaw = Zotero.Prefs.get(prefKey, true);
          if (legacyRaw) {
            raw = legacyRaw;
            Zotero.Prefs.set(prefKey, legacyRaw);
          }
        }
        const values = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(values) ? values.filter((value) => typeof value === "string" && value) : []);
      } catch {
        return new Set();
      }
    }
    _saveKeySet(prefKey, values) {
      try {
        Zotero.Prefs.set(prefKey, JSON.stringify([...values]));
      } catch (error) {
        this.logError(`Failed to save preference ${prefKey}`, error);
      }
    }
    _loadManagedTagIDs() {
      const keys = this._loadKeySet(MANAGED_TAG_IDS_PREF);
      return Object.fromEntries([...keys].map((key) => [key, true]));
    }
    _saveManagedTagIDs() {
      this._saveKeySet(MANAGED_TAG_IDS_PREF, new Set(Object.keys(this._managedCitationTagIDs)));
    }
    async clearStaleArtifacts() {
      const libraryID = Zotero.Libraries.userLibraryID;
      const collections = Zotero.Collections.getByLibrary(libraryID, true, true);
      const collectionsByKey = new Map(collections.map((collection) => [collection.key, collection]));
      const removedKeys = new Set();
      const remainingKeys = new Set();
      for (const key of this._temporaryCollectionKeys) {
        const collection = collectionsByKey.get(key);
        if (!collection) {
          continue;
        }
        try {
          await collection.eraseTx();
          removedKeys.add(key);
        } catch (error) {
          remainingKeys.add(key);
          this.logError("Failed to remove a stale citation collection", error);
        }
      }
      for (const collection of collections) {
        if (removedKeys.has(collection.key)) {
          continue;
        }
        try {
          await collection.loadDataType("relations");
          if (collection.getRelationsByPredicate(TEMP_COLLECTION_RELATION).includes(TEMP_COLLECTION_MARKER)) {
            await collection.eraseTx();
          }
        } catch (error) {
          this.logError("Failed to remove a stale citation collection", error);
        }
      }
      this._temporaryCollectionKeys = remainingKeys;
      this._saveKeySet(TEMP_COLLECTION_KEYS_PREF, this._temporaryCollectionKeys);
      const searchesByKey = new Map(Zotero.Searches.getByLibrary(libraryID).map((search) => [search.key, search]));
      for (const key of [...this._managedSearchKeys]) {
        const search = searchesByKey.get(key);
        if (!search) {
          this._managedSearchKeys.delete(key);
          continue;
        }
        try {
          await search.eraseTx();
          this._managedSearchKeys.delete(key);
        } catch (error) {
          this.logError("Failed to remove a legacy citation search", error);
        }
      }
      this._saveKeySet(TEMP_SEARCH_KEYS_PREF, this._managedSearchKeys);
    }
    _bumpDebugCounter(key, delta = 1) {
      if (!this._debugEnabled) {
        return;
      }
      if (!(key in this._debugCounters)) {
        this._debugCounters[key] = 0;
      }
      this._debugCounters[key] += delta;
    }
    _recordHealthEvent(key) {
      if (!(key in this._healthEvents)) {
        return;
      }
      const queue = this._healthEvents[key];
      queue.push(Date.now());
      if (queue.length > 2000) {
        queue.splice(0, queue.length - 2000);
      }
    }
    _recordPerf(name, durationMs) {
      const metric = this._perfStats[name];
      if (!metric || !Number.isFinite(durationMs) || durationMs < 0) {
        return;
      }
      metric.count += 1;
      metric.totalMs += durationMs;
      metric.lastMs = durationMs;
      if (durationMs > metric.maxMs) {
        metric.maxMs = durationMs;
      }
      if (durationMs >= this._perfSlowThresholdMs) {
        metric.slowCount += 1;
      }
    }
    _countRecentHealthEvents(key) {
      if (!(key in this._healthEvents)) {
        return 0;
      }
      const cutoff = Date.now() - this._healthWindowMs;
      const queue = this._healthEvents[key];
      while (queue.length > 0 && queue[0] < cutoff) {
        queue.shift();
      }
      return queue.length;
    }
    getDebugStats() {
      const recentExecWaitSessionTimeout = this._countRecentHealthEvents("execWaitSessionTimeout");
      const recentExecWaitSearchTimeout = this._countRecentHealthEvents("execWaitSearchTimeout");
      return {
        counters: { ...this._debugCounters },
        recent: {
          execWaitSessionTimeout: recentExecWaitSessionTimeout,
          execWaitSearchTimeout: recentExecWaitSearchTimeout
        },
        states: {
          debugEnabled: this._debugEnabled,
          listenerStopped: this._listenerStopped,
          isExecCommandHooked: this._isExecCommandHooked,
          isExecCommandRunning: this._isExecCommandRunning,
          activeSessionCount: Object.keys(this.sessions || {}).length
        },
        config: {
          tagSyncDebounceMs: this._tagSyncDebounceMs,
          itemsViewRefreshDebounceMs: this._itemsViewRefreshDebounceMs,
          execCommandWaitTimeoutMs: this._execCommandWaitTimeoutMs,
          execCommandPollIntervalMs: this._execCommandPollIntervalMs,
          healthWarnTimeoutCount: this._healthWarnTimeoutCount,
          healthErrorTimeoutCount: this._healthErrorTimeoutCount,
          healthWindowMs: this._healthWindowMs
        }
      };
    }
    resetDebugStats() {
      for (const key in this._debugCounters) {
        this._debugCounters[key] = 0;
      }
      for (const key in this._healthEvents) {
        this._healthEvents[key] = [];
      }
      this.debugLog("[Citation debug] counters reset");
      return this.getDebugStats();
    }
    assertHealth() {
      const stats = this.getDebugStats();
      const issues = [];
      const warnings = [];
      const counters = stats.counters;
      const states = stats.states;
      const recent = stats.recent;
      const config = stats.config;
      if (counters.execHookInstalled !== counters.execHookRestored && states.listenerStopped) {
        issues.push("execCommand hook install/restore count mismatch after listener stopped");
      }
      if (counters.windowCloseHandlerBound !== counters.windowCloseHandlerUnbound && states.listenerStopped) {
        issues.push("window close handler bind/unbind count mismatch after listener stopped");
      }
      if (recent.execWaitSessionTimeout >= config.healthErrorTimeoutCount) {
        issues.push(`execCommand session wait timeout count in health window >= error threshold (${recent.execWaitSessionTimeout} >= ${config.healthErrorTimeoutCount})`);
      } else if (recent.execWaitSessionTimeout >= config.healthWarnTimeoutCount) {
        warnings.push(`execCommand session wait timeout count in health window >= warn threshold (${recent.execWaitSessionTimeout} >= ${config.healthWarnTimeoutCount})`);
      }
      if (recent.execWaitSearchTimeout >= config.healthErrorTimeoutCount) {
        issues.push(`execCommand search wait timeout count in health window >= error threshold (${recent.execWaitSearchTimeout} >= ${config.healthErrorTimeoutCount})`);
      } else if (recent.execWaitSearchTimeout >= config.healthWarnTimeoutCount) {
        warnings.push(`execCommand search wait timeout count in health window >= warn threshold (${recent.execWaitSearchTimeout} >= ${config.healthWarnTimeoutCount})`);
      }
      if (!states.listenerStopped && !states.isExecCommandHooked) {
        issues.push("listener running but execCommand hook is not active");
      }
      const status = issues.length > 0 ? "error" : warnings.length > 0 ? "warn" : "ok";
      return {
        status,
        issues: [...issues, ...warnings],
        errors: issues,
        warnings,
        stats
      };
    }
    getHealthSummary() {
      const health = this.assertHealth();
      const { stats, status, errors, warnings } = health;
      const counters = stats?.counters || {};
      const recent = stats?.recent || {};
      const states = stats?.states || {};
      return {
        status,
        checkedAt: Date.now(),
        keySignals: {
          listenerStopped: !!states.listenerStopped,
          isExecCommandHooked: !!states.isExecCommandHooked,
          isExecCommandRunning: !!states.isExecCommandRunning,
          activeSessionCount: Number(states.activeSessionCount || 0),
          recentExecWaitSessionTimeout: Number(recent.execWaitSessionTimeout || 0),
          recentExecWaitSearchTimeout: Number(recent.execWaitSearchTimeout || 0),
          syncCitationTagsFailures: Number(counters.syncCitationTagsFailures || 0)
        },
        headline: {
          errors: errors.length,
          warnings: warnings.length,
          lastOps: {
            syncCitationTagsRuns: Number(counters.syncCitationTagsRuns || 0),
            syncCitationTagsTouched: Number(counters.syncCitationTagsTouched || 0)
          }
        }
      };
    }
    async runHealthSummaryCheck(options = {}) {
      const {
        reset = false,
        waitMs = 0
      } = options || {};
      if (reset) {
        this.resetDebugStats();
      }
      const safeWaitMs = Number.isFinite(Number(waitMs))
        ? Math.max(0, Math.min(600000, Math.trunc(Number(waitMs))))
        : 0;
      if (safeWaitMs > 0) {
        await Zotero.Promise.delay(safeWaitMs);
      }
      return {
        ...this.getHealthSummary(),
        meta: {
          resetPerformed: !!reset,
          waitedMs: safeWaitMs
        }
      };
    }
    async runHealthCheck(options = {}) {
      const {
        reset = true,
        waitMs = 0
      } = options || {};
      if (reset) {
        this.resetDebugStats();
      }
      const safeWaitMs = Number.isFinite(Number(waitMs))
        ? Math.max(0, Math.min(600000, Math.trunc(Number(waitMs))))
        : 0;
      if (safeWaitMs > 0) {
        await Zotero.Promise.delay(safeWaitMs);
      }
      const result = this.assertHealth();
      return {
        ...result,
        meta: {
          resetPerformed: !!reset,
          waitedMs: safeWaitMs,
          checkedAt: Date.now()
        }
      };
    }
    getPerformanceStats() {
      const result = {};
      for (const key in this._perfStats) {
        const metric = this._perfStats[key];
        result[key] = {
          ...metric,
          avgMs: metric.count > 0 ? metric.totalMs / metric.count : 0
        };
      }
      return {
        metrics: result,
        config: {
          perfSlowThresholdMs: this._perfSlowThresholdMs
        },
        checkedAt: Date.now()
      };
    }
    resetPerformanceStats() {
      for (const key in this._perfStats) {
        this._perfStats[key] = { count: 0, totalMs: 0, maxMs: 0, lastMs: 0, slowCount: 0 };
      }
      return this.getPerformanceStats();
    }
    async runPerformanceCheck(options = {}) {
      const {
        reset = false,
        waitMs = 0
      } = options || {};
      if (reset) {
        this.resetPerformanceStats();
      }
      const safeWaitMs = Number.isFinite(Number(waitMs))
        ? Math.max(0, Math.min(600000, Math.trunc(Number(waitMs))))
        : 0;
      if (safeWaitMs > 0) {
        await Zotero.Promise.delay(safeWaitMs);
      }
      return {
        ...this.getPerformanceStats(),
        meta: {
          resetPerformed: !!reset,
          waitedMs: safeWaitMs
        }
      };
    }
    _getBoolPref(key, fallback) {
      try {
        return !!Zotero.Prefs.get(key, true);
      } catch (e) {
        return fallback;
      }
    }
    _getClampedIntPref(key, fallback, min, max) {
      try {
        const value = Number(Zotero.Prefs.get(key, true));
        if (!Number.isFinite(value)) {
          return fallback;
        }
        return Math.max(min, Math.min(max, Math.trunc(value)));
      } catch (e) {
        return fallback;
      }
    }
    _sanitizeFolderName(rawName) {
      const fallback = "Untitled Document";
      const raw = typeof rawName === "string" ? rawName : String(rawName || "");
      const noControlChars = raw.replace(/[\u0000-\u001F\u007F]/g, " ");
      const normalized = noControlChars.replace(/\s+/g, " ").trim();
      const maxLength = 200;
      return (normalized || fallback).slice(0, maxLength);
    }
    _getDocumentDisplayName(docId) {
      let raw = typeof docId === "string" ? docId.trim() : String(docId || "").trim();
      if (!raw || raw === "__doc__") {
        return "";
      }
      raw = raw.replace(/^(["'])(.*)\1$/, "$2").trim();
      const isURL = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
      const withoutQuery = isURL ? raw.replace(/[?#].*$/, "") : raw;
      // A trailing separator identifies an application/directory path rather
      // than a document. This also ignores the macOS Word.app placeholder.
      if (!withoutQuery || /[\\\/]$/.test(withoutQuery)) {
        return "";
      }
      let decoded = withoutQuery;
      try {
        decoded = decodeURIComponent(withoutQuery);
      } catch {
      }
      const normalizedPath = decoded.replace(/\\/g, "/");
      const candidate = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
      if (!candidate || candidate === "." || candidate === ".." || /^[a-z][a-z0-9+.-]*:$/i.test(candidate)) {
        return "";
      }
      try {
        return this._sanitizeFolderName(candidate.normalize("NFC"));
      } catch {
        return this._sanitizeFolderName(candidate);
      }
    }
    _setActiveSessionID(sessionID) {
      const normalized = typeof sessionID === "string" && sessionID ? sessionID : null;
      this.activeSessionID = normalized;
      try {
        if (Zotero.ZoteroCitation?.api) {
          Zotero.ZoteroCitation.api.activeSessionID = normalized;
        }
      } catch (e) {
      }
    }
    _rememberSessionDocument(sessionID, docId) {
      if (typeof sessionID !== "string" || !sessionID || !docId) {
        return;
      }
      if (this._docIdBySession[sessionID] && this._docIdBySession[sessionID] !== docId) {
        this._clearCollectionRenameRetry(sessionID);
      }
      this._docIdBySession[sessionID] = docId;
      const session = this.sessions?.[sessionID];
      if (session) {
        session.docId = docId;
      }
    }
    _clearCollectionRenameRetry(sessionID) {
      const timer = this._collectionRenameRetryTimerBySession?.[sessionID];
      if (timer) {
        window.clearTimeout(timer);
        delete this._collectionRenameRetryTimerBySession[sessionID];
      }
      if (this._collectionRenameRetryCountBySession) {
        delete this._collectionRenameRetryCountBySession[sessionID];
      }
    }
    _scheduleCollectionRenameRetry(sessionID, targetName, docId = this._docIdBySession?.[sessionID]) {
      if (this._listenerStopped || !sessionID || !targetName || this._collectionRenameRetryTimerBySession?.[sessionID]) {
        return;
      }
      const attempt = (this._collectionRenameRetryCountBySession[sessionID] || 0) + 1;
      if (attempt > 2) {
        this.debugLog("[Citation execCommand] collection rename retries exhausted", sessionID);
        return;
      }
      this._collectionRenameRetryCountBySession[sessionID] = attempt;
      this._collectionRenameRetryTimerBySession[sessionID] = window.setTimeout(() => {
        delete this._collectionRenameRetryTimerBySession[sessionID];
        const session = this.sessions?.[sessionID];
        if (this._listenerStopped || !session?.collection
          || (docId && this._docIdBySession?.[sessionID] !== docId)) {
          return;
        }
        this._renameCollection(sessionID, targetName, docId).catch((error) => {
          this.logError(`Failed to retry Word citation collection rename for ${sessionID}`, error);
          this._scheduleCollectionRenameRetry(sessionID, targetName, docId);
        });
      }, 100 * attempt);
    }
    async _renameCollection(sessionID, targetName, docId) {
      const session = this.sessions?.[sessionID];
      if (!session) return;
      const task = (session._renameTask || Promise.resolve()).catch(() => {}).then(async () => {
        if (this._listenerStopped || session.closing || this.sessions?.[sessionID] !== session
          || (docId && this._docIdBySession[sessionID] !== docId) || !session.collection) return;
        const previousName = session.collection.name;
        if (previousName === targetName) return;
        session.collection.name = targetName;
        try {
          await session.collection.saveTx({ skipSelect: true });
          session.lastName = targetName;
        } catch (error) {
          session.collection.name = previousName;
          throw error;
        }
      });
      session._renameTask = task;
      try { await task; } finally { if (session._renameTask === task) session._renameTask = null; }
    }
    _normalizeSearchConditions(rawConditions) {
      if (Array.isArray(rawConditions)) {
        return rawConditions.filter(Boolean);
      }
      if (!rawConditions || typeof rawConditions !== "object") {
        return [];
      }
      return Object.keys(rawConditions).sort((a, b) => Number(a) - Number(b)).map((key) => rawConditions[key]).filter(Boolean);
    }
    /**
     * 监听session状态以生成搜索目录
     */
    async listener(t) {
      try {
        await this.clearStaleArtifacts();
      } catch (error) {
        // Cleanup is best-effort and must not prevent the citation column or
        // Word integration from starting when a library object is unavailable.
        this.logError("Failed to clear stale citation artifacts", error);
      }
      if (this._listenerStopped) return;
      this._bumpDebugCounter("listenerStarted");
      this.debugLog("[Citation debug] listener started", this._debugCounters);
      if (this._listenerTimer) {
        window.clearTimeout(this._listenerTimer);
        this._listenerTimer = null;
      }
      const tick = async () => {
        if (this._listenerStopped) {
          return;
        }
        try {
          if (!Zotero.ZoteroCitation) {
            void this.clear().catch((error) => this.logError("Failed to clear after plugin instance removal", error));
            return;
          }
          if (this._isExecCommandRunning) {
            return;
          }
          const sessions = Zotero.Integration.sessions || {};
          const _sessions2 = this.sessions;
          for (const sessionID in _sessions2) {
            if (!(sessionID in sessions)) {
              const missingCount = (this._missingSessionCountBySession[sessionID] || 0) + 1;
              this._missingSessionCountBySession[sessionID] = missingCount;
              if (missingCount >= 3) {
                this.debugLog("[Citation] Session absent for three checks, cleaning up:", sessionID);
                await this.clearSession(sessionID);
              }
            } else {
              delete this._missingSessionCountBySession[sessionID];
            }
          }
          for (const sessionID in sessions) {
            const session = sessions[sessionID];
            let _session;
            const agentName = String(session?.agent || "");
            if (!/(WinWord|MacWord|Word)/i.test(agentName)) {
              continue;
            }
            if (sessionID in _sessions2) {
              _session = _sessions2[sessionID];
            } else {
              _sessions2[sessionID] = _session = {
                collection: void 0,
                idData: {},
                lastName: sessionID,
                docId: this._docIdBySession[sessionID],
                pending: true
              };
              this.debugLog("[Citation] New session detected, initializing...", sessionID);
              try {
                await this.initCollection(sessionID, _session);
              } catch (error) {
                delete _sessions2[sessionID];
                this.logError(`Failed to create Word citation collection for ${sessionID}`, error);
                continue;
              } finally {
                _session.pending = false;
              }
              this.debugLog("[Citation] Initial refresh to populate citation numbers");
              await this.refreshSessionCitations(sessionID, session);
            }
            if (_session.pending == true || !_session.collection) {
              continue;
            }
            await this.refreshSessionCitations(sessionID, session);
          }
        } catch (e) {
          ztoolkit.log("[Citation listener] UNHANDLED ERROR:", e);
        } finally {
          if (!this._listenerStopped) {
            this._listenerTimer = window.setTimeout(tick, t);
          }
        }
      };
      this._listenerTimer = window.setTimeout(tick, t);
      if (this._onWindowClose) {
        window.removeEventListener("close", this._onWindowClose);
        this._bumpDebugCounter("windowCloseHandlerUnbound");
      }
      this._onWindowClose = (event) => {
        event.preventDefault();
        void this.clear().catch((error) => this.logError("Failed to clear citation state before window close", error)).finally(() => {
          window.setTimeout(() => window.close());
        });
      };
      window.addEventListener("close", this._onWindowClose);
      this._bumpDebugCounter("windowCloseHandlerBound");
      if (!this._isExecCommandHooked) {
        this._originalExecCommand = Zotero.Integration.execCommand;
        if (typeof this._originalExecCommand !== "function") {
          this.logError("Word integration command API is unavailable");
          return;
        }
        this._isExecCommandHooked = true;
        this._bumpDebugCounter("execHookInstalled");
        const citationModule = this;
        // Keep immutable originals: another add-on may retain our wrapper after
        // shutdown. Such wrappers must remain transparent, callable links.
        const originalExecCommand = this._originalExecCommand;
        const originalGetSession = Zotero.Integration.getSession;
        if (typeof originalGetSession === "function") {
          const getSessionWrapper = async function(app, doc, agent, command) {
            const candidates = [...citationModule._execCommandBindings.values()]
              .filter((binding) => binding.agent === agent && binding.command === command);
            const binding = candidates.length === 1 ? candidates[0] : null;
            const result = await originalGetSession.apply(this, arguments);
            if (!citationModule._listenerStopped && binding && !binding.ambiguous
              && citationModule._execCommandBindings.get(binding.bindingID) === binding) {
              const sessionID = result?.[0]?.sessionID;
              if (typeof sessionID === "string" && sessionID) binding.sessionID = sessionID;
            }
            return result;
          };
          this._originalGetSession = originalGetSession;
          this._getSessionWrapper = getSessionWrapper;
          Zotero.Integration.getSession = getSessionWrapper;
        }
        const execCommandWrapper = async function(agent, command, docId) {
          if (citationModule._listenerStopped || !/(WinWord|MacWord|Word)/i.test(String(agent || ""))) {
            return originalExecCommand.apply(this, arguments);
          }
          citationModule._bumpDebugCounter("execCommandCalls");
          citationModule.debugLog("[Citation execCommand]", agent, command, docId);
          const integration = Zotero.Integration;
          const sessionsBefore = new Set(Object.keys(integration?.sessions || {}));
          const currentBefore = integration?.currentSession;
          const boundBefore = typeof currentBefore?.sessionID === "string" ? currentBefore.sessionID : null;
          const bindingID = ++citationModule._execCommandSerial;
          const binding = { bindingID, sessionID: null, docId, sessionsBefore, agent, command, ambiguous: false };
          for (const pending of citationModule._execCommandBindings.values()) {
            pending.ambiguous = binding.ambiguous = true;
          }
          citationModule._execCommandBindings.set(bindingID, binding);
          citationModule._execCommandDepth += 1;
          citationModule._isExecCommandRunning = true;
          let result;
          try {
            result = await originalExecCommand.apply(this, arguments);
          } catch (error) {
            citationModule._execCommandBindings.delete(bindingID);
            throw error;
          } finally {
            citationModule._execCommandDepth = Math.max(0, citationModule._execCommandDepth - 1);
            citationModule._isExecCommandRunning = citationModule._execCommandDepth > 0;
          }
          try {
            if (citationModule._listenerStopped || binding.ambiguous) return result;
            // Older integrations without getSession can only be resolved when
            // the command demonstrably changed the current session.
            if (!binding.sessionID && typeof originalGetSession !== "function") {
              const currentAfter = integration?.currentSession;
              const currentAfterID = typeof currentAfter?.sessionID === "string" ? currentAfter.sessionID : null;
              const sessionsAfter = Object.keys(integration?.sessions || {});
              const pendingBindings = [...citationModule._execCommandBindings.values()]
                .filter((candidate) => candidate.bindingID !== bindingID);
              if (currentAfterID && currentAfterID !== boundBefore && pendingBindings.length === 0
                && sessionsAfter.includes(currentAfterID)) {
                binding.sessionID = currentAfterID;
              }
            }
            const sessionID = binding.sessionID;
            if (!sessionID) {
              citationModule.debugLog("[Citation execCommand] session binding unavailable; skipping collection rename");
              return result;
            }
            // The macOS integration uses the Word.app bundle path as a
            // placeholder when the active document is requested. Never keep
            // that application path as a document target; clear stale target
            // state because this command identifies no document.
            const targetName = citationModule._getDocumentDisplayName(docId);
            if (targetName) {
              citationModule._rememberSessionDocument(sessionID, docId);
            } else if (docId) {
              citationModule._clearCollectionRenameRetry(sessionID);
              delete citationModule._docIdBySession[sessionID];
              if (citationModule.sessions?.[sessionID]) {
                delete citationModule.sessions[sessionID].docId;
              }
              delete addon.data.docId;
            }
            citationModule._setActiveSessionID(sessionID);
            if (targetName) addon.data.docId = docId;
            const startedAt = Date.now();
            let _session;
            while (!((_session = citationModule.sessions[sessionID]) && _session.collection)) {
              if (citationModule._listenerStopped || binding.ambiguous) return result;
              if (Date.now() - startedAt > citationModule._execCommandWaitTimeoutMs) {
                citationModule._bumpDebugCounter("execWaitSearchTimeout");
                citationModule._recordHealthEvent("execWaitSearchTimeout");
                citationModule.debugLog("[Citation execCommand] session collection wait timed out", sessionID);
                return result;
              }
              await Zotero.Promise.delay(citationModule._execCommandPollIntervalMs);
            }
            if (targetName && _session.collection.name !== targetName) {
              const previousName = _session.collection.name;
              citationModule.debugLog("[Citation execCommand] collection rename", previousName, "->", targetName);
              try {
                await citationModule._renameCollection(sessionID, targetName, docId);
              } catch (error) {
                citationModule.logError(`Failed to rename Word citation collection for ${sessionID}`, error);
                citationModule._scheduleCollectionRenameRetry(sessionID, targetName, docId);
              }
            }
          } catch (error) {
            citationModule.logError("Post-command citation refresh failed", error);
          } finally {
            citationModule._execCommandBindings.delete(bindingID);
          }
          return result;
        };
        this._execCommandWrapper = execCommandWrapper;
        Zotero.Integration.execCommand = execCommandWrapper;
      }
    }
    // 修复：按 session 隔离的前缀方法
    _getSortedCacheKey(sessionID) {
      return `cache_${sessionID}`;
    }
    
    _getSortedCache(sessionID) {
      if (!this._sortedCacheBySession || typeof this._sortedCacheBySession !== "object") {
        return void 0;
      }
      const key = this._getSortedCacheKey(sessionID);
      const cache = this._sortedCacheBySession[key];
      if (!cache || typeof cache.sig !== "string" || !Array.isArray(cache.result)
        || cache.result.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
        return void 0;
      }
      return cache;
    }
    
    _setSortedCache(sessionID, sig, result) {
      if (!this._sortedCacheBySession || typeof this._sortedCacheBySession !== "object") {
        this._sortedCacheBySession = {};
      }
      const key = this._getSortedCacheKey(sessionID);
      this._sortedCacheBySession[key] = { sig, result: [...result] };
    }
    cleanupSessionState(sessionID, removeSession = true) {
      this._clearCollectionRenameRetry(sessionID);
      if (removeSession && this.sessions) {
        delete this.sessions[sessionID];
      }
      delete this._docIdBySession[sessionID];
      if (this.activeSessionID === sessionID) {
        this._setActiveSessionID(null);
      }
      delete this._lastRefreshAt[sessionID];
      delete this._lastTagSyncSig[sessionID];
      delete this._sessionCitedIDs[sessionID];
      delete this._tagSyncInFlightBySession[sessionID];
      delete this._pendingTagSyncIDsBySession[sessionID];
      delete this._emptyReadCountBySession[sessionID];
      delete this._missingSessionCountBySession[sessionID];
      this._sessionUpdateRevision[sessionID] = (this._sessionUpdateRevision[sessionID] || 0) + 1;
      delete this._sessionUpdateQueue[sessionID];
      if (this._refreshRetryTimerBySession[sessionID]) {
        window.clearTimeout(this._refreshRetryTimerBySession[sessionID]);
        delete this._refreshRetryTimerBySession[sessionID];
      }
      if (this._tagSyncTimerBySession[sessionID]) {
        window.clearTimeout(this._tagSyncTimerBySession[sessionID]);
        delete this._tagSyncTimerBySession[sessionID];
      }
      const cacheKey = this._getSortedCacheKey(sessionID);
      delete this._sortedCacheBySession[cacheKey];
    }
    _scheduleSessionRefresh(sessionID, targetSession, delayMs = 180) {
      if (this._listenerStopped || this._refreshRetryTimerBySession[sessionID]) {
        return;
      }
      this._refreshRetryTimerBySession[sessionID] = window.setTimeout(() => {
        delete this._refreshRetryTimerBySession[sessionID];
        if (this._listenerStopped || !this.sessions?.[sessionID]) {
          return;
        }
        void this.refreshSessionCitations(sessionID, targetSession).catch((error) => this.logError("Failed to retry citation refresh", error));
      }, Math.max(50, delayMs));
    }
    async clearSession(sessionID, skipTagCleanup = false) {
      const session = this.sessions?.[sessionID];
      if (!session) {
        return;
      }
      session.closing = true;
      this._sessionUpdateRevision[sessionID] = (this._sessionUpdateRevision[sessionID] || 0) + 1;
      await Promise.allSettled([session._renameTask, this._sessionUpdateQueue[sessionID]].filter(Boolean));
      if (this._tagSyncTimerBySession[sessionID]) {
        window.clearTimeout(this._tagSyncTimerBySession[sessionID]);
        delete this._tagSyncTimerBySession[sessionID];
      }
      delete this._pendingTagSyncIDsBySession[sessionID];
      delete this._sessionCitedIDs[sessionID];
      if (!skipTagCleanup) {
        const tagTask = this._tagSyncInFlightBySession[sessionID];
        if (tagTask && typeof tagTask.then === "function") {
          await Promise.allSettled([tagTask]);
        }
        try {
          await this.syncCitationTags(sessionID, []);
        } catch (error) {
          this.logError(`Failed to update citation tags while closing ${sessionID}`, error);
        }
      }
      this.cleanupSessionState(sessionID, true);
      const collection = session.collection;
      if (!collection?.id) {
        return;
      }
      try {
        await collection.eraseTx();
        this._temporaryCollectionKeys.delete(collection.key);
        this._saveKeySet(TEMP_COLLECTION_KEYS_PREF, this._temporaryCollectionKeys);
      } catch (error) {
        this.logError(`Failed to remove Word citation collection ${collection.name || collection.key}`, error);
      }
    }
    
    getSortedItemIDs(citationsByIndex, sessionID) {
      const perfStart = Date.now();
      citationsByIndex ??= {};
      try {
        // 修复：使用完整的数据特征作为缓存签名，防止中间数据变化导致缓存命中不失效
        // 计算所有位置的 item IDs 的完整哈希，而不仅仅是第一个位置
        const indexKeys = Object.keys(citationsByIndex).sort((a, b) => Number(a) - Number(b));
        const normalized = {};
        let fullHash = "";
        for (const key of indexKeys) {
          const items = citationsByIndex[key]?.citationItems;
          normalized[key] = Array.isArray(items) ? items.filter((item) => {
            if (!item || (typeof item.id !== "number" && typeof item.id !== "string")) return false;
            const id = Number(item.id);
            return Number.isSafeInteger(id) && id > 0;
          }).map((item) => ({ id: Number(item.id) })) : [];
          fullHash += key + ":" + normalized[key].map((item) => item.id).join(",") + ";";
        }
        citationsByIndex = Object.fromEntries(indexKeys.map((key) => [key, { citationItems: normalized[key] }]));

        const sig = fullHash || "_empty";
        
        // 修复：按 session 隔离检查缓存，防止来自其他 session 的数据污染
        const cache = this._getSortedCache(sessionID);
        if (cache && cache.sig === sig) {
          this.debugLog("[Citation] getSortedItemIDs - cache hit for session", sessionID);
          return [...cache.result];
        }
        
        const seenIds = new Set();
        const SortedItemIDs = [];
        
        for (const i of indexKeys) {
          const citationItems = citationsByIndex[i]?.citationItems;
          if (!citationItems || !Array.isArray(citationItems)) {
            ztoolkit.log("[Citation] WARNING: Invalid citationItems at position", i, ":", citationItems);
            continue;
          }
          
          citationItems.forEach((item) => {
            if (!item || typeof item.id === "undefined") {
              ztoolkit.log("[Citation] WARNING: Invalid item at position", i, ":", item);
              return;
            }
            const itemID = Number(item.id);
            if (!Number.isInteger(itemID) || itemID <= 0) {
              ztoolkit.log("[Citation] WARNING: Invalid item ID at position", i, ":", item.id);
              return;
            }
            if (!seenIds.has(itemID)) {
              seenIds.add(itemID);
              SortedItemIDs.push(itemID);
            }
          });
        }
        
        // 修复：按 session 隔离存储缓存，防止污染
        this._setSortedCache(sessionID, sig, SortedItemIDs);
        
        // 关键日志：显示位置和序号的映射
        this.debugLog("[Citation getSortedItemIDs] Session:", sessionID);
        this.debugLog("[Citation getSortedItemIDs] Document positions (keys):", indexKeys);
        this.debugLog("[Citation getSortedItemIDs] Sorted item IDs:", SortedItemIDs.slice(0, 10), SortedItemIDs.length > 10 ? "..." : "");
        this.debugLog("[Citation getSortedItemIDs] Item count:", SortedItemIDs.length);
        
        return SortedItemIDs;
      } catch (e) {
        ztoolkit.log("[Citation] ERROR in getSortedItemIDs:", e);
        // 修复：错误时不返回空数组，而是返回当前已知的数据
        const cache = this._getSortedCache(sessionID);
        return cache?.result ? [...cache.result] : [];
      } finally {
        this._recordPerf("getSortedItemIDs", Date.now() - perfStart);
      }
    }
    async refreshSessionCitations(sessionID, session) {
      const perfStart = Date.now();
      if (this._listenerStopped || !this.sessions?.[sessionID] || this.sessions[sessionID].closing) return;
      const targetSession = session || Zotero.Integration.sessions[sessionID];
      if (!targetSession) {
        this.debugLog("[Citation refreshSessionCitations] Session not found:", sessionID);
        return;
      }
      
      // 修复：防止重复执行和数据竞态
      if (targetSession._zoteroCitationSyncing) {
        this.debugLog("[Citation refreshSessionCitations] Update in progress, skipping concurrent request");
        targetSession._zoteroCitationRefreshPending = true;
        return;
      }
      
      // 限流检查
      try {
        const now = Date.now();
        const last = this._lastRefreshAt[sessionID] || 0;
        if (now - last < this._minRefreshInterval) {
          this.debugLog(`[Citation refreshSessionCitations] Throttled for session ${sessionID}`);
          this._scheduleSessionRefresh(sessionID, targetSession, this._minRefreshInterval - (now - last) + 25);
          return;
        }
        this._lastRefreshAt[sessionID] = now;
      } catch (e) {
      }
      
      targetSession._zoteroCitationSyncing = true;
      try {
        // 修复：添加数据一致性检查
        let citationsByItemID = targetSession.citationsByItemID;
        let citationsByIndex = targetSession.citationsByIndex;
        
        if (!citationsByItemID || typeof citationsByItemID !== "object") {
          ztoolkit.log("[Citation] ERROR: citationsByItemID is invalid:", citationsByItemID);
          await targetSession.updateFromDocument(0);
          citationsByItemID = targetSession.citationsByItemID || {};
        }
        
        if (!citationsByIndex || typeof citationsByIndex !== "object") {
          ztoolkit.log("[Citation] ERROR: citationsByIndex is invalid:", citationsByIndex);
          await targetSession.updateFromDocument(0);
          citationsByIndex = targetSession.citationsByIndex || {};
        }
        
        // 修复：数据为空时，尝试一次智能恢复
        if (Object.keys(citationsByIndex).length === 0 && Object.keys(citationsByItemID).length > 0) {
          ztoolkit.log("[Citation] DATA MISMATCH: citationsByIndex empty but citationsByItemID has data, attempting recovery...");
          await Zotero.Promise.delay(50);
          await targetSession.updateFromDocument(0);
          citationsByIndex = targetSession.citationsByIndex || {};
          citationsByItemID = targetSession.citationsByItemID || {};
          
          // 仍未恢复，记录警告
          if (Object.keys(citationsByIndex).length === 0) {
            ztoolkit.log("[Citation] WARNING: transient citation index mismatch; preserving last known data");
            this._emptyReadCountBySession[sessionID] = 0;
            this._scheduleSessionRefresh(sessionID, targetSession, 250);
            return;
          }
        }
        
        // 还是为空就返回，不继续处理
        if (Object.keys(citationsByIndex).length === 0) {
          const emptyItemMap = Object.keys(citationsByItemID).length === 0;
          if (!emptyItemMap) {
            this._emptyReadCountBySession[sessionID] = 0;
            this._scheduleSessionRefresh(sessionID, targetSession, 250);
            return;
          }
          const emptyReadCount = (this._emptyReadCountBySession[sessionID] || 0) + 1;
          this._emptyReadCountBySession[sessionID] = emptyReadCount;
          if (emptyReadCount < 2) {
            this.debugLog("[Citation] Empty document snapshot awaiting confirmation", sessionID);
            this._scheduleSessionRefresh(sessionID, targetSession, 250);
            return;
          }
          this.debugLog("[Citation] No citations in document, clearing Word collection");
          this.scheduleCitationTagSync(sessionID, [], true);
          await this.updateCitations(sessionID, {}, [], targetSession.styleClass);
          return;
        }
        this._emptyReadCountBySession[sessionID] = 0;
        
        // 计算排序
        const sortedItemIDs = this.getSortedItemIDs(citationsByIndex, sessionID);

        if (this._listenerStopped || !this.sessions?.[sessionID]) return;
        
        // 修复：校验排序结果
        if (!Array.isArray(sortedItemIDs) || sortedItemIDs.length === 0) {
          ztoolkit.log("[Citation] ERROR: getSortedItemIDs returned invalid result:", sortedItemIDs);
          return;
        }
        
        this.debugLog("[Citation refreshSessionCitations] Final sorted", sortedItemIDs.length, "items for session", sessionID);

        this.scheduleCitationTagSync(sessionID, sortedItemIDs);
        
        // 更新序号
        await this.updateCitations(sessionID, citationsByItemID, sortedItemIDs, targetSession.styleClass);
      } catch (e) {
        ztoolkit.log("[Citation refreshSessionCitations] UNHANDLED ERROR:", e);
      } finally {
        targetSession._zoteroCitationSyncing = false;
        if (targetSession._zoteroCitationRefreshPending) {
          targetSession._zoteroCitationRefreshPending = false;
          this._scheduleSessionRefresh(sessionID, targetSession, this._minRefreshInterval);
        }
        this._recordPerf("refreshSessionCitations", Date.now() - perfStart);
      }
    }
    _buildCitationTagSig(sortedItemIDs) {
      if (!Array.isArray(sortedItemIDs) || sortedItemIDs.length === 0) {
        return "";
      }
      const uniq = Array.from(new Set(
        sortedItemIDs.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
      )).sort((a, b) => a - b);
      return uniq.join(",");
    }
    scheduleCitationTagSync(sessionID, sortedItemIDs, force = false) {
      if (this._listenerStopped) return;
      const normalizedIDs = Array.isArray(sortedItemIDs)
        ? sortedItemIDs.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
        : [];
      const sig = this._buildCitationTagSig(normalizedIDs);
      if (normalizedIDs.length) {
        this._sessionCitedIDs[sessionID] = normalizedIDs;
      } else {
        delete this._sessionCitedIDs[sessionID];
      }
      if (this._listenerStopped) {
        return;
      }
      if (!force && this._lastTagSyncSig[sessionID] === sig) {
        return;
      }
      this._lastTagSyncSig[sessionID] = sig;
      this._pendingTagSyncIDsBySession[sessionID] = normalizedIDs;
      if (this._tagSyncTimerBySession[sessionID]) {
        return;
      }
      this._tagSyncTimerBySession[sessionID] = window.setTimeout(() => {
        delete this._tagSyncTimerBySession[sessionID];
        const pendingIDs = this._pendingTagSyncIDsBySession[sessionID];
        if (!pendingIDs) {
          return;
        }
        if (this._tagSyncInFlightBySession[sessionID]) {
          return;
        }
        delete this._pendingTagSyncIDsBySession[sessionID];
        const syncPromise = this.syncCitationTags(sessionID, pendingIDs);
        this._tagSyncInFlightBySession[sessionID] = syncPromise;
        void syncPromise.catch((e) => {
          ztoolkit.log("[Citation scheduleCitationTagSync] Unexpected error:", e);
        }).finally(() => {
          if (this._tagSyncInFlightBySession[sessionID] === syncPromise) {
            delete this._tagSyncInFlightBySession[sessionID];
          }
          const nextPendingIDs = this._pendingTagSyncIDsBySession[sessionID];
          if (nextPendingIDs) {
            delete this._pendingTagSyncIDsBySession[sessionID];
            this.scheduleCitationTagSync(sessionID, nextPendingIDs, true);
          }
        });
      }, this._tagSyncDebounceMs);
    }
    _isWritableCitationItem(item) {
      const userLibraryID = Zotero.Libraries?.userLibraryID;
      if (!item || item.libraryID !== userLibraryID || item.editable === false) {
        return false;
      }
      try {
        if (typeof item.isEditable === "function" && !item.isEditable()) {
          return false;
        }
        const library = typeof Zotero.Libraries?.get === "function"
          ? Zotero.Libraries.get(item.libraryID)
          : null;
        if (library?.editable === false || library?.readOnly === true) {
          return false;
        }
        if (typeof library?.isEditable === "function" && !library.isEditable()) {
          return false;
        }
        if (typeof library?.editable === "function" && !library.editable()) {
          return false;
        }
      } catch (e) {
        return false;
      }
      return true;
    }
    async syncCitationTags(sessionID, sortedItemIDs) {
      // Tags belong to the union of all documents. Per-session locks alone
      // allow conflicting writes to the same item from different documents.
      const previous = this._tagSyncQueue || Promise.resolve();
      const task = previous.catch(() => {}).then(() => this._syncCitationTags(sessionID, sortedItemIDs));
      this._tagSyncQueue = task;
      try {
        return await task;
      } finally {
        if (this._tagSyncQueue === task) this._tagSyncQueue = null;
      }
    }
    async _syncCitationTags(sessionID, sortedItemIDs) {
      const perfStart = Date.now();
      let touchedCount = 0;
      let lastYieldedTouchCount = 0;
      let hadFailures = false;
      let ownershipChanged = false;
      this._bumpDebugCounter("syncCitationTagsRuns");
      try {
        const activeCitedIDSet = new Set();
        for (const sid in this._sessionCitedIDs) {
          const ids = this._sessionCitedIDs[sid] || [];
          ids.forEach((id) => activeCitedIDSet.add(Number(id)));
        }
        for (const itemID of activeCitedIDSet) {
          if (!Number.isInteger(itemID) || itemID <= 0) {
            continue;
          }
          try {
            let item = Zotero.Items.get(itemID);
            if (!item && typeof Zotero.Items.getAsync === "function") {
              item = await Zotero.Items.getAsync(itemID);
            }
            if (!item) {
              continue;
            }
            if (!this._isWritableCitationItem(item)) {
              continue;
            }
            const hasCitationTag = typeof item.hasTag === "function"
              ? item.hasTag(this._citationTagName)
              : (() => {
                const tags = typeof item.getTags === "function" ? item.getTags() : [];
                return Array.isArray(tags) && tags.some((tag) => {
                  const tagName = typeof tag === "string" ? tag : tag?.tag;
                  return tagName === this._citationTagName;
                });
              })();
            let addedByPlugin = false;
            if (!hasCitationTag && typeof item.addTag === "function") {
              item.addTag(this._citationTagName);
              try {
                await item.saveTx();
                touchedCount += 1;
                addedByPlugin = true;
                ownershipChanged = true;
              } catch (saveError) {
                try {
                  if (typeof item.removeTag === "function") {
                    item.removeTag(this._citationTagName);
                  }
                } catch (rollbackError) {
                  ztoolkit.log("[Citation syncCitationTags] Failed to roll back tag add", itemID, rollbackError);
                }
                throw saveError;
              }
            }
            if (addedByPlugin || this._managedCitationTagIDs[itemID]) {
              this._managedCitationTagIDs[itemID] = true;
            }
            if (touchedCount > 0 && touchedCount % 30 === 0 && touchedCount !== lastYieldedTouchCount) {
              lastYieldedTouchCount = touchedCount;
              await Zotero.Promise.delay(0);
            }
          } catch (e) {
            hadFailures = true;
            this._bumpDebugCounter("syncCitationTagsFailures");
            ztoolkit.log("[Citation syncCitationTags] Failed to add/sync tag for item", itemID, e);
          }
        }
        const managedIDs = Object.keys(this._managedCitationTagIDs).map((id) => Number(id));
        for (const itemID of managedIDs) {
          if (activeCitedIDSet.has(itemID)) {
            continue;
          }
          try {
            let item = Zotero.Items.get(itemID);
            if (!item && typeof Zotero.Items.getAsync === "function") {
              item = await Zotero.Items.getAsync(itemID);
            }
            if (!item) {
              delete this._managedCitationTagIDs[itemID];
              ownershipChanged = true;
              continue;
            }
            if (!this._isWritableCitationItem(item)) {
              // Keep the ownership record while the item cannot be written.
              // The tag may still be present and must be retried once the
              // library becomes writable again.
              continue;
            }
            const hasCitationTag = typeof item.hasTag === "function"
              ? item.hasTag(this._citationTagName)
              : (() => {
                const tags = typeof item.getTags === "function" ? item.getTags() : [];
                return Array.isArray(tags) && tags.some((tag) => {
                  const tagName = typeof tag === "string" ? tag : tag?.tag;
                  return tagName === this._citationTagName;
                });
            })();
            if (hasCitationTag && typeof item.removeTag === "function") {
              item.removeTag(this._citationTagName);
              try {
                await item.saveTx();
                touchedCount += 1;
              } catch (saveError) {
                try {
                  if (typeof item.addTag === "function") {
                    item.addTag(this._citationTagName);
                  }
                } catch (rollbackError) {
                  ztoolkit.log("[Citation syncCitationTags] Failed to roll back tag removal", itemID, rollbackError);
                }
                throw saveError;
              }
            }
            delete this._managedCitationTagIDs[itemID];
            ownershipChanged = true;
            if (touchedCount > 0 && touchedCount % 30 === 0 && touchedCount !== lastYieldedTouchCount) {
              lastYieldedTouchCount = touchedCount;
              await Zotero.Promise.delay(0);
            }
          } catch (e) {
            hadFailures = true;
            this._bumpDebugCounter("syncCitationTagsFailures");
            ztoolkit.log("[Citation syncCitationTags] Failed to remove tag for item", itemID, e);
          }
        }
      } finally {
        if (ownershipChanged || hadFailures) {
          this._saveManagedTagIDs();
        }
        if (touchedCount > 0) {
          this._bumpDebugCounter("syncCitationTagsTouched", touchedCount);
        }
        if (hadFailures) {
          delete this._lastTagSyncSig[sessionID];
        }
        this._recordPerf("syncCitationTags", Date.now() - perfStart);
      }
    }
    scheduleItemsViewRefresh() {
      if (this._itemsViewRefreshTimer) {
        return;
      }
      this._itemsViewRefreshTimer = window.setTimeout(() => {
        this._itemsViewRefreshTimer = null;
        try {
          addon.data.suspendUIRefresh = true;
        } catch (e) {
        }
        try {
          ZoteroPane.itemsView.refreshAndMaintainSelection();
        } catch (e) {
          ztoolkit.log("[Citation scheduleItemsViewRefresh] Error refreshing item view:", e);
        } finally {
          try {
            addon.data.suspendUIRefresh = false;
          } catch (e) {
          }
        }
      }, this._itemsViewRefreshDebounceMs);
    }
    async updateCitations(sessionID, citationsByItemID, sortedItemIDs, styleClass) {
      const revision = (this._sessionUpdateRevision[sessionID] || 0) + 1;
      this._sessionUpdateRevision[sessionID] = revision;
      const previous = this._sessionUpdateQueue[sessionID] || Promise.resolve();
      const task = previous.catch((error) => {
        this.logError(`Previous citation update failed for ${sessionID}`, error);
      }).then(async () => {
        if (this._listenerStopped || !this.sessions?.[sessionID] || this._sessionUpdateRevision[sessionID] !== revision) {
          return;
        }
        await this._applyCitations(sessionID, citationsByItemID, sortedItemIDs, styleClass, revision);
      });
      this._sessionUpdateQueue[sessionID] = task;
      try {
        await task;
      } finally {
        if (this._sessionUpdateQueue[sessionID] === task) {
          delete this._sessionUpdateQueue[sessionID];
        }
      }
    }
    async _applyCitations(sessionID, citationsByItemID, sortedItemIDs, styleClass, revision) {
      // 修复：严格的参数校验
      if (!citationsByItemID || typeof citationsByItemID !== "object") {
        ztoolkit.log("[Citation updateCitations] ERROR: Invalid citationsByItemID", citationsByItemID);
        return;
      }
      
      if (!Array.isArray(sortedItemIDs)) {
        ztoolkit.log("[Citation updateCitations] ERROR: sortedItemIDs is not an array", sortedItemIDs);
        return;
      }
      
      const citationIDKeys = Object.keys(citationsByItemID);
      
      // 修复：校验数据一致性
      // 检查 citationsByItemID 中的所有 ID 是否都在 sortedItemIDs 中
      const itemIDSet = new Set(sortedItemIDs.map(id => Number(id)));
      const missingIDs = citationIDKeys.filter(id => !itemIDSet.has(Number(id)));
      
      if (missingIDs.length > 0) {
        ztoolkit.log("[Citation updateCitations] WARNING: These IDs are in citationsByItemID but not in sortedItemIDs:", missingIDs);
        // 不直接返回，继续处理，但要小心处理这些 ID
      }
      
      const isNoteStyle = styleClass === "note";
      const idIndexMap = new Map(sortedItemIDs.map((id, idx) => [Number(id), idx]));
      const oldIdData = this.sessions[sessionID]?.idData || {};
      
      // 生成每个项目的精选引用文本
      const getPlainCitation = (id) => {
        const index = idIndexMap.get(Number(id));
        
        // 修复：找不到时的处理
        if (index === undefined) {
          ztoolkit.log("[Citation updateCitations] WARNING: Item ID", id, "not found in sorted list");
          const previousValue = oldIdData[id]?.plainCitation;
          if (previousValue) {
            return previousValue;
          }
          return isNoteStyle ? "—" : "—: (pending)";
        }
        
        const order = index + 1;
        if (isNoteStyle) {
          return String(order);
        } else {
          const citations = citationsByItemID[id];
          if (!Array.isArray(citations) || citations.length === 0) {
            ztoolkit.log("[Citation updateCitations] WARNING: Item", id, "has invalid citations", citations);
            return order + ": (error)";
          }
          
          return order + ": " + citations.map(
            (i) => i?.properties?.plainCitation || "(no text)"
          ).join(", ");
        }
      };
      
      const targetData = {};
      for (const id of citationIDKeys) {
        try {
          targetData[id] = { plainCitation: getPlainCitation(id) };
        } catch (e) {
          ztoolkit.log("[Citation updateCitations] ERROR generating citation for ID", id, ":", e);
          targetData[id] = { plainCitation: "(error)" };
        }
      }
      
      // 修复：校验 session 存在
      if (!this.sessions[sessionID]) {
        this.debugLog("[Citation updateCitations] Session already closed:", sessionID);
        return;
      }
      
      const integrationSession = Zotero.Integration.sessions[sessionID];
      if (integrationSession && !integrationSession.idData) {
        integrationSession.idData = {};
      }
      
      // 比较新旧数据，仅在有变化时才更新
      let hasChanges = Object.keys(targetData).length !== Object.keys(oldIdData).length;
      
      if (!hasChanges) {
        for (const id in targetData) {
          if (targetData[id].plainCitation !== oldIdData[id]?.plainCitation) {
            hasChanges = true;
            break;
          }
        }
      }
      
      const citationSession = this.sessions[sessionID];
      const userLibraryID = Zotero.Libraries.userLibraryID;
      const targetIDs = citationIDKeys.map(Number).filter((id) => {
        const item = Zotero.Items.get(id);
        return item && item.libraryID === userLibraryID && (typeof item.isTopLevelItem !== "function" || item.isTopLevelItem());
      });
      const excludedCount = citationIDKeys.length - targetIDs.length;
      if (excludedCount > 0) {
        this.debugLog(`[Citation updateCitations] Excluded ${excludedCount} missing, child, or non-user-library items from the Word collection`);
      }
      if (this._sessionUpdateRevision[sessionID] !== revision) {
        return;
      }
      await this.syncCollectionItems(citationSession, targetIDs);

      if (this._sessionUpdateRevision[sessionID] !== revision || !this.sessions?.[sessionID]) {
        return;
      }

      if (hasChanges) {
        citationSession.idData = targetData;
        if (integrationSession) {
          integrationSession.idData = targetData;
        }
        
        this.debugLog("[Citation updateCitations] Updated", Object.keys(targetData).length, "items for session", sessionID);
        this.scheduleItemsViewRefresh();
      }
    }
    async initCollection(sessionID, session = this.sessions[sessionID]) {
      if (!session || this._listenerStopped) {
        return;
      }
      const collection = new Zotero.Collection();
      collection.libraryID = Zotero.Libraries.userLibraryID;
      collection.name = sessionID;
      try {
        if (typeof collection.addRelation === "function") {
          collection.addRelation(TEMP_COLLECTION_RELATION, TEMP_COLLECTION_MARKER);
        }
      } catch (error) {
        this.logError("Failed to mark temporary Word citation collection", error);
      }
      await collection.saveTx({ skipSelect: true });
      this._temporaryCollectionKeys.add(collection.key);
      this._saveKeySet(TEMP_COLLECTION_KEYS_PREF, this._temporaryCollectionKeys);
      if (this._listenerStopped || this.sessions[sessionID] !== session) {
        await collection.eraseTx();
        this._temporaryCollectionKeys.delete(collection.key);
        this._saveKeySet(TEMP_COLLECTION_KEYS_PREF, this._temporaryCollectionKeys);
        return;
      }
      session.collection = collection;
    }
    async syncCollectionItems(session, targetIDs) {
      const collection = session?.collection;
      if (this._listenerStopped || session?.closing || !collection?.id) {
        return;
      }
      const normalizedTargetIDs = [...new Set(targetIDs.map(Number).filter(Number.isInteger))];
      const currentIDs = collection.getChildItems(true).map((itemOrID) => typeof itemOrID === "number" ? itemOrID : itemOrID?.id).filter(Number.isInteger);
      const targetSet = new Set(normalizedTargetIDs);
      const currentSet = new Set(currentIDs);
      const remove = currentIDs.filter((id) => !targetSet.has(id));
      const add = normalizedTargetIDs.filter((id) => !currentSet.has(id));
      if (!remove.length && !add.length) {
        return;
      }
      await Zotero.DB.executeTransaction(async () => {
        if (this._listenerStopped || session.closing) return;
        if (remove.length) {
          await collection.removeItems(remove);
        }
        if (add.length) {
          await collection.addItems(add);
        }
      });
    }
    /**
     * 退出时调用
     */
    clear() {
      if (!this._clearPromise) {
        this._clearPromise = this._performClear();
      }
      return this._clearPromise;
    }
    async _performClear() {
      this._listenerStopped = true;
      this._setActiveSessionID(null);
      this._isExecCommandRunning = false;
      this._execCommandDepth = 0;
      if (this._getSessionWrapper && Zotero.Integration.getSession === this._getSessionWrapper) {
        Zotero.Integration.getSession = this._originalGetSession;
      }
      this._getSessionWrapper = null;
      this._originalGetSession = null;
      for (const sessionID of Object.keys(this._collectionRenameRetryTimerBySession || {})) {
        this._clearCollectionRenameRetry(sessionID);
      }
      if (this._listenerTimer) {
        window.clearTimeout(this._listenerTimer);
        this._listenerTimer = null;
      }
      if (this._onWindowClose) {
        window.removeEventListener("close", this._onWindowClose);
        this._onWindowClose = null;
        this._bumpDebugCounter("windowCloseHandlerUnbound");
      }
      if (this._isExecCommandHooked && this._originalExecCommand
        && Zotero.Integration.execCommand === this._execCommandWrapper) {
        Zotero.Integration.execCommand = this._originalExecCommand;
        this._isExecCommandHooked = false;
        this._originalExecCommand = null;
        this._execCommandWrapper = null;
        this._bumpDebugCounter("execHookRestored");
      } else if (this._isExecCommandHooked) {
        this.debugLog("[Citation] execCommand hook changed by another patch; leaving it installed");
        this._isExecCommandHooked = false;
        this._originalExecCommand = null;
        this._execCommandWrapper = null;
      }
      this.debugLog("[Citation debug] clear completed", this._debugCounters);
      // 优化：清理缓存以防止内存泄漏
      if (this._cacheCleanupTimer) {
        window.clearInterval(this._cacheCleanupTimer);
        this._cacheCleanupTimer = null;
      }
      for (const sessionID in this._tagSyncTimerBySession) {
        window.clearTimeout(this._tagSyncTimerBySession[sessionID]);
      }
      this._tagSyncTimerBySession = {};
      this._pendingTagSyncIDsBySession = {};
      const tagTasks = Object.values(this._tagSyncInFlightBySession).filter((task) => task && typeof task.then === "function");
      if (tagTasks.length) {
        await Promise.allSettled(tagTasks);
      }
      this._sessionCitedIDs = {};
      try {
        await this.syncCitationTags("__shutdown__", []);
      } catch (error) {
        this.logError("Failed to remove managed citation tags during shutdown", error);
      }
      const sessionIDs = Object.keys(this.sessions || {});
      const cleanupResults = await Promise.allSettled(sessionIDs.map((sessionID) => this.clearSession(sessionID, true)));
      for (const result of cleanupResults) {
        if (result.status === "rejected") {
          this.logError("Failed to remove a Word citation collection during shutdown", result.reason);
        }
      }
      // 清理内部缓存
      try {
        if (this._itemsViewRefreshTimer) {
          window.clearTimeout(this._itemsViewRefreshTimer);
          this._itemsViewRefreshTimer = null;
        }
        this._sortedCacheBySession = {};
        this._lastRefreshAt = {};
        this._lastTagSyncSig = {};
        this._sessionCitedIDs = {};
        this._managedCitationTagIDs = {};
        this._tagSyncInFlightBySession = {};
        this._pendingTagSyncIDsBySession = {};
        this._tagSyncTimerBySession = {};
        this._sessionUpdateQueue = {};
        this._sessionUpdateRevision = {};
        this._emptyReadCountBySession = {};
        this._missingSessionCountBySession = {};
        this._docIdBySession = {};
        this._execCommandBindings.clear();
        this._collectionRenameRetryTimerBySession = {};
        this._collectionRenameRetryCountBySession = {};
        for (const sessionID in this._refreshRetryTimerBySession) {
          window.clearTimeout(this._refreshRetryTimerBySession[sessionID]);
        }
        this._refreshRetryTimerBySession = {};
      } catch (e) {
      }
    }
  };

  // src/modules/cite.ts
  var citeItemsInFlight = false;
  var citeItems = async (requestedItems = null) => {
    if (citeItemsInFlight || addon.data.alive === false) {
      return;
    }
    let selectedItems = requestedItems;
    if (!selectedItems) {
      if (Zotero_Tabs.selectedIndex === 0) {
        selectedItems = ZoteroPane.getSelectedItems();
      } else {
        const reader = Zotero.Reader.getByTabID(Zotero_Tabs.selectedID);
        const attachment = reader && Zotero.Items.get(reader.itemID);
        selectedItems = attachment?.parentItem ? [attachment.parentItem] : [];
      }
    }
    if (!Array.isArray(selectedItems) || !selectedItems.length
      || !selectedItems.every((item) => item?.isRegularItem?.() && item.isTopLevelItem())) return;
    const selectedIDs = [...new Set(selectedItems.map((item) => item.id))];
    if (typeof Zotero.Integration?.Session?.prototype?.cite !== "function") return;
    citeItemsInFlight = true;
    const cite = Zotero.Integration.Session.prototype.cite;
    const patchedCite = async function(field, addNote = false, addAnnotations = false) {
      if (addon.data.alive === false) return cite.apply(this, arguments);
      if (typeof this._insertCitingResult !== "function" || typeof this.addCitation !== "function"
        || typeof Zotero.Integration.CitationEditInterface !== "function") {
        return cite.apply(this, arguments);
      }
      let newField;
      let citation;
      let committed = false;
      try {
      if (field) {
        field = await Zotero.Integration.Field.loadExisting(field);
        if (field.type != 1) {
          throw new Zotero.Exception.Alert("integration.error.notInCitation");
        }
        citation = new Zotero.Integration.Citation(field, await field.unserialize(), await field.getNoteIndex());
      } else {
        newField = true;
        field = new Zotero.Integration.CitationField(await this.addField(true));
        citation = new Zotero.Integration.Citation(field);
      }
      await citation.prepareForEditing();
      let fieldIndexPromise, citationsByItemIDPromise;
      if (!this.data.prefs.delayCitationUpdates || !Object.keys(this.citationsByItemID).length || this._sessionUpToDate) {
        fieldIndexPromise = this.getFields().then(async function(fields2) {
          for (let i = 0, n = fields2.length; i < n; i++) {
            if (await fields2[i].equals(field._field)) {
              field = new Zotero.Integration.CitationField(fields2[i]);
              return i;
            }
          }
          return -1;
        });
        citationsByItemIDPromise = this.updateFromDocument(0).then(() => {
          return this.citationsByItemID;
        });
      } else {
        fieldIndexPromise = Zotero.Promise.resolve(-1);
        citationsByItemIDPromise = Zotero.Promise.resolve(this.citationsByItemID);
      }
      const io = new Zotero.Integration.CitationEditInterface(
        citation,
        this.style.opt.sort_citations,
        fieldIndexPromise,
        citationsByItemIDPromise
      );
      selectedIDs.forEach((id) => {
        if (!io.citation.citationItems.some((item) => Number(item.id) === id)) {
          io.citation.citationItems.push({ id });
        }
      });
      if (!io.citation.citationItems.length) {
        throw new Zotero.Exception.UserCancelled("inserting citation");
      }
      const [fieldIndex] = await Promise.all([fieldIndexPromise, citationsByItemIDPromise]);
      const citations = await this._insertCitingResult(fieldIndex, field, io.citation);
      if (!this.data.prefs.delayCitationUpdates) {
        if (citations.length != 1) {
          var fields = await this.getFields(true);
        }
        await this.updateFromDocument(0);
      }
      // ========== 核心：插入前的不完整畫写 ==========
      for (const citation2 of citations) {
        if (fields) {
          const index = citation2.fieldIndex ?? citation2._fieldIndex;
          const replacement = new Zotero.Integration.CitationField(fields[index]);
          if ("field" in citation2) citation2.field = replacement;
          else citation2._field = replacement;
        }
        const index = citation2.fieldIndex ?? citation2._fieldIndex;
        const citationField = citation2.field ?? citation2._field;
        await this.addCitation(index, await citationField.getNoteIndex(), citation2);
        // Once a citation is registered, a later failure must not delete a
        // field that the session already owns (for multi-field results).
        committed = true;
      }
      committed = true;
      
      // Refresh through the same guarded path as background updates. A UI
      // refresh failure must not turn a successful native insertion into failure.
      try {
        const sessionID = this.sessionID;
        if (addon.data.alive !== false && sessionID && Zotero.ZoteroCitation?.api?.refreshSessionCitations) {
          await Zotero.ZoteroCitation.api.refreshSessionCitations(sessionID, this);
        }
      } catch (error) {
        Zotero.logError(error);
      }
      return citations;
      } catch (error) {
        if (newField && !committed && typeof field?.delete === "function") {
          try {
            await field.delete();
            // addCitation can fail after mutating its in-memory indices.
            // Re-read document fields after removing the uncommitted field.
            await this.getFields(true);
            await this.updateFromDocument(0);
          } catch (cleanupError) { Zotero.logError(cleanupError); }
        }
        throw error;
      }
    };
    Zotero.Integration.Session.prototype.cite = patchedCite;
    try {
      if (Zotero.isMac) {
        await Zotero.Integration.execCommand(
          "MacWord16",
          "addEditCitation",
          "/Applications/Microsoft Word.app/",
          2
        );
      } else {
        await Zotero.Integration.execCommand(
          "WinWord",
          "addEditCitation",
          null, // Let Word choose its current active document, not a stale stored path.
          1
        );
      }
    } finally {
      if (Zotero.Integration.Session.prototype.cite === patchedCite) {
        Zotero.Integration.Session.prototype.cite = cite;
      }
      citeItemsInFlight = false;
    }
  };

  // src/modules/views.ts
  var Views = class {
    constructor() {
      this._disposed = false;
      this._dragItems = null;
      this._dragEndHandler = null;
      this._registeredColumnKeys = /* @__PURE__ */ new Set();
      this._iconNodeStates = /* @__PURE__ */ new Map();
      initLocale();
    }
    async createCitationColumn() {
      if (this._disposed) {
        return;
      }
      const key = "citation";
      const registered = await Zotero.ItemTreeManager.registerColumns({
        dataKey: key,
        label: getString(`column-${key}`),
        zoteroPersist: ["width", "hidden", "sortDirection"],
        dataProvider: (item, dataKey) => {
          try {
            // 首先检查是否有当前 session
            const currentSession = Zotero.Integration.currentSession;
            
            // Word 文件夹由插件会话中的临时 Collection 表示。原生
            // Integration session 不保存 collection，因此始终从插件映射读取。
            const sessions = Zotero.ZoteroCitation?.api?.sessions || {};
            
            if (!sessions || Object.keys(sessions).length === 0) {
              return "";
            }

            // Zotero 10 permits several collections to be selected. Only a
            // selected Word collection overrides the active Word document;
            // selecting an ordinary Zotero collection must not hide numbers.
            let selectedCollections = [];
            try {
              const getSelectedCollections = ZoteroPane.getSelectedCollections || ZoteroPane.collectionsView?.getSelectedCollections;
              if (typeof getSelectedCollections === "function") {
                const owner = ZoteroPane.getSelectedCollections ? ZoteroPane : ZoteroPane.collectionsView;
                selectedCollections = getSelectedCollections.call(owner) || [];
              }
            } catch (e) {
              ztoolkit.log("[Citation dataProvider] Failed to read selected collections:", e);
            }
            const selectedWordSessions = [];
            const selectedWordSessionSet = new Set();
            selectedCollections.forEach((selectedCollection) => {
              const selectedKey = selectedCollection?.key;
              if (!selectedKey) {
                return;
              }
              const candidates = Object.values(sessions).filter((session) => {
                const collection = session?.collection;
                if (!collection || collection.key !== selectedKey) {
                  return false;
                }
                if (selectedCollection.libraryID == null || collection.libraryID == null) {
                  return true;
                }
                return collection.libraryID === selectedCollection.libraryID;
              });
              // A key without library information is only safe when it maps
              // to one session; otherwise leave the context unresolved.
              if (selectedCollection.libraryID == null && candidates.length !== 1) {
                return;
              }
              for (const session of candidates) {
                if (!selectedWordSessionSet.has(session)) {
                  selectedWordSessionSet.add(session);
                  selectedWordSessions.push(session);
                }
              }
            });
            if (selectedWordSessions.length > 0) {
              const matchingSessions = selectedWordSessions.filter((session) => session.idData?.[item.id]);
              if (matchingSessions.length === 1) {
                const citation = matchingSessions[0].idData[item.id].plainCitation;
                if (addon.data.citationDebugEnabled) {
                  ztoolkit.log(`[Citation dataProvider] Multi-selection lookup - Item ${item.id}: "${citation}"`);
                }
                return citation || "";
              }
              // A Word collection was explicitly selected, so do not leak a
              // number from another open document into this context.
              return "";
            }

            // In My Library or an ordinary collection, show the number from
            // the currently active Word document.
            const explicitActiveSessionID = Zotero.ZoteroCitation?.api?.activeSessionID;
            const resolvedActiveSessionID = explicitActiveSessionID && sessions[explicitActiveSessionID]
              ? explicitActiveSessionID
              : currentSession?.sessionID;
            if (resolvedActiveSessionID) {
              const activeSession = sessions[resolvedActiveSessionID];
              if (activeSession?.idData?.[item.id]) {
                const citation = activeSession.idData[item.id].plainCitation;
                if (addon.data.citationDebugEnabled) {
                  ztoolkit.log(`[Citation dataProvider] Active document lookup - Item ${item.id}: "${citation}"`);
                }
                return citation || "";
              }
              return "";
            }

            // If Zotero no longer exposes currentSession, use a value only
            // when exactly one Word document supplies it. This preserves the
            // original-folder display without choosing an arbitrary document.
            const matchingSessions = Object.values(sessions).filter((session) => session?.idData?.[item.id]);
            if (matchingSessions.length === 1) {
              return matchingSessions[0].idData[item.id].plainCitation || "";
            }
            
            return "";
          } catch (e) {
            ztoolkit.log("[Citation dataProvider] Error:", e);
            return "";
          }
        },
        renderCell: (index, data, column, isFirstColumn, doc = document) => {
          const span = ztoolkit.UI.createElement(doc, "span");
          span.style.pointerEvents = "auto";
          if (!column) {
            return span;
          }
          span.className = `cell ${column.className}`;
          if (data == "") {
            return span;
          } else {
            // 保留 updateCitations 生成的文档顺序前缀，例如
            // "1: (Author, Year)"；脚注样式则直接显示 "1"。
            span.innerText = data ?? "";
            return span;
          }
        },
        pluginID: config.addonID
      });
      const registeredKeys = Array.isArray(registered) ? registered : [registered];
      for (const registeredKey of registeredKeys) {
        if (typeof registeredKey === "string" && registeredKey) {
          this._registeredColumnKeys ??= new Set();
          this._registeredColumnKeys.add(registeredKey);
        }
      }
      // Shutdown may race with the asynchronous registration call. Do not
      // leave a column behind when registration completes after disposal.
      if (this._disposed || addon.data.alive === false) {
        this._unregisterCitationColumns();
      }
    }
    _dragEnabled() {
      const column = this.getColumnInfo("citation");
      return !this._disposed && addon.data.alive !== false && !!column && column.hidden !== true
        && Zotero.Prefs.get("extensions.zotero.zoterocitation.dragCite.enable", true) !== false;
    }
    dispose() {
      this._disposed = true;
      this._dragItems = null;
      if (this._dragEndHandler) document.removeEventListener("dragend", this._dragEndHandler, true);
      this._dragEndHandler = null;
      for (const [iconNode, state] of this._iconNodeStates || []) {
        this._restoreIconNode(iconNode, state);
      }
      this._iconNodeStates?.clear();
      this._unregisterCitationColumns();
    }
    _unregisterCitationColumns() {
      const columnKeys = [...(this._registeredColumnKeys || [])];
      this._registeredColumnKeys?.clear();
      if (columnKeys.length) {
        try {
          const manager = Zotero.ItemTreeManager;
          if (typeof manager.unregisterColumns === "function") {
            Promise.resolve(manager.unregisterColumns(columnKeys)).catch((error) => ztoolkit.log("[Views] Failed to unregister citation column:", error));
          } else if (typeof manager.unregisterColumn === "function") {
            columnKeys.forEach((columnKey) => Promise.resolve(manager.unregisterColumn(columnKey)).catch((error) => ztoolkit.log("[Views] Failed to unregister citation column:", error)));
          }
        } catch (error) {
          ztoolkit.log("[Views] Failed to unregister citation column:", error);
        }
      }
    }
    async dragCite() {
      if (this._dragEndHandler || this._disposed || addon.data.alive === false
        || Zotero.Prefs.get("extensions.zotero.zoterocitation.dragCite.enable", true) === false) return;
      this._dragEndHandler = (event) => {
        const items = this._dragItems;
        this._dragItems = null;
        if (!items?.length || !this._dragEnabled() || !event.dataTransfer
          || event.dataTransfer.mozUserCancelled || event.dataTransfer.dropEffect === "none") return;
        const x = event.screenX, y = event.screenY;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const width = window.outerWidth || document.documentElement.getBoundingClientRect().width;
        const height = window.outerHeight || document.documentElement.getBoundingClientRect().height;
        if (x >= window.screenX && x < window.screenX + width
          && y >= window.screenY && y < window.screenY + height) return;
        void addon.api.citeItems(items).catch((error) => Zotero.logError(error));
      };
      document.addEventListener("dragend", this._dragEndHandler, true);
      try {
        ztoolkit.patch(ZoteroPane.itemsView, "onDragStart", config.addonRef,
          (original) => (event, row) => {
            this._dragItems = null;
            const items = ZoteroPane.getSelectedItems();
            if (this._dragEnabled() && event.dataTransfer && items?.length
              && items.every((item) => item?.isRegularItem?.() && item.isTopLevelItem())) {
              this._dragItems = [...items];
              event.dataTransfer.setData("text/plain", "");
              return;
            }
            return original.call(ZoteroPane.itemsView, event, row);
          });
      } catch (error) {
        document.removeEventListener("dragend", this._dragEndHandler, true);
        this._dragEndHandler = null;
        throw error;
      }
    }
    async patchIcon() {
      try {
        const view = this;
        ztoolkit.patch(
          ZoteroPane.collectionsView,
          "renderItem",
          config.addonRef,
          (original) => (index, selection, oldDiv, columns) => {
            const previousIcon = oldDiv?.querySelector?.(".cell-icon");
            if (previousIcon) {
              view._restoreIconNode(previousIcon);
              view._iconNodeStates?.delete(previousIcon);
            }
            const div = original.call(ZoteroPane.collectionsView, index, selection, oldDiv, columns);
            if (view._disposed || addon.data.alive === false) return div;
            const row = ZoteroPane.collectionsView.getRow(index);
            const sessions = Zotero.ZoteroCitation?.api?.sessions || {};
            const rowRef = row?.ref;
            const isCitationCollection = Object.values(sessions).some((session) => {
              const collection = session?.collection;
              return collection?.key && collection.key === rowRef?.key
                && (collection.libraryID == null || rowRef?.libraryID == null
                  || collection.libraryID === rowRef.libraryID);
            });
            const iconNode = div?.querySelector?.(".cell-icon");
            if (iconNode && isCitationCollection) {
              view._rememberIconNode(iconNode);
              iconNode.style.backgroundImage = `url(chrome://${config.addonRef}/content/icons/word.png)`;
              iconNode.classList.remove("icon-search", "icon-collection");
              iconNode.classList.add("icon-publications");
            } else if (iconNode) {
              view._restoreIconNode(iconNode);
              view._iconNodeStates?.delete(iconNode);
            }
            return div;
          }
        );
      } catch (error) {
        ztoolkit.log("[Views] Failed to patch citation collection icon:", error);
      }
    }
    _rememberIconNode(iconNode) {
      this._iconNodeStates ??= new Map();
      for (const node of this._iconNodeStates.keys()) {
        if (node.isConnected === false) this._iconNodeStates.delete(node);
      }
      if (this._iconNodeStates.has(iconNode)) {
        return;
      }
      this._iconNodeStates.set(iconNode, {
        backgroundImage: iconNode.style?.backgroundImage || "",
        hadSearch: iconNode.classList?.contains("icon-search") === true,
        hadCollection: iconNode.classList?.contains("icon-collection") === true,
        hadPublications: iconNode.classList?.contains("icon-publications") === true
      });
    }
    _restoreIconNode(iconNode, state = this._iconNodeStates?.get(iconNode)) {
      if (!iconNode || !state) {
        return;
      }
      // CSSStyleDeclaration may serialize the value with quotes, so compare
      // the stable chrome URL rather than the exact serialized spelling.
      if (String(iconNode.style?.backgroundImage || "").includes(`/content/icons/word.png`)) {
        iconNode.style.backgroundImage = state.backgroundImage;
      }
      if (iconNode.classList) {
        if (state.hadSearch) iconNode.classList.add("icon-search");
        else iconNode.classList.remove("icon-search");
        if (state.hadCollection) iconNode.classList.add("icon-collection");
        else iconNode.classList.remove("icon-collection");
        if (state.hadPublications) iconNode.classList.add("icon-publications");
        else iconNode.classList.remove("icon-publications");
      }
    }
    getColumnInfo(dataKey) {
      try {
        const columns = typeof ZoteroPane.itemsView.getColumns === "function"
          ? ZoteroPane.itemsView.getColumns()
          : ZoteroPane.itemsView._columns || [];
        const ownedKeys = new Set([dataKey, `${config.addonID}-${dataKey}`, ...(this._registeredColumnKeys || [])]);
        const columnInfo = columns.find((i) => typeof i?.dataKey === "string" && ownedKeys.has(i.dataKey));
        return columnInfo;
      } catch {
        return null;
      }
    }
  };
  var views_default = Views;

  // src/hooks.ts
  let keydownHandler;
  let startupPromise;
  let shutdownPromise;
  async function onStartup() {
    if (startupPromise) return startupPromise;
    if (shutdownPromise || addon.data.alive === false) return;
    startupPromise = (async () => {
      await Promise.all([Zotero.initializationPromise, Zotero.unlockPromise, Zotero.uiReadyPromise]);
      if (!addon.data.alive) return;
      initLocale();
      if (Zotero.Prefs.get("extensions.zotero.zoterocitation.enable", true) === false) {
        return;
      }
      const citation = new Citation();
      addon.data.citation = citation;
      await citation.listener(1e3);
      if (!addon.data.alive) return;
      const views = new views_default();
      addon.data.views = views;
      await views.patchIcon();
      if (!addon.data.alive) return;
      await views.createCitationColumn();
      if (!addon.data.alive) return;
      if (Zotero.Prefs.get("extensions.zotero.zoterocitation.dragCite.enable", true) !== false) {
        await views.dragCite();
      }
      if (!addon.data.alive) return;
      keydownHandler = (event) => {
        if (event.key === "'" && !event.repeat && !event.isComposing
          && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
          const target = event.originalTarget || event.target;
          if (!target || target.isContentEditable || "value" in target) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          void citeItems().catch((error) => Zotero.logError(error));
        }
      };
      document.addEventListener("keydown", keydownHandler, true);
    })();
    try {
      return await startupPromise;
    } catch (error) {
      if (addon.data.alive) {
        await onShutdown();
      }
      throw error;
    }
  }
  async function onShutdown() {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
    addon.data.alive = false;
    addon.data.views?.dispose?.();
    if (keydownHandler) {
      document.removeEventListener("keydown", keydownHandler, true);
      keydownHandler = void 0;
    }
    try {
      await addon.data.citation?.clear?.();
    } catch (error) {
      Zotero.logError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      ztoolkit.unregisterAll();
      ztoolkit.Prompt.unregisterAll();
      addon.data.alive = false;
      if (Zotero[config.addonInstance] === addon) delete Zotero[config.addonInstance];
    }
    })();
    return shutdownPromise;
  }
  var hooks_default = {
    onStartup,
    onShutdown
  };

  // src/addon.ts
  var Addon = class {
    constructor() {
      this.data = {
        alive: true,
        env: "production",
        docId: "__doc__",
        // ztoolkit: new MyToolkit(),
        ztoolkit: new ZoteroToolkit()
      };
      this.hooks = hooks_default;
      this.api = { citeItems };
    }
  };
  var addon_default = Addon;

  // src/index.ts
  var basicTool2 = new BasicTool();
  if (!basicTool2.getGlobal("Zotero")[config.addonInstance]) {
    globalThis.Zotero = basicTool2.getGlobal("Zotero");
    globalThis.ZoteroPane = basicTool2.getGlobal("ZoteroPane");
    globalThis.Zotero_Tabs = basicTool2.getGlobal("Zotero_Tabs");
    globalThis.window = basicTool2.getGlobal("window");
    globalThis.document = basicTool2.getGlobal("document");
    globalThis.console = basicTool2.getGlobal("window").console;
    globalThis.addon = new addon_default();
    globalThis.ztoolkit = addon.data.ztoolkit;
    ztoolkit.basicOptions.log.prefix = `[${config.addonName}]`;
    ztoolkit.basicOptions.log.disableConsole = true;
    ztoolkit.UI.basicOptions.ui.enableElementJSONLog = false;
    Zotero[config.addonInstance] = addon;
    addon.hooks.onStartup().catch((error) => Zotero.logError(error));
  }
})();
