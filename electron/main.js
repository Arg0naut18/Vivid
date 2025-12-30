const {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  session,
} = require("electron");
const path = require("path");
const http = require("http");

let mainWindow;
// REPLACE THIS with your actual Render URL (e.g., 'https://vivid-backend.onrender.com')
const REMOTE_SERVER_URL = "https://vivid-wvh4.onrender.com/";

const isDev = !app.isPackaged;

// --- Window Management ---

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: "#111827",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    autoHideMenuBar: true,
  });

  // Load the local frontend
  mainWindow.loadFile(path.join(__dirname, "../static/index.html"));

  // Optional: Open dev tools in development
  // if (isDev) mainWindow.webContents.openDevTools();
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

ipcMain.on("window-control", (event, action) => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return;

  switch (action) {
    case "minimize":
      win.minimize();
      break;
    case "maximize":
      win.isMaximized() ? win.unmaximize() : win.maximize();
      break;
    case "close":
      win.close();
      break;
  }
});
