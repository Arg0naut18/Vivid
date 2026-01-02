!macro customInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "Vivid requires a Virtual Audio Driver for advanced application audio isolation (streaming only one app). Would you like to view the setup guide now?" IDNO +2
  ExecShell "open" "https://vb-audio.com/Cable/"
!macroend
