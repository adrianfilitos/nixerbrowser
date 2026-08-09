!macro customInstall
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\NixerBrowser\Capabilities" "" "Nixer Browser"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\NixerBrowser\Capabilities" "ApplicationName" "Nixer Browser"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\NixerBrowser\Capabilities" "ApplicationDescription" "Navegador basado en Chromium con interfaz en React"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\NixerBrowser\Capabilities" "ApplicationIcon" "$INSTDIR\${PRODUCT_NAME}.exe,0"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\NixerBrowser\Capabilities\URLAssociations" "http" "NixerBrowser.http"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\NixerBrowser\Capabilities\URLAssociations" "https" "NixerBrowser.https"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\NixerBrowser\Capabilities\URLAssociations" "mailto" "NixerBrowser.mailto"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\NixerBrowser\Capabilities\Application" "ApplicationName" "Nixer Browser"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\NixerBrowser\Capabilities\Application" "ApplicationDescription" "Navegador basado en Chromium con interfaz en React"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\NixerBrowser\Capabilities\Application" "AppUserModelID" "com.nixer.browser"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\NixerBrowser\Capabilities\DefaultIcon" "" "$INSTDIR\${PRODUCT_NAME}.exe,0"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\NixerBrowser\shell\open\command" "" "$INSTDIR\${PRODUCT_NAME}.exe"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\NixerBrowser\DefaultIcon" "" "$INSTDIR\${PRODUCT_NAME}.exe,0"
  WriteRegStr HKCU "Software\RegisteredApplications" "Nixer Browser" "Software\Clients\StartMenuInternet\NixerBrowser\Capabilities"
  WriteRegStr HKCU "Software\Classes\NixerBrowser.http\shell\open\command" "" '"$INSTDIR\${PRODUCT_NAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\NixerBrowser.https\shell\open\command" "" '"$INSTDIR\${PRODUCT_NAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\NixerBrowser.mailto\shell\open\command" "" '"$INSTDIR\${PRODUCT_NAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\${PRODUCT_NAME}.exe" "" "$INSTDIR\${PRODUCT_NAME}.exe"
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\NixerBrowser"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Nixer Browser"
  DeleteRegKey HKCU "Software\Classes\NixerBrowser.http"
  DeleteRegKey HKCU "Software\Classes\NixerBrowser.https"
  DeleteRegKey HKCU "Software\Classes\NixerBrowser.mailto"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\${PRODUCT_NAME}.exe"
!macroend
