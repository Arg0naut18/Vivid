!include "x64.nsh"

!macro customInstall
  ; Check if VB Cable is installed by checking for the driver file
  IfFileExists "$WINDIR\System32\drivers\vbcable.sys" installed not_installed

  not_installed:
    DetailPrint "VB-Audio Cable not found. Installing..."
    
    ; Create a temp directory for the driver files
    SetOutPath "$TEMP\vivid_vb_driver"
    
    ; Copy the driver files from the build resources
    File /r "${BUILD_RESOURCES_DIR}\vb-audio-driver\*.*"
    
    ; Run the installer silently
    ${If} ${RunningX64}
      ExecWait '"$TEMP\vivid_vb_driver\VBCABLE_Setup_x64.exe" -i -h'
    ${Else}
      ExecWait '"$TEMP\vivid_vb_driver\VBCABLE_Setup.exe" -i -h'
    ${EndIf}
    
    DetailPrint "VB-Audio Cable installation attempted."
    
    ; Clean up
    SetOutPath "$TEMP"
    RMDir /r "$TEMP\vivid_vb_driver"
    
    Goto done

  installed:
    DetailPrint "VB-Audio Cable is already installed."

  done:
!macroend
