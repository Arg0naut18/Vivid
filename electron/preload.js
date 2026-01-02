const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Screen Sharing
    getScreenSources: () => ipcRenderer.invoke('get-sources'),

    // Guide
    openAudioGuide: () => ipcRenderer.send('open-audio-guide'),
    
    // Window Controls (Minimize, Close, etc.)
    minimizeWindow: () => ipcRenderer.send('window-control', 'minimize'),
    maximizeWindow: () => ipcRenderer.send('window-control', 'maximize'),
    closeWindow: () => ipcRenderer.send('window-control', 'close'),
    
    // PiP Control
    togglePip: (enable) => ipcRenderer.send('toggle-pip', enable),
    onPipModeChanged: (callback) => ipcRenderer.on('pip-mode-changed', (event, value) => callback(value)),

    // App State Events
    onAppBlur: (callback) => ipcRenderer.on('app-blur', callback),
    onAppFocus: (callback) => ipcRenderer.on('app-focus', callback),

    // Platform Info
    isElectron: true,
    
    // Config
    config: {
        apiUrl: process.env.VIVID_API_URL || ""
    }
});
