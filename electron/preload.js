const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Screen Sharing
    getScreenSources: () => ipcRenderer.invoke('get-sources'),
    
    // Window Controls (Minimize, Close, etc.)
    minimizeWindow: () => ipcRenderer.send('window-control', 'minimize'),
    maximizeWindow: () => ipcRenderer.send('window-control', 'maximize'),
    closeWindow: () => ipcRenderer.send('window-control', 'close'),
    
    // Platform Info
    isElectron: true,
    
    // Config
    config: {
        apiUrl: process.env.VIVID_API_URL || ""
    }
});
