const {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  session,
  shell,
} = require("electron");
const path = require("path");
const Store = require("./store");

// Fix for 'ProcessFrame failed: -2147467259' (WGC error on Windows)
app.commandLine.appendSwitch("disable-features", "UseWindowsGraphicsCapture");

const store = new Store({
  configName: "user-preferences",
  defaults: {
    windowBounds: { width: 1280, height: 720 },
    pipBounds: null,
    isMaximized: false,
  },
});

let mainWindow;

const REMOTE_SERVER_URL = "https://vivid-wvh4.onrender.com/";

// --- PiP State ---
let isPipMode = false;
let wasMaximized = false;

// --- Window Management ---

function createWindow() {
  let { width, height, x, y } = store.get("windowBounds");
  const isMaximizedState = store.get("isMaximized");

  mainWindow = new BrowserWindow({
    width: width || 1280,
    height: height || 720,
    x: x,
    y: y,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: "#111827",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
    },
    autoHideMenuBar: true,
    show: false, // Hide initially to prevent flash if maximizing
  });

  if (isMaximizedState) {
    mainWindow.maximize();
  }
  mainWindow.show();

  // Load the local frontend
  mainWindow.loadFile(path.join(__dirname, "../static/index.html"));

  // Track window focus/blur for PIP
  mainWindow.on("blur", () => {
    mainWindow.webContents.send("app-blur");
  });

  mainWindow.on("focus", () => {
    mainWindow.webContents.send("app-focus");
  });

  // Save Window State (Debounced)
  let resizeTimeout;
  const saveState = () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (
        !isPipMode &&
        !mainWindow.isMaximized() &&
        !mainWindow.isMinimized()
      ) {
        store.set("windowBounds", mainWindow.getBounds());
      }
      if (!isPipMode) {
        store.set("isMaximized", mainWindow.isMaximized());
      }
    }, 500);
  };

  mainWindow.on("resize", saveState);
  mainWindow.on("move", saveState);
}

// --- App Lifecycle ---

app.whenReady().then(() => {
  // Set the remote URL in environment so preload can pick it up
  process.env.VIVID_API_URL = REMOTE_SERVER_URL;

  // Update CSP to allow connection to the remote server
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          `default-src 'self' 'unsafe-inline' 'unsafe-eval' ${REMOTE_SERVER_URL} ws: wss: data: blob:;`,
        ],
      },
    });
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// --- IPC Handlers (Native Features) ---

ipcMain.on("open-audio-guide", () => {
  shell.openExternal("https://vb-audio.com/Cable/");
});

ipcMain.handle("get-sources", async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["window", "screen"],
    });
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
    }));
  } catch (error) {
    console.error("Error getting sources:", error);
    return [];
  }
});

ipcMain.on("toggle-pip", (event, enable) => {
  if (!mainWindow) return;

  if (enable) {
    if (isPipMode) return; // Already in PiP

    // 1. Capture State logic
    // We rely on the Store having the last known "Good" state (saved during resize/move events)
    // But we also check immediate state:
    wasMaximized = mainWindow.isMaximized();

    // CRITICAL: We must unmaximize to allow resizing to PiP size
    if (wasMaximized) {
      mainWindow.unmaximize();
    }

    // 2. Determine PiP Target Bounds
    let targetBounds = store.get("pipBounds");

    if (!targetBounds) {
      const { screen } = require("electron");
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.workAreaSize;
      const pipWidth = 320;
      const pipHeight = 180;
      const padding = 20;

      targetBounds = {
        x: width - pipWidth - padding,
        y: height - pipHeight - padding,
        width: pipWidth,
        height: pipHeight,
      };
    }

    // 3. Apply PiP settings
    isPipMode = true;
    mainWindow.setMinimumSize(160, 90);

    // Ensure window is restored (visible) if it was minimized
    if (mainWindow.isMinimized()) mainWindow.restore();

    mainWindow.setBounds(targetBounds);
    mainWindow.setAlwaysOnTop(true, "screen-saver");
    mainWindow.webContents.send("pip-mode-changed", true);

    // Save PiP bounds when user moves/resizes IT
    // We add a specific listener for PiP mode?
    // Actually, our global 'resize' listener handles saving.
    // We just need to update logic in saveState to check isPipMode.

    // Setup temporary listener for PiP persistence
    const savePipState = () => {
      if (isPipMode && !mainWindow.isMinimized()) {
        store.set("pipBounds", mainWindow.getBounds());
      }
    };
    mainWindow.on("resize", savePipState);
    mainWindow.on("move", savePipState);

    // Cleanup helper
    mainWindow.pipCleanup = () => {
      mainWindow.removeListener("resize", savePipState);
      mainWindow.removeListener("move", savePipState);
    };
  } else {
    if (!isPipMode) return; // Not in PiP

    // Cleanup PiP listeners
    if (mainWindow.pipCleanup) mainWindow.pipCleanup();

    // Restore
    isPipMode = false;
    mainWindow.setAlwaysOnTop(false);

    // Restore size constraints
    mainWindow.setMinimumSize(900, 600);

    // Retrieve saved normal bounds
    const normalBounds = store.get("windowBounds");
    const shouldMaximize = store.get("isMaximized") || wasMaximized;

    if (shouldMaximize) {
      mainWindow.maximize();
    } else if (normalBounds) {
      mainWindow.setBounds(normalBounds);
    } else {
      mainWindow.setSize(1280, 720);
      mainWindow.center();
    }

    mainWindow.webContents.send("pip-mode-changed", false);
  }
});

ipcMain.on("window-control", (event, action) => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return;

  // If in PiP mode, prevent standard minimize?
  // Actually, if user clicks minimize in PiP, maybe they want to hide it completely.
  // But let's keep standard behavior for now.

  switch (action) {
    case "minimize":
      win.minimize();
      break;
    case "maximize":
      if (isPipMode) {
        // If in PiP, maximize acts as "Restore"
        ipcMain.emit("toggle-pip", event, false);
      } else {
        win.isMaximized() ? win.unmaximize() : win.maximize();
      }
      break;
    case "close":
      win.close();
      break;
  }
});
